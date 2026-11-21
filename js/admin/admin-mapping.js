/* ============================================================
 * PenyuGuard Admin — admin-mapping.js
 * Manajemen Data Persebaran: peta Leaflet + CRUD spatial_locations
 * (mode demonstrasi — data tersimpan lokal)
 * ============================================================ */
(function () {
  'use strict';

  var U = PG.util;
  var map = null;
  var addMode = false;
  var layerSpatial = null;
  var layerSightings = null;
  var state = { cat: '', species: '', month: '' };

  var TYPE_META = {
    interaction_zone: { label: 'Zona Potensial Interaksi', badge: 'badge-warn', color: '#D9FF47' },
    nesting_sensitive: { label: 'Lokasi Peneluran Sensitif', badge: 'badge-revisi', color: '#7F8CFF' },
    hotspot: { label: 'Titik Perjumpaan Berulang', badge: 'badge-info', color: '#D9FF47' }
  };

  function typeMeta(t) { return TYPE_META[t] || { label: t || '-', badge: 'badge-muted', color: '#9DB2BC' }; }

  function initMap() {
    map = L.map('admin-map', { zoomControl: true }).setView([-8.72, 119.70], 11);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Sources: Esri, TomTom, Garmin, FAO, NOAA, USGS, and the GIS User Community'
    }).addTo(map);

    layerSpatial = L.layerGroup().addTo(map);
    layerSightings = L.layerGroup().addTo(map);

    map.on('click', function (e) {
      if (!addMode) return;
      openForm(null, { lat: e.latlng.lat, lng: e.latlng.lng });
    });
  }

  /* ---------------- render titik-titik peta ---------------- */
  async function renderLayers() {
    layerSpatial.clearLayers();
    layerSightings.clearLayers();

    var spatial = await PGStore.all('spatial_locations');
    var sightings = await PGStore.all('turtle_sightings');

    spatial
      .filter(function (r) { return !state.cat || r.type === state.cat; })
      .forEach(function (r) {
        var m = typeMeta(r.type);
        var color = m.color;
        var marker;
        if (r.type === 'interaction_zone' && r.radius_m > 0) {
          marker = L.circle([r.lat, r.lng], {
            radius: r.radius_m, color: color, weight: 2, dashArray: '6 6', fillColor: color, fillOpacity: .08
          });
        } else {
          marker = L.circleMarker([r.lat, r.lng], {
            radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: .92
          });
        }
        marker.bindPopup(
          '<div class="pop-title">' + U.esc(r.name) + '</div>' +
          '<div class="pop-sub">' + U.esc(m.label) + (r.type === 'interaction_zone' && r.radius_m > 0 ? ' • radius ' + U.fmtNum(r.radius_m) + ' m' : '') + '</div>' +
          '<div class="pop-row"><b>Koordinat</b><span>' + Number(r.lat).toFixed(5) + ', ' + Number(r.lng).toFixed(5) + '</span></div>' +
          '<div class="pop-row"><b>Publik</b><span>' + (r.public_visible ? 'Ya' : 'Tidak (sensitif)') + '</span></div>' +
          '<div class="pop-note">' + U.esc(r.description || '') + '</div>'
        );
        marker.addTo(layerSpatial);
      });

    sightings
      .filter(function (r) { return r.status === 'approved'; })
      .filter(function (r) { return !state.species || r.species === state.species; })
      .filter(function (r) { return !state.month || String(r.date || '').slice(0, 7) === state.month; })
      .forEach(function (r) {
        var c = PG.SPECIES_COLORS[r.species] || '#9DB2BC';
        var mk = L.circleMarker([r.lat, r.lng], {
          radius: 7, color: '#fff', weight: 2, fillColor: c, fillOpacity: .9
        }).bindPopup(
          '<div class="pop-title">' + U.esc(r.species) + '</div>' +
          '<div class="pop-sub">' + U.esc(r.report_no || '') + ' • ' + U.fmtDateShort(r.date) + '</div>' +
          '<div class="pop-row"><b>Lokasi</b><span>' + U.esc(r.location_name) + '</span></div>' +
          '<div class="pop-row"><b>Kondisi</b><span>' + U.esc(r.condition) + '</span></div>' +
          '<div class="pop-note">Titik pengamatan (read-only) — kelola melalui menu Data Penyu.</div>'
        );
        mk.addTo(layerSightings);
      });


  }

  /* ---------------- form modal ---------------- */
  function openForm(row, coords) {
    var isEdit = !!row;
    var lat = row ? row.lat : (coords ? coords.lat : -8.72);
    var lng = row ? row.lng : (coords ? coords.lng : 119.70);
    var type = row ? row.type : 'interaction_zone';
    var html =
      '<form id="sp-form" class="form-grid">' +
      '  <div class="field span-2"><label>Nama Lokasi <span class="req">*</span></label>' +
      '    <input class="input" name="name" required value="' + U.esc(row ? row.name : '') + '" placeholder="mis. Zona Potensial Interaksi — Loh Wenci"></div>' +
      '  <div class="field"><label>Kategori <span class="req">*</span></label>' +
      '    <select class="select" name="type">' +
      Object.keys(TYPE_META).map(function (k) {
        return '<option value="' + k + '"' + (type === k ? ' selected' : '') + '>' + TYPE_META[k].label + '</option>';
      }).join('') +
      '    </select></div>' +
      '  <div class="field"><label>Radius (m — untuk zona)</label>' +
      '    <input class="input" name="radius_m" type="number" min="0" step="50" value="' + (row && row.radius_m ? row.radius_m : 1500) + '"></div>' +
      '  <div class="field"><label>Latitude <span class="req">*</span></label>' +
      '    <input class="input" name="lat" type="number" step="any" required value="' + lat + '"></div>' +
      '  <div class="field"><label>Longitude <span class="req">*</span></label>' +
      '    <input class="input" name="lng" type="number" step="any" required value="' + lng + '"></div>' +
      '  <div class="field span-2"><label>Deskripsi</label>' +
      '    <textarea class="textarea" name="description" rows="3" placeholder="Keterangan singkat titik/zona…">' + U.esc(row ? row.description || '' : '') + '</textarea></div>' +
      '  <div class="field span-2"><label class="checkbox"><input type="checkbox" name="public_visible"' + (!row || row.public_visible ? ' checked' : '') + '>' +
      '    <span>Tampilkan di peta publik <small class="text-muted">(nonaktifkan untuk lokasi sensitif — koordinat tidak dipublikasikan)</small></span></label></div>' +
      '</form>';
    var m = PG.ui.openModal({
      title: isEdit ? 'Edit Titik/Zona Spasial' : 'Tambah Titik/Zona Spasial',
      size: 'lg',
      body: html,
      footer: '<button class="btn btn-outline" data-cancel>Batal</button>' +
        '<button class="btn btn-primary" data-save><i class="fa-solid fa-floppy-disk"></i> Simpan</button>'
    });
    m.el.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.el.querySelector('[data-save]').addEventListener('click', async function () {
      var form = m.el.querySelector('#sp-form');
      var name = form.name.value.trim();
      var latV = parseFloat(form.lat.value);
      var lngV = parseFloat(form.lng.value);
      if (name.length < 3) { PG.toast('Nama lokasi minimal 3 karakter.', 'error'); return; }
      if (!isFinite(latV) || latV < -90 || latV > 90) { PG.toast('Latitude tidak valid.', 'error'); return; }
      if (!isFinite(lngV) || lngV < -180 || lngV > 180) { PG.toast('Longitude tidak valid.', 'error'); return; }
      var payload = {
        name: name,
        type: form.type.value,
        lat: latV,
        lng: lngV,
        radius_m: parseInt(form.radius_m.value, 10) || 0,
        description: form.description.value.trim(),
        public_visible: form.public_visible.checked
      };
      if (isEdit) {
        await PGStore.update('spatial_locations', row.id, payload);
        PG.toast('Titik berhasil diperbarui.', 'success');
      } else {
        await PGStore.insert('spatial_locations', payload);
        PG.toast('Titik baru ditambahkan.', 'success');
      }
      m.close();
      await renderLayers();
      renderTable();
    });
  }

  /* ---------------- tabel daftar ---------------- */
  var tableState = { page: 1, perPage: 8, search: '' };

  async function renderTable() {
    var mount = U.el('#tbl-spatial');
    var countEl = U.el('#spatial-count');
    if (!mount) return;
    var rows = await PGStore.all('spatial_locations');
    if (countEl) countEl.textContent = rows.length + ' titik/zona';
    var list = rows;
    if (tableState.search) {
      var q = tableState.search.toLowerCase();
      list = rows.filter(function (r) {
        return String(r.name || '').toLowerCase().indexOf(q) > -1;
      });
    }
    if (!list.length) {
      mount.innerHTML = PG.ui.emptyState('fa-map-location-dot', 'Belum ada titik', 'Aktifkan Mode Tambah Titik lalu klik peta untuk menambah.');
      return;
    }
    var pages = Math.max(1, Math.ceil(list.length / tableState.perPage));
    if (tableState.page > pages) tableState.page = pages;
    var slice = list.slice((tableState.page - 1) * tableState.perPage, tableState.page * tableState.perPage);

    var h = '<div class="table-wrap"><table class="pg-table"><thead><tr>' +
      '<th>Nama</th><th>Kategori</th><th>Koordinat</th><th>Radius</th><th>Publik</th><th style="text-align:right">Aksi</th></tr></thead><tbody>';
    slice.forEach(function (r) {
      var tm = typeMeta(r.type);
      h += '<tr data-id="' + U.esc(r.id) + '">' +
        '<td><strong>' + U.esc(r.name) + '</strong></td>' +
        '<td><span class="badge ' + tm.badge + '"><i class="fa-solid fa-circle" style="font-size:6px"></i> ' + U.esc(tm.label) + '</span></td>' +
        '<td>' + Number(r.lat).toFixed(5) + ', ' + Number(r.lng).toFixed(5) + '</td>' +
        '<td>' + (r.radius_m > 0 ? U.fmtNum(r.radius_m) + ' m' : '—') + '</td>' +
        '<td>' + (r.public_visible ? '<span class="badge badge-success">Publik</span>' : '<span class="badge badge-danger">Sensitif</span>') + '</td>' +
        '<td><div class="cell-actions" style="justify-content:flex-end">' +
        '<button class="btn btn-ghost" data-edit title="Edit"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="btn btn-ghost" data-del title="Hapus" style="background:var(--pg-danger-soft);color:var(--pg-danger)"><i class="fa-regular fa-trash-can"></i></button>' +
        '</div></td></tr>';
    });
    h += '</tbody></table></div><div class="pagination" style="justify-content:center"></div>';
    mount.innerHTML = h;

    var pm = U.el('.pagination', mount);
    if (pm) {
      PG.ui.pagination(pm, {
        page: tableState.page, perPage: tableState.perPage, total: list.length,
        onChange: function (p) { tableState.page = p; renderTable(); }
      });
    }
    U.els('tr[data-id]', mount).forEach(function (tr) {
      var id = tr.getAttribute('data-id');
      var row = rows.filter(function (r) { return String(r.id) === String(id); })[0];
      if (!row) return;
      tr.querySelector('[data-edit]').addEventListener('click', function () { openForm(row); });
      tr.querySelector('[data-del]').addEventListener('click', async function () {
        var ok = await PG.ui.confirm({
          title: 'Hapus Titik/Zona',
          danger: true, okLabel: 'Ya, Hapus',
          message: 'Hapus <strong>' + U.esc(row.name) + '</strong> dari data persebaran?'
        });
        if (!ok) return;
        await PGStore.remove('spatial_locations', row.id);
        PG.toast('Titik dihapus.', 'success');
        await renderLayers();
        renderTable();
      });
    });
  }

  /* ---------------- kontrol ---------------- */
  function bindControls() {
    var addBtn = U.el('#btn-add-mode');
    var hint = U.el('#adm-map-addhint');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        addMode = !addMode;
        addBtn.innerHTML = addMode
          ? '<i class="fa-solid fa-xmark"></i> Keluar Mode Tambah'
          : '<i class="fa-solid fa-location-crosshairs"></i> Mode Tambah Titik';
        addBtn.classList.toggle('btn-primary', !addMode);
        addBtn.classList.toggle('btn-warn', addMode);
        if (hint) hint.hidden = !addMode;
        var el = U.el('#admin-map');
        if (el) el.style.cursor = addMode ? 'crosshair' : '';
      });
    }
    var cat = U.el('#adm-map-cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; renderLayers(); });
    var sp = U.el('#adm-map-species');
    if (sp) sp.addEventListener('change', function () { state.species = sp.value; renderLayers(); });
    var mo = U.el('#adm-map-month');
    if (mo) mo.addEventListener('change', function () { state.month = mo.value; renderLayers(); });
    var reset = U.el('#adm-map-reset');
    if (reset) reset.addEventListener('click', function () {
      state = { cat: '', species: '', month: '' };
      if (cat) cat.value = '';
      if (sp) sp.value = '';
      if (mo) mo.value = '';
      renderLayers();
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    try { if (window.PGAuth && PGAuth.ready) await PGAuth.ready; } catch (e) { }
    if (!U.el('#admin-map')) return;
    initMap();
    bindControls();
    await renderLayers();
    renderTable();
  });
})();
