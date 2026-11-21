/* ============================================================
 * PenyuGuard — main.js
 * Shell UI publik: navbar, banner mode demo, footer, toast,
 * utilitas umum, dan animasi reveal.
 * ============================================================ */
(function () {
  'use strict';
  window.PG = window.PG || {};
  var PG = window.PG;

  /* ---------------- Utilitas ---------------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  PG.util = {
    getRoot: function () { return window.PGRoot ? PGRoot() : './'; },
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
    readFile: function (file) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    },
    downscaleImage: function (dataUrl, maxW, quality) {
      maxW = maxW || 900; quality = quality || 0.8;
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, maxW / img.width);
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
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

  /* ---------------- Toast ---------------- */
  PG.toast = function (msg, type) {
    type = type || 'success';
    var wrap = PG.util.el('.pg-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'pg-toast-wrap';
      document.body.appendChild(wrap);
    }
    var icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' };
    var t = document.createElement('div');
    t.className = 'pg-toast pg-toast-' + type;
    t.innerHTML = '<i class="fa-solid ' + (icons[type] || 'fa-bell') + '"></i><div>' + esc(msg) + '</div>' +
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

  /* Pesan lintas halaman (mis. hasil redirect guard) */
  PG.consumeSessionToast = function () {
    try {
      var msg = sessionStorage.getItem('pg_toast');
      if (msg) {
        sessionStorage.removeItem('pg_toast');
        var parts = JSON.parse(msg);
        setTimeout(function () { PG.toast(parts[0], parts[1] || 'info'); }, 350);
      }
    } catch (e) { }
  };

  /* ---------------- Navigasi publik ---------------- */
  var NAV_GROUPS = [
    { key: 'pemantauan', label: 'Pemantauan', items: [
      { key: 'dashboard', label: 'Dashboard', href: 'pages/dashboard.html' },
      { key: 'mapping', label: 'Peta Persebaran', href: 'pages/mapping.html' }
    ]},
    { key: 'analisis', label: 'Analisis', items: [
      { key: 'oseanografi', label: 'Oseanografi', href: 'pages/oceanographic.html' },
      { key: 'ai', label: 'PenyuVision AI', href: 'pages/ai-analysis.html' }
    ]},
    { key: 'informasi', label: 'Informasi', items: [
      { key: 'edukasi', label: 'Edukasi & Konservasi', href: 'pages/education.html' }
    ]}
  ];

  function renderNav() {
    var host = PG.util.el('#pg-navbar');
    if (!host) return;
    var root = PG.util.getRoot();
    var active = document.body.getAttribute('data-active') || '';
    var u = window.PGAuth ? PGAuth.user : null;

    var homeLink = '<li><a class="pg-nav-link' + (active === 'beranda' ? ' active' : '') + '" href="' + root + 'index.html">Beranda</a></li>';
    var groupLinks = NAV_GROUPS.map(function (group) {
      var groupActive = group.items.some(function (it) { return it.key === active; });
      var children = group.items.map(function (it) {
        return '<a class="pg-nav-sub-link' + (active === it.key ? ' active' : '') + '" href="' + root + it.href + '"><span>' + it.label + '</span></a>';
      }).join('');
      return '<li class="pg-nav-group' + (groupActive ? ' has-active' : '') + '">' +
        '<button class="pg-nav-link pg-nav-group-toggle' + (groupActive ? ' active' : '') + '" type="button" aria-expanded="false">' +
        group.label + '<i class="fa-solid fa-chevron-down pg-nav-chevron"></i></button>' +
        '<div class="pg-nav-submenu">' + children + '</div></li>';
    }).join('');

    var authHtml;
    if (u) {
      var staff = PGAuth.isStaff();
      authHtml = '<li class="pg-nav-user"><button class="pg-userbtn" id="pg-userbtn" aria-haspopup="true" aria-expanded="false">' +
        '<span class="avatar">' + (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : PG.util.initials(u.full_name)) + '</span>' +
        '<span class="pg-usermeta"><strong>' + esc(String(u.full_name).split(' ')[0]) + '</strong><small>' + esc(PGAuth.ROLE_LABEL[u.role] || u.role) + '</small></span>' +
        '<i class="fa-solid fa-chevron-down"></i></button><div class="pg-dropdown" id="pg-dropdown">' +
        '<div class="dropdown-head"><strong>' + esc(u.full_name) + '</strong><small>' + esc(u.email) + '</small></div>' +
        '<a href="' + root + 'pages/profile.html">Profil Saya</a>' +
        '<a href="' + root + 'pages/my-reports.html">Riwayat Laporan</a>' +
        (staff ? '<a href="' + root + 'admin/dashboard.html">Admin</a>' : '') +
        '<div class="dropdown-divider"></div><button data-act="logout">Keluar</button></div></li>';
    } else {
      authHtml = '<li class="pg-nav-auth"><a class="pg-nav-link" href="' + root + 'pages/login.html">Masuk</a></li>' +
        '<li class="pg-nav-register"><a class="btn btn-teal btn-sm" href="' + root + 'pages/register.html">Daftar</a></li>';
    }

    host.innerHTML = '<nav class="pg-nav" id="pg-nav"><div class="pg-container pg-nav-inner">' +
      '<a class="pg-brand" href="' + root + 'index.html" aria-label="PenyuGuard beranda"><img src="' + root + 'assets/logo/penyuguard-brand.png" alt=""><img class="pg-wordmark" src="' + root + 'assets/logo/penyuguard-wordmark.png" alt=""></a>' +
      '<button class="pg-nav-toggle" id="pg-nav-toggle" aria-label="Buka menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>' +
      '<ul class="pg-nav-menu" id="pg-nav-menu">' + homeLink + groupLinks +
      '<li class="pg-nav-report"><a class="pg-nav-link is-cta' + (active === 'lapor' ? ' active' : '') + '" href="' + root + 'pages/report.html">Buat Laporan</a></li>' +
      authHtml + '</ul></div></nav>';

    var nav = PG.util.el('#pg-nav'), toggle = PG.util.el('#pg-nav-toggle'), menu = PG.util.el('#pg-nav-menu');
    function closeMobileMenu() {
      if (!menu || !nav || !toggle) return;
      menu.classList.remove('open'); nav.classList.remove('menu-open'); document.body.classList.remove('nav-scroll-lock');
      toggle.setAttribute('aria-expanded', 'false'); toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
    }
    if (toggle && menu) toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open'); nav.classList.toggle('menu-open', open);
      document.body.classList.toggle('nav-scroll-lock', open); toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });

    host.querySelectorAll('.pg-nav-group-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var item = btn.closest('.pg-nav-group'), willOpen = !item.classList.contains('open');
        host.querySelectorAll('.pg-nav-group.open').forEach(function (other) {
          other.classList.remove('open');
          var otherBtn = other.querySelector('.pg-nav-group-toggle'); if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });
        if (willOpen) item.classList.add('open');
        btn.setAttribute('aria-expanded', String(willOpen));
      });
    });
    var ub = PG.util.el('#pg-userbtn'), dd = PG.util.el('#pg-dropdown');
    if (ub && dd) {
      ub.addEventListener('click', function (e) { e.stopPropagation(); ub.classList.toggle('open'); dd.classList.toggle('show'); ub.setAttribute('aria-expanded', String(dd.classList.contains('show'))); });
      document.addEventListener('click', function (e) {
        if (!dd.contains(e.target) && e.target !== ub) { ub.classList.remove('open'); dd.classList.remove('show'); ub.setAttribute('aria-expanded', 'false'); }
        if (!e.target.closest('.pg-nav-group')) host.querySelectorAll('.pg-nav-group.open').forEach(function (g) { g.classList.remove('open'); var b = g.querySelector('.pg-nav-group-toggle'); if (b) b.setAttribute('aria-expanded', 'false'); });
      });
    }
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMobileMenu); });
    var lo = PG.util.el('[data-act="logout"]');
    if (lo) lo.addEventListener('click', async function () { await PGAuth.logout(); window.location.href = root + 'index.html'; });
  }

  /* ---------------- Banner mode demo ---------------- */
  function renderDemoBanner() {
    var host = PG.util.el('#pg-demo-banner');
    if (host) host.remove();
    if (window.PGConfig && PGConfig.isConfigured) {
      if (!PGConfig.connectionError) return;
      var failed = document.createElement('div');
      failed.className = 'pg-demo-banner';
      failed.id = 'pg-demo-banner';
      failed.innerHTML = '<div class="pg-container"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Koneksi Supabase bermasalah</strong> — website tidak beralih ke Mode Demonstrasi. Periksa URL, anon key, koneksi internet, dan konfigurasi proyek.</span></div>';
      var failedAnchor = PG.util.el('#pg-nav') || document.body.firstChild;
      if (failedAnchor && failedAnchor.parentNode) failedAnchor.parentNode.insertBefore(failed, failedAnchor.nextSibling);
      return;
    }
    var banner = document.createElement('div');
    banner.className = 'pg-demo-banner';
    banner.id = 'pg-demo-banner';
    banner.innerHTML =
      '<div class="pg-container"><i class="fa-solid fa-triangle-exclamation"></i>' +
      '<span><strong>Mode Demonstrasi aktif</strong> — autentikasi dan data tersimpan di browser ini; data demonstrasi dibedakan dari observasi iNaturalist dan produk oseanografi bersumber.</span>' +
      '<button type="button" id="pg-demo-info">Selengkapnya</button></div>';
    var anchor = PG.util.el('.pg-nav') || document.body.firstChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(banner, anchor.nextSibling);
    else document.body.prepend(banner);
    PG.util.el('#pg-demo-info').addEventListener('click', function () {
      PG.ui.openModal({
        title: 'Tentang Mode Demonstrasi',
        body:
          '<p class="mb-12">Website PenyuGuard sedang berjalan dalam <strong>Mode Demonstrasi</strong>:</p>' +
          '<ul class="mt-8" style="padding-left:18px;line-height:1.9;font-size:14px">' +
          '<li>Data demo diberi label terpisah dari observasi iNaturalist, laporan masyarakat yang diverifikasi, dan produk oseanografi bersumber.</li>' +
          '<li>Autentikasi memakai penyimpanan lokal browser dan <strong>tidak aman untuk penggunaan produksi</strong>.</li>' +
          '<li>Untuk mengaktifkan autentikasi, basis data, dan penyimpanan Supabase, isi <code>config/supabase.js</code> lalu jalankan <code>database/schema.sql</code>.</li>' +
          '</ul>',
        footer: '<button class="btn btn-primary" data-close-ok>Mengerti</button>',
        onOpen: function (ov, close) {
          ov.querySelector('[data-close-ok]').addEventListener('click', close);
        }
      });
    });
  }

  /* ---------------- Footer ---------------- */
  function renderFooter() {
    var host = PG.util.el('#pg-footer');
    if (!host) return;
    var root = PG.util.getRoot();
    host.innerHTML =
      '<footer class="pg-footer"><div class="pg-container">' +
      '  <div class="pg-footer-grid">' +
      '    <div>' +
      '      <a class="pg-brand" href="' + root + 'index.html" aria-label="PenyuGuard beranda"><img src="' + root + 'assets/logo/penyuguard-brand.png" alt=""><img class="pg-wordmark" src="' + root + 'assets/logo/penyuguard-wordmark.png" alt=""></a>' +
      '      <p>Platform pemantauan dan analitik untuk persebaran penyu, kondisi oseanografi, dan mitigasi interaksi manusia–penyu di Pulau Rinca, Taman Nasional Komodo, Nusa Tenggara Timur.</p>' +
      '      <p class="mt-12"><span class="badge badge-lg" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.78)"><i class="fa-solid fa-water"></i> Platform Analitik Konservasi Laut</span></p>' +
      '    </div>' +
      '    <div><h4>Jelajahi</h4><ul>' +
      '      <li><a href="' + root + 'index.html"><i class="fa-solid fa-chevron-right"></i> Beranda</a></li>' +
      '      <li><a href="' + root + 'pages/dashboard.html"><i class="fa-solid fa-chevron-right"></i> Dashboard</a></li>' +
      '      <li><a href="' + root + 'pages/mapping.html"><i class="fa-solid fa-chevron-right"></i> Peta Persebaran</a></li>' +
      '      <li><a href="' + root + 'pages/oceanographic.html"><i class="fa-solid fa-chevron-right"></i> Oseanografi</a></li>' +
      '      <li><a href="' + root + 'pages/ai-analysis.html"><i class="fa-solid fa-chevron-right"></i> PenyuVision AI</a></li>' +
      '      <li><a href="' + root + 'pages/education.html"><i class="fa-solid fa-chevron-right"></i> Edukasi &amp; Konservasi</a></li>' +
      '      <li><a href="' + root + 'pages/report.html"><i class="fa-solid fa-chevron-right"></i> Buat Laporan</a></li>' +
      '    </ul></div>' +
      '    <div><h4>Lokasi &amp; Kontak</h4><ul class="footer-contact">' +
      '      <li><i class="fa-solid fa-location-dot"></i><span>Pulau Rinca, Taman Nasional Komodo,<br>Kabupaten Manggarai Barat, Nusa Tenggara Timur</span></li>' +
      '      <li><i class="fa-solid fa-building-columns"></i><span>Koordinasi: Balai Taman Nasional Komodo &amp; UPT Konservasi terkait</span></li>' +
      '    </ul></div>' +
      '  </div>' +
      '  <div class="pg-footer-oversized" aria-hidden="true">PENYUGUARD</div>' +
      '  <div class="pg-footer-bottom">' +
      '    <p>Copyright © 2026 PenyuGuard. Dikembangkan sebagai produk inovasi mahasiswa Sistem Informasi Kelautan.</p>' +
      '    <p><span class="badge"><i class="fa-solid fa-database"></i> Asal data dan status penyimpanan ditampilkan pada tiap modul</span></p>' +
      '  </div>' +
      '</div></footer>';
  }

  /* ---------------- Reveal on scroll ---------------- */
  function initReveal() {
    var els = PG.util.els('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener('DOMContentLoaded', async function () {
  if (window.PGAuth && PGAuth.ready) {
    await PGAuth.ready;
  }

  renderNav();
  renderDemoBanner();
  renderFooter();
  initReveal();
  PG.consumeSessionToast();
  PG.charts.init();

  var nav = PG.util.el('#pg-nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
});

  PG.renderNav = renderNav;
  PG.renderFooter = renderFooter;
  PG.renderDemoBanner = renderDemoBanner;
})();
