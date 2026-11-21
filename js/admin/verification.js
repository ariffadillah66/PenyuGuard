/* ============================================================
 * PenyuGuard — admin/verification.js
 * Halaman Verifikasi Laporan: statistik, filter, tabel, dan
 * modal pemeriksaan dengan aksi verifikasi lengkap.
 * ------------------------------------------------------------
 * Setiap aksi mencatat status, catatan, verifikator, dan log
 * aktivitas. Laporan disetujui dapat diteruskan otomatis ke
 * data utama (tergantung pengaturan publication_mode).
 * ============================================================ */
(function () {
  'use strict';
  var PG = window.PG;
  var esc = function (v) { return PG.util.esc(v); };

  var state = { status: 'Semua', q: '', page: 1, perPage: 10 };
  var allRows = [];
  var STATUS_KEYS = PG.REPORT_STATUSES;

  function $(id) { return document.getElementById(id); }

  /* ==========================================================
   * Muat & render dasar
   * ========================================================== */
  async function reload() {
    allRows = (await PGStore.all('public_reports'))
      .slice()
      .sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
    renderModeBadge();
    renderStats();
    renderTabs();
    renderTable();
    if (window.PGAdmin && PGAdmin.refreshBadge) PGAdmin.refreshBadge();
  }

  function renderModeBadge() {
    var el = $('verif-mode');
    if (!el) return;
    var mode = PGStore.settings.get().publication_mode;
    el.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ' +
      (mode === 'hold' ? 'Publikasi: Ditahan — diteruskan manual' : 'Publikasi: Langsung diteruskan');
  }

  function renderStats() {
    var host = $('verif-stats');
    if (!host) return;
    var c = PGAdmin.countBy(allRows, 'status');
    var defs = [
      ['Menunggu Verifikasi', 'fa-clock', 'warn'],
      ['Sedang Diperiksa', 'fa-magnifying-glass', ''],
      ['Disetujui', 'fa-circle-check', 'teal'],
      ['Ditolak', 'fa-circle-xmark', 'danger'],
      ['Perlu Revisi', 'fa-pen-clip', 'navy']
    ];
    host.innerHTML = defs.map(function (d) {
      return PG.ui.statCard({ icon: d[1], label: d[0], value: PG.util.fmtNum(c[d[0]] || 0), tone: d[2] });
    }).join('');
    PG.util.els('.stat-card', host).forEach(function (card, i) {
      card.style.cursor = 'pointer';
      card.title = 'Filter: ' + defs[i][0];
      card.addEventListener('click', function () { setStatus(defs[i][0]); });
    });
  }

  function setStatus(s) {
    state.status = s;
    state.page = 1;
    renderTabs();
    renderTable();
  }

  function renderTabs() {
    var host = $('verif-tabs');
    if (!host) return;
    var c = PGAdmin.countBy(allRows, 'status');
    var defs = [['Semua', allRows.length]].concat(STATUS_KEYS.map(function (s) { return [s, c[s] || 0]; }));
    host.innerHTML = defs.map(function (d) {
      return '<button type="button" class="verif-tab' + (state.status === d[0] ? ' active' : '') + '" data-tab="' + esc(d[0]) + '">' +
        esc(d[0]) + '<span class="vt-count">' + PG.util.fmtNum(d[1]) + '</span></button>';
    }).join('');
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return allRows.filter(function (r) {
      if (state.status !== 'Semua' && r.status !== state.status) return false;
      if (q) {
        var hay = ((r.report_no || '') + ' ' + (r.user_name || '') + ' ' + (r.email || '') + ' ' + (r.location_name || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderTable() {
    var list = filtered();
    var start = (state.page - 1) * state.perPage;
    var rows = list.slice(start, start + state.perPage);
    PG.ui.dataTable({
      mount: 'verif-table',
      columns: [
        { label: 'Nomor', render: function (r) { return '<strong class="text-strong">' + esc(r.report_no) + '</strong>'; } },
        { label: 'Tanggal Kirim', render: function (r) { return esc(PG.util.fmtDateShort(r.created_at)); } },
        { label: 'Jenis Kejadian', render: function (r) { return esc(r.incident_type || '-'); } },
        { label: 'Lokasi', render: function (r) { return esc(r.location_name || '-'); } },
        { label: 'Pelapor', render: function (r) {
          return '<div style="line-height:1.35"><strong style="font-size:13.5px">' + esc(r.user_name || '-') + '</strong>' +
            (r.email ? '<br><small class="text-muted">' + esc(r.email) + '</small>' : '') + '</div>';
        } },
        { label: 'Status', render: function (r) { return PG.util.statusBadge(r.status); } },
        { label: 'Aksi', render: function (r) {
          return '<button class="btn btn-outline btn-sm" data-check="' + esc(r.id) + '"><i class="fa-solid fa-magnifying-glass"></i> Periksa</button>';
        } }
      ],
      rows: rows,
      emptyIcon: 'fa-clipboard-check',
      emptyTitle: 'Tidak ada laporan',
      emptyDesc: 'Tidak ada laporan yang cocok dengan filter saat ini.'
    });
    PG.ui.pagination($('verif-pagination'), {
      page: state.page, perPage: state.perPage, total: list.length,
      onChange: function (p) { state.page = p; renderTable(); }
    });
    var cEl = $('verif-count');
    if (cEl) cEl.textContent = PG.util.fmtNum(list.length) + ' laporan';
  }

  /* ==========================================================
   * Modal pemeriksaan laporan
   * ========================================================== */
  function checkModalBody(r, photoUrl) {
    var hasCoords = r.lat != null && r.lng != null && r.lat !== '' && r.lng !== '';
    var lat = Number(r.lat), lng = Number(r.lng);
    var osm = hasCoords
      ? 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=14/' + lat + '/' + lng
      : '';
    var coordStr = hasCoords ? '(' + lat.toLocaleString('id-ID', { maximumFractionDigits: 5 }) + ', ' + lng.toLocaleString('id-ID', { maximumFractionDigits: 5 }) + ')' : '';
    return '' +
      '<div class="mb-16">' + PG.util.statusBadge(r.status) + '</div>' +
      '<div class="adm-info-grid">' +
      '  <div><span class="info-label">Pelapor</span><div class="info-value">' + esc(r.user_name || '-') + '</div></div>' +
      '  <div><span class="info-label">Email Pelapor</span><div class="info-value">' + esc(r.email || '-') + '</div></div>' +
      '  <div><span class="info-label">Waktu Kejadian</span><div class="info-value">' + esc(PG.util.fmtDateTime(r.incident_datetime)) + '</div></div>' +
      '  <div><span class="info-label">Jenis Kejadian</span><div class="info-value">' + esc(r.incident_type || '-') + '</div></div>' +
      '  <div><span class="info-label">Spesies</span><div class="info-value">' + esc(r.species || 'Tidak teridentifikasi') + '</div></div>' +
      '  <div><span class="info-label">Kondisi Penyu</span><div class="info-value">' + esc(r.condition || '-') + '</div></div>' +
      '  <div class="span-2"><span class="info-label">Lokasi</span>' +
      '    <div class="info-value">' + esc(r.location_name || '-') + (coordStr ? ' <span class="text-muted text-sm">' + esc(coordStr) + '</span>' : '') + '</div>' +
      (osm ? '<a href="' + esc(osm) + '" target="_blank" rel="noopener" class="text-sm" style="color:var(--pg-ocean);font-weight:600;text-decoration:none"><i class="fa-solid fa-arrow-up-right-from-square"></i> Lihat di OpenStreetMap</a>' : '') +
      '  </div>' +
      '  <div class="span-2"><span class="info-label">Deskripsi Kejadian</span>' +
      '    <div class="info-value" style="font-weight:400;line-height:1.7">' + esc(r.description || '-') + '</div></div>' +
      '</div>' +
      '<div class="mt-16">' +
      '  <span class="info-label">Foto Bukti</span>' +
      (photoUrl
        ? '<div class="preview-img-wrap img-340"><img src="' + esc(photoUrl) + '" alt="Foto laporan ' + esc(r.report_no) + '" style="max-height:340px"></div>'
        : '<div class="adm-photo-placeholder"><i class="fa-solid fa-camera"></i><span>Tidak ada foto</span></div>') +
      '</div>' +
      '<div class="field mt-16">' +
      '  <label for="verif-note">Catatan Verifikasi</label>' +
      '  <textarea class="textarea" id="verif-note" style="min-height:96px" placeholder="Tambahkan catatan verifikasi untuk laporan ini…">' + esc(r.operator_note || '') + '</textarea>' +
      '  <span class="hint">Catatan tersimpan pada laporan dan tercatat pada log aktivitas sistem.</span>' +
      '</div>';
  }

  async function openCheck(id) {
    var r = null;
    for (var i = 0; i < allRows.length; i++) { if (allRows[i].id === id) { r = allRows[i]; break; } }
    if (!r) return;
    var photoUrl = '';
    if (r.photo) {
      try { photoUrl = await PGStore.mediaUrl(r.photo); }
      catch (e) { console.warn('[PenyuGuard] Foto laporan tidak dapat dibuka:', e); }
    }

    PG.ui.openModal({
      title: 'Periksa Laporan ' + esc(r.report_no),
      size: 'xl',
      body: checkModalBody(r, photoUrl),
      footer:
        '<button type="button" class="btn btn-outline" data-act="periksa"><i class="fa-solid fa-magnifying-glass"></i> Tandai Sedang Diperiksa</button>' +
        '<button type="button" class="btn btn-warn" data-act="revisi"><i class="fa-solid fa-pen-clip"></i> Minta Revisi</button>' +
        '<button type="button" class="btn btn-danger" data-act="tolak"><i class="fa-solid fa-circle-xmark"></i> Tolak</button>' +
        '<button type="button" class="btn btn-primary" data-act="setuju"><i class="fa-solid fa-circle-check"></i> Setujui &amp; Terbitkan</button>',
      onOpen: function (ov, close) {
        PG.util.els('[data-act]', ov).forEach(function (b) {
          b.addEventListener('click', async function () {
            var act = ACTS[b.getAttribute('data-act')];
            if (!act) return;
            var note = '';
            var noteEl = ov.querySelector('#verif-note');
            if (noteEl) note = noteEl.value.trim();
            b.disabled = true;
            try {
              await applyAction(r, act, note);
              close();
            } catch (e) {
              PG.toast('Gagal memperbarui laporan. Coba lagi.', 'error');
              b.disabled = false;
            }
          });
        });
      }
    });
  }

  /* ==========================================================
   * Aksi verifikasi
   * ========================================================== */
  var ACTS = {
    periksa: { status: 'Sedang Diperiksa', toast: ['info', 'ditandai Sedang Diperiksa'] },
    revisi: { status: 'Perlu Revisi', toast: ['warn', 'diminta untuk direvisi'] },
    tolak: { status: 'Ditolak', toast: ['error', 'ditolak'] },
    setuju: { status: 'Disetujui', toast: ['success', 'disetujui'], forward: true }
  };

  async function applyAction(r, act, note) {
    var patch = {
      status: act.status,
      operator_note: note || '',
      verified_by: (PGAuth.user && PGAuth.user.full_name) || '',
      verified_at: new Date().toISOString(),
      _silent: true
    };

    /* Terapkan perubahan melalui adapter (Supabase atau mode demo). */
    var row = await PGStore.update('public_reports', r.id, patch);

    /* Catat log verifikasi eksplisit */
    await PGStore.log('Verifikasi laporan', r.report_no, 'Status: ' + act.status + (note ? ' — ' + note : ''));

    if (act.forward) {
      await forwardApproved(row || Object.assign({}, r, patch));
    } else {
      PG.toast('Laporan ' + r.report_no + ' ' + act.toast[1] + '.', act.toast[0]);
    }

    await reload();
  }

  /* Teruskan laporan disetujui ke data utama sesuai mode publikasi */
  async function forwardApproved(r) {
    var mode = PGStore.settings.get().publication_mode;
    if (mode === 'hold') {
      PG.toast('Laporan ' + r.report_no + ' disetujui — disimpan, diteruskan manual (mode publikasi: ditahan).', 'info');
      return;
    }

    var dateOnly = String(r.incident_datetime || '').slice(0, 10) ||
      String(r.created_at || '').slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    var t = r.incident_type;
    var target = 'turtle_sightings';

    /* Approval can be retried after a network timeout; never publish twice. */
    var existing = await PGStore.all(target);
    if (existing.some(function (row) { return row.report_no === r.report_no; })) {
      PG.toast('Laporan ' + r.report_no + ' sudah pernah diteruskan ke data utama.', 'info');
      return;
    }

    var cond;
    if (t === 'Penyu Terdampar') cond = 'Terdampar';
    else if (t === 'Penyu Terluka') cond = 'Terluka';
    else cond = r.condition || 'Sehat'; /* Perjumpaan Penyu & Kejadian Lainnya */
    await PGStore.insert('turtle_sightings', {
      report_no: r.report_no,
      date: dateOnly,
      time: '',
      species: r.species || 'Tidak teridentifikasi',
      location_name: r.location_name,
      lat: r.lat,
      lng: r.lng,
      carapace_length_cm: null,
      condition: cond,
      source: 'Laporan Masyarakat',
      notes: 'Diteruskan dari laporan publik ' + r.report_no,
      photo: r.photo || '',
      data_origin: 'community_report',
      status: 'approved',
      _silent: true
    });

    PG.toast('Laporan ' + r.report_no + ' disetujui & diterbitkan — data diteruskan ke data penyu.', 'success');
  }

  /* ==========================================================
   * Inisialisasi halaman
   * ========================================================== */
  async function initVerification() {
    if (!$('verif-stats')) return;

    /* Filter tab (delegasi) */
    $('verif-tabs').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!b) return;
      setStatus(b.getAttribute('data-tab'));
    });

    /* Kontrol pencarian */
    $('verif-controls').innerHTML =
      '<div class="filter-bar">' +
      '  <div class="f-group f-grow"><label>Pencarian</label>' +
      '    <div class="adm-search"><i class="fa-solid fa-magnifying-glass"></i>' +
      '    <input class="input" id="verif-q" placeholder="Cari nomor laporan, pelapor, atau lokasi…"></div></div>' +
      '  <div class="f-group"><label>&nbsp;</label>' +
      '    <button type="button" class="btn btn-ghost btn-sm" id="verif-reset"><i class="fa-solid fa-rotate-left"></i> Reset Filter</button></div>' +
      '</div>';
    var inQ = $('verif-q');
    inQ.addEventListener('input', PG.util.debounce(function () {
      state.q = inQ.value.trim();
      state.page = 1;
      renderTable();
    }, 250));
    $('verif-reset').addEventListener('click', function () {
      state = { status: 'Semua', q: '', page: 1, perPage: state.perPage };
      inQ.value = '';
      renderTabs();
      renderTable();
    });

    /* Tombol Periksa (delegasi pada kontainer tabel) */
    $('verif-table').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-check]') : null;
      if (!b) return;
      openCheck(b.getAttribute('data-check')).catch(function (e) { console.error('[PenyuGuard] Gagal membuka laporan:', e); });
    });

    await reload();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    try { await PGAuth.ready; } catch (e) { /* guard menangani redirect */ }
    if (!PGAuth.user) return;
    initVerification();
  });
})();
