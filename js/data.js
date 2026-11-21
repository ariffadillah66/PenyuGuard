/* ============================================================
 * PenyuGuard — data.js
 * Lapisan data: PGData (muat JSON) + PGStore (CRUD overlay localStorage)
 * ------------------------------------------------------------
 * Mode demonstrasi: seluruh data disimpan lokal & berlabel "data
 * simulasi demonstrasi". Bila config/supabase.js diisi, integrasi
 * Supabase dapat mengambil alih (lihat README → Integrasi Supabase).
 * ============================================================ */
(function () {
  'use strict';

  /* Root path ('./' di root, '../' di folder pages/ atau admin/) */
  window.PGRoot = function () {
    var p = window.location.pathname;
    return (p.indexOf('/pages/') > -1 || p.indexOf('/admin/') > -1) ? '../' : './';
  };

  /* ---------------- PGData: pemuat JSON dengan fallback tertanam ---------------- */
  var PGData = {
    _cache: {},
    _warned: false,
    load: function (name) {
      var self = this;
      if (self._cache[name]) return Promise.resolve(self._cache[name]);
      var url = PGRoot() + 'data/' + name + '.json';
      return fetch(url, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .catch(function () {
          var fb = (window.PG_FALLBACK && window.PG_FALLBACK[name]);
          if (fb !== undefined && !self._warned) {
            console.info('[PenyuGuard] data/' + name + '.json tidak dapat dimuat — memakai fallback tertanam (mode file://).');
          }
          if (fb === undefined && !self._warned) {
            console.warn('[PenyuGuard] Data "' + name + '" tidak tersedia (JSON maupun fallback).');
          }
          self._warned = true;
          return fb !== undefined ? fb : [];
        })
        .then(function (data) {
          self._cache[name] = data;
          return data;
        });
    },
    clearCache: function () { this._cache = {}; }
  };
  window.PGData = PGData;

  /* ---------------- util kecil internal ---------------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }
  var mediaUrlCache = {};

  /* ---------------- PGStore: entitas CRUD overlay localStorage ---------------- */
  var ENTITY_FILES = {
    turtle_sightings: 'turtle-sightings',
    aquaculture_sites: 'aquaculture',
    sst_data: 'sst',
    chl_data: 'oceanographic/chl-timeseries',
    salinity_data: 'oceanographic/salinity-timeseries',
    public_reports: 'reports',
    profiles: 'profiles',
    education_articles: 'articles',
    turtle_species: 'species',
    spatial_locations: 'spatial-locations',
    activity_logs: 'activity-logs',
    ai_analyses: 'ai-analyses'
  };

  var DEFAULT_SETTINGS = {
    site_name: 'PenyuGuard',
    contact: 'Kanal pelaporan: halaman Laporkan Penyu PenyuGuard',
    approximate_sensitive: true,
    publication_mode: 'manual'
  };

  var PGStore = {
    _seeding: null,

    /* Jika Supabase dikonfigurasi, jangan diam-diam beralih ke penyimpanan lokal. */
    _remote: function () {
      return !!(window.PGConfig && window.PGConfig.isConfigured);
    },
    _client: function () {
      if (!this._remote() || !window.PGAuth || !window.PGAuth._sb) {
        throw new Error((window.PGConfig && window.PGConfig.connectionError) || 'Supabase dikonfigurasi tetapi koneksi belum siap. Data lokal tidak digunakan sebagai pengganti.');
      }
      return window.PGAuth._sb;
    },
    _clean: function (obj) {
      var out = {};
      Object.keys(obj || {}).forEach(function (k) {
        if (k.charAt(0) !== '_' && obj[k] !== undefined) out[k] = obj[k];
      });
      return out;
    },

    _key: function (e) { return 'pg_ent_' + e; },

    seed: function () {
      if (this._remote()) return Promise.resolve();
      if (this._seeding) return this._seeding;
      var self = this;
      self._seeding = (async function () {
        var cur = null;
        try { cur = localStorage.getItem('pg_seed_version'); } catch (e) { /* storage non-aktif */ }
        // Bersihkan sisa penyimpanan lokal dari fitur yang sudah dihapus.
        ['pg_ent_ai_analyses', 'pg_ent_ai_dataset'].forEach(function (k) {
          try { localStorage.removeItem(k); } catch (err) { }
        });
        if (cur === self.SEED_VERSION) return;
        // Seed hanya entitas yang belum ada; jangan menghapus data lokal hasil impor/pengguna.
        for (var ent in ENTITY_FILES) {
          if (!ENTITY_FILES[ent]) continue;
          var already = null;
          try { already = localStorage.getItem(self._key(ent)); } catch (err) { }
          var data = await PGData.load(ENTITY_FILES[ent]);
          var arr = Array.isArray(data) ? data : (data && data.items) || [];
          if (already !== null) {
            // Add newly bundled iNaturalist observations to existing demo stores
            // without replacing user edits or other locally stored records.
            if (ent === 'turtle_sightings') {
              try {
                var current = JSON.parse(already) || [];
                var known = {};
                current.forEach(function (row) { if (row && row.id) known[String(row.id)] = true; });
                arr.forEach(function (row) {
                  if (row && row.source === 'iNaturalist' && !known[String(row.id)]) {
                    current.push(row);
                    known[String(row.id)] = true;
                  }
                });
                localStorage.setItem(self._key(ent), JSON.stringify(current));
              } catch (err) { /* keep the existing local data intact */ }
            }
            continue;
          }
          try { localStorage.setItem(self._key(ent), JSON.stringify(arr)); } catch (err) { }
        }
        // sinkronkan counter nomor laporan dengan seed
        ['PG'].forEach(function (prefix) {
          var max = 0, rx = new RegExp('^' + prefix + '-\\d{4}-(\\d+)$');
          ['public_reports'].forEach(function (ent) {
            try {
              JSON.parse(localStorage.getItem(self._key(ent)) || '[]').forEach(function (row) {
                var m = rx.exec(row.report_no || '');
                if (m) max = Math.max(max, parseInt(m[1], 10));
              });
            } catch (err) { }
          });
          try { localStorage.setItem('pg_seq_' + prefix, String(max)); } catch (err) { }
        });
        try { localStorage.setItem('pg_seed_version', self.SEED_VERSION); } catch (err) { }
      })();
      return self._seeding;
    },

    all: async function (entity) {
      if (this._remote()) {
        if (entity === 'activity_logs' && (!window.PGAuth.user)) return [];
        var remote = await this._client().from(entity).select('*');
        if (remote.error) throw new Error('Gagal membaca ' + entity + ': ' + remote.error.message);
        return remote.data || [];
      }
      await this.seed();
      var raw = null;
      try { raw = localStorage.getItem(this._key(entity)); } catch (e) { }
      if (raw === null) {
        // entitas tanpa seed → kosong
        return [];
      }
      try { return JSON.parse(raw); } catch (e) { return []; }
    },

    _save: function (entity, arr) {
      try { localStorage.setItem(this._key(entity), JSON.stringify(arr)); } catch (e) {
        console.warn('[PenyuGuard] Penyimpanan lokal penuh / tidak tersedia.', e);
      }
    },

    insert: async function (entity, obj) {
      if (this._remote()) {
        var payload = this._clean(obj);
        if (!payload.id && entity !== 'public_reports' && entity !== 'ai_analyses') payload.id = uid(entity.slice(0, 4));
        if (!payload.created_at && ['public_reports','turtle_sightings','aquaculture_sites','spatial_locations','ai_analyses'].indexOf(entity) > -1) payload.created_at = nowISO();
        if (entity === 'public_reports' && !payload.report_no) {
          payload.report_no = (entity === 'public_reports' ? 'PG' : 'BY') + '-' + new Date().getFullYear() + '-' +
            Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
        }
        if (entity === 'public_reports' && window.PGAuth.user) payload.user_id = window.PGAuth.user.id;
        var ins = await this._client().from(entity).insert(payload).select('*').single();
        if (ins.error) throw new Error('Gagal menyimpan ' + entity + ': ' + ins.error.message);
      if (!obj._silent) {
        try { await this.log('Tambah data', entity, obj.name || obj.title || obj.report_no || obj.id); }
        catch (logError) { console.warn('[PenyuGuard] Data tersimpan, tetapi log aktivitas gagal:', logError); }
      }
        return ins.data;
      }
      var arr = await this.all(entity);
      obj.id = obj.id || uid(entity.slice(0, 4));
      obj.created_at = obj.created_at || nowISO();
      if (entity === 'public_reports' && !obj.report_no) obj.report_no = this.nextReportNo('PG');
      arr.unshift(obj);
      this._save(entity, arr);
      if (!obj._silent) {
        await this.log('Tambah data', entity, obj.name || obj.title || obj.report_no || obj.id);
      }
      return obj;
    },

    update: async function (entity, id, patch) {
      if (this._remote()) {
        var upd = await this._client().from(entity).update(this._clean(patch)).eq('id', id).select('*').maybeSingle();
        if (upd.error) throw new Error('Gagal memperbarui ' + entity + ': ' + upd.error.message);
        if (upd.data && patch._silent !== true) await this.log('Ubah data', entity, upd.data.name || upd.data.title || upd.data.report_no || id);
        return upd.data;
      }
      var arr = await this.all(entity);
      var row = null;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], patch); row = arr[i]; break; }
      }
      this._save(entity, arr);
      if (row && patch._silent !== true) {
        await this.log('Ubah data', entity, row.name || row.title || row.report_no || row.id);
      }
      return row;
    },

    remove: async function (entity, id) {
      if (this._remote()) {
        var before = await this._client().from(entity).select('*').eq('id', id).maybeSingle();
        if (before.error) throw new Error('Gagal membaca data ' + entity + ': ' + before.error.message);
        var del = await this._client().from(entity).delete().eq('id', id);
        if (del.error) throw new Error('Gagal menghapus ' + entity + ': ' + del.error.message);
        if (before.data) {
          try { await this.log('Hapus data', entity, before.data.name || before.data.title || before.data.report_no || id); }
          catch (logError) { console.warn('[PenyuGuard] Data terhapus, tetapi log aktivitas gagal:', logError); }
        }
        return before.data;
      }
      var arr = await this.all(entity);
      var row = null;
      var kept = arr.filter(function (r) { if (r.id === id) { row = r; return false; } return true; });
      this._save(entity, kept);
      if (row) await this.log('Hapus data', entity, row.name || row.title || row.report_no || row.id);
      return row;
    },

    uploadDataUrl: async function (dataUrl, filename, folder) {
      if (!dataUrl) return '';
      if (!this._remote()) return dataUrl;
      var client = this._client();
      var safe = String(filename || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = (folder || 'uploads') + '/' + Date.now() + '-' + uid('img') + '-' + safe;
      var blob = await fetch(dataUrl).then(function (r) { return r.blob(); });
      var bucket = (window.PG_CONFIG && window.PG_CONFIG.storageBucket) || 'penyuguard-media';
      var uploaded = await client.storage.from(bucket).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (uploaded.error) throw new Error('Gagal mengunggah foto: ' + uploaded.error.message);
      return uploaded.data.path;
    },

    mediaUrl: async function (storedPath, expiresIn) {
      var value = String(storedPath || '');
      if (!value || !this._remote() || /^(data:|blob:)/i.test(value)) return value;
      var config = window.PG_CONFIG || {};
      var bucket = config.storageBucket || 'penyuguard-media';
      var base = String(config.supabaseUrl || '').replace(/\/$/, '');
      var publicPrefix = base + '/storage/v1/object/public/' + bucket + '/';
      if (value.indexOf(publicPrefix) === 0) value = decodeURIComponent(value.slice(publicPrefix.length));
      else if (/^https?:\/\//i.test(value)) return value;
      if (!/^(reports|ai-analyses|uploads|admin)\//.test(value)) return value;
      if (mediaUrlCache[value] && mediaUrlCache[value].expiresAt > Date.now()) return mediaUrlCache[value].url;
      var result = await this._client().storage.from(bucket).createSignedUrl(value, expiresIn || 3600);
      if (result.error) throw new Error('Gagal membuat tautan media privat: ' + result.error.message);
      var signedUrl = result.data && result.data.signedUrl;
      if (!signedUrl) throw new Error('Supabase tidak mengembalikan tautan media.');
      mediaUrlCache[value] = { url: signedUrl, expiresAt: Date.now() + ((expiresIn || 3600) - 30) * 1000 };
      return signedUrl;
    },

    insertMany: async function (entity, items) {
      if (!items || !items.length) return 0;
      if (this._remote()) {
        var payload = items.map(function (item) {
          var row = this._clean(item);
          if (!row.id) row.id = uid(entity.slice(0, 4));
          if (!row.created_at && ['turtle_sightings','aquaculture_sites','spatial_locations','ai_analyses'].indexOf(entity) > -1) row.created_at = nowISO();
          return row;
        }, this);
        var result = await this._client().from(entity).insert(payload);
        if (result.error) throw new Error('Gagal mengimpor ' + entity + ': ' + result.error.message);
        await this.log('Impor data', entity, payload.length + ' baris');
        return payload.length;
      }
      var arr = await this.all(entity);
      items.forEach(function (it) {
        it.id = it.id || uid(entity.slice(0, 4));
        it.created_at = it.created_at || nowISO();
        arr.unshift(it);
      });
      this._save(entity, arr);
      return items.length;
    },

    nextReportNo: function (prefix) {
      var y = new Date().getFullYear();
      var seq = 0;
      try { seq = parseInt(localStorage.getItem('pg_seq_' + prefix) || '0', 10); } catch (e) { }
      seq += 1;
      try { localStorage.setItem('pg_seq_' + prefix, String(seq)); } catch (e) { }
      return prefix + '-' + y + '-' + String(seq).padStart(4, '0');
    },

    log: async function (action, target, detail) {
      var u = (window.PGAuth && PGAuth.user) ? PGAuth.user : null;
      if (this._remote()) {
        if (!u) return;
        var entry = { user_id: u.id, timestamp: nowISO(), actor: u.email || '', role: u.role, action: action, target: target || '', detail: detail || '' };
        var logged = await this._client().from('activity_logs').insert(entry);
        if (logged.error) console.warn('[PenyuGuard] Log aktivitas gagal disimpan:', logged.error.message);
        return;
      }
      var arr = await this.all('activity_logs');
      arr.unshift({
        id: uid('log'), timestamp: nowISO(),
        actor: u ? u.email : 'Sistem',
        role: u ? u.role : 'system',
        action: action, target: target || '', detail: detail || ''
      });
      this._save('activity_logs', arr.slice(0, 400));
    },

    /* ---------------- pengaturan situs ---------------- */
    settings: {
      get: function () {
        try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('pg_settings') || '{}')); }
        catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
      },
      set: function (patch) {
        var s = this.get();
        Object.assign(s, patch);
        try { localStorage.setItem('pg_settings', JSON.stringify(s)); } catch (e) { }
        return s;
      }
    },

    /* koordinat publik: hormati pengaturan aproksimasi lokasi sensitif */
    approxCoords: function (lat, lng) {
      var s = this.settings.get();
      if (!s.approximate_sensitive) return { lat: lat, lng: lng };
      return {
        lat: Math.round(lat * 100) / 100,
        lng: Math.round(lng * 100) / 100
      };
    },

    resetDemo: function () {
      try {
        Object.keys(localStorage)
          .filter(function (k) { return k.indexOf('pg_') === 0; })
          .forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { }
    }
  };
  PGStore.SEED_VERSION = window.PG_SEED_VERSION || '1';
  window.PGStore = PGStore;
})();
