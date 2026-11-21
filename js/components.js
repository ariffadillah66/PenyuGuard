/* ============================================================
 * PenyuGuard — components.js
 * Komponen UI bersama: modal, confirm, stat card, pagination,
 * helper Chart.js, konstanta domain, dan utilitas formulir.
 * ============================================================ */
(function () {
  'use strict';
  window.PG = window.PG || {};

  /* ---------------- Konstanta domain ---------------- */
  PG.INCIDENT_TYPES = ['Perjumpaan Penyu', 'Penyu Terdampar', 'Penyu Terluka', 'Kejadian Lainnya'];
  PG.CONDITIONS = ['Sehat', 'Terluka', 'Terdampar', 'Meninggal', 'Tidak diketahui'];
  PG.REPORT_STATUSES = ['Menunggu Verifikasi', 'Sedang Diperiksa', 'Disetujui', 'Ditolak', 'Perlu Revisi'];
  PG.SPECIES_COLORS = { 'Penyu Hijau': '#0000FF', 'Penyu Sisik': '#D9FF47', 'Penyu Lekang': '#7F8CFF', 'Penyu Tempayan': '#B9C4FF', 'Penyu Belimbing': '#5969D8', 'Tidak teridentifikasi': '#8995B8' };
  PG.CHART_PALETTE = ['#0000FF', '#D9FF47', '#7F8CFF', '#B9C4FF', '#5969D8', '#8995B8', '#F5F8FF'];
  PG.SOURCE_TYPES = ['Laporan Masyarakat', 'Penelitian', 'Patroli'];

  PG.sizeClass = function (cm) {
    if (cm == null || isNaN(cm)) return '-';
    if (cm < 45) return 'Penyu muda (<45 cm)';
    if (cm <= 85) return 'Subdewasa (45–85 cm)';
    return 'Dewasa (>85 cm)';
  };

  PG.optionHtml = function (list, selected, emptyLabel) {
    var out = emptyLabel ? '<option value="">' + emptyLabel + '</option>' : '';
    (list || []).forEach(function (o) {
      var val = typeof o === 'string' ? o : o.value;
      var lab = typeof o === 'string' ? o : o.label;
      out += '<option value="' + esc(val) + '"' + (String(val) === String(selected) ? ' selected' : '') + '>' + esc(lab) + '</option>';
    });
    return out;
  };

  /* util esc lokal (duplikasi ringan agar file ini berdiri sendiri) */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Modal ---------------- */
  PG.ui = PG.ui || {};

  PG.ui.openModal = function (opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'pg-modal-overlay';
    ov.innerHTML =
      '<div class="pg-modal ' + (opts.size === 'lg' ? 'pg-modal-lg' : opts.size === 'xl' ? 'pg-modal-xl' : '') + '" role="dialog" aria-modal="true">' +
      '  <div class="pg-modal-head"><h3>' + (opts.title || '') + '</h3>' +
      '  <button class="pg-modal-x" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>' +
      '  <div class="pg-modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="pg-modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('show'); });
    var closed = false;
    var close = function () {
      if (closed) return; closed = true;
      ov.classList.remove('show');
      setTimeout(function () { ov.remove(); }, 210);
      document.removeEventListener('keydown', onEsc);
    };
    function onEsc(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.pg-modal-x').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);
    if (typeof opts.onOpen === 'function') setTimeout(function () { opts.onOpen(ov, close); }, 30);
    return { el: ov, close: close };
  };

  PG.ui.confirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m = PG.ui.openModal({
        title: opts.title || 'Konfirmasi',
        body: '<p style="line-height:1.7">' + (opts.message || 'Lanjutkan tindakan ini?') + '</p>',
        footer: '<button class="btn btn-outline" data-no>Batal</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + (opts.okLabel || 'Ya, Lanjutkan') + '</button>'
      });
      m.el.querySelector('[data-no]').addEventListener('click', function () { m.close(); resolve(false); });
      m.el.querySelector('[data-yes]').addEventListener('click', function () { m.close(); resolve(true); });
    });
  };

  /* ---------------- Stat card ---------------- */
  PG.ui.statCard = function (o) {
    o = o || {};
    return '<div class="stat-card' + (o.tone ? ' tone-' + o.tone : '') + '">' +
      '<div class="stat-icon' + (o.tone ? ' tone-' + o.tone : '') + '"><i class="fa-solid ' + (o.icon || 'fa-circle-info') + '"></i></div>' +
      '<div class="stat-info"><span class="stat-value">' + (o.value == null ? '-' : o.value) + '</span>' +
      '<span class="stat-label">' + (o.label || '') + '</span>' +
      (o.sub ? '<span class="stat-sub">' + o.sub + '</span>' : '') +
      '</div></div>';
  };

  /* ---------------- Empty state ---------------- */
  PG.ui.emptyState = function (icon, title, desc, action) {
    return '<div class="empty-state"><div class="empty-icon"><i class="fa-solid ' + icon + '"></i></div>' +
      '<h4>' + title + '</h4><p>' + desc + '</p>' + (action || '') + '</div>';
  };

  /* ---------------- Pagination ---------------- */
  PG.ui.pagination = function (mount, o) {
    if (!mount) return;
    var pages = Math.max(1, Math.ceil((o.total || 0) / (o.perPage || 8)));
    if (pages <= 1) { mount.innerHTML = ''; return; }
    var html = '<button data-p="' + (o.page - 1) + '"' + (o.page <= 1 ? ' disabled' : '') + ' aria-label="Sebelumnya"><i class="fa-solid fa-chevron-left"></i></button>';
    var wins = [];
    for (var p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - o.page) <= 1) wins.push(p);
    }
    var last = 0;
    wins.forEach(function (p) {
      if (p - last > 1) html += '<span class="pg-dots">…</span>';
      html += '<button data-p="' + p + '" class="' + (p === o.page ? 'active' : '') + '">' + p + '</button>';
      last = p;
    });
    html += '<button data-p="' + (o.page + 1) + '"' + (o.page >= pages ? ' disabled' : '') + ' aria-label="Berikutnya"><i class="fa-solid fa-chevron-right"></i></button>';
    html += '<span class="pg-pageinfo">' + (o.total || 0) + ' data</span>';
    mount.innerHTML = html;
    mount.querySelectorAll('button[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = parseInt(b.dataset.p, 10);
        if (p >= 1 && p <= pages && p !== o.page) o.onChange(p);
      });
    });
  };

  /* ---------------- Tabel sederhana ---------------- */
  PG.ui.dataTable = function (o) {
    var el = document.getElementById(o.mount);
    if (!el) return;
    if (!o.rows || !o.rows.length) {
      el.innerHTML = PG.ui.emptyState(o.emptyIcon || 'fa-inbox', o.emptyTitle || 'Belum ada data', o.emptyDesc || 'Data akan tampil di sini.');
      return;
    }
    var html = '<div class="table-wrap"><table class="pg-table"><thead><tr>';
    o.columns.forEach(function (c) { html += '<th>' + esc(c.label) + '</th>'; });
    html += '</tr></thead><tbody>';
    o.rows.forEach(function (row, idx) {
      html += '<tr>';
      o.columns.forEach(function (c) {
        html += '<td>' + (c.render ? c.render(row, idx) : esc(row[c.key] == null ? '-' : row[c.key])) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  };

  /* ---------------- Form helper ---------------- */
  PG.formToObject = function (form) {
    var out = {};
    (form || document).querySelectorAll('input[name], select[name], textarea[name]').forEach(function (el) {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  };

  PG.clearFieldErrors = function (form) {
    (form || document).querySelectorAll('.field-error.show').forEach(function (e) { e.classList.remove('show'); });
    (form || document).querySelectorAll('.invalid').forEach(function (e) { e.classList.remove('invalid'); });
  };

  PG.showFieldError = function (input, msg) {
    if (!input) return;
    input.classList.add('invalid');
    var field = input.closest('.field');
    if (!field) return;
    var err = field.querySelector('.field-error');
    if (err) { err.textContent = msg; err.classList.add('show'); }
  };

  /* ---------------- Chart.js helpers ---------------- */
  PG.charts = {
    _all: [],
    init: function () {
      if (!window.Chart) return;
      Chart.defaults.font.family = "'Inter', sans-serif";
      Chart.defaults.font.size = 12;
      Chart.defaults.color = '#C2CBE4';
      Chart.defaults.borderColor = 'rgba(137,149,184,.22)';
      Chart.defaults.plugins.legend.labels.usePointStyle = true;
      Chart.defaults.plugins.legend.labels.boxWidth = 8;
      Chart.defaults.plugins.legend.labels.boxHeight = 8;
      Chart.defaults.plugins.tooltip.backgroundColor = '#080F3D';
      Chart.defaults.plugins.tooltip.padding = 11;
      Chart.defaults.plugins.tooltip.cornerRadius = 9;
      Chart.defaults.plugins.tooltip.titleFont = { weight: '700' };
    },
    make: function (id, cfg) {
      var cv = typeof id === 'string' ? document.getElementById(id) : id;
      if (!cv || !window.Chart) return null;
      var old = Chart.getChart ? Chart.getChart(cv) : null;
      if (old) old.destroy();
      cfg.options = cfg.options || {};
      if (cfg.options.maintainAspectRatio === undefined) cfg.options.maintainAspectRatio = false;
      if (cfg.options.responsive === undefined) cfg.options.responsive = true;
      var ch = new Chart(cv, cfg);
      this._all.push(ch);
      return ch;
    },
    destroyAll: function () {
      this._all.forEach(function (c) { try { c.destroy(); } catch (e) { } });
      this._all = [];
    }
  };
})();
