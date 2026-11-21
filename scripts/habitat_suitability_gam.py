#!/usr/bin/env python
"""Build an exploratory turtle habitat-suitability GAM from PenyuGuard data.

Background points are sampled from valid SST grid cells (environmental data
support), not asserted absences. Environmental predictors are monthly normals
over the shared satellite/product period, joined to points in projected metres.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from pygam import LogisticGAM, s
from shapely.geometry import Point, shape, mapping, box


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "oceanographic"
CRS = "EPSG:4326"
METRIC_CRS = "EPSG:32750"  # UTM 50S, covering Pulau Rinca.
RNG = np.random.default_rng(20261122)
PARAMETERS = ["SST", "Salinitas", "Klorofil-a"]
UNITS = {"SST": "°C", "Salinitas": "PSU", "Klorofil-a": "mg/m³"}
MONTH_KEYS = [f"{year}-{month:02d}" for year in range(2022, 2027) for month in range(1, 13)]


def load_json(path: Path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def geo_frame(features, rows, crs=CRS):
    return gpd.GeoDataFrame(rows, geometry=[shape(feature["geometry"]) for feature in features], crs=crs)


def load_environment():
    sst_fc = load_json(DATA / "sst-rinca.geojson")
    sst_features = sst_fc["features"]
    sst_rows = []
    for feature in sst_features:
        props = feature.get("properties", {})
        values = []
        for month in range(1, 13):
            vals = [float(props[key]) for key in MONTH_KEYS if key.endswith(f"-{month:02d}") and props.get(key) is not None]
            values.append(float(np.mean(vals)) if vals else np.nan)
        sst_rows.append({"SST": values})
    sst = geo_frame(sst_features, sst_rows).to_crs(METRIC_CRS)

    sal_fc = load_json(DATA / "oceanographic" / "SALINITAS.geojson")
    sal_features = sal_fc["features"]
    sal_rows = []
    for feature in sal_features:
        props = feature.get("properties", {})
        values = []
        for month in range(1, 13):
            vals = [float(props[key]) for key in MONTH_KEYS if key.endswith(f"-{month:02d}") and props.get(key) not in (None, "")]
            values.append(float(np.mean(vals)) if vals else np.nan)
        sal_rows.append({"Salinitas": values})
    sal = geo_frame(sal_features, sal_rows).to_crs(METRIC_CRS)

    chl_text = (DATA / "oceanographic" / "CHL_peta.js").read_text(encoding="utf-8")
    match = re.search(r"window\.CHL_GEO\s*=\s*(\{.*?\});", chl_text, re.S)
    if not match:
        raise ValueError("CHL_peta.js tidak memuat objek window.CHL_GEO yang valid.")
    chl_fc = json.loads(match.group(1))
    months = chl_fc.get("properties", {}).get("bulan", [])
    chl_features = chl_fc.get("features", [])
    chl_rows = []
    for feature in chl_features:
        vals = feature.get("properties", {}).get("v", [])
        monthly = []
        for month in range(1, 13):
            samples = [float(value) for key, value in zip(months, vals)
                       if key.endswith(f"-{month:02d}") and value is not None]
            monthly.append(float(np.mean(samples)) if samples else np.nan)
        chl_rows.append({"Klorofil-a": monthly})
    chl = geo_frame(chl_features, chl_rows).to_crs(METRIC_CRS)
    return sst, sal, chl


def load_presences():
    records = load_json(DATA / "turtle-sightings.json")
    rows = []
    seen = set()
    for item in records:
        # Exclude simulated and community records from model presence data.
        if item.get("data_origin") != "iNaturalist":
            continue
        try:
            lat, lng = float(item["lat"]), float(item["lng"])
            month = int(str(item.get("date", ""))[5:7])
        except (KeyError, TypeError, ValueError):
            continue
        key = str(item.get("id") or (round(lat, 6), round(lng, 6), item.get("date")))
        if key in seen or not (-90 <= lat <= 90 and -180 <= lng <= 180 and 1 <= month <= 12):
            continue
        seen.add(key)
        rows.append({"source_id": key, "month": month, "geometry": Point(lng, lat)})
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=CRS).to_crs(METRIC_CRS)


def nearest_month_values(points: gpd.GeoDataFrame, env: gpd.GeoDataFrame, parameter: str, month: int):
    source = env[["geometry", parameter]].copy()
    source[parameter] = source[parameter].apply(lambda values: values[month - 1] if len(values) >= month else np.nan)
    source = source[np.isfinite(source[parameter])].copy()
    if source.empty or points.empty:
        return pd.Series(index=points.index, dtype=float)
    joined = gpd.sjoin_nearest(points[["geometry"]], source, how="left", distance_col="distance_m")
    joined.loc[joined["distance_m"] > 12000, parameter] = np.nan
    return joined.groupby(level=0)[parameter].first().reindex(points.index)


def extract_rows(points, month_lookup, envs):
    output = points[["geometry", "month"]].copy()
    for parameter, env in zip(PARAMETERS, envs):
        result = pd.Series(index=output.index, dtype=float)
        for month in range(1, 13):
            indices = output.index[output["month"] == month]
            if len(indices):
                result.loc[indices] = nearest_month_values(output.loc[indices], env, parameter, month).values
        output[parameter] = result
    return output


def sample_background(sst: gpd.GeoDataFrame, count: int, presence_months: list[int]):
    valid_rows = []
    for index, row in sst.iterrows():
        if np.isfinite(row["SST"]).any():
            valid_rows.append(index)
    if not valid_rows:
        raise ValueError("Tidak ada sel SST valid untuk membentuk titik latar.")
    chosen = RNG.choice(valid_rows, size=count, replace=len(valid_rows) < count)
    background = sst.loc[chosen, ["geometry"]].reset_index(drop=True)
    background["month"] = RNG.choice(presence_months, size=count, replace=True)
    background["source_id"] = [f"background-{i + 1}" for i in range(count)]
    return background.set_crs(METRIC_CRS, allow_override=True)


def optimal_range(x_values, probability):
    threshold = float(np.nanmax(probability)) * 0.8
    selected = np.asarray(x_values)[np.asarray(probability) >= threshold]
    return {"minimum": float(selected.min()), "maximum": float(selected.max()),
            "definition": "Rentang pada kurva respons marginal dengan probabilitas ≥80% dari puncak kurva."} if len(selected) else None


def fit_model(samples: pd.DataFrame):
    x = samples[PARAMETERS].to_numpy(dtype=float)
    y = samples["presence"].to_numpy(dtype=int)
    if len(np.unique(y)) != 2 or np.sum(y == 1) < 20:
        raise ValueError(f"Sampel valid GAM tidak mencukupi: presence={int(np.sum(y == 1))}, background={int(np.sum(y == 0))}.")
    model = LogisticGAM(s(0) + s(1) + s(2), max_iter=500)
    model.gridsearch(x, y, lam=np.logspace(-3, 3, 7), progress=False)
    curves = {}
    median = np.nanmedian(x, axis=0)
    p_values = model.statistics_.get("p_values", [])
    for index, parameter in enumerate(PARAMETERS):
        low, high = np.nanpercentile(x[:, index], [1, 99])
        axis = np.linspace(float(low), float(high), 100)
        grid = np.tile(median, (len(axis), 1))
        grid[:, index] = axis
        partial, confidence = model.partial_dependence(term=index, X=grid, width=0.95)
        # pyGAM partial effects are centered; anchor them at the fitted
        # probability for the median environmental profile.
        base_probability = float(np.asarray(model.predict_mu(median.reshape(1, -1))).ravel()[0])
        baseline = math.log(np.clip(base_probability, 1e-12, 1 - 1e-12) /
                            (1 - np.clip(base_probability, 1e-12, 1 - 1e-12)))
        sigmoid = lambda value: 1 / (1 + np.exp(-np.clip(value, -35, 35)))
        response = sigmoid(baseline + partial)
        lower = sigmoid(baseline + confidence[:, 0])
        upper = sigmoid(baseline + confidence[:, 1])
        curves[parameter] = {
            "unit": UNITS[parameter], "x": axis.tolist(),
            "partial_dependence": response.tolist(), "lower_ci": lower.tolist(), "upper_ci": upper.tolist(),
            "p_value": float(p_values[index + 1]) if len(p_values) > index + 1 else None,
            "optimal_range": optimal_range(axis, response),
        }
    return model, curves


def export_suitability(model, envs):
    sst, sal, chl = envs
    # Keep the suitability grid exactly aligned with the SST source cells.
    # CHL polygons describe a coarser rectangular product footprint, not a
    # coastline mask, so they must not define the study-area coordinates.
    sst_ll = sst.to_crs(CRS)
    # UTM round-trips introduce tiny floating-point differences between rows;
    # estimate cell spacing from rounded coordinate keys, not raw uniques.
    x_values = np.sort(np.unique(np.round(sst_ll.geometry.x.to_numpy(), 3)))
    y_values = np.sort(np.unique(np.round(sst_ll.geometry.y.to_numpy(), 3)))
    dx = float(np.median(np.diff(x_values))) if len(x_values) > 1 else 0.01
    dy = float(np.median(np.diff(y_values))) if len(y_values) > 1 else 0.01
    grid = sst[["geometry", "SST"]].copy()
    grid["SST"] = grid["SST"].apply(
        lambda values: float(np.nanmean(values)) if np.isfinite(values).any() else np.nan)
    grid_ll_centers = sst_ll.geometry
    grid_ll = gpd.GeoDataFrame(
        {"geometry": [box(point.x - dx / 2, point.y - dy / 2,
                           point.x + dx / 2, point.y + dy / 2)
                      for point in grid_ll_centers]},
        geometry="geometry", crs=CRS)
    grid = grid.set_geometry(gpd.GeoSeries(grid_ll.geometry, index=grid.index, crs=CRS).to_crs(METRIC_CRS))
    for parameter, env in zip(PARAMETERS[1:], [sal, chl]):
        source = env[["geometry", parameter]].copy()
        source[parameter] = source[parameter].apply(lambda values: float(np.nanmean(values)) if np.isfinite(values).any() else np.nan)
        source = source[np.isfinite(source[parameter])]
        joined = gpd.sjoin_nearest(grid[["geometry"]], source, how="left", distance_col="distance_m")
        joined.loc[joined["distance_m"] > 12000, parameter] = np.nan
        grid[parameter] = joined.groupby(level=0)[parameter].first().reindex(grid.index)
    grid = grid.dropna(subset=PARAMETERS)
    if grid.empty:
        raise ValueError("Tidak ada grid spasial dengan ketiga parameter valid.")
    matrix = grid[PARAMETERS].to_numpy(dtype=float)
    # LogisticGAM.predict_mu returns the modeled probability. Some pyGAM
    # releases also expose predict_proba; support either API.
    probability = (model.predict_proba(matrix) if hasattr(model, "predict_proba")
                   else model.predict_mu(matrix))
    grid_ll = grid.to_crs(CRS)
    features = []
    for (_, row), (_, geographic_row), score in zip(grid.iterrows(), grid_ll.iterrows(), probability):
        score = float(score)
        category = "Sangat Sesuai" if score > 0.70 else "Cukup Sesuai" if score >= 0.40 else "Kurang Sesuai"
        features.append({"type": "Feature", "geometry": mapping(geographic_row.geometry), "properties": {
            "probability": score, "category": category,
            "SST": float(row["SST"]), "Salinitas": float(row["Salinitas"]), "Klorofil-a": float(row["Klorofil-a"]),
            "support": "Rerata bulanan pada grid lingkungan yang memiliki data",
        }})
    return {"type": "FeatureCollection", "name": "PenyuGuard_GAM_Habitat_Suitability",
            "features": features}


def main():
    sst, sal, chl = load_environment()
    envs = [sst, sal, chl]
    presences = load_presences()
    if presences.empty:
        raise ValueError("Tidak ditemukan koordinat iNaturalist pada turtle-sightings.json.")
    presences["presence"] = 1
    presence_env = extract_rows(presences, presences["month"].tolist(), envs)
    presence_env["presence"] = 1
    presence_env = presence_env.dropna(subset=PARAMETERS)
    if len(presence_env) < 20:
        raise ValueError(f"Hanya {len(presence_env)} titik kehadiran memiliki ketiga parameter terdekat; minimum analisis 20.")
    presence_months = presence_env["month"].astype(int).tolist()
    backgrounds = sample_background(sst, 2 * len(presence_env), presence_months)
    background_env = extract_rows(backgrounds, backgrounds["month"].tolist(), envs)
    background_env["presence"] = 0
    background_env = background_env.dropna(subset=PARAMETERS)
    samples = pd.concat([presence_env, background_env], ignore_index=True)
    if background_env.empty:
        raise ValueError("Ekstraksi parameter gagal menghasilkan titik pseudo-absence valid.")
    model, curves = fit_model(samples)
    curves_doc = {
        "title": "Kurva respons kesesuaian habitat penyu",
        "model": "LogisticGAM dengan spline aditif; gridsearch lambda logspace(-3, 3, 7)",
        "presence_source": "data/turtle-sightings.json, data_origin=iNaturalist",
        "background_source": "Sampel acak dari sel SST valid (kerangka dukungan data lingkungan); bukan absensi terverifikasi",
        "environmental_period": "Klimatologi bulanan Jan 2022–Nov 2026",
        "crs": METRIC_CRS,
        "sample_counts": {"presence": int(len(presence_env)), "background_valid": int(len(background_env))},
        "narrative_limit": "Hasil eksploratif; probabilitas dipengaruhi desain pseudo-absence dan bukan peluang absolut keberadaan penyu.",
        "parameters": curves,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "gam-habitat-curves.json").open("w", encoding="utf-8") as file:
        json.dump(curves_doc, file, ensure_ascii=False, indent=2, allow_nan=False)
    geojson = export_suitability(model, envs)
    with (OUT / "habitat-suitability.geojson").open("w", encoding="utf-8") as file:
        json.dump(geojson, file, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(json.dumps({"presence": len(presence_env), "background": len(background_env),
                      "map_cells": len(geojson["features"]), "outputs": [
                          str(OUT / "gam-habitat-curves.json"), str(OUT / "habitat-suitability.geojson")]}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Gagal membangun model GAM: {exc}", file=sys.stderr)
        raise
