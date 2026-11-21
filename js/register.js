/* ============================================================
 * PenyuGuard — register.js
 * Pendaftaran akun publik (role otomatis User).
 * ============================================================ */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Param ?next= tervalidasi (hindari open redirect) */
  function safeNext() {
    var raw = '';
    try { raw = new URLSearchParams(window.location.search).get('next') || ''; } catch (e) { }
    var val = raw;
    try { val = decodeURIComponent(raw); } catch (e) { }
    if (val && /^[\w\-\/]+\.html$/.test(val)) return val;
    return 'index.html';
  }

  function redirectTarget() {
    var next = safeNext();
    var root = PG.util.getRoot();
    if (next === 'index.html') return root + 'index.html';
    if (next.indexOf('/') > -1) return root + next;
    return next;
  }

  function bindPwToggle(root) {
    (root || document).querySelectorAll('.pw-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = btn.parentElement.querySelector('input');
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = '<i class="fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
        btn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      });
    });
  }

  /* Skor kekuatan: panjang>=8 (+1), huruf+angka (+1), simbol/huruf besar (+1) */
  function pwScore(pw) {
    var s = 0;
    if (pw.length >= 8) s++;
    if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) s++;
    if (/[A-Z]/.test(pw) || /[^a-zA-Z0-9]/.test(pw)) s++;
    return s;
  }

  function updateMeter(meter, pw) {
    if (!meter) return;
    var label = meter.querySelector('.pw-label');
    meter.classList.remove('weak', 'medium', 'strong');
    if (!pw) {
      if (label) label.textContent = 'Kekuatan password';
      return;
    }
    var s = pwScore(pw);
    if (s <= 1) {
      meter.classList.add('weak');
      if (label) label.textContent = 'Lemah';
    } else if (s === 2) {
      meter.classList.add('medium');
      if (label) label.textContent = 'Sedang';
    } else {
      meter.classList.add('strong');
      if (label) label.textContent = 'Kuat';
    }
  }

  function setLoading(btn, on) {
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
  }

  function showError(box, msg) {
    box.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>' + PG.util.esc(msg) + '</span>';
    box.style.display = 'flex';
  }
  function hideError(box) { box.style.display = 'none'; box.innerHTML = ''; }

  function openPrivacyModal() {
    PG.ui.openModal({
      title: 'Kebijakan Privasi — Ringkasan',
      body:
        '<p style="font-size:13.8px;line-height:1.75;color:var(--pg-text)">' +
        'Ringkasan kebijakan privasi PenyuGuard (mode demonstrasi):</p>' +
        '<ul style="padding-left:18px;font-size:13.8px;line-height:1.9;color:var(--pg-text)">' +
        '<li><strong>Data yang dikumpulkan:</strong> nama lengkap, email, nomor telepon (opsional), foto profil, serta isi dan foto laporan yang Anda kirim.</li>' +
        '<li><strong>Data digunakan</strong> untuk verifikasi laporan dan dokumentasi upaya konservasi penyu di Pulau Rinca.</li>' +
        '<li><strong>Foto laporan</strong> tersimpan sebagai dokumentasi lapangan oleh tim verifikasi.</li>' +
        '<li><strong>Identitas pelapor tidak dibagikan ke publik</strong> — peta dan dashboard publik hanya menampilkan data kejadian.</li>' +
        '<li>Untuk <strong>penghapusan akun</strong>, hubungi administrator melalui kanal kontak PenyuGuard.</li>' +
        '</ul>' +
        '<div class="note-strip warn mt-16"><i class="fa-solid fa-flask"></i><span>Halaman ini berjalan dalam Mode Demonstrasi — data tersimpan lokal di peramban Anda dan tidak dikirim ke server mana pun.</span></div>',
      footer: '<button class="btn btn-primary" data-policy-ok>Mengerti</button>',
      onOpen: function (ov, close) {
        ov.querySelector('[data-policy-ok]').addEventListener('click', close);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    bindPwToggle(document);

    /* Sudah login → tidak perlu mendaftar lagi */
    if (PGAuth.user) {
      window.location.href = redirectTarget();
      return;
    }

    var form = PG.util.el('#register-form');
    var name = PG.util.el('#reg-name');
    var email = PG.util.el('#reg-email');
    var pass = PG.util.el('#reg-password');
    var confirm = PG.util.el('#reg-confirm');
    var agree = PG.util.el('#reg-agree');
    var meter = PG.util.el('#reg-pw-meter');
    var errBox = PG.util.el('#register-error');
    var submit = PG.util.el('#register-submit');
    var policyLink = PG.util.el('#reg-policy-link');
    if (!form) return;

    pass.addEventListener('input', function () { updateMeter(meter, pass.value); });

    policyLink.addEventListener('click', function (e) {
      e.preventDefault();
      openPrivacyModal();
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      PG.clearFieldErrors(form);
      hideError(errBox);

      var ok = true;
      if (name.value.trim().length < 3) {
        PG.showFieldError(name, 'Nama lengkap minimal 3 karakter.');
        ok = false;
      }
      if (!EMAIL_RE.test(email.value.trim())) {
        PG.showFieldError(email, 'Masukkan format email yang valid.');
        ok = false;
      }
      if (pass.value.length < 8 || !/[a-zA-Z]/.test(pass.value) || !/\d/.test(pass.value)) {
        PG.showFieldError(pass, 'Password minimal 8 karakter dan harus mengandung huruf & angka.');
        ok = false;
      }
      if (confirm.value !== pass.value || !confirm.value) {
        PG.showFieldError(confirm, 'Konfirmasi password tidak cocok.');
        ok = false;
      }
      if (!agree.checked) {
        PG.showFieldError(agree, 'Anda harus menyetujui kebijakan privasi untuk mendaftar.');
        ok = false;
      }
      if (!ok) return;

      setLoading(submit, true);
      try {
        var res = await PGAuth.register({
          full_name: name.value.trim(),
          email: email.value.trim(),
          password: pass.value,
          confirm: confirm.value
        });
        if (res && res.needsConfirmation) {
          PG.toast('Registrasi berhasil! Periksa email Anda untuk konfirmasi sebelum login.', 'success');
          setTimeout(function () { window.location.href = 'login.html'; }, 1200);
          return;
        }
        PG.toast('Registrasi berhasil! Anda sudah login.', 'success');
        setTimeout(function () { window.location.href = redirectTarget(); }, 800);
      } catch (err) {
        setLoading(submit, false);
        showError(errBox, (err && err.message) ? err.message : 'Terjadi kesalahan saat registrasi.');
      }
    });
  });
})();
