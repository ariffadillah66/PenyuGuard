/* ============================================================
 * PenyuGuard — login.js
 * Halaman login (mode demonstrasi / Supabase).
 * ============================================================ */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Param ?next= hanya menerima pola aman untuk menghindari open redirect */
  function safeNext() {
    var raw = '';
    try { raw = new URLSearchParams(window.location.search).get('next') || ''; } catch (e) { }
    var val = raw;
    try { val = decodeURIComponent(raw); } catch (e) { /* biarkan nilai mentah */ }
    if (val && /^[\w\-\/]+\.html$/.test(val)) return val;
    return 'index.html';
  }

  /* Resolusi target redirect:
     - 'index.html'                → beranda (root)
     - berisi '/' (mis. admin/x)   → relatif root
     - selain itu                  → file pada folder pages/ saat ini */
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

  function setLoading(btn, on) {
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
  }

  function showError(box, msg) {
    box.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>' + PG.util.esc(msg) + '</span>';
    box.style.display = 'flex';
  }
  function hideError(box) { box.style.display = 'none'; box.innerHTML = ''; }

  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    if (PGConfig.isConfigured) {
  var demoBox = document.querySelector('.demo-box');
  if (demoBox) demoBox.style.display = 'none';
}
    bindPwToggle(document);

    /* Jangan otomatis mengalihkan halaman login.
       Sesi Supabase yang masih aktif sebelumnya membuat pengguna
       langsung terpental ke beranda sehingga formulir login tidak terlihat.
       Biarkan halaman login tetap tampil; pengguna dapat masuk dengan akun
       lain atau membuka halaman tujuan secara manual. */
    if (PGAuth.user) {
      var activeNotice = document.createElement('div');
      activeNotice.className = 'alert alert-info auth-alert';
      activeNotice.style.display = 'flex';
      activeNotice.setAttribute('role', 'status');
      activeNotice.innerHTML =
        '<i class="fa-solid fa-circle-info"></i><span>Anda masih masuk sebagai <strong>' +
        PG.util.esc(PGAuth.user.email || PGAuth.user.full_name || 'pengguna') +
        '</strong>. Anda tetap dapat menggunakan formulir ini untuk masuk dengan akun lain.</span>';
      var loginForm = PG.util.el('#login-form');
      if (loginForm && loginForm.parentNode) {
        loginForm.parentNode.insertBefore(activeNotice, loginForm);
      }
    }

    var form = PG.util.el('#login-form');
    var email = PG.util.el('#login-email');
    var pass = PG.util.el('#login-password');
    var remember = PG.util.el('#login-remember');
    var errBox = PG.util.el('#login-error');
    var submit = PG.util.el('#login-submit');
    if (!form) return;

    /* Akun demo: isi formulir, TIDAK auto-submit */
    document.querySelectorAll('.demo-acc').forEach(function (b) {
      b.addEventListener('click', function () {
        email.value = b.getAttribute('data-email') || '';
        pass.value = b.getAttribute('data-password') || '';
        PG.clearFieldErrors(form);
        hideError(errBox);
        PG.toast('Kredensial demo diisi ke formulir. Klik "Login" untuk masuk.', 'info');
      });
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      PG.clearFieldErrors(form);
      hideError(errBox);

      var ok = true;
      if (!EMAIL_RE.test(email.value.trim())) {
        PG.showFieldError(email, 'Masukkan format email yang valid.');
        ok = false;
      }
      if (pass.value.length < 8) {
        PG.showFieldError(pass, 'Password minimal 8 karakter.');
        ok = false;
      }
      if (!ok) return;

      setLoading(submit, true);
      try {
        var user = await PGAuth.login(email.value.trim(), pass.value, remember.checked);
        PG.toast('Login berhasil! Selamat datang, ' + (user.full_name || 'Pengguna') + '.', 'success');
        setTimeout(function () { window.location.href = redirectTarget(); }, 650);
      } catch (err) {
        setLoading(submit, false);
        showError(errBox, (err && err.message) ? err.message : 'Terjadi kesalahan saat login.');
      }
    });
  });
})();
