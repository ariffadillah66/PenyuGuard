/* ============================================================
 * PenyuGuard — forgot-password.js
 * Reset password: tautan email (Supabase) atau reset lokal (demo).
 * ============================================================ */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  function showAlert(box, cls, icon, msgHtml) {
    box.className = 'alert ' + cls + ' auth-alert';
    box.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + msgHtml + '</span>';
    box.style.display = 'flex';
  }
  function hideBox(box) { box.style.display = 'none'; box.innerHTML = ''; }

  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    bindPwToggle(document);

    var form = PG.util.el('#forgot-form');
    var email = PG.util.el('#fp-email');
    var errBox = PG.util.el('#fp-error');
    var okBox = PG.util.el('#fp-success');
    var submit = PG.util.el('#fp-submit');
    if (!form) return;

    var demoStep = PG.util.el('#fp-demo-step');
    var demoForm = PG.util.el('#demo-reset-form');
    var demoEmail = PG.util.el('#fp-demo-email');
    var demoPass = PG.util.el('#fp-demo-pass');
    var demoConfirm = PG.util.el('#fp-demo-confirm');
    var demoErr = PG.util.el('#fp-demo-error');
    var demoOk = PG.util.el('#fp-demo-success');
    var demoSubmit = PG.util.el('#fp-demo-submit');

    /* ---- Langkah 1: kirim tautan pemulihan ---- */
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      PG.clearFieldErrors(form);
      hideBox(errBox);
      hideBox(okBox);

      if (!EMAIL_RE.test(email.value.trim())) {
        PG.showFieldError(email, 'Masukkan format email yang valid.');
        return;
      }

      setLoading(submit, true);
      try {
        var res = await PGAuth.resetPassword(email.value.trim());
        if (res && res.demo) {
          /* Mode demo → tampilkan reset lokal */
          showAlert(errBox, 'alert-warn', 'fa-triangle-exclamation',
            '<strong>Mode Demonstrasi:</strong> tautan tidak benar-benar dikirim. Gunakan formulir reset lokal di bawah (khusus demonstrasi).');
          demoEmail.value = email.value.trim();
          demoStep.style.display = 'block';
          demoStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          showAlert(okBox, 'alert-success', 'fa-circle-check',
            'Tautan pemulihan telah dikirim ke email Anda (periksa juga folder spam).');
        }
      } catch (err) {
        showAlert(errBox, 'alert-danger', 'fa-circle-exclamation',
          PG.util.esc((err && err.message) ? err.message : 'Gagal memproses permintaan reset.'));
      } finally {
        setLoading(submit, false);
      }
    });

    /* ---- Langkah 2 (demo): perbarui password secara lokal ---- */
    if (demoForm) {
      demoForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        PG.clearFieldErrors(demoForm);
        hideBox(demoErr);
        hideBox(demoOk);

        var ok = true;
        if (!EMAIL_RE.test(demoEmail.value.trim())) {
          PG.showFieldError(demoEmail, 'Masukkan format email yang valid.');
          ok = false;
        }
        if (demoPass.value.length < 8) {
          PG.showFieldError(demoPass, 'Password baru minimal 8 karakter.');
          ok = false;
        }
        if (demoConfirm.value !== demoPass.value || !demoConfirm.value) {
          PG.showFieldError(demoConfirm, 'Konfirmasi password tidak cocok.');
          ok = false;
        }
        if (!ok) return;

        setLoading(demoSubmit, true);
        try {
          await PGAuth.demoSetPassword(demoEmail.value.trim(), demoPass.value);
          PG.toast('Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru.', 'success');
          showAlert(demoOk, 'alert-success', 'fa-circle-check',
            'Password untuk <strong>' + PG.util.esc(demoEmail.value.trim()) + '</strong> berhasil diperbarui. ' +
            '<a href="login.html"><strong>Login sekarang</strong></a>.');
          demoPass.value = '';
          demoConfirm.value = '';
        } catch (err) {
          showAlert(demoErr, 'alert-danger', 'fa-circle-exclamation',
            PG.util.esc((err && err.message) ? err.message : 'Gagal memperbarui password.'));
        } finally {
          setLoading(demoSubmit, false);
        }
      });
    }
  });
})();
