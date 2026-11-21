/* ============================================================
 * PenyuGuard — js/admin/data-management.js
 * Mesin CRUD generik + inisialisasi halaman manajemen data:
 * turtles, oceanographic (SST), education.
 * ------------------------------------------------------------
 * Bergantung pada: config/supabase.js, js/data-fallback.js,
 * js/data.js (PGStore), js/auth.js (PGAuth), js/components.js
 * (PG.ui, konstanta domain), js/admin/admin.js (shell PGAdmin).
 * Data lokal disimpan di localStorage; jika Supabase aktif, PGStore menggunakan tabel Supabase.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- Kompatibilitas: fallback util bila js/main.js
     tidak ikut dimuat pada area admin (isi hanya bila kosong) ---------- */
  window.PG = window.PG || {};
  (function (PG) {
    PG.util = PG.util || {};
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    var FB = {
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
      debounce: function (fn, ms) {
        var t;
        return function () {
          var a = arguments, s = this;
          clearTimeout(t);
          t = setTimeout(function () { fn.apply(s, a); }, ms || 250);
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
      }
    };
    Object.keys(FB).forEach(function (k) { if (PG.util[k] === undefined) PG.util[k] = FB[k]; });
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
        t.innerHTML = '<i class="fa-solid ' + (icons[type] || 'fa-bell') + '"></i><div>' + esc(msg) + '</div>';
        wrap.appendChild(t);
        setTimeout(function () { t.remove(); }, 4600);
      };
    }
  })(window.PG);

  var U = window.PG.util;
  window.PGAdmin = window.PGAdmin || {};
  var PGAdmin = window.PGAdmin;

  /* ============================================================
   * Helper bersama
   * ============================================================ */

  /* path gambar seed ('assets/..') harus diawali '../' dari folder admin/ */
  function imgSrc(p) {
    if (!p) return '';
    p = String(p);
    if (/^(data:|https?:|blob:)/.test(p) || p.charAt(0) === '/' || p.charAt(0) === '.') return p;
    return '../' + p;
  }

  function badge(cls, txt, icon) {
    return '<span class="badge ' + cls + '">' + (icon ? '<i class="fa-solid ' + icon + '"></i> ' : '') + U.esc(txt) + '</span>';
  }

  var ROW_STATUS = {
    approved: ['badge-success', 'Disetujui'],
    pending: ['badge-warn', 'Menunggu Verifikasi'],
    reviewed: ['badge-info', 'Sedang Diperiksa'],
    rejected: ['badge-danger', 'Ditolak'],
    revisi: ['badge-revisi', 'Perlu Revisi']
  };
  function statusHtml(s) {
    var m = ROW_STATUS[s] || ['badge-muted', s || '-'];
    return badge(m[0], m[1], 'fa-circle');
  }

  function thumbImg(p, size) {
    size = size || 44;
    if (!p) {
      return '<span style="display:inline-flex;width:' + size + 'px;height:' + size + 'px;border-radius:9px;' +
        'background:var(--pg-aqua-soft);color:var(--pg-teal);align-items:center;justify-content:center">' +
        '<i class="fa-solid fa-image"></i></span>';
    }
    return '<img src="' + U.esc(imgSrc(p)) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;' +
      'object-fit:cover;border-radius:9px;border:1px solid var(--pg-border)">';
  }

  function fmtCoord(v, dec) {
    var n = Number(v);
    if (v == null || v === '' || !isFinite(n)) return '-';
    return n.toFixed(dec || 4);
  }

  /* Penyimpanan batch (tanpa log per baris) — pola _save sama seperti auth.js */
  async function batchInsert(entity, items) {
    if (!items || !items.length) return 0;
    return PGStore.insertMany(entity, items);
  }

  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  /* ============================================================
   * PGAdmin.parseCSV — parser sederhana (koma / titik-koma,
   * dukung tanda kutip ganda, header lowercase)
   * ============================================================ */
  PGAdmin.parseCSV = function (text) {
    var out = [];
    if (!text) return out;
    var lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
      .filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return out;

    function splitLine(line, delim) {
      var cells = [], cur = '', inQ = false, i, c;
      for (i = 0; i < line.length; i++) {
        c = line[i];
        if (inQ) {
          if (c === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = false;
          } else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === delim) { cells.push(cur); cur = ''; }
        else cur += c;
      }
      cells.push(cur);
      return cells.map(function (s) { return s.trim(); });
    }

    var first = lines[0];
    var candidates = [',', ';', '\t'];
    var delim = candidates.map(function (d) { return { d: d, n: splitLine(first, d).length }; }).sort(function (a, b) { return b.n - a.n; })[0].d;
    var header = splitLine(lines[0], delim).map(function (h) {
      return h.replace(/^\uFEFF/, '').toLowerCase().trim().replace(/[\s\-]+/g, '_');
    });
    for (var i = 1; i < lines.length; i++) {
      var cells = splitLine(lines[i], delim);
      if (cells.length === 1 && cells[0] === '') continue;
      var obj = {};
      header.forEach(function (h, j) { obj[h] = cells[j] !== undefined ? cells[j] : ''; });
      out.push(obj);
    }
    return out;
  };

  /* ============================================================
   * PGAdmin.crud — mesin CRUD generik
   * ============================================================ */
  PGAdmin.crud = function (cfg) {
    var mount = document.getElementById(cfg.mountId);
    if (!mount) {
      console.warn('[PenyuGuard] Mount #' + cfg.mountId + ' tidak ditemukan.');
      return null;
    }

    var state = { search: '', filters: {}, page: 1, token: 0 };
    var lastRows = [];
    var imgData = {};
    var body = null;

    function toolbarHtml() {
      var t = '<div class="filter-bar" style="margin-bottom:16px;padding:14px 16px">';
      t += '<div class="f-group f-grow"><label>Cari</label>' +
        '<input type="text" class="input" data-crud-search placeholder="' +
        U.esc(cfg.searchPlaceholder || 'Ketik untuk mencari…') + '"></div>';
      (cfg.filters || []).forEach(function (f, i) {
        t += '<div class="f-group"><label>' + U.esc(f.label || f.key) + '</label>' +
          '<select class="select" data-crf="' + i + '"><option value="">' + U.esc(f.emptyLabel || 'Semua') + '</option>' +
          (f.years ? '' : PG.optionHtml(f.options || [], '')) + '</select></div>';
      });
      if (cfg.showAdd !== false) {
        t += '<button type="button" class="btn btn-primary" data-crud-add style="align-self:flex-end">' +
          '<i class="fa-solid fa-plus"></i> ' + U.esc(cfg.addLabel || 'Tambah') + '</button>';
      }
      t += '</div>';
      return t;
    }

    mount.innerHTML =
      toolbarHtml() +
      (cfg.note ? '<div class="note-strip" style="margin:-4px 0 16px"><i class="fa-solid fa-circle-info"></i><span>' + cfg.note + '</span></div>' : '') +
      '<div class="crud-body"></div>';
    body = U.el('.crud-body', mount);

    var searchInput = U.el('[data-crud-search]', mount);
    if (searchInput) {
      searchInput.addEventListener('input', U.debounce(function () {
        state.search = searchInput.value.trim();
        state.page = 1;
        render();
      }, 250));
    }
    U.els('select[data-crf]', mount).forEach(function (sel) {
      var f = (cfg.filters || [])[parseInt(sel.getAttribute('data-crf'), 10)];
      if (!f) return;
      sel.addEventListener('change', function () {
        state.filters[f.key] = sel.value;
        state.page = 1;
        render();
      });
    });
    var addBtn = U.el('[data-crud-add]', mount);
    if (addBtn) addBtn.addEventListener('click', function () { openForm(null); });

    /* ---------------- render tabel + paginasi ---------------- */
    var render = async function () {
      var my = ++state.token;
      var all;
      try { all = await PGStore.all(cfg.entity); }
      catch (e) {
        body.innerHTML = PG.ui.emptyState('fa-triangle-exclamation', 'Data gagal dimuat', U.esc(e.message || 'Periksa koneksi Supabase dan kebijakan RLS.'));
        return;
      }
      if (my !== state.token) return;

      /* opsi filter tahun dinamis dari data */
      (cfg.filters || []).forEach(function (f, i) {
        if (!f.years) return;
        var sel = U.el('select[data-crf="' + i + '"]', mount);
        if (!sel) return;
        var ys = [];
        all.forEach(function (r) {
          var y = r.year != null ? r.year : String(r.date || '').slice(0, 4);
          if (y && ys.indexOf(String(y)) < 0) ys.push(String(y));
        });
        ys.sort(function (a, b) { return b - a; });
        var cur = state.filters[f.key] || '';
        if (cur && ys.indexOf(cur) < 0) { cur = ''; state.filters[f.key] = ''; }
        sel.innerHTML = '<option value="">' + U.esc(f.emptyLabel || 'Semua tahun') + '</option>' +
          ys.map(function (y) {
            return '<option value="' + U.esc(y) + '"' + (y === cur ? ' selected' : '') + '>' + U.esc(y) + '</option>';
          }).join('');
      });

      var rows = all;
      if (state.search) {
        var q = state.search.toLowerCase();
        rows = rows.filter(function (r) {
          return (cfg.searchKeys || []).some(function (k) {
            return String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) > -1;
          });
        });
      }
      Object.keys(state.filters).forEach(function (k) {
        var v = state.filters[k];
        if (!v) return;
        rows = rows.filter(function (r) {
          if (k === 'year') {
            var y = r.year != null ? r.year : String(r.date || '').slice(0, 4);
            return String(y) === v;
          }
          return String(r[k] == null ? '' : r[k]) === v;
        });
      });

      var per = cfg.perPage || 8;
      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / per));
      if (state.page > pages) state.page = pages;
      var slice = rows.slice((state.page - 1) * per, state.page * per);
      lastRows = slice;

      if (!all.length) {
        body.innerHTML = PG.ui.emptyState(
          cfg.emptyIcon || 'fa-database',
          cfg.emptyTitle || 'Belum ada data',
          cfg.emptyDesc || 'Klik tombol Tambah untuk membuat data pertama (tersimpan pada penyimpanan aktif).');
        return;
      }
      if (!rows.length) {
        body.innerHTML = PG.ui.emptyState('fa-magnifying-glass', 'Tidak ada hasil',
          'Tidak ada data yang cocok dengan kata kunci atau filter yang dipilih.');
        return;
      }

      var h = '<div class="table-wrap"><table class="pg-table"><thead><tr>' +
        cfg.columns.map(function (c) { return '<th>' + U.esc(c.label) + '</th>'; }).join('') +
        '<th style="text-align:right">Aksi</th></tr></thead><tbody>';
      var displayRows = await Promise.all(slice.map(async function (row) {
        var display = Object.assign({}, row);
        for (var k of ['photo', 'image', 'thumb', 'avatar']) {
          if (display[k]) {
            try { display[k] = await PGStore.mediaUrl(display[k]); }
            catch (e) { display[k] = ''; }
          }
        }
        return display;
      }));
      if (my !== state.token) return;
      displayRows.forEach(function (row) {
        h += '<tr data-id="' + U.esc(row.id) + '">';
        cfg.columns.forEach(function (c) {
          var val = '';
          try { val = c.render ? c.render(row) : U.esc(row[c.key] == null ? '-' : row[c.key]); }
          catch (e) { val = '<span class="text-muted">—</span>'; }
          h += '<td>' + val + '</td>';
        });
        h += '<td><div class="cell-actions" style="justify-content:flex-end">';
        if (cfg.detailTemplate) {
          h += '<button type="button" class="btn btn-ghost" data-act="detail" title="Lihat detail"><i class="fa-regular fa-eye"></i></button>';
        }
        h += '<button type="button" class="btn btn-ghost" data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>';
        if (cfg.allowDelete !== false) {
          h += '<button type="button" class="btn btn-ghost" data-act="del" title="Hapus" style="background:var(--pg-danger-soft);color:var(--pg-danger)"><i class="fa-regular fa-trash-can"></i></button>';
        }
        h += '</div></td></tr>';
      });
      h += '</tbody></table></div><div class="pagination"></div>';
      body.innerHTML = h;

      var pm = U.el('.pagination', body);
      if (pm) {
        PG.ui.pagination(pm, {
          page: state.page, perPage: per, total: total,
          onChange: function (p) { state.page = p; render(); }
        });
      }

      U.els('button[data-act]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = b.closest('tr[data-id]');
          var id = tr ? tr.getAttribute('data-id') : '';
          var row = lastRows.filter(function (r) { return String(r.id) === String(id); })[0];
          if (!row) return;
          var act = b.getAttribute('data-act');
          if (act === 'detail') openDetail(row).catch(function (e) { console.warn('[PenyuGuard] Media detail tidak dapat dibuka:', e); });
          else if (act === 'edit') openForm(row);
          else if (act === 'del') del(row);
        });
      });
    };

    /* ---------------- form modal ---------------- */
    function fieldHtml(f, val) {
      var h = '<div class="field' + (f.span2 ? ' span-2' : '') + '">';
      h += '<label>' + U.esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
      if (f.type === 'textarea') {
        var txt = Array.isArray(val) ? val.join('\n') : (val == null ? '' : String(val));
        h += '<textarea class="textarea" name="' + U.esc(f.key) + '" rows="' + (f.rows || 3) + '"' +
          (f.placeholder ? ' placeholder="' + U.esc(f.placeholder) + '"' : '') + '>' + U.esc(txt) + '</textarea>';
      } else if (f.type === 'select') {
        h += '<select class="select" name="' + U.esc(f.key) + '">' +
          PG.optionHtml(f.options || [], val, f.emptyLabel) + '</select>';
      } else if (f.type === 'switch') {
        h += '<label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;font-weight:500;color:var(--pg-text)">' +
          '<input type="checkbox" name="' + U.esc(f.key) + '" style="width:18px;height:18px;accent-color:var(--pg-teal);cursor:pointer"' +
          (val ? ' checked' : '') + '><span>' + U.esc(f.switchLabel || f.label) + '</span></label>';
      } else if (f.type === 'image') {
        h += '<div data-imgfield="' + U.esc(f.key) + '">' +
          '<div data-imgpreview style="display:none;margin-bottom:8px">' +
          '<div class="preview-img-wrap" style="max-width:300px"><img src="" alt="Pratinjau">' +
          '<button type="button" class="preview-remove" data-imgremove title="Hapus gambar"><i class="fa-solid fa-xmark"></i></button>' +
          '</div></div>' +
          '<div class="file-drop" data-imgdrop style="padding:16px 18px">' +
          '<i class="fa-solid fa-cloud-arrow-up" style="font-size:20px;margin-bottom:6px"></i>' +
          '<h4 style="font-size:13.5px;margin-bottom:3px">Unggah foto</h4>' +
          '<p style="font-size:11.5px">Klik atau seret gambar (JPG/PNG) — otomatis dikompres ke lebar 900px</p>' +
          '<input type="file" accept="image/*"></div></div>';
      } else {
        var type = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : (f.type === 'time' ? 'time' : 'text'));
        h += '<input type="' + type + '" class="input" name="' + U.esc(f.key) + '" value="' +
          U.esc(val == null ? '' : val) + '"' +
          (f.step ? ' step="' + U.esc(f.step) + '"' : '') +
          (f.placeholder ? ' placeholder="' + U.esc(f.placeholder) + '"' : '') + '>';
      }
      if (f.hint) h += '<span class="hint">' + U.esc(f.hint) + '</span>';
      h += '</div>';
      return h;
    }

    async function openForm(existing) {
      var isEdit = !!existing;
      var base = Object.assign({}, cfg.defaults || {}, existing || {});
      var imagePreview = {};
      for (var f of (cfg.fields || []).filter(function (field) { return field.type === 'image'; })) {
        if (base[f.key]) {
          try { imagePreview[f.key] = await PGStore.mediaUrl(base[f.key]); }
          catch (e) { imagePreview[f.key] = ''; }
        }
      }
      imgData = {};
      var fieldsHtml = (cfg.fields || []).map(function (f) { return fieldHtml(f, base[f.key]); }).join('');
      return PG.ui.openModal({
        title: isEdit ? (cfg.editItemLabel || 'Edit Data') : (cfg.newItemLabel || 'Tambah Data'),
        size: 'lg',
        body:
          '<div class="alert alert-danger" data-form-error style="display:none;margin-bottom:16px"></div>' +
          '<form class="form-grid" data-crud-form autocomplete="off">' + fieldsHtml + '</form>',
        footer: '<button type="button" class="btn btn-outline" data-cancel>Batal</button>' +
          '<button type="button" class="btn btn-primary" data-save><i class="fa-solid fa-floppy-disk"></i> Simpan</button>',
        onOpen: function (ov, close) {
          /* pasang perilaku field gambar */
          (cfg.fields || []).filter(function (f) { return f.type === 'image'; }).forEach(function (f) {
            var wrap = ov.querySelector('[data-imgfield="' + f.key + '"]');
            if (!wrap) return;
            imgData[f.key] = base[f.key] || '';
            var input = wrap.querySelector('input[type="file"]');
            var prev = wrap.querySelector('[data-imgpreview]');
            var img = wrap.querySelector('img');
            var drop = wrap.querySelector('[data-imgdrop]');
            var show = function () {
              if (imgData[f.key]) {
                img.src = imgData[f.key] === (base[f.key] || '') && imagePreview[f.key]
                  ? imagePreview[f.key] : imgSrc(imgData[f.key]);
                prev.style.display = '';
                drop.style.display = 'none';
              } else {
                prev.style.display = 'none';
                drop.style.display = '';
                img.removeAttribute('src');
              }
            };
            show();
            input.addEventListener('change', function () {
              var file = input.files && input.files[0];
              if (!file) return;
              U.readFile(file)
                .then(function (d) { return U.downscaleImage(d, 900); })
                .then(function (d) { imgData[f.key] = d; show(); });
            });
            wrap.querySelector('[data-imgremove]').addEventListener('click', function () {
              imgData[f.key] = '';
              show();
            });
          });

          ov.querySelector('[data-cancel]').addEventListener('click', close);
          var form = ov.querySelector('[data-crud-form]');
          form.addEventListener('submit', function (e) { e.preventDefault(); save(ov, close, isEdit, existing); });
          ov.querySelector('[data-save]').addEventListener('click', function () { save(ov, close, isEdit, existing); });
        }
      });
    }

    async function save(ov, close, isEdit, existing) {
      var form = ov.querySelector('[data-crud-form]');
      var err = ov.querySelector('[data-form-error]');
      err.style.display = 'none';
      U.els('.invalid', form).forEach(function (elx) { elx.classList.remove('invalid'); });

      var out = {}, missing = [];
      (cfg.fields || []).forEach(function (f) {
        var elx = form.querySelector('[name="' + f.key + '"]');
        var v;
        if (f.type === 'image') v = imgData[f.key] || '';
        else if (f.type === 'switch') v = elx ? elx.checked : false;
        else if (f.type === 'number') {
          var raw = elx ? String(elx.value).trim() : '';
          v = raw === '' ? null : parseFloat(raw);
          if (raw !== '' && (v == null || isNaN(v))) v = null;
        } else {
          v = elx ? String(elx.value || '').trim() : '';
        }
        if (f.required && (v === '' || v == null)) {
          missing.push(f.label);
          if (elx && elx.classList) elx.classList.add('invalid');
        }
        out[f.key] = v;
      });

      if (missing.length) {
        err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Lengkapi kolom wajib: <strong>' +
          U.esc(missing.join(', ')) + '</strong></span>';
        err.style.display = 'flex';
        var mb = ov.querySelector('.pg-modal-body');
        if (mb) mb.scrollTop = 0;
        return;
      }

      var row = isEdit
        ? Object.assign({}, existing, out)
        : Object.assign({}, cfg.defaults || {}, out);

      if (cfg.entity === 'turtle_sightings' && !isEdit && !row.report_no) {
        row.report_no = await nextSightingNo();
      }

      var bs = typeof cfg.beforeSave === 'function' ? cfg.beforeSave(row, isEdit) : undefined;
      if (bs && typeof bs.then === 'function') bs = await bs;
      if (bs === false) return;

      var btn = ov.querySelector('[data-save]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan…'; }
      try {
        if (PGConfig.isConfigured) {
          for (var f of (cfg.fields || []).filter(function (field) { return field.type === 'image'; })) {
            if (typeof row[f.key] === 'string' && /^data:image\//i.test(row[f.key])) {
              var owner = PGAuth.user && PGAuth.user.id ? PGAuth.user.id : 'staff';
              row[f.key] = await PGStore.uploadDataUrl(row[f.key], (row.name || row.title || f.key) + '.jpg', 'admin/' + owner + '/' + cfg.entity);
            }
          }
        }
        if (isEdit) await PGStore.update(cfg.entity, row.id, row);
        else await PGStore.insert(cfg.entity, row);
      } catch (e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan'; }
        err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Gagal menyimpan: ' +
          U.esc(e && e.message ? e.message : 'kesalahan tidak diketahui') + '</span>';
        err.style.display = 'flex';
        return;
      }
      close();
      PG.toast(isEdit ? 'Perubahan data disimpan.' : 'Data baru berhasil ditambahkan.', 'success');
      if (!isEdit) state.page = 1;
      render();
      if (typeof cfg.afterChange === 'function') cfg.afterChange(isEdit ? 'update' : 'insert', row);
    }

    async function nextSightingNo() {
      var all = await PGStore.all('turtle_sightings');
      var max = 0;
      all.forEach(function (r) {
        var m = /^PG-S-(\d+)$/.exec(r.report_no || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      if (!max) return 'PG-S-' + Date.now().toString().slice(-4);
      return 'PG-S-' + String(max + 1).padStart(4, '0');
    }

    async function openDetail(row) {
      var detailRow = Object.assign({}, row);
      for (var k of ['photo', 'image', 'thumb', 'avatar']) {
        if (detailRow[k]) {
          try { detailRow[k] = await PGStore.mediaUrl(detailRow[k]); }
          catch (e) { detailRow[k] = ''; }
        }
      }
      PG.ui.openModal({
        title: cfg.detailTitle || 'Detail Data',
        size: 'lg',
        body: cfg.detailTemplate(detailRow),
        footer: '<button type="button" class="btn btn-primary" data-close-ok>Tutup</button>',
        onOpen: function (ov, close) {
          ov.querySelector('[data-close-ok]').addEventListener('click', close);
        }
      });
    }

    function rowLabel(row) {
      if (typeof cfg.itemLabel === 'function') return cfg.itemLabel(row);
      return row.title || row.name || row.report_no || row.location_name || row.id;
    }

    async function del(row) {
      var ok = await PG.ui.confirm({
        title: 'Hapus Data',
        danger: true,
        okLabel: 'Ya, Hapus',
        message: 'Hapus <strong>' + U.esc(rowLabel(row)) + '</strong> dari ' +
          U.esc(cfg.entityLabel || cfg.entity) + '? Tindakan ini tidak dapat dibatalkan (data akan dihapus dari penyimpanan aktif).'
      });
      if (!ok) return;
      await PGStore.remove(cfg.entity, row.id);
      PG.toast('Data dihapus.', 'success');
      render();
      if (typeof cfg.afterChange === 'function') cfg.afterChange('remove', row);
    }

    var api = {
      refresh: function () { return render(); },
      openForm: function (row) { return openForm(row || null); },
      setFilter: function (key, val) { state.filters[key] = val; state.page = 1; return render(); },
      getRows: function () { return lastRows.slice(); }
    };
    PGAdmin._engines = PGAdmin._engines || {};
    PGAdmin._engines[cfg.mountId] = api;
    render();
    return api;
  };

  /* ============================================================
   * HALAMAN: Data Perjumpaan Penyu (turtles)
   * ============================================================ */
  var TURTLE_SPECIES = ['Penyu Hijau', 'Penyu Sisik', 'Penyu Lekang', 'Penyu Tempayan', 'Penyu Belimbing', 'Tidak teridentifikasi'];

  function turtleDetail(row) {
    var COND_BADGE = { 'Sehat': 'badge-success', 'Terluka': 'badge-warn', 'Terdampar': 'badge-danger', 'Meninggal': 'badge-muted' };
    var c = PG.SPECIES_COLORS[row.species] || '#9DB2BC';
    var pairs = [
      ['Nomor Laporan', U.esc(row.report_no || '—')],
      ['Tanggal / Waktu', U.fmtDate(row.date) + (row.time ? ' • ' + U.esc(row.time) : '')],
      ['Spesies', '<span class="legend-dot" style="background:' + c + '"></span>' + U.esc(row.species || '-')],
      ['Lokasi', U.esc(row.location_name || '-')],
      ['Koordinat', fmtCoord(row.lat, 5) + ', ' + fmtCoord(row.lng, 5)],
      ['Panjang Karapas', row.carapace_length_cm != null ? U.fmtNum(row.carapace_length_cm, 1) + ' cm' : '—'],
      ['Kondisi', badge(COND_BADGE[row.condition] || 'badge-muted', row.condition || '-', 'fa-circle')],
      ['Sumber Data', U.esc(row.source || '-')],
      ['Status', statusHtml(row.status)],
      ['Tercatat', U.fmtDateTime(row.created_at)]
    ];
    var h = '<div style="display:grid;grid-template-columns:170px 1fr;gap:9px 16px;font-size:14px;align-items:start">' +
      pairs.map(function (p) {
        return '<div style="color:var(--pg-muted);font-weight:600">' + p[0] + '</div><div>' + p[1] + '</div>';
      }).join('') + '</div>';
    h += '<h4 style="margin:18px 0 8px;font-size:14.5px">Catatan Lapangan</h4>' +
      '<p style="font-size:14px;line-height:1.75">' + U.esc(row.notes || 'Tidak ada catatan.') + '</p>';
    h += row.photo
      ? '<h4 style="margin:18px 0 8px;font-size:14.5px">Foto Dokumentasi</h4>' +
        '<div class="preview-img-wrap" style="max-width:360px"><img src="' + U.esc(imgSrc(row.photo)) + '" alt="Foto dokumentasi"></div>'
      : '<div class="note-strip mt-16"><i class="fa-solid fa-image"></i><span>Tidak ada foto dokumentasi pada data ini.</span></div>';
    return h;
  }

  function initTurtlesCrud() {
    var COND_BADGE = { 'Sehat': 'badge-success', 'Terluka': 'badge-warn', 'Terdampar': 'badge-danger', 'Meninggal': 'badge-muted' };
    var eng = PGAdmin.crud({
      entity: 'turtle_sightings',
      entityLabel: 'data perjumpaan penyu',
      mountId: 'tbl-turtles',
      newItemLabel: 'Tambah Data Penyu',
      editItemLabel: 'Edit Data Penyu',
      detailTitle: 'Detail Perjumpaan Penyu',
      searchPlaceholder: 'Cari spesies / lokasi / no. laporan…',
      note: 'Data berstatus <strong>approved</strong> tampil di dashboard publik &amp; peta. Pilih asal data agar dashboard membedakan demo, laporan masyarakat, iNaturalist, dan penelitian.',
      fields: [
        { key: 'species', label: 'Spesies', type: 'select', options: TURTLE_SPECIES, required: true },
        { key: 'date', label: 'Tanggal', type: 'date', required: true },
        { key: 'time', label: 'Waktu', type: 'time' },
        { key: 'location_name', label: 'Nama Lokasi', type: 'text', required: true, placeholder: 'mis. Teluk Wainilu' },
        { key: 'lat', label: 'Lintang (latitude)', type: 'number', step: 'any', required: true, placeholder: '-8.72345' },
        { key: 'lng', label: 'Bujur (longitude)', type: 'number', step: 'any', required: true, placeholder: '119.71234' },
        { key: 'carapace_length_cm', label: 'Panjang Karapas', type: 'number', step: '0.1', hint: 'cm — opsional' },
        { key: 'condition', label: 'Kondisi Penyu', type: 'select', options: PG.CONDITIONS, required: true },
        { key: 'source', label: 'Sumber Data', type: 'select', options: PG.SOURCE_TYPES },
        { key: 'data_origin', label: 'Asal Data', type: 'select', options: ['demo', 'community_report', 'iNaturalist', 'research'], required: true },
        { key: 'photo', label: 'Foto Dokumentasi', type: 'image' },
        { key: 'notes', label: 'Catatan', type: 'textarea', span2: true, rows: 3, placeholder: 'Catatan lapangan tambahan…' }
      ],
      columns: [
        { key: 'report_no', label: 'Nomor', render: function (r) { return '<strong style="color:var(--pg-navy)">' + U.esc(r.report_no || '—') + '</strong>'; } },
        { key: 'date', label: 'Tanggal', render: function (r) { return U.fmtDateShort(r.date) + (r.time ? '<div class="text-xs text-muted">' + U.esc(r.time) + '</div>' : ''); } },
        { key: 'species', label: 'Spesies', render: function (r) {
            var c = PG.SPECIES_COLORS[r.species] || '#9DB2BC';
            return '<span class="legend-dot" style="background:' + c + '"></span>' + U.esc(r.species || '-');
          } },
        { key: 'location_name', label: 'Lokasi', render: function (r) { return U.esc(r.location_name || '—'); } },
        { key: 'lat', label: 'Koordinat', render: function (r) { return fmtCoord(r.lat) + ', ' + fmtCoord(r.lng); } },
        { key: 'carapace_length_cm', label: 'Panjang', render: function (r) { return r.carapace_length_cm != null ? U.fmtNum(r.carapace_length_cm, 1) + ' cm' : '—'; } },
        { key: 'condition', label: 'Kondisi', render: function (r) { return badge(COND_BADGE[r.condition] || 'badge-muted', r.condition || '-', 'fa-circle'); } }
      ],
      searchKeys: ['species', 'location_name', 'report_no'],
      filters: [
        { key: 'species', label: 'Spesies', options: TURTLE_SPECIES.map(function (s) { return { value: s, label: s }; }), emptyLabel: 'Semua spesies' },
        { key: 'condition', label: 'Kondisi', options: PG.CONDITIONS.map(function (s) { return { value: s, label: s }; }), emptyLabel: 'Semua kondisi' },
        { key: 'year', label: 'Tahun', years: true, emptyLabel: 'Semua tahun' }
      ],
      defaults: { status: 'approved', source: 'Penelitian', data_origin: 'demo' },
      detailTemplate: turtleDetail,
      perPage: 8
    });
    try {
      if (new URLSearchParams(window.location.search).get('add') === '1') {
        setTimeout(function () { if (eng) eng.openForm(null); }, 350);
      }
    } catch (e) { /* URLSearchParams tidak tersedia */ }
  }

  /* ============================================================
   * HALAMAN: Data Oseanografi SST (oceanographic)
   * ============================================================ */
  var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  async function initOceanographic() {
    if (window.Chart && PG.charts && PG.charts.init) PG.charts.init();

    var yearSel = U.el('#sst-year');
    var eng = PGAdmin.crud({
      entity: 'sst_data',
      entityLabel: 'data SST',
      mountId: 'tbl-sst',
      showAdd: false,
      newItemLabel: 'Tambah Data SST',
      editItemLabel: 'Edit Data SST',
      searchPlaceholder: 'Cari (belum ada kata kunci khusus)…',
      emptyTitle: 'Belum ada data SST',
      emptyDesc: 'Gunakan tombol Impor CSV atau Tambah Manual pada toolbar di atas.',
      fields: [
        { key: 'year', label: 'Tahun', type: 'number', required: true, hint: '2000–2100' },
        { key: 'month', label: 'Bulan (1–12)', type: 'number', required: true, hint: '1 = Januari … 12 = Desember' },
        { key: 'sst_mean_c', label: 'SST Rata-rata (°C)', type: 'number', step: '0.01', required: true },
        { key: 'sst_min_c', label: 'SST Minimum (°C)', type: 'number', step: '0.01', required: true },
        { key: 'sst_max_c', label: 'SST Maksimum (°C)', type: 'number', step: '0.01', required: true }
      ],
      columns: [
        { key: 'year', label: 'Tahun', render: function (r) { return '<strong>' + U.esc(r.year) + '</strong>'; } },
        { key: 'month', label: 'Bulan', render: function (r) { return U.esc(NAMA_BULAN[(parseInt(r.month, 10) || 1) - 1] || r.month); } },
        { key: 'sst_min_c', label: 'Min', render: function (r) { return U.fmtNum(r.sst_min_c, 2) + ' °C'; } },
        { key: 'sst_mean_c', label: 'Mean', render: function (r) { return '<strong>' + U.fmtNum(r.sst_mean_c, 2) + ' °C</strong>'; } },
        { key: 'sst_max_c', label: 'Max', render: function (r) { return U.fmtNum(r.sst_max_c, 2) + ' °C'; } }
      ],
      searchKeys: [],
      filters: [],
      perPage: 10,
      beforeSave: async function (row, isEdit) {
        row.year = Math.round(Number(row.year));
        row.month = Math.round(Number(row.month));
        if (!(row.year >= 2000 && row.year <= 2100)) { PG.toast('Tahun harus antara 2000–2100.', 'error'); return false; }
        if (!(row.month >= 1 && row.month <= 12)) { PG.toast('Bulan harus antara 1–12.', 'error'); return false; }
        if (!isEdit) {
          var all = await PGStore.all('sst_data');
          var dup = all.some(function (r) { return Number(r.year) === row.year && Number(r.month) === row.month; });
          if (dup) {
            PG.toast('Data tahun ' + row.year + ' bulan ' + row.month + ' sudah ada — gunakan Edit.', 'warn');
            return false;
          }
        }
      },
      afterChange: function () { syncYears(); refreshChart(); }
    });

    async function syncYears() {
      var all = await PGStore.all('sst_data');
      var years = [];
      all.forEach(function (r) {
        var y = parseInt(r.year, 10);
        if (y && years.indexOf(y) < 0) years.push(y);
      });
      years.sort(function (a, b) { return b - a; });
      if (!yearSel) return;
      var cur = parseInt(yearSel.value, 10);
      yearSel.innerHTML = years.length
        ? years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('')
        : '<option value="">—</option>';
      if (cur && years.indexOf(cur) > -1) yearSel.value = String(cur);
      else if (years.length) yearSel.value = String(years[0]);
    }

    async function refreshChart() {
      var cv = document.getElementById('chart-sst-admin');
      if (!cv || !window.Chart || !PG.charts) return;
      var y = parseInt((yearSel && yearSel.value) || '0', 10);
      var all = await PGStore.all('sst_data');
      var rows = all.filter(function (r) { return parseInt(r.year, 10) === y; })
        .sort(function (a, b) { return a.month - b.month; });
      var labels = rows.map(function (r) { return NAMA_BULAN[(parseInt(r.month, 10) || 1) - 1]; });
      PG.charts.make('chart-sst-admin', {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'SST Rata-rata (°C)',
              data: rows.map(function (r) { return r.sst_mean_c; }),
              borderColor: '#D9FF47', backgroundColor: 'rgba(217,255,71,.12)',
              fill: true, tension: .35, borderWidth: 2.6, pointRadius: 3, pointBackgroundColor: '#D9FF47'
            },
            {
              label: 'Min (°C)',
              data: rows.map(function (r) { return r.sst_min_c; }),
              borderColor: '#9DB2BC', borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0, fill: false, tension: .3
            },
            {
              label: 'Max (°C)',
              data: rows.map(function (r) { return r.sst_max_c; }),
              borderColor: '#D9FF47', borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0, fill: false, tension: .3
            }
          ]
        },
        options: {
          plugins: { legend: { display: true, position: 'bottom' } },
          scales: { y: { title: { display: true, text: 'Suhu (°C)' } } }
        }
      });
      var sub = U.el('#sst-chart-sub');
      if (sub) {
        sub.textContent = rows.length
          ? 'Rata-rata bulanan tahun ' + y + ' — ' + rows.length + ' bulan terdata.'
          : 'Belum ada data SST untuk tahun ' + y + '.';
      }
    }

    if (yearSel) {
      yearSel.addEventListener('change', function () {
        refreshChart();
        eng.setFilter('year', yearSel.value);
      });
    }
    var addBtn = U.el('#btn-sst-add');
    if (addBtn) addBtn.addEventListener('click', function () { eng.openForm(null); });

    /* Import multi-parameter oseanografi: SST, klorofil-a, salinitas. */
    function num(v) {
      if (v == null || String(v).trim() === '') return NaN;
      return Number(String(v).trim().replace(',', '.'));
    }
    function monthKey(r) {
      var y = Number(r.year || r.tahun || r.tahun_data);
      var m = Number(r.month || r.bulan_angka || r.month_number);
      var period = r.bulan || r.period || r.periode || r.date || r.tanggal;
      if ((!Number.isFinite(y) || !Number.isFinite(m)) && period) {
        var match = String(period).match(/(\d{4})[-/](\d{1,2})/);
        if (match) { y = Number(match[1]); m = Number(match[2]); }
      }
      return { year: y, month: m };
    }
    function firstValue(r, names) {
      for (var i = 0; i < names.length; i++) {
        var v = r[names[i]];
        if (v !== undefined && v !== null && String(v).trim() !== '') return num(v);
      }
      return NaN;
    }
    function normalizeSST(rows) {
      if (rows.length && (rows[0].metrik || rows[0].metric || rows[0].parameter)) {
        var metrics = {};
        rows.forEach(function (r) { metrics[String(r.metrik || r.metric || r.parameter).toLowerCase().trim()] = r; });
        var dates = Object.keys(rows[0]).filter(function (k) { return /^\d{4}-\d{1,2}$/.test(k); });
        return dates.map(function (d) {
          var y = Number(d.slice(0, 4)), m = Number(d.slice(5));
          return { year:y, month:m,
            sst_mean_c:firstValue(metrics.sst_mean_c || metrics.sst_mean || {}, [d]),
            sst_min_c:firstValue(metrics.sst_min_c || metrics.sst_min || {}, [d]),
            sst_max_c:firstValue(metrics.sst_max_c || metrics.sst_max || {}, [d]) };
        });
      }
      return rows.map(function (r) {
        var k = monthKey(r);
        return { year:k.year, month:k.month,
          sst_mean_c:firstValue(r,['sst_mean_c','sst_mean','mean','sst_avg','rata_rata']),
          sst_min_c:firstValue(r,['sst_min_c','sst_min','min','minimum']),
          sst_max_c:firstValue(r,['sst_max_c','sst_max','max','maksimum']) };
      });
    }
    async function importMonthly(file, entity, normalize, requiredFields, label) {
      try {
        var rows = PGAdmin.parseCSV(await readTextFile(file));
        if (!rows.length) throw new Error('CSV kosong atau header tidak terbaca.');
        var normalized = normalize(rows);
        var existing = await PGStore.all(entity), seen = {};
        existing.forEach(function (r) { seen[String(r.year) + '-' + String(r.month)] = r; });
        var items = [], updates = [], bad = 0;
        normalized.forEach(function (r) {
          var y = Number(r.year), m = Number(r.month);
          var valid = Number.isInteger(y) && y >= 2000 && y <= 2100 && Number.isInteger(m) && m >= 1 && m <= 12 &&
            requiredFields.every(function (f) { return r[f] !== null && r[f] !== '' && Number.isFinite(Number(r[f])); });
          if (entity === 'sst_data') {
            if (!Number.isFinite(Number(r.sst_min_c))) r.sst_min_c = null;
            if (!Number.isFinite(Number(r.sst_max_c))) r.sst_max_c = null;
          }
          if (!valid) { bad++; return; }
          var key = y + '-' + m;
          r.year = y; r.month = m; if (entity !== 'sst_data') r.period = y + '-' + String(m).padStart(2, '0');
          if (seen[key]) updates.push({ id: seen[key].id, data: r });
          else items.push(r);
        });
        for (var u = 0; u < updates.length; u++) await PGStore.update(entity, updates[u].id, updates[u].data);
        if (items.length) await batchInsert(entity, items);
        var totalSaved = items.length + updates.length;
        if (totalSaved) await PGStore.log('Impor CSV', entity, totalSaved + ' periode dari ' + file.name);
        PG.toast(label + ': ' + items.length + ' baru, ' + updates.length + ' diperbarui, ' + bad + ' baris dilewati. ' + (totalSaved ? 'Impor berhasil.' : 'Periksa header CSV dan nilai kolom wajib.'), totalSaved ? 'success' : 'warn');
        await updateImportCounts();
        if (entity === 'sst_data') { await syncYears(); refreshChart(); eng.refresh(); }
      } catch (err) {
        console.error('[PenyuGuard] Import ' + entity, err);
        PG.toast('Impor ' + label + ' gagal: ' + (err.message || err), 'error');
      }
    }
    function bindImport(buttonId, inputId, entity, normalize, fields, label) {
      var btn = U.el('#' + buttonId), input = U.el('#' + inputId);
      if (!btn || !input) return;
      btn.addEventListener('click', function () { input.value = ''; input.click(); });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (f) importMonthly(f, entity, normalize, fields, label);
      });
    }
    bindImport('btn-import-csv', 'sst-csv-file', 'sst_data', normalizeSST,
      ['sst_mean_c'], 'SST');
    bindImport('btn-import-chl', 'chl-csv-file', 'chl_data', function (rows) {
      return rows.map(function (r) {
        var k = monthKey(r);
        return { year: k.year, month: k.month, chl_mean_mg_m3: firstValue(r, ['chl_mean_mg_m3','chl_mean_mg_3','chl_mean','mean']),
          image_count: num(r.jumlah_citra || r.image_count) || 0 };
      });
    }, ['chl_mean_mg_m3'], 'Klorofil-a');
    bindImport('btn-import-salinity', 'salinity-csv-file', 'salinity_data', function (rows) {
      return rows.map(function (r) {
        var k = monthKey(r);
        return { year: k.year, month: k.month, sal_mean_psu: firstValue(r, ['sal_mean_psu','sal_mean','mean']),
          sal_min_psu: firstValue(r, ['sal_min_psu','sal_min','min']), sal_max_psu: firstValue(r, ['sal_max_psu','sal_max','max']),
          image_count: num(r.jumlah_citra || r.image_count) || 0, pixel_count: num(r.jumlah_piksel || r.pixel_count) || 0 };
      });
    }, ['sal_mean_psu'], 'Salinitas');

    async function updateImportCounts() {
      var configs = [['sst_data', '#count-sst'], ['chl_data', '#count-chl'], ['salinity_data', '#count-salinity']];
      for (var i = 0; i < configs.length; i++) {
        var el = U.el(configs[i][1]);
        try {
          var rows = await PGStore.all(configs[i][0]);
          if (el) el.textContent = rows.length + ' periode';
        } catch (err) {
          if (el) el.textContent = 'Tabel belum tersedia';
        }
      }
    }
    updateImportCounts();

    await syncYears();
    refreshChart();
  }

  /* ============================================================
   * HALAMAN: Konten Edukasi (education) — 2 tab
   * ============================================================ */
  var ARTICLE_CATEGORIES = ['Pengenalan Spesies', 'Habitat', 'Konservasi', 'Ancaman', 'Ekosistem', 'Panduan', 'Interaksi', 'Teknologi'];
  var IUCN_META = {
    CR: ['badge-danger', 'Kritis (Critically Endangered)'],
    EN: ['badge-warn', 'Terancam (Endangered)'],
    VU: ['badge-info', 'Rentan (Vulnerable)'],
    NT: ['badge-muted', 'Nyaris Terancam (Near Threatened)'],
    LC: ['badge-muted', 'Berisiko Rendah (Least Concern)']
  };

  function bindTabs() {
    U.els('.tabs .tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        U.els('.tabs .tab-btn').forEach(function (b) { b.classList.remove('active'); });
        U.els('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var pane = U.el('#pane-' + btn.getAttribute('data-tab'));
        if (pane) pane.classList.add('active');
      });
    });
  }

  function articleDetail(row) {
    var h = '<div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:14px">' +
      '<span class="badge badge-info"><i class="fa-solid fa-folder"></i> ' + U.esc(row.category || '-') + '</span>' +
      (row.published
        ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Terbit</span>'
        : '<span class="badge badge-muted"><i class="fa-solid fa-pen"></i> Draf</span>') +
      '<span class="badge badge-muted"><i class="fa-solid fa-clock"></i> Diperbarui ' + U.fmtDateShort(row.updated_at) + '</span>' +
      '</div>';
    if (row.image) {
      h += '<div class="preview-img-wrap" style="max-height:260px;margin-bottom:16px"><img src="' + U.esc(imgSrc(row.image)) + '" alt=""></div>';
    }
    h += '<p style="font-style:italic;color:var(--pg-muted);margin-bottom:16px">' + U.esc(row.excerpt || '') + '</p>';
    /* konten artikel berupa HTML sederhana yang ditulis admin (sumber tepercaya internal) */
    h += '<div class="article-content" style="font-size:14.5px;line-height:1.8">' + (row.content || '(konten kosong)') + '</div>';
    return h;
  }

  function initArticlesCrud() {
    PGAdmin.crud({
      entity: 'education_articles',
      entityLabel: 'artikel edukasi',
      mountId: 'tbl-articles',
      newItemLabel: 'Tambah Artikel Edukasi',
      editItemLabel: 'Edit Artikel Edukasi',
      detailTitle: 'Pratinjau Artikel',
      addLabel: 'Tambah Artikel',
      searchPlaceholder: 'Cari judul / kategori artikel…',
      note: 'Artikel berstatus <strong>Terbit</strong> tampil pada halaman Edukasi publik. Konten ditulis dengan HTML sederhana (&lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;).',
      fields: [
        { key: 'title', label: 'Judul Artikel', type: 'text', span2: true, required: true, placeholder: 'mis. Mengenal Penyu Laut Indonesia' },
        { key: 'category', label: 'Kategori', type: 'select', options: ARTICLE_CATEGORIES, required: true },
        { key: 'published', label: 'Status', type: 'switch', switchLabel: 'Terbitkan (tampil di halaman publik)' },
        { key: 'image', label: 'Gambar Utama', type: 'image' },
        { key: 'excerpt', label: 'Ringkasan (excerpt)', type: 'textarea', span2: true, rows: 2, required: true, placeholder: '1–2 kalimat ringkasan untuk kartu artikel…' },
        { key: 'content', label: 'Konten Artikel', type: 'textarea', span2: true, rows: 12, required: true, hint: 'boleh HTML sederhana: <p>, <ul>, <li>, <strong>' }
      ],
      columns: [
        { key: 'image', label: 'Gambar', render: function (r) { return thumbImg(r.image, 44); } },
        { key: 'title', label: 'Judul', render: function (r) {
            return '<span class="truncate" style="display:inline-block;max-width:280px;vertical-align:middle;font-weight:600;color:var(--pg-navy)" title="' +
              U.esc(r.title) + '">' + U.esc(r.title || '—') + '</span>';
          } },
        { key: 'category', label: 'Kategori', render: function (r) { return badge('badge-info', r.category || '-', 'fa-folder'); } },
        { key: 'published', label: 'Status', render: function (r) {
            return r.published
              ? badge('badge-success', 'Terbit', 'fa-circle-check')
              : badge('badge-muted', 'Draf', 'fa-pen');
          } },
        { key: 'updated_at', label: 'Diperbarui', render: function (r) { return U.fmtDateShort(r.updated_at); } }
      ],
      searchKeys: ['title', 'category'],
      filters: [
        { key: 'category', label: 'Kategori', options: ARTICLE_CATEGORIES.map(function (c) { return { value: c, label: c }; }), emptyLabel: 'Semua kategori' },
        { key: 'published', label: 'Status', options: [{ value: 'true', label: 'Terbit' }, { value: 'false', label: 'Draf' }], emptyLabel: 'Semua status' }
      ],
      defaults: { published: true },
      detailTemplate: articleDetail,
      perPage: 8,
      beforeSave: function (row) {
        row.updated_at = new Date().toISOString();
      }
    });
  }

  function initSpeciesCrud() {
    PGAdmin.crud({
      entity: 'turtle_species',
      entityLabel: 'profil spesies',
      mountId: 'tbl-species',
      newItemLabel: 'Tambah Profil Spesies',
      editItemLabel: 'Edit Profil Spesies',
      addLabel: 'Tambah Spesies',
      searchPlaceholder: 'Cari nama spesies / nama ilmiah…',
      note: 'Spesies <strong>Terkonfirmasi</strong> tampil penuh pada katalog publik; yang belum terkonfirmasi ditandai <strong>Kandidat</strong> berdasarkan catatan keberadaan lokal.',
      fields: [
        { key: 'name', label: 'Nama Umum', type: 'text', required: true, placeholder: 'mis. Penyu Hijau' },
        { key: 'scientific', label: 'Nama Ilmiah', type: 'text', required: true, placeholder: 'mis. Chelonia mydas' },
        { key: 'iucn', label: 'Status IUCN', type: 'select', options: ['CR', 'EN', 'VU', 'NT', 'LC'], required: true },
        { key: 'image', label: 'Foto Spesies', type: 'image' },
        { key: 'confirmed_local', label: 'Status Lokal', type: 'switch', switchLabel: 'Terkonfirmasi di perairan Rinca/Komodo' },
        { key: 'ccl_range', label: 'Rentang Panjang (CCL)', type: 'text', placeholder: 'mis. 80–120 cm (dewasa)' },
        { key: 'weight_range', label: 'Rentang Berat', type: 'text', placeholder: 'mis. 68–190 kg' },
        { key: 'presence_note', label: 'Catatan Keberadaan Lokal', type: 'textarea', span2: true, rows: 2, hint: 'status keberadaan lokal — kandidat katalog bila belum terkonfirmasi' },
        { key: 'habitat', label: 'Habitat', type: 'textarea', span2: true, rows: 2 },
        { key: 'characteristics', label: 'Karakteristik', type: 'textarea', span2: true, rows: 5, hint: 'pisahkan dengan baris baru — satu karakteristik per baris' },
        { key: 'description', label: 'Deskripsi', type: 'textarea', span2: true, rows: 4 }
      ],
      columns: [
        { key: 'image', label: 'Gambar', render: function (r) { return thumbImg(r.image, 44); } },
        { key: 'name', label: 'Nama', render: function (r) { return '<strong style="color:var(--pg-navy)">' + U.esc(r.name || '—') + '</strong>'; } },
        { key: 'scientific', label: 'Ilmiah', render: function (r) { return '<em>' + U.esc(r.scientific || '—') + '</em>'; } },
        { key: 'iucn', label: 'IUCN', render: function (r) {
            var m = IUCN_META[r.iucn] || ['badge-muted', r.iucn || '-'];
            return '<span class="badge ' + m[0] + '" title="' + U.esc(m[1]) + '">' + U.esc(r.iucn || '-') + '</span>';
          } },
        { key: 'confirmed_local', label: 'Lokal', render: function (r) {
            return r.confirmed_local
              ? badge('badge-success', 'Ya', 'fa-circle-check')
              : badge('badge-warn', 'Kandidat', 'fa-circle-question');
          } }
      ],
      searchKeys: ['name', 'scientific'],
      filters: [
        { key: 'iucn', label: 'IUCN', options: ['CR', 'EN', 'VU', 'NT', 'LC'].map(function (c) { return { value: c, label: c }; }), emptyLabel: 'Semua status' },
        { key: 'confirmed_local', label: 'Status Lokal', options: [{ value: 'true', label: 'Terkonfirmasi' }, { value: 'false', label: 'Kandidat' }], emptyLabel: 'Semua' }
      ],
      defaults: { confirmed_local: false },
      perPage: 8,
      beforeSave: function (row) {
        row.characteristics = String(row.characteristics || '')
          .split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      }
    });
  }

  function initEducation() {
    bindTabs();
    initArticlesCrud();
    initSpeciesCrud();
  }

  /* ============================================================
   * Self-init berdasarkan body[data-active]
   * ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    var boot = async function () {
      try {
        if (window.PGAuth && PGAuth.ready) await PGAuth.ready;
      } catch (e) { /* abaikan */ }
      var key = (document.body.getAttribute('data-active') || '').toLowerCase();
      if (key === 'turtles') initTurtlesCrud();
      else if (key === 'oceanographic') initOceanographic();
      else if (key === 'education') initEducation();
    };
    boot();
  });
})();
