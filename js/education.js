/* ============================================================
 * PenyuGuard — education.js
 * Halaman Edukasi & Konservasi: katalog spesies, status
 * konservasi, ancaman, panduan lapangan, CTA pelaporan, dan
 * artikel edukasi (dikelola administrator, data simulasi).
 * ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await PGAuth.ready;

  var U = PG.util;
  var ROOT = U.getRoot();

  var IUCN = {
    CR: ['Critically Endangered — Kritis', 'badge-danger'],
    EN: ['Endangered — Terancam Punah', 'badge-warn'],
    VU: ['Vulnerable — Rentan', 'badge-info'],
    NT: ['Near Threatened — Hampir Terancam', 'badge-muted'],
    LC: ['Least Concern — Risiko Rendah', 'badge-success']
  };

  /* ================= Katalog spesies ================= */
  var targetSpecies = ['Chelonia mydas', 'Eretmochelys imbricata'];
  var storedSpecies = [];
  var referenceSpecies = [];
  try { storedSpecies = await PGStore.all('turtle_species'); }
  catch (e) { console.warn('[PenyuGuard] Katalog tersimpan tidak dapat dimuat:', e); }
  try { referenceSpecies = await PGData.load('species'); }
  catch (e) { console.warn('[PenyuGuard] Katalog referensi website tidak dapat dimuat:', e); }
  storedSpecies = (Array.isArray(storedSpecies) ? storedSpecies : [])
    .filter(function (sp) { return sp && targetSpecies.indexOf(sp.scientific) > -1; });
  referenceSpecies = (Array.isArray(referenceSpecies) ? referenceSpecies : [])
    .filter(function (sp) { return sp && targetSpecies.indexOf(sp.scientific) > -1; });
  var storedBySpecies = new Map(storedSpecies.map(function (sp) { return [sp.scientific, sp]; }));
  var referenceUsed = false;
  var species = referenceSpecies.map(function (ref) {
    var stored = storedBySpecies.get(ref.scientific);
    if (!stored || Object.keys(ref).some(function (key) {
      return stored[key] === undefined || stored[key] === null || stored[key] === '' ||
        (Array.isArray(stored[key]) && stored[key].length === 0);
    })) referenceUsed = true;
    var merged = Object.assign({}, ref);
    if (stored) Object.keys(stored).forEach(function (key) {
      if (stored[key] !== undefined && stored[key] !== null && stored[key] !== '' &&
        !(Array.isArray(stored[key]) && stored[key].length === 0)) merged[key] = stored[key];
    });
    return merged;
  });
  var referenceNames = new Set(referenceSpecies.map(function (sp) { return sp.scientific; }));
  storedSpecies.filter(function (sp) { return !referenceNames.has(sp.scientific); }).forEach(function (sp) { species.push(sp); });
  var sourceNote = document.getElementById('education-species-source');
  if (sourceNote && referenceUsed) {
    sourceNote.hidden = false;
    sourceNote.textContent = 'Profil referensi website melengkapi katalog yang belum tersedia di penyimpanan aktif; profil ini bukan catatan observasi individu.';
  }

  var grid = document.getElementById('species-grid');
  if (grid) {
    if (!species.length) {
      grid.innerHTML = PG.ui.emptyState('fa-paw', 'Katalog belum tersedia',
        'Data spesies belum dapat dimuat dari penyimpanan aktif maupun katalog referensi website.');
    } else {
      grid.innerHTML = species.map(function (sp) {
        var iucn = IUCN[sp.iucn] || IUCN.LC;
        var localBadge = sp.confirmed_local
          ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Terdokumentasi di perairan Komodo</span>'
          : '<span class="badge badge-warn"><i class="fa-solid fa-circle-question"></i> Kandidat — belum terkonfirmasi lokal</span>';
        var chars = (sp.characteristics || []).slice(0, 3).map(function (c) {
          return '<li>' + U.esc(c) + '</li>';
        }).join('');
        return '<article class="card card-hover" style="overflow:hidden;display:flex;flex-direction:column">' +
          '<div style="position:relative;height:200px;overflow:hidden">' +
          '  <img src="' + U.esc(ROOT + (sp.image || '')) + '" alt="Foto ' + U.esc(sp.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">' +
          '  <div style="position:absolute;top:12px;left:12px;right:12px;display:flex;gap:7px;flex-wrap:wrap">' +
          '    <span class="badge badge-navy"><i class="fa-solid fa-list-check"></i> IUCN ' + U.esc(sp.iucn) + '</span>' +
          '    ' + localBadge +
          '  </div>' +
          '</div>' +
          '<div class="card-pad" style="display:flex;flex-direction:column;gap:9px;flex:1">' +
          '  <div><h3 style="font-size:17.5px">' + U.esc(sp.name) + '</h3>' +
          '  <span style="font-style:italic;color:var(--pg-ocean);font-size:13.5px;font-weight:600">' + U.esc(sp.scientific) + '</span></div>' +
          '  <p class="text-sm text-muted" style="flex:1">' + U.esc(sp.description) + '</p>' +
          '  <ul style="padding-left:18px;list-style-position:outside;font-size:12.9px;color:var(--pg-text);display:flex;flex-direction:column;gap:4px">' + chars + '</ul>' +
          '  <p style="font-size:12.8px;border-top:1px dashed var(--pg-border);padding-top:10px;color:var(--pg-text)">' +
          '    <strong style="color:var(--pg-navy)">Habitat:</strong> ' + U.esc(sp.habitat) + '</p>' +
          '  <p style="font-size:12.3px;color:var(--pg-muted)"><i class="fa-solid fa-ruler"></i> CCL dewasa: ' +
          U.esc(sp.ccl_range || '-') + ' • Berat: ' + U.esc(sp.weight_range || '-') + '</p>' +
          '</div></article>';
      }).join('');
    }
  }

  /* ================= Tabel status konservasi ================= */
  var tbody = document.getElementById('conservation-tbody');
  if (tbody) {
    tbody.innerHTML = species.map(function (sp) {
      var iucn = IUCN[sp.iucn] || IUCN.LC;
      return '<tr>' +
        '<td><strong>' + U.esc(sp.name) + '</strong><br><span class="text-xs" style="font-style:italic;color:var(--pg-ocean)">' + U.esc(sp.scientific) + '</span></td>' +
        '<td><span class="badge ' + iucn[1] + '">' + U.esc(sp.iucn) + ' — ' + U.esc(iucn[0].split(' — ')[0]) + '</span></td>' +
        '<td><span class="badge badge-info"><i class="fa-solid fa-file-contract"></i> Appendix I</span></td>' +
        '<td><span class="badge badge-success"><i class="fa-solid fa-shield-halved"></i> Dilindungi (PermenLHK P.106/2018)</span></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="4" class="text-muted">Data spesies belum tersedia.</td></tr>';
  }

  /* ================= Grid ancaman ================= */
  var THREATS = [
    { icon: 'fa-hand-holding-dollar', title: 'Perdagangan Ilegal', desc: 'Perdagangan telur, daging, dan cangkang penyu masih terjadi meski seluruh spesies penyu laut dilindungi undang-undang.' },
    { icon: 'fa-link', title: 'Tangkapan Sampingan (Bycatch)', desc: 'Penyu dapat terjerat jaring insang, rawai, dan pancing; interaksi tidak sengaja ini menjadi tekanan utama di perairan pesisir.' },
    { icon: 'fa-bottle-water', title: 'Sampah Plastik', desc: 'Kantong plastik sulit dibedakan dari ubur-ubur bagi penyu; tali dan pukat hanyut dapat melilit tubuh penyu hingga tidak bisa bergerak.' },
    { icon: 'fa-building', title: 'Alih Fungsi Pantai & Cahaya', desc: 'Pembangunan pesisir dan pencahayaan artifisial mengganggu peneluran serta mengelabui tukik yang mengandalkan cahaya alami horizon.' },
    { icon: 'fa-temperature-high', title: 'Perubahan Iklim', desc: 'Suhu pasir menentukan jenis kelamin tukik; kenaikan muka air laut mengerosi pantai peneluran dan menggeser habitat.' },
    { icon: 'fa-paw', title: 'Predasi & Gangguan Alami', desc: 'Telur dan tukik menjadi mangsa predator alami; gangguan manusia pada sarang memperbesar tingkat kegagalan penetasan.' }
  ];
  var tGrid = document.getElementById('threats-grid');
  if (tGrid) {
    tGrid.innerHTML = THREATS.map(function (t, i) {
      return '<div class="card card-pad card-hover">' +
        '<div class="stat-icon ' + (i % 2 === 0 ? 'tone-danger' : 'tone-warn') + '" style="width:48px;height:48px;font-size:19px;flex-basis:48px;margin-bottom:14px"><i class="fa-solid ' + t.icon + '"></i></div>' +
        '<h3 style="font-size:15.8px;margin-bottom:7px">' + U.esc(t.title) + '</h3>' +
        '<p class="text-sm text-muted">' + U.esc(t.desc) + '</p>' +
        '</div>';
    }).join('');
  }

  /* ================= Artikel edukasi ================= */
  var articles = [];
  try {
    articles = (await PGStore.all('education_articles')).filter(function (a) {
      return a && a.published !== false;
    });
  } catch (e) { articles = []; }

  var aGrid = document.getElementById('articles-grid');
  if (aGrid) {
    if (!articles.length) {
      aGrid.innerHTML = PG.ui.emptyState('fa-book-open', 'Artikel belum tersedia',
        'Materi edukasi akan diterbitkan administrator (data simulasi demonstrasi).');
    } else {
      aGrid.innerHTML = articles.map(function (a) {
        return '<article class="card card-hover" style="overflow:hidden;display:flex;flex-direction:column">' +
          '<div style="height:170px;overflow:hidden">' +
          '  <img src="' + U.esc(ROOT + (a.image || '')) + '" alt="Ilustrasi artikel ' + U.esc(a.title) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">' +
          '</div>' +
          '<div class="card-pad" style="display:flex;flex-direction:column;gap:8px;flex:1">' +
          '  <div><span class="badge badge-teal"><i class="fa-solid fa-folder"></i> ' + U.esc(a.category || 'Edukasi') + '</span></div>' +
          '  <h3 style="font-size:16px">' + U.esc(a.title) + '</h3>' +
          '  <p class="text-sm text-muted" style="flex:1">' + U.esc(a.excerpt || '') + '</p>' +
          '  <div><button class="btn btn-outline btn-sm" data-read="' + U.esc(a.id) + '">' +
          '    <i class="fa-solid fa-book-open"></i> Baca</button></div>' +
          '</div></article>';
      }).join('');

      U.els('button[data-read]', aGrid).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var a = articles.find(function (x) { return x.id === btn.dataset.read; });
          if (!a) return;
          var meta = '<div class="text-xs text-muted mb-12"><i class="fa-solid fa-folder"></i> ' +
            U.esc(a.category || 'Edukasi') +
            (a.updated_at ? ' • Diperbarui ' + U.esc(U.fmtDateShort(a.updated_at)) : '') +
            ' <span class="badge badge-muted" style="margin-left:6px"><i class="fa-solid fa-database"></i> Data simulasi</span></div>';
          PG.ui.openModal({
            title: U.esc(a.title),
            size: 'lg',
            body: meta + String(a.content || ''),
            footer: '<button class="btn btn-primary" data-close-art><i class="fa-solid fa-check"></i> Tutup</button>',
            onOpen: function (ov, close) {
              var b = ov.querySelector('[data-close-art]');
              if (b) b.addEventListener('click', close);
            }
          });
        });
      });
    }
  }
});
