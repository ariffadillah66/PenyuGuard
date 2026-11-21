/* ============================================================
 * PenyuGuard — my-reports.js
 * Riwayat laporan milik pengguna + filter status, pencarian
 * lokasi, dan modal detail dengan timeline status.
 * ============================================================ */
(function () {
  'use strict';

  var state = { status: 'Semua', query: '', reports: [] };

  /* Ikon per jenis kejadian */
  function incidentIcon(type) {
    var t = String(type || '');
    if (t.indexOf('Perjumpaan') > -1) return 'fa-water';
    if (t.indexOf('Terdampar') > -1) return 'fa-house-tsunami';
    if (t.indexOf('Terluka') > -1) return 'fa-band-aid';
    return 'fa-circle-info';
  }

  function badgeLg(status) {
    var m = PG.util.statusMeta(status);
    return '<span class="badge badge-lg ' + m[0] + '"><i class="fa-solid ' + m[1] + '"></i> ' + PG.util.esc(status || '-') + '</span>';
  }

  /* ---------------- Timeline status visual ---------------- */
  function trackHtml(status) {
    var s1 = '', s2 = '', s3 = '', label3 = 'Disetujui';
    if (status === 'Menunggu Verifikasi') { s1 = 'active'; }
    else if (status === 'Sedang Diperiksa') { s1 = 'done'; s2 = 'active'; }
    else if (status === 'Disetujui') { s1 = 'done'; s2 = 'done'; s3 = 'done'; }
    else if (status === 'Ditolak') { s1 = 'done'; s2 = 'done'; s3 = 'rejected'; label3 = 'Ditolak'; }
    else if (status === 'Perlu Revisi') { s1 = 'done'; s2 = 'done'; s3 = 'revisi'; label3 = 'Perlu Revisi'; }
    return '<div class="status-track">' +
      '<div class="st-step ' + s1 + '">Menunggu<br>Verifikasi</div>' +
      '<div class="st-step ' + s2 + '">Sedang<br>Diperiksa</div>' +
      '<div class="st-step ' + s3 + '">' + label3 + '</div>' +
      '</div>';
  }

  /* ---------------- Chip filter ---------------- */
  function renderChips() {
    var mount = PG.util.el('#rep-chips');
    if (!mount) return;
    var statuses = ['Semua'].concat(PG.REPORT_STATUSES || []);
    mount.innerHTML = statuses.map(function (s) {
      var count = s === 'Semua'
        ? state.reports.length
        : state.reports.filter(function (r) { return r.status === s; }).length;
      return '<button type="button" class="chip' + (state.status === s ? ' active' : '') + '" data-status="' + PG.util.esc(s) + '">' +
        PG.util.esc(s) + ' (' + count + ')</button>';
    }).join('');
    mount.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        state.status = c.getAttribute('data-status') || 'Semua';
        renderChips();
        renderList();
      });
    });
  }

  /* ---------------- Daftar laporan ---------------- */
  function filtered() {
    var q = state.query.trim().toLowerCase();
    return state.reports.filter(function (r) {
      if (state.status !== 'Semua' && r.status !== state.status) return false;
      if (q && String(r.location_name || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderList() {
    var mount = PG.util.el('#rep-list');
    if (!mount) return;
    var list = filtered();

    if (!state.reports.length) {
      mount.innerHTML = PG.ui.emptyState(
        'fa-folder-open',
        'Belum ada laporan',
        'Anda belum mengirimkan laporan penyu. Setiap laporan Anda membantu tim konservasi memetakan kehadiran penyu di Pulau Rinca.',
        '<a class="btn btn-primary" href="report.html"><i class="fa-solid fa-paper-plane"></i> Buat Laporan Pertama</a>'
      );
      return;
    }
    if (!list.length) {
      mount.innerHTML = PG.ui.emptyState(
        'fa-magnifying-glass',
        'Tidak ada hasil',
        'Tidak ada laporan yang cocok dengan filter status atau kata kunci lokasi yang dipilih.',
        '<button type="button" class="btn btn-outline btn-sm" id="rep-reset"><i class="fa-solid fa-filter-circle-xmark"></i> Reset Filter</button>'
      );
      var reset = PG.util.el('#rep-reset');
      if (reset) {
        reset.addEventListener('click', function () {
          state.status = 'Semua';
          state.query = '';
          PG.util.el('#rep-search').value = '';
          renderChips();
          renderList();
        });
      }
      return;
    }

    mount.innerHTML = list.map(function (r) {
      return '<div class="rep-item">' +
        '<span class="rep-ico"><i class="fa-solid ' + incidentIcon(r.incident_type) + '"></i></span>' +
        '<div class="rep-main">' +
        '  <div class="rep-no">' + PG.util.esc(r.report_no || r.id) + '</div>' +
        '  <div class="rep-meta">' +
        '    <span><i class="fa-solid fa-tag"></i>' + PG.util.esc(r.incident_type || '-') + '</span>' +
        '    <span><i class="fa-solid fa-location-dot"></i>' + PG.util.esc(r.location_name || '-') + '</span>' +
        '    <span><i class="fa-solid fa-calendar"></i>Dikirim: ' + PG.util.esc(PG.util.fmtDateTime(r.created_at)) + '</span>' +
        '  </div>' +
        '</div>' +
        '<div class="rep-side">' + PG.util.statusBadge(r.status) +
        '  <button type="button" class="btn btn-ghost btn-sm" data-detail="' + PG.util.esc(r.id) + '"><i class="fa-solid fa-eye"></i> Detail</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- Modal detail ---------------- */
  function dtItem(label, value, full) {
    return '<div class="detail-item' + (full ? ' dt-full' : '') + '">' +
      '<div class="dt-label">' + label + '</div>' +
      '<div class="dt-value">' + value + '</div>' +
      '</div>';
  }

  async function openDetail(id) {
    var r = state.reports.find(function (x) { return x.id === id; });
    if (!r) return;

    var photoUrl = r.photo || '';
    if (photoUrl) {
      try { photoUrl = await PGStore.mediaUrl(photoUrl); }
      catch (e) { photoUrl = ''; }
    }
    var photoHtml = photoUrl
      ? '<div class="preview-img-wrap"><img src="' + PG.util.esc(photoUrl) + '" alt="Foto laporan ' + PG.util.esc(r.report_no || '') + '"></div>'
      : '<div class="photo-empty"><i class="fa-solid fa-image"></i><span>Tidak ada foto dokumentasi pada laporan ini.</span></div>';

    var noteHtml = r.operator_note
      ? '<div class="alert alert-warn mt-16"><i class="fa-solid fa-comment-dots"></i><span><strong>Catatan Operator:</strong> ' + PG.util.esc(r.operator_note) + '</span></div>'
      : '<div class="note-strip mt-16"><i class="fa-solid fa-comment-dots"></i><span><strong>Catatan Operator:</strong> Belum ada catatan.</span></div>';

    var verifiedHtml = (r.verified_by && r.verified_at)
      ? '<div class="alert alert-success mt-12"><i class="fa-solid fa-user-check"></i><span>Diverifikasi oleh: <strong>' + PG.util.esc(r.verified_by) + '</strong> pada ' + PG.util.esc(PG.util.fmtDateTime(r.verified_at)) + '</span></div>'
      : '';

    var coords = (r.lat != null && r.lat !== '' && r.lng != null && r.lng !== '')
      ? PG.util.esc(r.lat) + ', ' + PG.util.esc(r.lng)
      : '-';

    PG.ui.openModal({
      size: 'lg',
      title: 'Detail Laporan',
      body:
        '<div class="detail-head">' +
        '  <div><div class="dt-label">Nomor Laporan</div><div class="rep-no">' + PG.util.esc(r.report_no || r.id) + '</div></div>' +
        badgeLg(r.status) +
        '</div>' +
        '<div class="detail-grid">' +
        dtItem('Jenis Kejadian', PG.util.esc(r.incident_type || '-')) +
        (r.species ? dtItem('Spesies', PG.util.esc(r.species)) : '') +
        dtItem('Kondisi Penyu', PG.util.esc(r.condition || '-')) +
        dtItem('Waktu Kejadian', PG.util.esc(PG.util.fmtDateTime(r.incident_datetime))) +
        dtItem('Lokasi', PG.util.esc(r.location_name || '-')) +
        dtItem('Koordinat', coords) +
        dtItem('Deskripsi', PG.util.esc(r.description || 'Tidak ada deskripsi.'), true) +
        dtItem('Foto Dokumentasi', photoHtml, true) +
        '</div>' +
        trackHtml(r.status) +
        noteHtml +
        verifiedHtml,
      footer: '<button class="btn btn-outline" data-detail-close><i class="fa-solid fa-xmark"></i> Tutup</button>',
      onOpen: function (ov, close) {
        ov.querySelector('[data-detail-close]').addEventListener('click', close);
      }
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    if (!PGAuth.user) return; // guard auth.js sudah me-redirect
    PG.renderNav();

    var all = await PGStore.all('public_reports');
    state.reports = all
      .filter(function (r) { return r.user_id === PGAuth.user.id; })
      .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });

    renderChips();
    renderList();

    /* Pencarian lokasi */
    var search = PG.util.el('#rep-search');
    if (search) {
      search.addEventListener('input', PG.util.debounce(function () {
        state.query = search.value;
        renderList();
      }, 200));
    }

    /* Klik tombol Detail (delegasi) */
    var list = PG.util.el('#rep-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-detail]');
        if (btn) openDetail(btn.getAttribute('data-detail')).catch(function (e) { console.warn('[PenyuGuard] Foto laporan tidak dapat dibuka:', e); });
      });
    }
  });
})();
