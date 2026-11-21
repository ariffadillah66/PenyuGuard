/* ============================================================
 * PenyuGuard — dashboard.js
 * Dashboard analitik publik — membaca data melalui PGStore.
 * ============================================================ */
(function () {
  'use strict';

  var MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var UNIDENT = 'Tidak teridentifikasi';

  var D = { sightings: [], aqua: [], sst: [] };

  /* ---------------- helper umum ---------------- */
  function byId(id) { return document.getElementById(id); }
  function yOf(s) { return parseInt(String(s || '').slice(0, 4), 10) || 0; }
  function mOf(s) { return parseInt(String(s || '').slice(5, 7), 10) || 0; }
  function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function fmt1(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmt2(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ymKey(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }
  function ymLabel(key) {
    var y = String(key).slice(0, 4), m = parseInt(String(key).slice(5, 7), 10);
    return (MONTHS_SHORT[m - 1] || '?') + ' ' + y;
  }
  function avg(arr) {
    if (!arr.length) return null;
    var s = 0; arr.forEach(function (v) { s += Number(v) || 0; });
    return s / arr.length;
  }
  function distinct(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v !== undefined && v !== null && v !== '' && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }
  function originCounts(rows, fallback) {
    var out = {};
    rows.forEach(function (r) {
      var origin = r.data_origin || fallback || 'demo';
      out[origin] = (out[origin] || 0) + 1;
    });
    return out;
  }
  function originSummary(counts) {
    var labels = { demo: 'demo', community_report: 'laporan masyarakat', iNaturalist: 'iNaturalist', research: 'penelitian' };
    var parts = Object.keys(counts).sort().map(function (key) { return (labels[key] || key) + ': ' + fmt(counts[key]); });
    return parts.join(' · ') || 'belum ada data';
  }
  function renderOriginSummary() {
    var badge = byId('dash-origin-badge'), detail = byId('dash-origin-detail');
    var turtle = originCounts(D.sightings, 'demo');
    var aqua = originCounts(D.aqua, 'demo'), sst = originCounts(D.sst, 'research');
    var nonDemo = (turtle.community_report || 0) + (turtle.iNaturalist || 0) + (turtle.research || 0) +
      (aqua.research || 0);
    if (badge) {
      var remote = PGStore._remote();
      badge.className = 'badge ' + (remote ? (nonDemo ? 'badge-success' : 'badge-warn') : 'badge-warn');
      badge.innerHTML = remote
        ? '<i class="fa-solid fa-database"></i> Supabase aktif · ' + (nonDemo ? fmt(nonDemo) + ' data non-demo' : 'belum ada data non-demo')
        : '<i class="fa-solid fa-flask"></i> Mode demonstrasi lokal';
    }
    if (detail) detail.textContent =
      'Asal perjumpaan penyu: ' + originSummary(turtle) +
      '. Asal budidaya: ' + originSummary(aqua) + '. SST: ' + fmt(D.sst.length) +
      ' periode (' + originSummary(sst) + '). Data demo dan observasi bersumber dihitung terpisah dari kolom asal data.';
  }
  function countBy(rows, keyFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + 1; });
    return m;
  }

  /* ---------------- filter ---------------- */
  function getF() {
    var y = byId('f-year'), m = byId('f-month'), sp = byId('f-species'), lo = byId('f-location');
    return {
      year: (y && y.value) || '',
      month: (m && m.value) || '',
      species: (sp && sp.value) || '',
      location: (lo && lo.value) || ''
    };
  }
  function fSight(f) {
    return D.sightings.filter(function (r) {
      if (f.year && yOf(r.date) !== +f.year) return false;
      if (f.month && mOf(r.date) !== +f.month) return false;
      if (f.species && r.species !== f.species) return false;
      if (f.location && r.location_name !== f.location) return false;
      return true;
    });
  }
  function fSst(f) {
    return D.sst.filter(function (r) {
      if (f.year && r.year !== +f.year) return false;
      if (f.month && r.month !== +f.month) return false;
      return true;
    });
  }

  /* ---------------- kartu ringkasan (KPI) ---------------- */
  function renderKpis(f) {
    var host = byId('dash-kpis');
    if (!host) return;
    var s = fSight(f), sstRows = fSst(f);
    var species = distinct(s.map(function (r) { return r.species; }).filter(function (x) { return x && x !== UNIDENT; }));
    var locs = distinct(s.map(function (r) { return r.location_name; }));
    var sstAvg = avg(sstRows.map(function (r) { return r.sst_mean_c; }));

    host.innerHTML =
      PG.ui.statCard({ icon: 'fa-location-crosshairs', tone: 'teal', value: fmt(s.length), label: 'Total Perjumpaan Penyu' }) +
      PG.ui.statCard({ icon: 'fa-tags', tone: 'aqua', value: fmt(species.length), label: 'Spesies Teridentifikasi' }) +
      PG.ui.statCard({ icon: 'fa-map-location-dot', value: fmt(locs.length), label: 'Lokasi Pengamatan' }) +
      PG.ui.statCard({ icon: 'fa-seedling', tone: 'teal', value: fmt(D.aqua.length), label: 'Lokasi Budidaya', sub: 'di luar pengaruh filter spesies' }) +
      PG.ui.statCard({ icon: 'fa-temperature-half', tone: 'navy', value: sstAvg == null ? '–' : fmt2(sstAvg) + ' °C', label: 'Rata-rata SST' });
  }

  /* ---------------- Grafik 1: tren perjumpaan ---------------- */
  function renderTrend(f) {
    var s = fSight(f), labels, data;
    if (f.year) {
      labels = MONTHS_SHORT.slice();
      var cnt = countBy(s, function (r) { return mOf(r.date); });
      data = MONTHS_SHORT.map(function (_, i) { return cnt[i + 1] || 0; });
    } else {
      var keys = distinct(s.map(function (r) { return ymKey(yOf(r.date), mOf(r.date)); })).sort();
      var c2 = countBy(s, function (r) { return ymKey(yOf(r.date), mOf(r.date)); });
      labels = keys.map(ymLabel);
      data = keys.map(function (k) { return c2[k] || 0; });
    }
    PG.charts.make('ch-trend', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Perjumpaan', data: data,
          borderColor: '#D9FF47', backgroundColor: 'rgba(217,255,71,.14)',
          fill: true, tension: .35, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { autoSkip: true, maxRotation: 0 } }
        }
      }
    });
  }

  /* ---------------- Grafik 2: komposisi spesies ---------------- */
  function renderSpecies(f) {
    var cnt = countBy(fSight(f), function (r) { return r.species || UNIDENT; });
    var labels = Object.keys(cnt);
    PG.charts.make('ch-species', {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: labels.map(function (l) { return cnt[l]; }),
          backgroundColor: labels.map(function (l) { return PG.SPECIES_COLORS[l] || '#9DB2BC'; }),
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' } } }
    });
  }

  /* ---------------- Grafik 5: SST ---------------- */
  function renderSst(f) {
    var rows = fSst(f).slice().sort(function (a, b) { return (a.year - b.year) || (a.month - b.month); });
    var labels, data;
    if (f.year) {
      labels = MONTHS_SHORT.slice();
      var map = {};
      rows.forEach(function (r) { map[r.month] = Number(r.sst_mean_c); });
      data = MONTHS_SHORT.map(function (_, i) { return map[i + 1] != null ? map[i + 1] : null; });
    } else {
      labels = rows.map(function (r) { return ymLabel(ymKey(r.year, r.month)); });
      data = rows.map(function (r) { return Number(r.sst_mean_c); });
    }
    PG.charts.make('ch-sst', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'SST rata-rata (°C)', data: data,
          borderColor: '#0000FF', backgroundColor: 'rgba(0,0,255,.2)',
          fill: true, tension: .35, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5,
          spanGaps: true
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: '°C' } },
          x: { ticks: { autoSkip: true, maxRotation: 0 } }
        }
      }
    });
  }

  /* ---------------- render menyeluruh ---------------- */
  function render() {
    var f = getF();
    renderKpis(f);
    renderTrend(f);
    renderSpecies(f);
    renderSst(f);
  }

  /* ---------------- isi opsi filter ---------------- */
  function fillFilters() {
    var years = distinct(D.sightings.map(function (r) { return yOf(r.date); })).sort();
    var ySel = byId('f-year');
    if (ySel) ySel.innerHTML = PG.optionHtml(years.map(function (y) { return { value: String(y), label: String(y) }; }), '', 'Semua Tahun');

    var mSel = byId('f-month');
    if (mSel) mSel.innerHTML = PG.optionHtml(MONTHS_ID.map(function (m, i) { return { value: String(i + 1), label: m }; }), '', 'Semua Bulan');

    var species = distinct(D.sightings.map(function (r) { return r.species; })).sort();
    var spSel = byId('f-species');
    if (spSel) spSel.innerHTML = PG.optionHtml(species, '', 'Semua Spesies');

    var locs = distinct(D.sightings.map(function (r) { return r.location_name; })).sort();
    var loSel = byId('f-location');
    if (loSel) loSel.innerHTML = PG.optionHtml(locs, '', 'Semua Lokasi');
  }

  function renderUpdated() {
    var host = byId('dash-updated');
    if (!host) return;
    var dates = D.sightings.map(function (r) { return r.date; }).filter(Boolean).sort();
    var max = dates.length ? dates[dates.length - 1] : null;
    host.innerHTML = '<i class="fa-solid fa-rotate"></i> Pembaruan data terakhir: ' + (max ? PG.util.fmtDate(max) : '–');
  }

  function bindFilters() {
    ['f-year', 'f-month', 'f-species', 'f-location'].forEach(function (id) {
      var elx = byId(id);
      if (elx) elx.addEventListener('change', render);
    });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    try {
      var s = await PGStore.all('turtle_sightings');
      var a = await PGStore.all('aquaculture_sites');
      var st = await PGStore.all('sst_data');
      D.sightings = (s || []).filter(function (r) { return r.status === 'approved'; });
      D.aqua = a || [];
      D.sst = st || [];
      renderOriginSummary();
      fillFilters();
      renderUpdated();
      bindFilters();
      render();
    } catch (err) {
      console.error('[PenyuGuard] Gagal memuat data dashboard publik.', err);
      var host = byId('dash-kpis');
      if (host) host.innerHTML = PG.ui.emptyState('fa-triangle-exclamation', 'Data tidak dapat dimuat', 'Gagal membaca data dari penyimpanan aktif. Periksa koneksi Supabase dan kebijakan RLS, lalu muat ulang halaman.');
    }
  });
})();
