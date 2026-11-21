/* ============================================================
 * PenyuGuard — mapping.js
 * Peta publik: perjumpaan penyu dan titik rekomendasi budidaya.
 * Nilai oseanografi pada popup dibaca dari grid lokal; tidak diinterpolasi.
 * ============================================================ */
document.addEventListener('DOMContentLoaded', async function () {
  await PGAuth.ready;

  var U = PG.util;
  var mapEl = document.getElementById('map');
  if (!mapEl) return;
  if (!window.L) {
    mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5B7480;font-size:14px;padding:20px;text-align:center">Peta tidak dapat dimuat — pustaka Leaflet tidak tersedia (periksa koneksi).</div>';
    return;
  }

  var sightings = [];
  var mapLoadError = null;
  try { sightings = await PGStore.all('turtle_sightings') || []; }
  catch (e) { mapLoadError = e; console.warn('[PenyuGuard] Gagal memuat perjumpaan penyu:', e); }

  function isApproved(status) { return status === 'approved' || status === 'Disetujui'; }
  sightings = sightings.filter(function (s) { return s && isApproved(s.status); });
  sightings = await Promise.all(sightings.map(async function (s) {
    if (!s.photo) return s;
    try { s._mapPhotoUrl = await PGStore.mediaUrl(s.photo); }
    catch (e) { console.info('[PenyuGuard] Foto titik tidak tersedia untuk peta:', s.id); }
    return s;
  }));

  var sourceNote = document.getElementById('map-source-note');
  if (sourceNote) {
    if (PGStore._remote()) {
      sourceNote.textContent = mapLoadError
        ? 'Gagal membaca perjumpaan dari Supabase: ' + (mapLoadError.message || 'periksa koneksi dan kebijakan RLS.')
        : (sightings.length
          ? 'Peta memuat ' + sightings.length + ' catatan perjumpaan publik dari Supabase. Asal dan kualitas data tercantum pada jendela informasi.'
          : 'Tabel turtle_sightings di Supabase belum memiliki perjumpaan publik. Data lokal tidak digunakan sebagai pengganti.');
    } else {
      sourceNote.textContent = 'Mode Demonstrasi: titik perjumpaan berasal dari data contoh. Asal dan kualitas data tercantum pada jendela informasi.';
    }
  }

  var ORDER = ['Penyu Hijau', 'Penyu Sisik', 'Penyu Lekang', 'Penyu Tempayan', 'Penyu Belimbing'];
  var seenSp = {}, speciesList = [];
  sightings.forEach(function (s) {
    var species = String(s.species || '').trim();
    if (species && !seenSp[species]) { seenSp[species] = true; speciesList.push(species); }
  });
  speciesList.sort(function (a, b) {
    var ia = ORDER.indexOf(a); if (ia < 0) ia = 99;
    var ib = ORDER.indexOf(b); if (ib < 0) ib = 99;
    return ia - ib;
  });
  var speciesSelect = document.getElementById('f-species');
  if (speciesSelect) speciesSelect.innerHTML = '<option value="">Semua Spesies</option>' + speciesList.map(function (sp) {
    return '<option value="' + U.esc(sp) + '">' + U.esc(sp) + '</option>';
  }).join('');

  var map = L.map('map', { center: [-8.72, 119.70], zoom: 11, maxZoom: 17, zoomControl: false });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  setTimeout(function () { map.invalidateSize(); }, 250);

  var GROUPS = { sightings: L.layerGroup().addTo(map) };
  var markerByKey = {};
  var searchIndex = [];
  var recommendationLayer = null;
  var recommendationFeatures = [];
  var zoneLayer = null;
  var zoneFeatures = [];
  var oceanData = { sst: [], chl: [], chlMonths: [], salinity: [] };

  function row(label, value) {
    return '<div class="pop-row"><b>' + U.esc(label) + '</b><span>' + U.esc(value == null || value === '' ? '—' : String(value)) + '</span></div>';
  }
  function optionalRow(label, value) {
    return value == null || value === '' ? '' : row(label, value);
  }
  function noteValue(notes, field) {
    var match = String(notes || '').match(new RegExp('(?:^|[;\\n])\\s*' + field + '\\s*:\\s*([^;\\n]+)', 'i'));
    return match ? match[1].trim().replace(/\.$/, '') : '';
  }
  function popupSighting(s) {
    var isINaturalist = s.source === 'iNaturalist' || s.data_origin === 'iNaturalist';
    var notes = s.notes || '';
    var sourceId = String(s.id || s.report_no || '').replace(/^inat_/, '').replace(/^INAT-/, '');
    var sourceLink = isINaturalist && /^\d+$/.test(sourceId)
      ? 'https://www.inaturalist.org/observations/' + sourceId : '';
    var scientificName = noteValue(notes, 'nama ilmiah');
    var observer = s.observer_name || s.observer || noteValue(notes, 'pengamat');
    var license = noteValue(notes, 'lisensi foto');
    var imageUrl = String(s._mapPhotoUrl || '');
    var hasImage = /^https:\/\//i.test(imageUrl);
    var photo = hasImage
      ? '<a class="pop-photo-link" href="' + U.esc(sourceLink || imageUrl) + '" target="_blank" rel="noopener" aria-label="Buka sumber foto">' +
        '<img class="pop-photo" src="' + U.esc(imageUrl) + '" alt="Foto ' + U.esc(s.species || 'penyu') + ' di ' + U.esc(s.location_name || 'lokasi observasi') + '" loading="lazy"></a>' +
        (isINaturalist ? '<div class="pop-photo-credit">Foto dari iNaturalist · lisensi tercantum pada observasi sumber</div>' : '')
      : '';
    var details = row('Tanggal', U.fmtDateShort(s.date) + (s.time ? ' · ' + s.time : '')) +
      row('Lokasi', s.location_name) +
      optionalRow('Nama ilmiah', scientificName) +
      optionalRow('Pengamat', observer) +
      (isINaturalist ? optionalRow('Kualitas', s.quality_grade || noteValue(notes, 'kualitas data')) :
        optionalRow('Kondisi', s.condition)) +
      optionalRow('Panjang karapas', s.carapace_length_cm != null && s.carapace_length_cm !== ''
        ? U.fmtNum(s.carapace_length_cm, 1) + ' cm' : '') +
      (isINaturalist ? optionalRow('Lisensi foto', license || 'Tidak dicantumkan') :
        optionalRow('No. Laporan', s.report_no));
    var provenance = isINaturalist
      ? '<div class="pop-note"><i class="fa-solid fa-circle-info"></i> Observasi dan identifikasi berasal dari iNaturalist; bukan verifikasi lapangan PenyuGuard.</div>'
      : s.data_origin === 'community_report'
        ? '<div class="pop-note"><i class="fa-solid fa-shield-halved"></i> Laporan masyarakat yang telah ditinjau petugas.</div>'
        : '<div class="pop-note"><i class="fa-solid fa-circle-info"></i> Asal data: ' + U.esc(s.data_origin || 'demo') + '.</div>';
    var sourceButton = sourceLink
      ? '<a class="pop-source-link" href="' + U.esc(sourceLink) + '" target="_blank" rel="noopener">Buka observasi iNaturalist #' + U.esc(sourceId) + ' <i class="fa-solid fa-arrow-up-right-from-square"></i></a>'
      : '';
    return '<div class="pop-hero pop-hero-sighting">' +
      '<span class="pop-kicker"><i class="fa-solid fa-binoculars"></i> ' + (isINaturalist ? 'OBSERVASI iNATURALIST' : 'PERJUMPAAN TERVERIFIKASI') + '</span>' +
      '<div class="pop-title">' + U.esc(s.species || 'Penyu') + '</div>' +
      '<div class="pop-sub"><i class="fa-solid fa-location-dot"></i> ' + U.esc(s.location_name || 'Lokasi tidak dicantumkan') + '</div>' +
      '</div>' + photo + '<div class="pop-data-card">' + details + '</div>' + sourceButton + provenance;
  }

  function toRad(n) { return n * Math.PI / 180; }
  function distanceKm(aLat, aLng, bLat, bLng) {
    var dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function nearestMonthly(records, lat, lng, coordinateFn, monthsFn, valueFn) {
    var best = null;
    (records || []).forEach(function (record) {
      var coords = coordinateFn(record);
      if (!coords || !Number.isFinite(Number(coords.lat)) || !Number.isFinite(Number(coords.lng))) return;
      var periods = monthsFn(record) || [];
      var valid = null;
      for (var i = periods.length - 1; i >= 0; i--) {
        var value = valueFn(record, periods[i], i);
        if (value !== null && value !== '' && Number.isFinite(Number(value))) {
          valid = { period: periods[i], value: Number(value) };
          break;
        }
      }
      if (!valid) return;
      var distance = distanceKm(lat, lng, Number(coords.lat), Number(coords.lng));
      if (!best || distance < best.distanceKm) best = {
        period: valid.period, value: valid.value, distanceKm: distance
      };
    });
    return best;
  }
  async function loadOceanographicData() {
    var results = await Promise.allSettled([
      fetch('../data/sst-rinca.geojson').then(function (r) { if (!r.ok) throw Error('SST ' + r.status); return r.json(); }),
      fetch('../data/oceanographic/SALINITAS.geojson').then(function (r) { if (!r.ok) throw Error('salinitas ' + r.status); return r.json(); })
    ]);
    if (results[0].status === 'fulfilled') oceanData.sst = results[0].value.features || [];
    else console.warn('[PenyuGuard] Grid SST tidak dapat dimuat untuk popup:', results[0].reason);
    if (results[1].status === 'fulfilled') oceanData.salinity = results[1].value.features || [];
    else console.warn('[PenyuGuard] Grid salinitas tidak dapat dimuat untuk popup:', results[1].reason);
    if (window.CHL_GEO && Array.isArray(window.CHL_GEO.features)) {
      oceanData.chl = window.CHL_GEO.features;
      oceanData.chlMonths = (window.CHL_GEO.properties || {}).bulan || [];
    } else console.warn('[PenyuGuard] Grid klorofil-a tidak tersedia pada halaman peta.');
  }
  function parameterRow(label, result, unit) {
    var value = result ? result.value.toFixed(2) : '—';
    var detail = result ? result.period + ' · grid ' + result.distanceKm.toFixed(1) + ' km' : 'Tidak tersedia pada grid';
    return '<div class="pop-metric"><span class="pop-metric-label">' + U.esc(label) + '</span>' +
      '<strong>' + value + (result ? ' <small>' + U.esc(unit) + '</small>' : '') + '</strong>' +
      '<span class="pop-metric-detail">' + U.esc(detail) + '</span></div>';
  }
  function popupRecommendation(properties, latlng) {
    var p = properties || {};
    var sst = nearestMonthly(oceanData.sst, latlng.lat, latlng.lng,
      function (f) { var x = f.properties || {}; return { lat: x.lat, lng: x.lon }; },
      function (f) { return Object.keys(f.properties || {}).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort(); },
      function (f, period) { return (f.properties || {})[period]; });
    var chl = nearestMonthly(oceanData.chl, latlng.lat, latlng.lng,
      function (f) { var x = f.properties || {}; return { lat: x.lat, lng: x.lon }; },
      function () { return oceanData.chlMonths; },
      function (f, period, index) { var values = (f.properties || {}).v || []; return values[index]; });
    var salinity = nearestMonthly(oceanData.salinity, latlng.lat, latlng.lng,
      function (f) { var x = f.properties || {}; return { lat: x.lat_pusat, lng: x.lon_pusat }; },
      function (f) { return Object.keys(f.properties || {}).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort(); },
      function (f, period) { return (f.properties || {})[period]; });
    return '<div class="pop-hero pop-hero-recommendation">' +
      '<span class="pop-kicker"><i class="fa-solid fa-compass"></i> ANALISIS SPASIAL</span>' +
      '<div class="pop-title">Titik Rekomendasi Budidaya</div>' +
      '<div class="pop-sub"><i class="fa-solid fa-location-dot"></i> Titik ' + U.esc(p.CID != null ? '#' + p.CID : 'rekomendasi') + '</div>' +
      '</div>' +
      '<div class="pop-section-title"><i class="fa-solid fa-water"></i> Parameter oseanografi</div>' +
      '<div class="pop-metrics">' +
      parameterRow('SST · NASA MUR', sst, '°C') +
      parameterRow('Klorofil-a · JAXA', chl, 'mg/m³') +
      parameterRow('Salinitas · HYCOM', salinity, 'PSU') +
      '</div>' +
      '<div class="pop-note"><i class="fa-solid fa-circle-info"></i> Nilai bulanan dari sel grid terdekat; periode dan jarak berbeda per parameter. Bukan pengukuran lapangan atau keputusan kelayakan final.</div>';
  }

  function popupZone(properties) {
    var p = properties || {};
    return '<div class="pop-hero pop-hero-zone">' +
      '<span class="pop-kicker"><i class="fa-solid fa-water"></i> AREA KAJIAN</span>' +
      '<div class="pop-title">Zona Potensial Budidaya</div>' +
      '<div class="pop-sub">Zona indikatif dari data spasial</div>' +
      '</div><div class="pop-data-card">' +
      optionalRow('ID fitur', p.OBJECTID != null ? p.OBJECTID : p.Id) +
      optionalRow('Kode grid', p.gridcode) +
      '</div><div class="pop-note"><i class="fa-solid fa-circle-info"></i> Batas zona mengikuti data sumber dan belum menyatakan kelayakan final. Perlu validasi kondisi laut, lapangan, dan zonasi.</div>';
  }

  function $(id) { return document.getElementById(id); }
  function chk(name) {
    var cb = document.querySelector('.map-layers-panel input[data-layer="' + name + '"]');
    return !!(cb && cb.checked);
  }
  function setCount(name, text) { var el = $('cnt-' + name); if (el) el.textContent = text; }
  function dateOk(date, filter) {
    date = String(date || '');
    if (filter.from && date < filter.from) return false;
    if (filter.to && date > filter.to) return false;
    return true;
  }
  function approxPt(lat, lng) {
    if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return null;
    var coords = PGStore.approxCoords(Number(lat), Number(lng));
    return coords && !isNaN(coords.lat) && !isNaN(coords.lng) ? coords : null;
  }

  var lastSightings = [];
  function rebuild() {
    var filter = {
      from: ($('f-from') || {}).value || '',
      to: ($('f-to') || {}).value || '',
      species: ($('f-species') || {}).value || '',
      type: ($('f-type') || {}).value || ''
    };
    lastSightings = sightings.filter(function (s) {
      return (filter.type === '' || filter.type === 'sightings') && dateOk(s.date, filter) &&
        (!filter.species || s.species === filter.species);
    });

    markerByKey = {};
    GROUPS.sightings.clearLayers();
    if (chk('sightings')) lastSightings.forEach(function (s) {
      var coords = approxPt(s.lat, s.lng);
      if (!coords) return;
      var color = PG.SPECIES_COLORS[s.species] || '#9DB2BC';
      var marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 8, color: color, weight: 2, fillColor: color, fillOpacity: 0.9
      });
      marker.bindPopup(popupSighting(s), { className: 'pg-map-popup', maxWidth: 280, minWidth: 0, autoPan: true, autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [280, 20] });
      marker.addTo(GROUPS.sightings);
      markerByKey['sightings:' + s.id] = marker;
    });

    var showRecommendations = chk('import-recommendations') &&
      (filter.type === '' || filter.type === 'recommendations');
    if (recommendationLayer) {
      if (showRecommendations && !map.hasLayer(recommendationLayer)) recommendationLayer.addTo(map);
      if (!showRecommendations && map.hasLayer(recommendationLayer)) map.removeLayer(recommendationLayer);
    }
    var showZones = chk('zones') && (filter.type === '' || filter.type === 'zones');
    if (zoneLayer) {
      if (showZones && !map.hasLayer(zoneLayer)) zoneLayer.addTo(map);
      if (!showZones && map.hasLayer(zoneLayer)) map.removeLayer(zoneLayer);
    }
    setCount('sightings', lastSightings.length + ' titik');
    buildSearchIndex(filter, showRecommendations, showZones);
  }

  function buildSearchIndex(filter, showRecommendations, showZones) {
    searchIndex = [];
    var seen = {};
    function add(label, subtitle, lat, lng, key) {
      if (!label) return;
      var token = String(label).toLowerCase();
      if (seen[token]) return;
      seen[token] = true;
      searchIndex.push({ label: label, subtitle: subtitle, lat: lat, lng: lng, key: key });
    }
    if (chk('sightings')) lastSightings.forEach(function (s) {
      var coords = approxPt(s.lat, s.lng);
      if (coords) add(s.location_name, 'Perjumpaan Penyu', coords.lat, coords.lng, 'sightings:' + s.id);
    });
    if (showRecommendations) recommendationFeatures.forEach(function (item) {
      var coords = item.layer && item.layer.getLatLng ? item.layer.getLatLng() : null;
      if (!coords) return;
      var key = 'recommendations:' + item.id;
      markerByKey[key] = item.layer;
      add('Titik Rekomendasi Budidaya #' + item.id, 'Titik Rekomendasi Budidaya', coords.lat, coords.lng, key);
    });
    if (showZones) zoneFeatures.forEach(function (item) {
      var center = item.layer && item.layer.getBounds ? item.layer.getBounds().getCenter() : null;
      if (!center) return;
      var key = 'zones:' + item.id;
      markerByKey[key] = item.layer;
      add('Zona Potensial Budidaya #' + item.id, 'Zona Potensial Budidaya', center.lat, center.lng, key);
    });
  }

  function renderResults(query) {
    var box = $('map-search-results');
    if (!box) return;
    var q = String(query || '').trim().toLowerCase();
    if (q.length < 2) { box.innerHTML = ''; return; }
    var hits = searchIndex.filter(function (item) { return item.label.toLowerCase().indexOf(q) > -1; }).slice(0, 8);
    if (!hits.length) {
      box.innerHTML = '<div style="padding:10px 15px;font-size:12.8px;color:#5B7480">Lokasi tidak ditemukan pada layer aktif.</div>';
      return;
    }
    box.innerHTML = hits.map(function (item, i) {
      return '<button type="button" data-i="' + i + '"><i class="fa-solid fa-location-dot"></i><span><strong>' + U.esc(item.label) +
        '</strong><small style="display:block;color:#5B7480;font-weight:500">' + U.esc(item.subtitle) + '</small></span></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button[data-i]'), function (button) {
      button.addEventListener('click', function () {
        var item = hits[parseInt(button.dataset.i, 10)];
        box.innerHTML = '';
        if (!item) return;
        map.flyTo([item.lat, item.lng], 13, { duration: 0.9 });
        setTimeout(function () { var marker = markerByKey[item.key]; if (marker && marker.openPopup) marker.openPopup(); }, 980);
      });
    });
  }

  var searchInput = $('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', U.debounce(function () { renderResults(searchInput.value); }, 180));
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { searchInput.value = ''; $('map-search-results').innerHTML = ''; }
    });
  }
  document.addEventListener('click', function (e) {
    var wrap = document.querySelector('.map-search-wrap'), box = $('map-search-results');
    if (wrap && box && !wrap.contains(e.target)) box.innerHTML = '';
  });
  Array.prototype.forEach.call(document.querySelectorAll('.map-layers-panel input[type="checkbox"][data-layer]'), function (cb) {
    cb.addEventListener('change', rebuild);
  });
  var panel = $('layers-panel'), panelHead = $('layers-toggle');
  if (panel && panelHead) {
    panelHead.addEventListener('click', function () { panel.classList.toggle('collapsed'); });
    if (window.innerWidth <= 760) panel.classList.add('collapsed');
  }
  ['f-from', 'f-to', 'f-species', 'f-type'].forEach(function (id) {
    var control = $(id); if (control) control.addEventListener('change', rebuild);
  });
  var resetButton = $('f-reset');
  if (resetButton) resetButton.addEventListener('click', function () {
    ['f-from', 'f-to', 'f-species', 'f-type'].forEach(function (id) { var control = $(id); if (control) control.value = ''; });
    rebuild();
    PG.toast('Filter peta diatur ulang.', 'info');
  });

  async function setupRecommendationLayer() {
    var checkbox = document.querySelector('.map-layers-panel input[data-layer="import-recommendations"]');
    if (!checkbox) return;
    try {
      await loadOceanographicData();
      var response = await fetch('../data/cultivation_import_20261118/Titik_Rekomendasi_Budidaya.json');
      if (!response.ok) throw Error('HTTP ' + response.status);
      var geojson = await response.json();
      recommendationFeatures = [];
      recommendationLayer = L.geoJSON(geojson, {
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, { radius: 7, color: '#B84B39', weight: 2, fillColor: '#E76F51', fillOpacity: 0.9 });
        },
        onEachFeature: function (feature, layer) {
          var props = feature.properties || {};
          var id = props.CID != null ? props.CID : props.OBJECTID;
          var coords = layer.getLatLng ? layer.getLatLng() : null;
          if (!coords) return;
          layer.bindPopup(popupRecommendation(props, coords), { className: 'pg-map-popup', maxWidth: 280, minWidth: 0, autoPan: true, autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [280, 20] });
          recommendationFeatures.push({ id: id, layer: layer });
        }
      });
      setCount('import-recommendations', recommendationFeatures.length + ' titik');
      rebuild();
    } catch (error) {
      setCount('import-recommendations', 'gagal dimuat');
      console.warn('[PenyuGuard] Titik rekomendasi gagal dimuat:', error);
    }
  }

  async function setupZoneLayer() {
    var checkbox = document.querySelector('.map-layers-panel input[data-layer="zones"]');
    if (!checkbox) return;
    try {
      var response = await fetch('../data/cultivation_import_20261118/Zona_Budidaya_Sesuai_Parameter.json');
      if (!response.ok) throw Error('HTTP ' + response.status);
      var geojson = await response.json();
      zoneFeatures = [];
      zoneLayer = L.geoJSON(geojson, {
        style: function () { return { color: '#694E9B', weight: 2, opacity: 0.9, fillColor: '#9A7BC7', fillOpacity: 0.28 }; },
        onEachFeature: function (feature, layer) {
          var properties = feature.properties || {};
          var id = properties.OBJECTID != null ? properties.OBJECTID : properties.Id;
          layer.bindPopup(popupZone(properties), { className: 'pg-map-popup', maxWidth: 280, minWidth: 0, autoPan: true, autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [280, 20] });
          layer.bindTooltip('Zona Potensial Budidaya', { sticky: true, className: 'zone-map-tooltip' });
          zoneFeatures.push({ id: id, layer: layer });
        }
      });
      setCount('zones', zoneFeatures.length + ' zona');
      rebuild();
    } catch (error) {
      setCount('zones', 'gagal dimuat');
      console.warn('[PenyuGuard] Zona potensial gagal dimuat:', error);
    }
  }

  rebuild();
  setupRecommendationLayer();
  setupZoneLayer();
});
