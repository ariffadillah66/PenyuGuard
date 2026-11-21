/* ============================================================
 * PenyuGuard — js/admin/users.js
 * Halaman Manajemen Pengguna (ADMIN only, data-require="admin"):
 * stat ringkasan, tabel profiles, ubah role, aktif/nonaktif,
 * riwayat aktivitas, reset password demo, tambah operator.
 * ------------------------------------------------------------
 * Mode demonstrasi: password akun dikelola pada localStorage
 * 'pg_demo_pw' (map id → hash). Bukan sistem produksi.
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
      initials: function (name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase();
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

  /* ------------------------------------------------------------
   * mirror demoHash dari auth.js — HANYA untuk mode demonstrasi
   * (bukan kriptografi produksi). Disalin persis agar password
   * akun baru ter-set kompatibel dengan PGAuth.login().
   * ------------------------------------------------------------ */
  var DEMO_PASSWORD = 'demo1234';
  function pgDemoHash(pw) {
    var s = 'pg$' + String(pw || '') + '#salt';
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = (h1 ^ s.charCodeAt(i)) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'h' + h1.toString(36) + h2.toString(36);
  }

  function setDemoPassword(id, pw) {
    try {
      var map = JSON.parse(localStorage.getItem('pg_demo_pw') || '{}');
      map[id] = pgDemoHash(pw);
      localStorage.setItem('pg_demo_pw', JSON.stringify(map));
    } catch (e) { /* penyimpanan non-aktif */ }
  }

  var ROLE_LABEL = (window.PGAuth && PGAuth.ROLE_LABEL) || { user: 'Pengguna', operator: 'Operator', admin: 'Administrator' };
  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function isSelf(row) {
    return !!(window.PGAuth && PGAuth.user && PGAuth.user.id === row.id);
  }

  function roleChip(role) {
    var safe = ['user', 'operator', 'admin'].indexOf(role) > -1 ? role : 'user';
    return '<span class="role-chip role-' + safe + '">' + U.esc(ROLE_LABEL[safe] || safe) + '</span>';
  }

  function statusBadge(status) {
    return status === 'disabled'
      ? '<span class="badge badge-danger"><i class="fa-solid fa-ban"></i> Nonaktif</span>'
      : '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Aktif</span>';
  }

  function shortId(id) {
    var s = String(id || '');
    return U.esc(s.length > 10 ? s.slice(0, 10) + '…' : s);
  }

  /* ============================================================
   * Init halaman
   * ============================================================ */
  async function initUsersAdmin() {
    var me = (window.PGAuth && PGAuth.user) ? PGAuth.user : null;
    var state = { search: '', page: 1, token: 0 };
    var lastRows = [];

    async function refreshStats() {
      var host = U.el('#stat-users');
      if (!host) return;
      var all = await PGStore.all('profiles');
      var ops = all.filter(function (r) { return r.role === 'operator'; }).length;
      var admins = all.filter(function (r) { return r.role === 'admin'; }).length;
      var dis = all.filter(function (r) { return r.status === 'disabled'; }).length;
      host.innerHTML =
        PG.ui.statCard({ icon: 'fa-users', value: U.fmtNum(all.length), label: 'Total Pengguna', sub: admins + ' admin • ' + ops + ' operator', tone: 'navy' }) +
        PG.ui.statCard({ icon: 'fa-user-gear', value: U.fmtNum(ops), label: 'Operator', sub: 'akun staff lapangan', tone: 'teal' }) +
        PG.ui.statCard({ icon: 'fa-user-slash', value: U.fmtNum(dis), label: 'Dinonaktifkan', sub: 'akun berstatus nonaktif', tone: 'danger' });
    }

    async function render() {
      var mount = U.el('#tbl-users');
      if (!mount) return;
      var my = ++state.token;
      var all = await PGStore.all('profiles');
      if (my !== state.token) return;

      var rows = all;
      if (state.search) {
        var q = state.search.toLowerCase();
        rows = all.filter(function (r) {
          return String(r.full_name || '').toLowerCase().indexOf(q) > -1 ||
            String(r.email || '').toLowerCase().indexOf(q) > -1;
        });
      }
      var per = 8, total = rows.length;
      var pages = Math.max(1, Math.ceil(total / per));
      if (state.page > pages) state.page = pages;
      var slice = rows.slice((state.page - 1) * per, state.page * per);
      lastRows = slice;

      if (!all.length) {
        mount.innerHTML = PG.ui.emptyState('fa-users', 'Belum ada pengguna', 'Akun pengguna akan tampil di sini.');
        return;
      }
      if (!rows.length) {
        mount.innerHTML = PG.ui.emptyState('fa-magnifying-glass', 'Tidak ada hasil', 'Tidak ada akun yang cocok dengan pencarian.');
        return;
      }

      var h = '<div class="table-wrap"><table class="pg-table"><thead><tr>' +
        '<th>ID</th><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Terdaftar</th>' +
        '<th style="text-align:right">Aksi</th></tr></thead><tbody>';
      slice.forEach(function (r) {
        h += '<tr data-id="' + U.esc(r.id) + '">' +
          '<td><span class="text-xs text-muted" style="font-family:monospace">' + shortId(r.id) + '</span></td>' +
          '<td><div style="display:flex;align-items:center;gap:10px">' +
          '<span class="avatar" style="width:34px;height:34px;font-size:12px">' + U.esc(U.initials(r.full_name)) + '</span>' +
          '<span><strong style="color:var(--pg-navy)">' + U.esc(r.full_name || '—') + '</strong>' +
          (isSelf(r) ? ' <span class="badge badge-info" style="margin-left:4px">Anda</span>' : '') +
          '</span></div></td>' +
          '<td>' + U.esc(r.email || '—') + '</td>' +
          '<td>' + roleChip(r.role) + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td>' + U.fmtDateShort(r.created_at) + '</td>' +
          '<td><div class="cell-actions" style="justify-content:flex-end">' +
          '<button type="button" class="btn btn-ghost" data-act="role" title="Ubah role"><i class="fa-solid fa-user-pen"></i></button>' +
          '<button type="button" class="btn btn-ghost" data-act="status" title="' +
          (r.status === 'disabled' ? 'Aktifkan akun' : 'Nonaktifkan akun') + '">' +
          '<i class="fa-solid fa-toggle-' + (r.status === 'disabled' ? 'off' : 'on') + '"></i></button>' +
          '<button type="button" class="btn btn-ghost" data-act="log" title="Riwayat aktivitas"><i class="fa-solid fa-clock-rotate-left"></i></button>' +
          '<button type="button" class="btn btn-ghost" data-act="reset" title="Atur ulang kata sandi (demonstrasi)"><i class="fa-solid fa-key"></i></button>' +
          '</div></td></tr>';
      });
      h += '</tbody></table></div><div class="pagination"></div>';
      mount.innerHTML = h;

      var pm = U.el('.pagination', mount);
      if (pm) {
        PG.ui.pagination(pm, {
          page: state.page, perPage: per, total: total,
          onChange: function (p) { state.page = p; render(); }
        });
      }

      U.els('button[data-act]', mount).forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = b.closest('tr[data-id]');
          var id = tr ? tr.getAttribute('data-id') : '';
          var row = lastRows.filter(function (r) { return String(r.id) === String(id); })[0];
          if (!row) return;
          var act = b.getAttribute('data-act');
          if (act === 'role') openRoleModal(row);
          else if (act === 'status') toggleStatus(row);
          else if (act === 'log') openHistoryModal(row);
          else if (act === 'reset') resetPassword(row);
        });
      });
    }

    /* ---------------- Ubah role ---------------- */
    function openRoleModal(row) {
      if (isSelf(row)) {
        PG.toast('Anda tidak dapat mengubah role akun sendiri.', 'error');
        return;
      }
      PG.ui.openModal({
        title: 'Ubah Role Pengguna',
        body:
          '<p style="line-height:1.7;margin-bottom:14px">Ubah hak akses untuk <strong>' + U.esc(row.full_name) + '</strong> ' +
          '(<span class="text-muted">' + U.esc(row.email) + '</span>).</p>' +
          '<div class="field"><label>Role Baru</label><select id="um-role" class="select">' +
          PG.optionHtml(['user', 'operator', 'admin'], row.role) + '</select>' +
          '<span class="hint">Pengguna: akses publik. Operator: memverifikasi laporan dan mengelola data. Administrator: akses penuh.</span></div>',
        footer: '<button type="button" class="btn btn-outline" data-cancel>Batal</button>' +
          '<button type="button" class="btn btn-primary" data-ok><i class="fa-solid fa-check"></i> Simpan Role</button>',
        onOpen: function (ov, close) {
          ov.querySelector('[data-cancel]').addEventListener('click', close);
          ov.querySelector('[data-ok]').addEventListener('click', async function () {
            var newRole = ov.querySelector('#um-role').value;
            if (!['user', 'operator', 'admin'].includes(newRole)) {
              PG.toast('Role tidak valid.', 'error');
              return;
            }
            if (newRole === row.role) {
              PG.toast('Role pengguna tidak berubah.', 'info');
              close();
              return;
            }
            await PGStore.update('profiles', row.id, { role: newRole });
            await PGStore.log('Perubahan hak akses', row.email, 'Role: ' + row.role + ' → ' + newRole);
            close();
            PG.toast('Peran ' + U.esc(row.full_name) + ' diubah menjadi ' + (ROLE_LABEL[newRole] || newRole) + '.', 'success');
            render();
            refreshStats();
          });
        }
      });
    }

    /* ---------------- Aktif / nonaktif ---------------- */
    async function toggleStatus(row) {
      if (isSelf(row)) {
        PG.toast('Anda tidak dapat menonaktifkan akun sendiri.', 'error');
        return;
      }
      var to = row.status === 'disabled' ? 'active' : 'disabled';
      var disabling = to === 'disabled';
      var ok = await PG.ui.confirm({
        title: disabling ? 'Nonaktifkan Akun' : 'Aktifkan Akun',
        danger: disabling,
        okLabel: disabling ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan',
        message: (disabling
          ? 'Akun <strong>' + U.esc(row.full_name) + '</strong> (' + U.esc(row.email) + ') akan <strong>dinonaktifkan</strong> dan tidak dapat login.'
          : 'Akun <strong>' + U.esc(row.full_name) + '</strong> (' + U.esc(row.email) + ') akan <strong>diaktifkan</strong> kembali.')
      });
      if (!ok) return;
      await PGStore.update('profiles', row.id, { status: to });
      await PGStore.log('Perubahan hak akses', row.email, 'Status akun: ' + (disabling ? 'dinonaktifkan' : 'diaktifkan'));
      PG.toast('Status akun diperbarui.', 'success');
      render();
      refreshStats();
    }

    /* ---------------- Riwayat aktivitas ---------------- */
    async function openHistoryModal(row) {
      var logs = (await PGStore.all('activity_logs'))
        .filter(function (l) { return String(l.actor || '').toLowerCase() === String(row.email || '').toLowerCase(); })
        .slice(0, 20);
      var body;
      if (!logs.length) {
        body = PG.ui.emptyState('fa-clock-rotate-left', 'Belum ada aktivitas', 'Tidak ada log aktivitas yang tercatat untuk akun ini (maks 20 terakhir).');
      } else {
        body = '<p class="text-sm text-muted" style="margin-bottom:14px">20 aktivitas terakhir akun <strong>' + U.esc(row.email) + '</strong>:</p>' +
          '<ul class="timeline">' +
          logs.map(function (l) {
            return '<li><div class="tl-time">' + U.fmtDateTime(l.timestamp) + '</div>' +
              '<div class="tl-title">' + U.esc(l.action || '-') + '</div>' +
              '<div class="tl-desc">' + U.esc(l.target || '') + (l.detail ? ' — ' + U.esc(l.detail) : '') + '</div></li>';
          }).join('') +
          '</ul>';
      }
      PG.ui.openModal({
        title: 'Riwayat Aktivitas',
        size: 'lg',
        body: body,
        footer: '<button type="button" class="btn btn-primary" data-close-ok>Tutup</button>',
        onOpen: function (ov, close) {
          ov.querySelector('[data-close-ok]').addEventListener('click', close);
        }
      });
    }

    /* ---------------- Reset password (demo) ---------------- */
    async function resetPassword(row) {
      var ok = await PG.ui.confirm({
        title: 'Atur Ulang Kata Sandi (Mode Demonstrasi)',
        okLabel: 'Ya, Reset',
        message: 'Setel ulang password <strong>' + U.esc(row.email) + '</strong> ke password awal demo <code>demo1234</code>? ' +
          'Akun dapat langsung login dengan password tersebut.'
      });
      if (!ok) return;
      setDemoPassword(row.id, DEMO_PASSWORD);
      await PGStore.log('Ubah data', 'profiles', 'Reset password demo untuk ' + row.email);
      PG.toast('Kata sandi dikembalikan ke demo1234 (Mode Demonstrasi).', 'success');
    }

    /* ---------------- Tambah Operator ---------------- */
    function openAddOperator() {
      if (window.PGConfig && PGConfig.isConfigured) {
        PG.toast('Pembuatan akun lokal hanya tersedia pada mode demonstrasi.', 'error');
        return;
      }
      PG.ui.openModal({
        title: 'Tambah Operator',
        body:
          '<div class="alert alert-info" style="margin-bottom:16px"><i class="fa-solid fa-key"></i><div>' +
          'Akun operator dibuat dengan <strong>password awal: <code>demo1234</code></strong> ' +
          '(mode demonstrasi — minta operator mengubahnya pada halaman Pengaturan setelah login).</div></div>' +
          '<div class="field"><label>Nama Lengkap <span class="req">*</span></label>' +
          '<input id="op-name" type="text" class="input" placeholder="mis. Petugas Lapangan Rinca"></div>' +
          '<div class="field"><label>Email <span class="req">*</span></label>' +
          '<input id="op-email" type="email" class="input" placeholder="nama@penyuguard.id"></div>' +
          '<div class="field-error" id="op-err"></div>',
        footer: '<button type="button" class="btn btn-outline" data-cancel>Batal</button>' +
          '<button type="button" class="btn btn-primary" data-ok><i class="fa-solid fa-user-plus"></i> Buat Akun</button>',
        onOpen: function (ov, close) {
          ov.querySelector('[data-cancel]').addEventListener('click', close);
          ov.querySelector('[data-ok]').addEventListener('click', async function () {
            if (PGConfig.isConfigured) {
              var remoteErr = ov.querySelector('#op-err');
              remoteErr.textContent = 'Pembuatan akun operator melalui browser dinonaktifkan demi keamanan. Buat akun melalui Supabase Authentication, lalu ubah role menjadi operator melalui SQL Editor. Jangan gunakan service_role key di frontend.';
              remoteErr.classList.add('show');
              return;
            }
            var name = ov.querySelector('#op-name').value.trim();
            var email = ov.querySelector('#op-email').value.trim().toLowerCase();
            var errEl = ov.querySelector('#op-err');
            errEl.classList.remove('show');
            errEl.textContent = '';

            var problems = [];
            if (name.length < 3) problems.push('nama lengkap minimal 3 karakter');
            if (!EMAIL_RX.test(email)) problems.push('format email tidak valid');
            if (problems.length) {
              errEl.textContent = problems.join('; ') + '.';
              errEl.classList.add('show');
              return;
            }
            var profiles = await PGStore.all('profiles');
            if (profiles.some(function (x) { return String(x.email || '').toLowerCase() === email; })) {
              errEl.textContent = 'Email sudah terdaftar. Gunakan email lain.';
              errEl.classList.add('show');
              return;
            }
            var id = 'u_' + Date.now().toString(36);
            await PGStore.insert('profiles', {
              id: id,
              full_name: name,
              email: email,
              role: 'operator',
              status: 'active',
              phone: '',
              avatar: ''
            });
            setDemoPassword(id, DEMO_PASSWORD);
            await PGStore.log('Registrasi operator', email, 'Role: operator — password awal demo (demo1234)');
            close();
            PG.toast('Operator "' + U.esc(name) + '" dibuat. Password awal: demo1234', 'success');
            render();
            refreshStats();
          });
        }
      });
    }

    /* ---------------- wiring ---------------- */
    var search = U.el('#users-search');
    if (search) {
      search.addEventListener('input', U.debounce(function () {
        state.search = search.value.trim();
        state.page = 1;
        render();
      }, 250));
    }
    var addBtn = U.el('#btn-add-operator');
    if (addBtn) addBtn.addEventListener('click', openAddOperator);

    await refreshStats();
    render();
  }

  /* ============================================================
   * Self-init (halaman users, data-require="admin")
   * ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    var boot = async function () {
      try {
        if (window.PGAuth && PGAuth.ready) await PGAuth.ready;
      } catch (e) { /* abaikan */ }
      if ((document.body.getAttribute('data-active') || '').toLowerCase() === 'users') {
        initUsersAdmin();
      }
    };
    boot();
  });
})();
