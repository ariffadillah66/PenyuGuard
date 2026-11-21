/* ============================================================
 * PenyuGuard — profile.js
 * Halaman profil: kartu profil, foto, edit data, ubah password,
 * statistik laporan, dan riwayat aktivitas.
 * ============================================================ */
(function () {
  'use strict';

  var MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
  var PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

  function bindPwToggle(root) {
    (root || document).querySelectorAll('.pw-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = btn.parentElement.querySelector('input');
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = '<i class="fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
        btn.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
      });
    });
  }

  /* ---------------- Render kartu profil ---------------- */
  function renderProfile() {
    var u = PGAuth.user;
    if (!u) return;
    var avatar = PG.util.el('#ph-avatar');
    avatar.innerHTML = u.avatar
      ? '<img src="' + PG.util.esc(u.avatar) + '" alt="Foto profil">'
      : PG.util.esc(PG.util.initials(u.full_name));

    PG.util.el('#ph-name').textContent = u.full_name || 'Pengguna PenyuGuard';
    PG.util.el('#ph-mail').textContent = u.email || '-';

    var roleCls = u.role === 'admin' ? ' role-admin' : u.role === 'operator' ? ' role-operator' : '';
    var statusBadge = u.status === 'active'
      ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Akun Aktif</span>'
      : '<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> Akun Nonaktif</span>';
    PG.util.el('#ph-meta').innerHTML =
      '<span class="role-chip' + roleCls + '"><i class="fa-solid fa-id-badge"></i> ' +
      PG.util.esc(PGAuth.ROLE_LABEL[u.role] || u.role) + '</span>' + statusBadge;

    PG.util.el('#ph-since').textContent = PG.util.fmtDate(u.created_at);
  }

  function renderStorageMode() {
    var badge = PG.util.el('#profile-storage-mode');
    if (!badge) return;
    var remote = !!(window.PGStore && PGStore._remote && PGStore._remote());
    var failed = remote && !!(window.PGConfig && PGConfig.connectionError);
    badge.className = 'badge ' + (failed ? 'badge-danger' : remote ? 'badge-success' : 'badge-warn');
    badge.innerHTML = failed
      ? '<i class="fa-solid fa-triangle-exclamation"></i> Supabase terputus'
      : remote ? '<i class="fa-solid fa-cloud"></i> Supabase aktif'
        : '<i class="fa-solid fa-hard-drive"></i> Demo lokal';
    badge.title = failed ? 'Supabase dikonfigurasi tetapi koneksi gagal.'
      : remote ? 'Data profil dan laporan menggunakan Supabase.'
        : 'Data profil dan laporan disimpan lokal di browser ini.';
  }

  /* ---------------- Statistik laporan ---------------- */
  async function renderStats() {
    var u = PGAuth.user;
    if (!u) return;
    var reports = await PGStore.all('public_reports');
    var mine = reports.filter(function (r) { return r.user_id === u.id; });
    PG.util.el('#st-total').textContent = PG.util.fmtNum(mine.length);
    PG.util.el('#st-approved').textContent = PG.util.fmtNum(mine.filter(function (r) { return r.status === 'Disetujui'; }).length);
    PG.util.el('#st-pending').textContent = PG.util.fmtNum(mine.filter(function (r) { return r.status === 'Menunggu Verifikasi'; }).length);
  }

  /* ---------------- Riwayat aktivitas ---------------- */
  function actMeta(log) {
    var a = String(log.action || '').toLowerCase();
    if (a.indexOf('login') > -1) return ['fa-arrow-right-to-bracket', ''];
    if (a.indexOf('logout') > -1) return ['fa-arrow-right-from-bracket', 'tone-danger'];
    if (a.indexOf('kirim') > -1 || a.indexOf('tambah') > -1 || a.indexOf('lapor') > -1) return ['fa-paper-plane', 'tone-success'];
    if (a.indexOf('verifikasi') > -1) return ['fa-clipboard-check', 'tone-success'];
    return ['fa-pen', ''];
  }

  async function renderActivity() {
    var u = PGAuth.user;
    var wrap = PG.util.el('#act-list');
    if (!u || !wrap) return;
    var logs = await PGStore.all('activity_logs');
    var mine = logs
      .filter(function (l) { return l.actor === u.email; })
      .sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); })
      .slice(0, 15);

    if (!mine.length) {
      PG.util.el('#act-wrap').innerHTML = PG.ui.emptyState(
        'fa-clock-rotate-left',
        'Belum ada aktivitas',
        'Aktivitas akun Anda (masuk, mengirim laporan, dan verifikasi) akan tercatat di sini.',
        '<a class="btn btn-primary btn-sm" href="report.html"><i class="fa-solid fa-paper-plane"></i> Buat Laporan Pertama</a>'
      );
      return;
    }

    wrap.innerHTML = mine.map(function (l) {
      var meta = actMeta(l);
      var desc = l.detail || l.target || '';
      return '<div class="act-item ' + meta[1] + '">' +
        '<span class="act-icon"><i class="fa-solid ' + meta[0] + '"></i></span>' +
        '<div class="act-body">' +
        '<div class="tl-title">' + PG.util.esc(l.action || 'Aktivitas') + '</div>' +
        (desc ? '<div class="tl-desc">' + PG.util.esc(desc) + '</div>' : '') +
        '<span class="tl-time">' + PG.util.esc(PG.util.fmtDateTime(l.timestamp)) + '</span>' +
        '</div></div>';
    }).join('');
  }

  /* ---------------- Modal: edit profil ---------------- */
  function openEditModal() {
    var u = PGAuth.user;
    if (!u) return;
    PG.ui.openModal({
      title: 'Edit Profil',
      body:
        '<form id="edit-profile-form" novalidate>' +
        '  <div class="field">' +
        '    <label for="ep-name">Nama Lengkap <span class="req">*</span></label>' +
        '    <input class="input" type="text" id="ep-name" value="' + PG.util.esc(u.full_name || '') + '" minlength="3">' +
        '    <span class="field-error"></span>' +
        '  </div>' +
        '  <div class="field">' +
        '    <label for="ep-email">Email</label>' +
        '    <input class="input" type="email" id="ep-email" value="' + PG.util.esc(u.email || '') + '" disabled>' +
        '    <span class="hint">Email tidak dapat diubah pada Mode Demonstrasi.</span>' +
        '  </div>' +
        '  <div class="field">' +
        '    <label for="ep-phone">Nomor Telepon</label>' +
        '    <input class="input" type="tel" id="ep-phone" value="' + PG.util.esc(u.phone || '') + '" placeholder="Contoh: +62 812 3456 7890">' +
        '    <span class="field-error"></span>' +
        '  </div>' +
        '  <div id="ep-error" class="alert alert-danger" style="display:none;"></div>' +
        '</form>',
      footer:
        '<button class="btn btn-outline" data-ep-cancel>Batal</button>' +
        '<button class="btn btn-primary" data-ep-save><i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan</button>',
      onOpen: function (ov, close) {
        bindPwToggle(ov);
        ov.querySelector('[data-ep-cancel]').addEventListener('click', close);
        var nameI = ov.querySelector('#ep-name');
        var phoneI = ov.querySelector('#ep-phone');
        var errBox = ov.querySelector('#ep-error');
        ov.querySelector('[data-ep-save]').addEventListener('click', async function () {
          PG.clearFieldErrors(ov);
          errBox.style.display = 'none';
          var ok = true;
          if (nameI.value.trim().length < 3) {
            PG.showFieldError(nameI, 'Nama lengkap minimal 3 karakter.');
            ok = false;
          }
          if (phoneI.value.trim() && !PHONE_RE.test(phoneI.value.trim())) {
            PG.showFieldError(phoneI, 'Nomor telepon tidak valid (6–20 karakter angka).');
            ok = false;
          }
          if (!ok) return;
          var btn = ov.querySelector('[data-ep-save]');
          btn.disabled = true;
          try {
            await PGAuth.updateProfile({ full_name: nameI.value.trim(), phone: phoneI.value.trim() });
            close();
            renderProfile();
            PG.renderNav();
            PG.toast('Profil berhasil diperbarui.', 'success');
          } catch (err) {
            errBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>' + PG.util.esc(err.message || 'Gagal menyimpan.') + '</span>';
            errBox.style.display = 'flex';
            btn.disabled = false;
          }
        });
      }
    });
  }

  /* ---------------- Modal: ubah password ---------------- */
  function openPasswordModal() {
    PG.ui.openModal({
      title: 'Ubah Kata Sandi',
      body:
        '<form id="change-pw-form" novalidate>' +
        '  <div class="field">' +
        '    <label for="cp-current">Kata Sandi Saat Ini <span class="req">*</span></label>' +
        '    <div class="input-icon has-toggle"><i class="fa-solid fa-lock"></i>' +
        '      <input class="input" type="password" id="cp-current" autocomplete="current-password">' +
        '      <button type="button" class="pw-toggle" aria-label="Tampilkan kata sandi"><i class="fa-solid fa-eye"></i></button>' +
        '    </div>' +
        '    <span class="field-error"></span>' +
        '  </div>' +
        '  <div class="field">' +
        '    <label for="cp-new">Kata Sandi Baru <span class="req">*</span></label>' +
        '    <div class="input-icon has-toggle"><i class="fa-solid fa-key"></i>' +
        '      <input class="input" type="password" id="cp-new" autocomplete="new-password" placeholder="Minimal 8 karakter">' +
        '      <button type="button" class="pw-toggle" aria-label="Tampilkan kata sandi"><i class="fa-solid fa-eye"></i></button>' +
        '    </div>' +
        '    <span class="field-error"></span>' +
        '  </div>' +
        '  <div class="field">' +
        '    <label for="cp-confirm">Konfirmasi Kata Sandi Baru <span class="req">*</span></label>' +
        '    <div class="input-icon has-toggle"><i class="fa-solid fa-key"></i>' +
        '      <input class="input" type="password" id="cp-confirm" autocomplete="new-password" placeholder="Ulangi kata sandi baru">' +
        '      <button type="button" class="pw-toggle" aria-label="Tampilkan kata sandi"><i class="fa-solid fa-eye"></i></button>' +
        '    </div>' +
        '    <span class="field-error"></span>' +
        '  </div>' +
        '  <div id="cp-error" class="alert alert-danger" style="display:none;"></div>' +
        '</form>',
      footer:
        '<button class="btn btn-outline" data-cp-cancel>Batal</button>' +
        '<button class="btn btn-primary" data-cp-save><i class="fa-solid fa-shield-halved"></i> Perbarui Password</button>',
      onOpen: function (ov, close) {
        bindPwToggle(ov);
        ov.querySelector('[data-cp-cancel]').addEventListener('click', close);
        var cur = ov.querySelector('#cp-current');
        var nw = ov.querySelector('#cp-new');
        var cf = ov.querySelector('#cp-confirm');
        var errBox = ov.querySelector('#cp-error');
        ov.querySelector('[data-cp-save]').addEventListener('click', async function () {
          PG.clearFieldErrors(ov);
          errBox.style.display = 'none';
          var ok = true;
          if (!cur.value) { PG.showFieldError(cur, 'Kata sandi saat ini wajib diisi.'); ok = false; }
          if (nw.value.length < 8) { PG.showFieldError(nw, 'Kata sandi baru minimal 8 karakter.'); ok = false; }
          if (cf.value !== nw.value || !cf.value) { PG.showFieldError(cf, 'Konfirmasi kata sandi tidak cocok.'); ok = false; }
          if (!ok) return;
          var btn = ov.querySelector('[data-cp-save]');
          btn.disabled = true;
          try {
            await PGAuth.changePassword(cur.value, nw.value);
            close();
            PG.toast('Kata sandi berhasil diubah.', 'success');
          } catch (err) {
            errBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>' + PG.util.esc(err.message || 'Gagal mengubah kata sandi.') + '</span>';
            errBox.style.display = 'flex';
            btn.disabled = false;
          }
        });
      }
    });
  }

  /* ---------------- Unggah foto profil ---------------- */
  function bindAvatarUpload() {
    var btn = PG.util.el('#ph-photo-btn');
    var input = PG.util.el('#ph-photo-input');
    if (!btn || !input) return;
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', async function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type || '')) {
        PG.toast('Berkas harus berupa gambar (JPG/PNG/WebP).', 'error');
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        PG.toast('Ukuran foto maksimal 2 MB. Pilih foto lain.', 'error');
        return;
      }
      try {
        var raw = await PG.util.readFile(file);
        var small = await PG.util.downscaleImage(raw, 400, 0.82);
        /* Preview langsung sebelum disimpan */
        PG.util.el('#ph-avatar').innerHTML = '<img src="' + small + '" alt="Foto profil">';
        await PGAuth.updateProfile({ avatar: small });
        PG.toast('Foto profil berhasil diperbarui.', 'success');
        PG.renderNav();
      } catch (err) {
        renderProfile();
        PG.toast((err && err.message) ? err.message : 'Gagal memperbarui foto profil.', 'error');
      }
    });
  }

  /* ---------------- Keluar ---------------- */
  function bindLogout() {
    var btn = PG.util.el('#ph-btn-logout');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var ok = await PG.ui.confirm({
        title: 'Keluar dari Akun?',
        message: 'Anda akan keluar dari PenyuGuard dan kembali ke beranda. Laporan Anda tetap tersimpan.',
        okLabel: 'Ya, Keluar',
        danger: true
      });
      if (!ok) return;
      await PGAuth.logout();
      window.location.href = PG.util.getRoot() + 'index.html';
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    if (!PGAuth.user) return; // guard auth.js sudah me-redirect

    renderProfile();
    renderStorageMode();
    bindAvatarUpload();
    bindLogout();
    PG.util.el('#ph-btn-edit').addEventListener('click', openEditModal);
    PG.util.el('#ph-btn-password').addEventListener('click', openPasswordModal);

    /* Segarkan navbar agar menampilkan sesi aktif */
    PG.renderNav();

    await Promise.all([renderStats(), renderActivity()]);
  });
})();
