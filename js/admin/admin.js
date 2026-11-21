/* ============================================================
 * PenyuGuard — admin/admin.js
 * Shell Konsol Admin: sidebar, topbar, footer + inisialisasi
 * halaman Dashboard, Log Aktivitas, dan Pengaturan.
 * ------------------------------------------------------------
 * Mendukung penyimpanan lokal demo dan Supabase sesuai konfigurasi aktif.
 * ============================================================ */
window.PGAdmin = window.PGAdmin || {};
(function () {
  'use strict';

  /* ==========================================================
   * 0. Lapisan kompatibilitas util & toast
   *    Shell admin tidak memuat js/main.js (shell publik), maka
   *    utilitas inti disediakan bila belum ada agar seluruh
   *    halaman admin berdiri sendiri tanpa error.
   * ========================================================== */
  window.PG = window.PG || {};
  var PG = window.PG;

  if (!PG.util) {
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    PG.util = {
      el: function (sel, root) { return (root || document).querySelector(sel); },
      els: function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
      esc: esc,
      fmtDate: function (iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      },
      fmtDateShort: function (iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      },
      fmtDateTime: function (iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        if (isNaN(d)) return '-';
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' • ' +
          d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      },
      fmtNum: function (n, dec) {
        return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: dec || 0 });
      },
      fmtRp: function (n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); },
      debounce: function (fn, ms) {
        var t;
        return function () {
          var args = arguments, self = this;
          clearTimeout(t);
          t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
        };
      },
      uid: function (p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
      initials: function (name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase();
      },
      download: function (filename, text, mime) {
        var b = new Blob([text], { type: mime || 'text/plain' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = filename;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 900);
      },
      statusMeta: function (s) {
        return {
          'Menunggu Verifikasi': ['badge-warn', 'fa-clock'],
          'Sedang Diperiksa': ['badge-info', 'fa-magnifying-glass'],
          'Disetujui': ['badge-success', 'fa-circle-check'],
          'Ditolak': ['badge-danger', 'fa-circle-xmark'],
          'Perlu Revisi': ['badge-revisi', 'fa-pen-clip']
        }[s] || ['badge-muted', 'fa-circle'];
      },
      statusBadge: function (s) {
        var m = PG.util.statusMeta(s);
        return '<span class="badge ' + m[0] + '"><i class="fa-solid ' + m[1] + '"></i> ' + esc(s) + '</span>';
      }
    };
  }

  if (!PG.toast) {
    PG.toast = function (msg, type) {
      type = type || 'success';
      var wrap = document.querySelector('.pg-toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'pg-toast-wrap';
        document.body.appendChild(wrap);
      }
      var icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' };
      var t = document.createElement('div');
      t.className = 'pg-toast pg-toast-' + type;
      t.innerHTML = '<i class="fa-solid ' + (icons[type] || 'fa-bell') + '"></i><div>' + PG.util.esc(msg) + '</div>' +
        '<button aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>';
      var killed = false;
      var kill = function () {
        if (killed) return; killed = true;
        t.classList.add('out');
        setTimeout(function () { t.remove(); }, 300);
      };
      t.querySelector('button').addEventListener('click', kill);
      wrap.appendChild(t);
      setTimeout(kill, 4600);
    };
  }

  /* ==========================================================
   * 1. Konstanta & helper umum
   * ========================================================== */
  var ADMIN_NAV = [
    { key: 'dashboard', section: 'Ringkasan', label: 'Dashboard', icon: 'fa-gauge-high', href: 'dashboard.html', roles: ['operator', 'admin'] },
    { key: 'verification', section: 'Operasional', label: 'Verifikasi Laporan', icon: 'fa-clipboard-check', href: 'verification.html', roles: ['operator', 'admin'] },
    { key: 'turtles', section: 'Data & Konten', label: 'Data Perjumpaan', icon: 'fa-turtle', href: 'turtles.html', roles: ['operator', 'admin'] },
    { key: 'mapping', section: 'Data & Konten', label: 'Data Persebaran', icon: 'fa-map-location-dot', href: 'mapping.html', roles: ['operator', 'admin'] },
    { key: 'oceanographic', section: 'Data & Konten', label: 'Data Oseanografi', icon: 'fa-temperature-half', href: 'oceanographic.html', roles: ['operator', 'admin'] },
    { key: 'education', section: 'Data & Konten', label: 'Konten Edukasi', icon: 'fa-book-open', href: 'education.html', roles: ['operator', 'admin'] },
    { key: 'users', section: 'Administrasi', label: 'Manajemen Pengguna', icon: 'fa-users-gear', href: 'users.html', roles: ['admin'], tag: true },
    { key: 'logs', section: 'Administrasi', label: 'Log Aktivitas', icon: 'fa-clock-rotate-left', href: 'activity-logs.html', roles: ['admin'], tag: true },
    { key: 'settings', section: 'Administrasi', label: 'Pengaturan', icon: 'fa-gear', href: 'settings.html', roles: ['admin'], tag: true }
  ];
  PGAdmin.NAV = ADMIN_NAV;

  var ROLE_LABEL = { user: 'Pengguna', operator: 'Operator', admin: 'Administrator', system: 'Sistem' };

  PGAdmin.esc = function (v) { return PG.util.esc(v); };
  PGAdmin.countBy = function (rows, key) {
    var out = {};
    (rows || []).forEach(function (r) {
      var k = r[key] == null ? '-' : r[key];
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  };
  PGAdmin.roleChip = function (role) {
    var r = String(role || '').toLowerCase();
    var lbl = ROLE_LABEL[r] || role || '-';
    return '<span class="role-chip role-' + PG.util.esc(r) + '">' + PG.util.esc(lbl) + '</span>';
  };

  function esc(v) { return PG.util.esc(v); }
  function fmtNum(n) { return PG.util.fmtNum(n); }
  function byCreatedDesc(a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }
  function byTimeDesc(a, b) { return String(b.timestamp || '').localeCompare(String(a.timestamp || '')); }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return '"' + v.replace(/"/g, '""') + '"';
  }

  /* ==========================================================
   * 2. Shell: sidebar, topbar, footer, badge verifikasi
   * ========================================================== */
  PGAdmin.refreshBadge = async function () {
    try {
      var rows = await PGStore.all('public_reports');
      var n = rows.filter(function (r) {
        return r.status === 'Menunggu Verifikasi' || r.status === 'Sedang Diperiksa';
      }).length;
      var b = document.getElementById('adm-verif-badge');
      if (b) {
        b.textContent = String(n);
        b.style.display = n > 0 ? '' : 'none';
      }
    } catch (e) { /* abaikan */ }
  };

  function renderShell() {
    var u = PGAuth.user;
    if (!u) return;
    var role = String(u.role || '').toLowerCase();
    var active = document.body.getAttribute('data-active') || '';
    var avatar = u.avatar
      ? '<img src="' + esc(u.avatar) + '" alt="">'
      : esc(PG.util.initials(u.full_name));

    /* --- Sidebar --- */
    var side = document.getElementById('pg-sidebar');
    if (side) {
      var items = ADMIN_NAV.filter(function (it) { return it.roles.indexOf(role) > -1; });
      var currentSection = '';
      var nav = items.map(function (it) {
        var heading = it.section !== currentSection
          ? '<div class="adm-nav-label">' + esc(it.section) + '</div>' : '';
        currentSection = it.section;
        return heading + '<a class="adm-nav-item' + (active === it.key ? ' active' : '') + '" href="' + it.href + '" title="' + esc(it.label) + '">' +
          '<i class="fa-solid ' + it.icon + '"></i>' +
          '<span class="adm-nav-text">' + esc(it.label) + '</span>' +
          (it.tag ? '<span class="adm-nav-tag">Admin</span>' : '') +
          (it.key === 'verification' ? '<span class="adm-badge-count" id="adm-verif-badge" style="display:none">0</span>' : '') +
          '</a>';
      }).join('');
      side.innerHTML =
        '<div class="adm-brand">' +
        '  <img src="../assets/logo/penyuguard-brand.png" alt="Logo PenyuGuard">' +
        '  <div class="adm-brand-text"><strong><img class="pg-wordmark" src="../assets/logo/penyuguard-wordmark.png" alt="PenyuGuard"></strong><small>Konsol Admin</small></div>' +
        '</div>' +
        '<nav class="adm-nav">' + nav + '</nav>' +
        '<div class="adm-sidebar-foot">' +
        '  <div class="adm-userchip"><span class="avatar">' + avatar + '</span>' +
        '    <div class="adm-userchip-meta"><strong>' + esc(u.full_name) + '</strong><small>' + esc(ROLE_LABEL[role] || role) + '</small></div>' +
        '  </div>' +
        '  <a class="adm-public-link" href="../index.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Lihat Situs Publik</a>' +
        '</div>';
    }

    /* --- Topbar --- */
    var top = document.getElementById('pg-topbar');
    if (top) {
      var cur = null;
      ADMIN_NAV.forEach(function (it) { if (it.key === active) cur = it; });
      var label = cur ? cur.label : 'Admin';
      top.innerHTML =
        '<button class="adm-burger" id="adm-burger" aria-label="Buka menu navigasi"><i class="fa-solid fa-bars"></i></button>' +
        '<div class="adm-topbar-title">' +
        '  <span class="adm-crumb">Admin / ' + esc(label) + '</span>' +
        '  <h1>' + esc(label) + '</h1>' +
        '</div>' +
        '<div class="adm-topbar-right">' +
        '  <span class="badge badge-info adm-demo-chip" title="Status penyimpanan akan diperiksa."><i class="fa-solid fa-database"></i> Memeriksa penyimpanan…</span>' +
        '  <div class="adm-user-wrap">' +
        '    <button class="pg-userbtn" id="adm-userbtn" aria-haspopup="true">' +
        '      <span class="avatar">' + avatar + '</span>' +
        '      <span class="pg-usermeta"><strong>' + esc(String(u.full_name).split(' ')[0]) + '</strong><small>' + esc(ROLE_LABEL[role] || role) + '</small></span>' +
        '      <i class="fa-solid fa-chevron-down"></i>' +
        '    </button>' +
        '    <div class="pg-dropdown" id="adm-userdd">' +
        '      <div class="dropdown-head"><strong>' + esc(u.full_name) + '</strong><small>' + esc(u.email) + '</small></div>' +
        '      <a href="../pages/profile.html"><i class="fa-solid fa-user"></i> Profil Saya</a>' +
        '      <a href="../index.html" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i> Situs Publik</a>' +
        '      <div class="dropdown-divider"></div>' +
        '      <button data-act="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      updateStorageMode();

      var layout = document.getElementById('adm-layout');
      var burger = document.getElementById('adm-burger');
      var overlay = document.getElementById('adm-overlay');
      function closeDrawer() { if (layout) layout.classList.remove('show-drawer'); }
      if (burger && layout) {
        burger.addEventListener('click', function (e) {
          e.stopPropagation();
          layout.classList.toggle('show-drawer');
        });
      }
      if (overlay) overlay.addEventListener('click', closeDrawer);

      var ub = document.getElementById('adm-userbtn');
      var dd = document.getElementById('adm-userdd');
      if (ub && dd) {
        ub.addEventListener('click', function (e) {
          e.stopPropagation();
          ub.classList.toggle('open');
          dd.classList.toggle('show');
        });
        document.addEventListener('click', function (e) {
          if (!dd.contains(e.target) && e.target !== ub) {
            ub.classList.remove('open');
            dd.classList.remove('show');
          }
        });
      }
      var lo = dd ? dd.querySelector('[data-act="logout"]') : null;
      if (lo) {
        lo.addEventListener('click', async function () {
          await PGAuth.logout();
          window.location.href = 'login.html';
        });
      }
    }

    /* Badge jumlah laporan perlu verifikasi pada menu sidebar */
    PGAdmin.refreshBadge();
  }

  function updateStorageMode() {
    Promise.resolve(window.PGAuth && PGAuth.ready).catch(function () {}).then(function () {
      var remote = !!(window.PGStore && PGStore._remote && PGStore._remote());
      var failed = remote && !!(window.PGConfig && PGConfig.connectionError);
      var chips = document.querySelectorAll('.adm-demo-chip');
      var footer = document.querySelector('.adm-footer');
      chips.forEach(function (chip) {
        chip.className = 'badge ' + (failed ? 'badge-danger' : remote ? 'badge-success' : 'badge-warn') + ' adm-demo-chip';
        chip.innerHTML = failed ? '<i class="fa-solid fa-triangle-exclamation"></i> Supabase Terputus' : remote
          ? '<i class="fa-solid fa-cloud"></i> Supabase Aktif'
          : '<i class="fa-solid fa-hard-drive"></i> Demo Lokal';
        chip.title = failed ? 'Supabase dikonfigurasi, tetapi koneksi gagal.' : remote
          ? 'Data dibaca dan disimpan melalui Supabase.'
          : 'Data disimpan di localStorage browser ini dan belum tersinkronisasi ke Supabase.';
      });
      if (footer) {
        var note = failed ? 'Supabase gagal terhubung' : remote ? 'Supabase terhubung' : 'Demo lokal pada browser';
        var first = footer.querySelector('span');
        if (first) first.innerHTML = '<strong>Konsol Admin PenyuGuard</strong> • ' + note;
      }
    });
  }

  function renderFooter() {
    var f = document.getElementById('adm-footer');
    if (!f) return;
    var v = (window.PGConfig && PGConfig.version) || '1.0.0';
    f.innerHTML =
      '<span><strong>Konsol Admin PenyuGuard</strong> • v' + esc(v) + ' • Memeriksa penyimpanan…</span>' +
      '<span>© 2026 PenyuGuard — Marine Conservation Analytics Platform</span>';
    updateStorageMode();
  }

  /* ==========================================================
   * 3. Dashboard admin
   * ========================================================== */
  function monthLabel(d) {
    var s = d.toLocaleDateString('id-ID', { month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + String(d.getFullYear()).slice(2);
  }

  function monthlySeries(rows) {
    var max = null;
    rows.forEach(function (r) {
      if (!r.date) return;
      var d = new Date(r.date);
      if (!isNaN(d) && (!max || d > max)) max = d;
    });
    if (!max) max = new Date();
    var buckets = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(max.getFullYear(), max.getMonth() - i, 1);
      buckets.push({
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: monthLabel(d), count: 0
      });
    }
    rows.forEach(function (r) {
      if (!r.date) return;
      var d = new Date(r.date);
      if (isNaN(d)) return;
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      for (var j = 0; j < buckets.length; j++) {
        if (buckets[j].key === key) { buckets[j].count++; break; }
      }
    });
    return buckets;
  }

  function dailySeries(logs, n) {
    var max = null;
    logs.forEach(function (l) {
      var d = new Date(l.timestamp);
      if (!isNaN(d) && (!max || d > max)) max = d;
    });
    if (!max) max = new Date();
    var buckets = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(max.getFullYear(), max.getMonth(), max.getDate() - i);
      buckets.push({
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        count: 0
      });
    }
    logs.forEach(function (l) {
      var key = String(l.timestamp || '').slice(0, 10);
      for (var j = 0; j < buckets.length; j++) {
        if (buckets[j].key === key) { buckets[j].count++; break; }
      }
    });
    return buckets;
  }

  function openReportSummary(r) {
    PG.ui.openModal({
      title: 'Detail Laporan ' + esc(r.report_no),
      size: 'lg',
      body:
        '<div class="mb-12">' + PG.util.statusBadge(r.status) + '</div>' +
        '<div class="adm-info-grid">' +
        '  <div><span class="info-label">Jenis Kejadian</span><div class="info-value">' + esc(r.incident_type || '-') + '</div></div>' +
        '  <div><span class="info-label">Pelapor</span><div class="info-value">' + esc(r.user_name || '-') + '</div></div>' +
        '  <div><span class="info-label">Spesies</span><div class="info-value">' + esc(r.species || '-') + '</div></div>' +
        '  <div><span class="info-label">Kondisi</span><div class="info-value">' + esc(r.condition || '-') + '</div></div>' +
        '  <div class="span-2"><span class="info-label">Lokasi</span><div class="info-value">' + esc(r.location_name || '-') + '</div></div>' +
        '  <div class="span-2"><span class="info-label">Tanggal Kejadian</span><div class="info-value">' + esc(PG.util.fmtDateTime(r.incident_datetime)) + '</div></div>' +
        '  <div class="span-2"><span class="info-label">Deskripsi</span><div class="info-value" style="font-weight:400;line-height:1.7">' + esc(r.description || '-') + '</div></div>' +
        '</div>',
      footer:
        '<button class="btn btn-outline" data-close>Tutup</button>' +
        '<a class="btn btn-primary" href="verification.html"><i class="fa-solid fa-clipboard-check"></i> Buka Verifikasi</a>',
      onOpen: function (ov, close) {
        var b = ov.querySelector('[data-close]');
        if (b) b.addEventListener('click', close);
      }
    });
  }

  async function initAdminDashboard() {
    var elStats = document.getElementById('adm-stats');
    var elCharts = document.getElementById('adm-charts');
    var elLower = document.getElementById('adm-lower');
    if (!elStats) return;

    var sightings = await PGStore.all('turtle_sightings');
    var reports = await PGStore.all('public_reports');
    var spatial = await PGStore.all('spatial_locations');
    var profiles = await PGStore.all('profiles');
    var logs = await PGStore.all('activity_logs');
    var role = PGAuth.user ? String(PGAuth.user.role || '').toLowerCase() : '';

    var sc = PGAdmin.countBy(reports, 'status');
    var waiting = sc['Menunggu Verifikasi'] || 0;
    var checking = sc['Sedang Diperiksa'] || 0;

    /* --- Kartu statistik --- */
    elStats.innerHTML =
      PG.ui.statCard({ icon: 'fa-turtle', label: 'Total Perjumpaan', value: fmtNum(sightings.length), sub: 'Catatan pada penyimpanan aktif', tone: 'teal' }) +
      PG.ui.statCard({ icon: 'fa-clipboard-list', label: 'Total Laporan Publik', value: fmtNum(reports.length), sub: 'Masuk dari masyarakat' }) +
      PG.ui.statCard({ icon: 'fa-clock', label: 'Menunggu Verifikasi', value: fmtNum(waiting), sub: checking + ' sedang diperiksa', tone: 'warn' }) +
      PG.ui.statCard({ icon: 'fa-circle-check', label: 'Laporan Disetujui', value: fmtNum(sc['Disetujui'] || 0), sub: 'Diterbitkan ke publik', tone: 'teal' }) +
      PG.ui.statCard({ icon: 'fa-circle-xmark', label: 'Laporan Ditolak', value: fmtNum(sc['Ditolak'] || 0), sub: 'Tidak memenuhi kriteria', tone: 'danger' }) +
      PG.ui.statCard({ icon: 'fa-map-location-dot', label: 'Titik Pengamatan', value: fmtNum(spatial.length), sub: 'Lokasi spasial terdaftar', tone: 'navy' }) +
      PG.ui.statCard({ icon: 'fa-users', label: 'Total Pengguna', value: fmtNum(profiles.length), sub: 'Akun terdaftar' });

    /* --- Grafik --- */
    if (window.Chart && PG.charts && PG.charts.init) PG.charts.init();
    if (elCharts) {
      elCharts.innerHTML =
        '<div class="adm-2col mt-20">' +
        '  <div class="chart-card">' +
        '    <h3><i class="fa-solid fa-chart-line"></i> Perjumpaan Penyu — 12 Bulan Terakhir</h3>' +
        '    <p class="chart-sub">Jumlah catatan perjumpaan penyu per bulan pada penyimpanan aktif</p>' +
        '    <div class="chart-box" style="--h:300px"><canvas id="chart-sightings"></canvas></div>' +
        '  </div>' +
        '  <div class="chart-card">' +
        '    <h3><i class="fa-solid fa-chart-pie"></i> Status Laporan Publik</h3>' +
        '    <p class="chart-sub">Komposisi seluruh laporan menurut status verifikasi</p>' +
        '    <div class="chart-box" style="--h:300px"><canvas id="chart-status"></canvas></div>' +
        '  </div>' +
        '</div>' +
        '<div class="chart-card mt-20">' +
        '  <h3><i class="fa-solid fa-chart-column"></i> Aktivitas Sistem — 14 Hari Terakhir</h3>' +
        '  <p class="chart-sub">Jumlah aktivitas tercatat pada log sistem per hari</p>' +
        '  <div class="chart-box" style="--h:240px"><canvas id="chart-activity"></canvas></div>' +
        '</div>';

      var months = monthlySeries(sightings);
      PG.charts.make('chart-sightings', {
        type: 'line',
        data: {
          labels: months.map(function (m) { return m.label; }),
          datasets: [{
            label: 'Perjumpaan',
            data: months.map(function (m) { return m.count; }),
            borderColor: '#0000FF',
            backgroundColor: 'rgba(0,0,255,.2)',
            fill: true, tension: .38, borderWidth: 2.5,
            pointRadius: 3, pointBackgroundColor: '#0000FF'
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(137,149,184,.22)' } }
          }
        }
      });

      var stKeys = PG.REPORT_STATUSES;
      var stColors = { 'Menunggu Verifikasi': '#D9FF47', 'Sedang Diperiksa': '#7F8CFF', 'Disetujui': '#0000FF', 'Ditolak': '#8995B8', 'Perlu Revisi': '#B9C4FF' };
      PG.charts.make('chart-status', {
        type: 'doughnut',
        data: {
          labels: stKeys,
          datasets: [{
            data: stKeys.map(function (k) { return sc[k] || 0; }),
            backgroundColor: stKeys.map(function (k) { return stColors[k]; }),
            borderColor: '#fff', borderWidth: 2
          }]
        },
        options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } }
      });

      var days = dailySeries(logs, 14);
      PG.charts.make('chart-activity', {
        type: 'bar',
        data: {
          labels: days.map(function (d) { return d.label; }),
          datasets: [{
            label: 'Aktivitas',
            data: days.map(function (d) { return d.count; }),
            backgroundColor: 'rgba(217,255,71,.72)',
            hoverBackgroundColor: '#D9FF47',
            borderRadius: 6, maxBarThickness: 26
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(137,149,184,.22)' } }
          }
        }
      });
    }

    /* --- Bagian bawah: laporan terbaru + timeline + aksi cepat --- */
    if (elLower) {
      elLower.innerHTML =
        '<div class="adm-2col mt-20">' +
        '  <div class="card">' +
        '    <div class="card-head"><div><h3>Laporan Terbaru</h3><p>5 laporan publik terakhir yang masuk</p></div>' +
        '      <a class="btn btn-ghost btn-sm" href="verification.html">Buka Verifikasi <i class="fa-solid fa-arrow-right"></i></a></div>' +
        '    <div id="adm-recent"></div>' +
        '  </div>' +
        '  <div>' +
        '    <div class="card card-pad mb-20">' +
        '      <div class="flex-between mb-12"><h3 style="font-size:16px">Aktivitas Terkini</h3>' +
        (role === 'admin' ? '<a href="activity-logs.html" style="color:var(--pg-ocean);font-weight:600;font-size:13px;text-decoration:none">Semua log <i class="fa-solid fa-arrow-right"></i></a>' : '') +
        '      </div>' +
        '      <ul class="timeline" id="adm-timeline"></ul>' +
        '    </div>' +
        '    <div class="card card-pad">' +
        '      <h3 style="font-size:16px;margin-bottom:14px">Aksi Cepat</h3>' +
        '      <div class="adm-quick" id="adm-quick"></div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      /* Tabel laporan terbaru */
      var recent = reports.slice().sort(byCreatedDesc).slice(0, 5);
      PG.ui.dataTable({
        mount: 'adm-recent',
        columns: [
          { label: 'Nomor', render: function (r) { return '<strong class="text-strong">' + esc(r.report_no) + '</strong>'; } },
          { label: 'Jenis', render: function (r) { return esc(r.incident_type || '-'); } },
          { label: 'Pelapor', render: function (r) { return esc(r.user_name || '-'); } },
          { label: 'Status', render: function (r) { return PG.util.statusBadge(r.status); } },
          { label: 'Tanggal', render: function (r) { return esc(PG.util.fmtDateShort(r.created_at)); } },
          { label: '', render: function (r) { return '<button class="btn btn-ghost btn-sm" data-detail="' + esc(r.id) + '"><i class="fa-solid fa-eye"></i> Detail</button>'; } }
        ],
        rows: recent,
        emptyIcon: 'fa-inbox',
        emptyTitle: 'Belum ada laporan',
        emptyDesc: 'Laporan publik yang masuk akan tampil di sini.'
      });
      var recentHost = document.getElementById('adm-recent');
      if (recentHost) {
        recentHost.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('[data-detail]') : null;
          if (!b) return;
          var id = b.getAttribute('data-detail');
          for (var i = 0; i < reports.length; i++) {
            if (reports[i].id === id) { openReportSummary(reports[i]); break; }
          }
        });
      }

      /* Timeline aktivitas terkini */
      var tlHost = document.getElementById('adm-timeline');
      if (tlHost) {
        var items = logs.slice().sort(byTimeDesc).slice(0, 8);
        tlHost.innerHTML = items.length
          ? items.map(function (l) {
            return '<li><span class="tl-time">' + esc(PG.util.fmtDateTime(l.timestamp)) + '</span>' +
              '<div class="tl-title">' + esc(l.action || '-') + '</div>' +
              '<div class="tl-desc">' + esc(l.target || '') + (l.detail ? ' — ' + esc(l.detail) : '') + '</div></li>';
          }).join('')
          : '<li><span class="tl-desc">Belum ada aktivitas tercatat.</span></li>';
      }

      /* Aksi cepat */
      var quick = document.getElementById('adm-quick');
      if (quick) {
        quick.innerHTML =
          '<a class="adm-quick-btn" href="verification.html"><i class="fa-solid fa-clipboard-check"></i><span>Verifikasi Laporan</span><small>' + fmtNum(waiting) + ' menunggu • ' + fmtNum(checking) + ' diperiksa</small></a>' +
          '<a class="adm-quick-btn" href="turtles.html?add=1"><i class="fa-solid fa-turtle"></i><span>Tambah Data Penyu</span><small>Buka formulir data penyu</small></a>' +
          '<a class="adm-quick-btn" href="../pages/mapping.html" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i><span>Peta Publik</span><small>Lihat peta persebaran</small></a>' +
          '<a class="adm-quick-btn" href="education.html"><i class="fa-solid fa-book-open"></i><span>Konten Edukasi</span><small>Kelola artikel edukasi</small></a>';
      }
    }
  }

  /* ==========================================================
   * 4. Log aktivitas (activity-logs.html — admin only)
   * ========================================================== */
  async function initActivityLogs() {
    var mountFilter = document.getElementById('logs-filter');
    var mountTable = document.getElementById('logs-table');
    var mountPag = document.getElementById('logs-pagination');
    if (!mountFilter || !mountTable) return;

    var logs = (await PGStore.all('activity_logs')).slice().sort(byTimeDesc);
    var actions = [];
    logs.forEach(function (l) {
      if (l.action && actions.indexOf(l.action) === -1) actions.push(l.action);
    });
    actions.sort();

    var PER = 12;
    var state = { q: '', action: '', from: '', to: '', page: 1 };

    mountFilter.innerHTML =
      '<div class="filter-bar">' +
      '  <div class="f-group"><label>Aksi</label>' +
      '    <select class="select" id="log-action"><option value="">Semua Aksi</option>' +
      actions.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') +
      '    </select></div>' +
      '  <div class="f-group f-grow"><label>Cari</label>' +
      '    <div class="adm-search"><i class="fa-solid fa-magnifying-glass"></i>' +
      '    <input class="input" id="log-q" placeholder="Cari aktor, target, atau detail…"></div></div>' +
      '  <div class="f-group"><label>Dari Tanggal</label><input type="date" class="input" id="log-from"></div>' +
      '  <div class="f-group"><label>Sampai Tanggal</label><input type="date" class="input" id="log-to"></div>' +
      '  <div class="f-group"><label>&nbsp;</label><button type="button" class="btn btn-ghost btn-sm" id="log-reset"><i class="fa-solid fa-rotate-left"></i> Reset</button></div>' +
      '</div>';

    function matches(l) {
      if (state.action && l.action !== state.action) return false;
      var day = String(l.timestamp || '').slice(0, 10);
      if (state.from && day < state.from) return false;
      if (state.to && day > state.to) return false;
      if (state.q) {
        var hay = ((l.actor || '') + ' ' + (l.target || '') + ' ' + (l.detail || '')).toLowerCase();
        if (hay.indexOf(state.q) === -1) return false;
      }
      return true;
    }
    function filtered() { return logs.filter(matches); }

    function render() {
      var list = filtered();
      var start = (state.page - 1) * PER;
      var rows = list.slice(start, start + PER);
      PG.ui.dataTable({
        mount: 'logs-table',
        columns: [
          { label: 'Waktu', render: function (l) { return esc(PG.util.fmtDateTime(l.timestamp)); } },
          { label: 'Aktor', render: function (l) { return esc(l.actor || '-'); } },
          { label: 'Peran', render: function (l) { return PGAdmin.roleChip(l.role); } },
          { label: 'Aksi', render: function (l) { return '<span class="badge badge-info">' + esc(l.action || '-') + '</span>'; } },
          { label: 'Target', render: function (l) { return esc(l.target || '-'); } },
          { label: 'Detail', render: function (l) { return '<div class="truncate" style="max-width:300px" title="' + esc(l.detail || '') + '">' + esc(l.detail || '-') + '</div>'; } }
        ],
        rows: rows,
        emptyIcon: 'fa-clock-rotate-left',
        emptyTitle: 'Tidak ada aktivitas',
        emptyDesc: 'Tidak ada log yang cocok dengan filter saat ini.'
      });
      PG.ui.pagination(mountPag, {
        page: state.page, perPage: PER, total: list.length,
        onChange: function (p) { state.page = p; render(); }
      });
      var cEl = document.getElementById('logs-count');
      if (cEl) cEl.textContent = fmtNum(list.length) + ' aktivitas tercatat';
    }

    var inQ = document.getElementById('log-q');
    inQ.addEventListener('input', PG.util.debounce(function () {
      state.q = inQ.value.trim().toLowerCase(); state.page = 1; render();
    }, 250));
    document.getElementById('log-action').addEventListener('change', function () {
      state.action = this.value; state.page = 1; render();
    });
    document.getElementById('log-from').addEventListener('change', function () {
      state.from = this.value; state.page = 1; render();
    });
    document.getElementById('log-to').addEventListener('change', function () {
      state.to = this.value; state.page = 1; render();
    });
    document.getElementById('log-reset').addEventListener('click', function () {
      state = { q: '', action: '', from: '', to: '', page: 1 };
      document.getElementById('log-q').value = '';
      document.getElementById('log-action').value = '';
      document.getElementById('log-from').value = '';
      document.getElementById('log-to').value = '';
      render();
    });

    var ex = document.getElementById('logs-export');
    if (ex) {
      ex.addEventListener('click', function () {
        var list = filtered();
        if (!list.length) { PG.toast('Tidak ada data untuk diekspor.', 'warn'); return; }
        var lines = [['Waktu', 'Pelaku', 'Peran', 'Aksi', 'Sasaran', 'Rincian'].map(csvCell).join(',')];
        list.forEach(function (l) {
          lines.push([l.timestamp, l.actor, ROLE_LABEL[String(l.role || '').toLowerCase()] || l.role, l.action, l.target, l.detail].map(csvCell).join(','));
        });
        PG.util.download('activity-logs.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
        PG.toast('Log aktivitas diekspor (' + list.length + ' baris).', 'success');
      });
    }

    render();
  }

  /* ==========================================================
   * 5. Pengaturan (settings.html — admin only)
   * ========================================================== */
  async function initSettings() {
    var s = PGStore.settings.get();
    var siteName = document.getElementById('set-site_name');
    var contact = document.getElementById('set-contact');
    var approx = document.getElementById('set-approximate_sensitive');
    var pubMode = document.getElementById('set-publication_mode');
    if (!siteName) return;

    siteName.value = s.site_name || '';
    contact.value = s.contact || '';
    approx.checked = !!s.approximate_sensitive;
    pubMode.value = s.publication_mode || 'manual';

    function toggleWarn() {
      var w = document.getElementById('approx-warning');
      if (w) w.style.display = approx.checked ? 'none' : 'flex';
    }
    approx.addEventListener('change', toggleWarn);
    toggleWarn();

    /* Kartu integrasi */
    var integ = document.getElementById('set-integrasi');
    if (integ) {
      if (window.PGConfig && PGConfig.isConfigured && PGConfig.connectionError) {
        integ.innerHTML = '<div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation"></i><span>Kredensial Supabase terisi, tetapi koneksi gagal. Mode demo tidak diaktifkan. Periksa konfigurasi dan koneksi.</span></div>';
      } else if (window.PGConfig && PGConfig.isConfigured) {
        integ.innerHTML =
          '<div class="mb-12"><span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Supabase aktif</span></div>' +
          '<p class="text-sm text-muted" style="line-height:1.7">Terhubung ke <code>' + esc(PGConfig.url) + '</code>. Autentikasi, database, dan storage berjalan pada Supabase sesuai <code>database/schema.sql</code>.</p>';
      } else {
        integ.innerHTML =
          '<div class="alert alert-info"><i class="fa-solid fa-circle-info"></i><span>Supabase belum dikonfigurasi. Saat ini autentikasi dan data berjalan di <strong>Mode Demonstrasi lokal</strong> pada browser ini.</span></div>';
      }
    }

    /* Simpan pengaturan umum */
    document.getElementById('set-save-umum').addEventListener('click', async function () {
      if (!siteName.value.trim()) { PG.toast('Nama situs tidak boleh kosong.', 'error'); return; }
      PGStore.settings.set({ site_name: siteName.value.trim(), contact: contact.value.trim() });
      await PGStore.log('Ubah pengaturan', 'settings', 'Pengaturan umum diperbarui');
      PG.toast('Pengaturan umum disimpan.', 'success');
    });

    /* Simpan kebijakan publikasi */
    document.getElementById('set-save-kebijakan').addEventListener('click', async function () {
      PGStore.settings.set({ approximate_sensitive: approx.checked, publication_mode: pubMode.value });
      await PGStore.log('Ubah pengaturan', 'settings',
        'Kebijakan publikasi diperbarui (aproksimasi koordinat: ' + (approx.checked ? 'aktif' : 'nonaktif') + ', mode publikasi: ' + pubMode.value + ')');
      PG.toast('Kebijakan publikasi disimpan.', 'success');
    });

    /* Reset data demo */
    var resetBtn = document.getElementById('set-reset-demo');
    if (resetBtn) {
      resetBtn.addEventListener('click', async function () {
        var ok = await PG.ui.confirm({
          title: 'Reset Data Demonstrasi',
          danger: true,
          okLabel: 'Ya, Reset Data',
          message: 'Data demo yang tersimpan lokal pada browser ini beserta sesi lokal akan <strong>dihapus</strong>. Data Supabase tidak dihapus. Tindakan ini tidak dapat dibatalkan. Lanjutkan?'
        });
        if (!ok) return;
        PGStore.resetDemo();
        window.location.reload();
      });
    }
  }

  /* ==========================================================
   * 6. Ekspor publik & boot
   * ========================================================== */
  PGAdmin.initAdminDashboard = initAdminDashboard;
  PGAdmin.initActivityLogs = initActivityLogs;
  PGAdmin.initSettings = initSettings;
  PGAdmin.renderShell = renderShell;
  PGAdmin.renderFooter = renderFooter;

  document.addEventListener('DOMContentLoaded', async function () {
    try { await PGAuth.ready; } catch (e) { /* guard sudah menangani redirect */ }
    if (!PGAuth.user) return; /* halaman akan dialihkan oleh guard auth */
    renderShell();
    renderFooter();
    var active = document.body.getAttribute('data-active') || '';
    if (active === 'dashboard') initAdminDashboard();
    else if (active === 'logs') initActivityLogs();
    else if (active === 'settings') initSettings();
  });
})();
