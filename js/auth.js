/* ============================================================
 * PenyuGuard — auth.js
 * Lapisan autentikasi & hak akses (Supabase Auth atau Mode Demonstrasi)
 * ------------------------------------------------------------
 * - Mode PRODUKSI  : Supabase Authentication + tabel profiles + RLS.
 * - Mode DEMO      : autentikasi lokal (localStorage) untuk keperluan
 *                    demonstrasi — SELALU ditandai dengan label demo.
 * Guard halaman: <body data-require="user|staff|admin" data-auth-area="public|admin">
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.PG_CONFIG || {};
  var PGConfig = {
    url: CFG.supabaseUrl || '',
    key: CFG.supabaseAnonKey || '',
    appName: CFG.appName || 'PenyuGuard',
    version: CFG.version || '1.0.0',
    get isConfigured() { return !!(this.url && this.key); }
  };
  window.PGConfig = PGConfig;

  /* Hash sederhana HANYA untuk mode demonstrasi (bukan kriptografi produksi). */
  function demoHash(pw) {
    var s = 'pg$' + String(pw || '') + '#salt';
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = (h1 ^ s.charCodeAt(i)) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'h' + h1.toString(36) + h2.toString(36);
  }

  function requireConfiguredClient(client) {
    if (PGConfig.isConfigured && !client) {
      throw new Error(PGConfig.connectionError || 'Supabase belum tersambung. Coba muat ulang setelah koneksi pulih.');
    }
  }

  var DEMO_PASSWORD = 'demo1234';

  var PGAuth = {
    user: null,
    _sb: null,
    ready: null,
    ROLE_LABEL: { user: 'User', operator: 'Operator', admin: 'Administrator' },

    /* ---------------- inisialisasi ---------------- */
    init: function () {
      var self = this;
      self.ready = (async function () {
        if (PGConfig.isConfigured) {
          try {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
              self._sb = window.supabase.createClient(PGConfig.url, PGConfig.key);
            } else {
              await new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
              });
              self._sb = window.supabase.createClient(PGConfig.url, PGConfig.key);
            }
            var res = await self._sb.auth.getSession();
            if (res && res.data && res.data.session) {
              self.user = await self._loadProfile(res.data.session.user);
            }
            var that = self;
            self._sb.auth.onAuthStateChange(function (_ev, session) {
              if (!session) { that.user = null; }
            });
          } catch (err) {
            console.error('[PenyuGuard] Supabase gagal diinisialisasi. Mode demo TIDAK diaktifkan otomatis.', err);
            PGConfig.connectionError = (err && err.message) ? err.message : 'Koneksi Supabase gagal.';
            self._sb = null;
          }
        }
        if (!PGConfig.isConfigured) {
          await PGStore.seed();
          self._ensureDemoPasswords();
          var sess = self._getSession();
          if (sess && !self._expired(sess)) {
            var profiles = await PGStore.all('profiles');
            self.user = profiles.find(function (p) { return p.id === sess.uid && p.status !== 'disabled'; }) || null;
            if (!self.user) self._clearSession();
          } else {
            self._clearSession();
          }
        }
        await self._guard();
      })();
      return self.ready;
    },

    /* ---------------- API publik ---------------- */
    login: async function (email, password, remember) {
      email = String(email || '').trim().toLowerCase();
      if (!email || !password) throw new Error('Email dan kata sandi wajib diisi.');
      requireConfiguredClient(this._sb);
      if (PGConfig.isConfigured && this._sb) {
        var res = await this._sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) throw new Error(this._humanError(res.error.message));
        this.user = await this._loadProfile(res.data.user);
        await PGStore.log('Login', 'Sistem', 'Login berhasil');
        return this.user;
      }
      await PGStore.seed();
      var profiles = await PGStore.all('profiles');
      var p = profiles.find(function (x) { return x.email.toLowerCase() === email; });
      if (!p) throw new Error('Akun tidak ditemukan. Periksa email Anda.');
      if (p.status === 'disabled') throw new Error('Akun dinonaktifkan. Hubungi administrator.');
      var h = this._getDemoPassword(p.id);
      if (h !== demoHash(password)) throw new Error('Kata sandi salah. Coba lagi.');
      this.user = p;
      this._setSession(p.id, !!remember);
      await PGStore.log('Login', 'Sistem', 'Login berhasil (mode demo)');
      return p;
    },

    register: async function (data) {
      var full = String(data.full_name || '').trim();
      var email = String(data.email || '').trim().toLowerCase();
      if (full.length < 3) throw new Error('Nama lengkap minimal 3 karakter.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Format email tidak valid.');
      if (String(data.password || '').length < 8) throw new Error('Kata sandi minimal 8 karakter.');
      if (data.password !== data.confirm) throw new Error('Konfirmasi kata sandi tidak cocok.');
      requireConfiguredClient(this._sb);
      if (PGConfig.isConfigured && this._sb) {
        var res = await this._sb.auth.signUp({
          email: email, password: data.password,
          options: { data: { full_name: full } }
        });
        if (res.error) throw new Error(this._humanError(res.error.message));
        return { demo: false, needsConfirmation: !(res.data && res.data.session) };
      }
      await PGStore.seed();
      var profiles = await PGStore.all('profiles');
      if (profiles.some(function (x) { return x.email.toLowerCase() === email; })) {
        throw new Error('Email sudah terdaftar. Gunakan email lain atau masuk.');
      }
      var id = 'u_' + Date.now().toString(36);
      var row = {
        id: id, full_name: full, email: email, role: 'user',
        status: 'active', phone: '', avatar: '',
        created_at: new Date().toISOString()
      };
      profiles.push(row);
      PGStore._save('profiles', profiles);
      this._setDemoPassword(id, data.password);
      await PGStore.log('Registrasi akun', id, full + ' (' + email + ') — role: user');
      // auto-login setelah registrasi (mode demo)
      this.user = row;
      this._setSession(id, true);
      return { demo: true, needsConfirmation: false, user: row };
    },

    logout: async function () {
      if (this.user) await PGStore.log('Logout', 'Sistem', 'Keluar dari sistem');
      this.user = null;
      this._clearSession();
      if (PGConfig.isConfigured && this._sb) {
        try { await this._sb.auth.signOut(); } catch (e) { }
      }
    },

    resetPassword: async function (email) {
      email = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Format email tidak valid.');
      requireConfiguredClient(this._sb);
      if (PGConfig.isConfigured && this._sb) {
        var redirectTo = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'reset-password-confirm.html';
        var res = await this._sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
        if (res.error) throw new Error(this._humanError(res.error.message));
        return { demo: false };
      }
      await PGStore.seed();
      var profiles = await PGStore.all('profiles');
      var found = profiles.some(function (x) { return x.email.toLowerCase() === email; });
      if (!found) throw new Error('Email tidak terdaftar pada sistem (Mode Demonstrasi).');
      return { demo: true };
    },

    demoSetPassword: async function (email, newPassword) {
      if (PGConfig.isConfigured) throw new Error('Fitur ini hanya tersedia pada mode demonstrasi.');
      if (String(newPassword || '').length < 8) throw new Error('Kata sandi baru minimal 8 karakter.');
      await PGStore.seed();
      var profiles = await PGStore.all('profiles');
      var p = profiles.find(function (x) { return x.email.toLowerCase() === String(email).trim().toLowerCase(); });
      if (!p) throw new Error('Email tidak terdaftar.');
      this._setDemoPassword(p.id, newPassword);
      await PGStore.log('Ubah data', 'profiles', 'Reset password (demo) untuk ' + email);
    },

    updateProfile: async function (patch) {
      if (!this.user) throw new Error('Silakan masuk terlebih dahulu.');
      requireConfiguredClient(this._sb);
      if (patch.full_name !== undefined && String(patch.full_name).trim().length < 3) {
        throw new Error('Nama lengkap minimal 3 karakter.');
      }
      if (PGConfig.isConfigured && this._sb) {
        var upd = {};
        if (patch.full_name !== undefined) upd.full_name = patch.full_name.trim();
        if (patch.phone !== undefined) upd.phone = patch.phone;
        if (patch.avatar !== undefined) upd.avatar = patch.avatar;
        var res = await this._sb.from('profiles').update(upd).eq('id', this.user.id);
        if (res.error) throw new Error('Gagal memperbarui profil: ' + res.error.message);
        this.user = Object.assign({}, this.user, upd);
        return this.user;
      }
      var row = await PGStore.update('profiles', this.user.id, patch);
      if (row) this.user = row;
      try {
        var sess = this._getSession();
        if (sess && this.user) { /* sesi tetap valid */ }
      } catch (e) { }
      return this.user;
    },

    changePassword: async function (currentPw, newPw) {
      if (!this.user) throw new Error('Silakan masuk terlebih dahulu.');
      if (String(newPw || '').length < 8) throw new Error('Kata sandi baru minimal 8 karakter.');
      requireConfiguredClient(this._sb);
      if (PGConfig.isConfigured && this._sb) {
        var res = await this._sb.auth.updateUser({ password: newPw });
        if (res.error) throw new Error(this._humanError(res.error.message));
        await PGStore.log('Ubah data', 'profiles', 'Perubahan password akun');
        return;
      }
      var h = this._getDemoPassword(this.user.id);
      if (h !== demoHash(currentPw)) throw new Error('Kata sandi saat ini salah.');
      this._setDemoPassword(this.user.id, newPw);
      await PGStore.log('Ubah data', 'profiles', 'Perubahan password akun (mode demo)');
    },

    isStaff: function () {
      return !!this.user && (this.user.role === 'operator' || this.user.role === 'admin');
    },

    /* ---------------- helper demo ---------------- */
    _ensureDemoPasswords: function () {
      try {
        if (!localStorage.getItem('pg_demo_pw')) {
          var map = {};
          ['u_admin', 'u_op', 'u_budi', 'u_sari', 'u_ahmad', 'u_maria'].forEach(function (id) {
            map[id] = demoHash(DEMO_PASSWORD);
          });
          localStorage.setItem('pg_demo_pw', JSON.stringify(map));
        }
      } catch (e) { }
    },
    _pwMap: function () {
      try { return JSON.parse(localStorage.getItem('pg_demo_pw') || '{}'); } catch (e) { return {}; }
    },
    _getDemoPassword: function (id) { return this._pwMap()[id] || demoHash(DEMO_PASSWORD); },
    _setDemoPassword: function (id, pw) {
      var map = this._pwMap();
      map[id] = demoHash(pw);
      try { localStorage.setItem('pg_demo_pw', JSON.stringify(map)); } catch (e) { }
    },
    _getSession: function () {
      try { return JSON.parse(localStorage.getItem('pg_session') || 'null'); } catch (e) { return null; }
    },
    _setSession: function (uid, remember) {
      var ttl = remember ? 30 * 24 * 3600e3 : 12 * 3600e3;
      try {
        localStorage.setItem('pg_session', JSON.stringify({ uid: uid, exp: Date.now() + ttl }));
      } catch (e) { }
    },
    _expired: function (s) { return !s || !s.exp || s.exp < Date.now(); },
    _clearSession: function () { try { localStorage.removeItem('pg_session'); } catch (e) { } },

    /* ---------------- Supabase profile ---------------- */
    _loadProfile: async function (authUser) {
      if (!authUser) return null;
      try {
        var res = await this._sb.from('profiles').select('*').eq('id', authUser.id).single();
        if (res.data) return res.data;
        return {
          id: authUser.id,
          full_name: (authUser.user_metadata && authUser.user_metadata.full_name) || 'Pengguna PenyuGuard',
          email: authUser.email || '', role: 'user', status: 'active',
          phone: '', avatar: '', created_at: authUser.created_at || null
        };
      } catch (e) {
        console.warn('[PenyuGuard] Profil tidak dapat dimuat dari Supabase.', e);
        return null;
      }
    },

    _humanError: function (msg) {
      var m = String(msg || '').toLowerCase();
      if (m.indexOf('invalid login credentials') > -1) return 'Email atau password salah.';
      if (m.indexOf('email not confirmed') > -1) return 'Email belum dikonfirmasi. Periksa kotak masuk Anda.';
      if (m.indexOf('already registered') > -1 || m.indexOf('already exists') > -1) return 'Email sudah terdaftar.';
      if (m.indexOf('rate limit') > -1) return 'Terlalu banyak percobaan. Tunggu beberapa saat lagi.';
      if (m.indexOf('password') > -1 && m.indexOf('at least') > -1) return 'Kata sandi terlalu lemah (minimal 8 karakter).';
      return msg || 'Terjadi kesalahan pada autentikasi.';
    },

    /* ---------------- guard akses halaman ---------------- */
    _guard: async function () {
      var body = document.body;
      var req = body.getAttribute('data-require');
      if (!req) { body.classList.remove('pg-locked'); return; }
      var area = body.getAttribute('data-auth-area') === 'admin' ? 'admin' : 'public';
      var need = req === 'user' ? ['user', 'operator', 'admin']
        : req === 'staff' ? ['operator', 'admin']
          : ['admin'];
      var ok = !!this.user && this.user.status !== 'disabled' && need.indexOf(this.user.role) > -1;
      if (!ok) {
        var file = (window.location.pathname.split('/').pop() || 'index.html');
        var next = encodeURIComponent(file + window.location.search);
        if (area === 'admin') {
          window.location.replace(PGRoot() + 'admin/login.html?next=' + next);
        } else {
          window.location.replace(PGRoot() + 'pages/login.html?next=' + next);
        }
        return new Promise(function () { }); // hentikan eksekusi halaman
      }
      body.classList.remove('pg-locked');
    }
  };
  window.PGAuth = PGAuth;
  PGAuth.init();
})();
