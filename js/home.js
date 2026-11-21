/* ============================================================
 * PenyuGuard — home.js
 * Logika beranda: statistik hero, katalog spesies + detail modal.
 * Statistik dan katalog membaca penyimpanan aktif dengan sumber data terpisah.
 * ============================================================ */
document.addEventListener('DOMContentLoaded', async function () {
  await PGAuth.ready;

  const analyticsStatus = document.getElementById('analytics-status');
  if (analyticsStatus) analyticsStatus.textContent = window.PGConfig && PGConfig.isConfigured
    ? 'SUMBER DATA AKTIF · ASAL DATA TERCATAT PER ENTRI'
    : 'DATA DEMONSTRASI · SUMBER TERCATAT PER ENTRI';

  /* ---------- Statistik hero ---------- */
  try {
    const sightings = await PGStore.all('turtle_sightings');
    const elS = document.getElementById('hs-sightings');
    if (elS) elS.textContent = PG.util.fmtNum(sightings.filter(s => s.status === 'approved').length);
    const elSA = document.getElementById('hs-sightings-analytics');
    if (elSA) elSA.textContent = PG.util.fmtNum(sightings.filter(s => s.status === 'approved').length);
    const locs = new Set(sightings.map(s => s.location_name));
    const elL = document.getElementById('hs-locations');
    if (elL) elL.textContent = PG.util.fmtNum(locs.size);
    const elLA = document.getElementById('hs-locations-analytics');
    if (elLA) elLA.textContent = PG.util.fmtNum(locs.size);
  } catch (e) {
    console.warn('[PenyuGuard] Gagal memuat statistik hero:', e);
  }

  /* ---------- Katalog spesies ---------- */
  const IUCN = {
    CR: ['Critically Endangered — Kritis', 'badge-danger'],
    EN: ['Endangered — Terancam Punah', 'badge-warn'],
    VU: ['Vulnerable — Rentan', 'badge-info'],
    NT: ['Near Threatened — Hampir Terancam', 'badge-muted'],
    LC: ['Least Concern — Risiko Rendah', 'badge-success']
  };
  const targetSpecies = ['Chelonia mydas', 'Eretmochelys imbricata'];
  let storedSpecies = [];
  let referenceSpecies = [];
  try { storedSpecies = await PGStore.all('turtle_species'); }
  catch (e) { console.warn('[PenyuGuard] Katalog tersimpan tidak dapat dimuat:', e); }
  try { referenceSpecies = await PGData.load('species'); }
  catch (e) { console.warn('[PenyuGuard] Katalog referensi website tidak dapat dimuat:', e); }
  storedSpecies = (Array.isArray(storedSpecies) ? storedSpecies : [])
    .filter(sp => sp && targetSpecies.includes(sp.scientific));
  referenceSpecies = (Array.isArray(referenceSpecies) ? referenceSpecies : [])
    .filter(sp => sp && targetSpecies.includes(sp.scientific));
  const storedBySpecies = new Map(storedSpecies.map(sp => [sp.scientific, sp]));
  let referenceUsed = false;
  let speciesList = referenceSpecies.map(ref => {
    const stored = storedBySpecies.get(ref.scientific);
    if (!stored || Object.keys(ref).some(key => stored[key] === undefined || stored[key] === null || stored[key] === '' ||
      (Array.isArray(stored[key]) && stored[key].length === 0))) referenceUsed = true;
    const merged = { ...ref };
    if (stored) Object.entries(stored).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) merged[key] = value;
    });
    return merged;
  });
  const referenceNames = new Set(referenceSpecies.map(sp => sp.scientific));
  storedSpecies.filter(sp => !referenceNames.has(sp.scientific)).forEach(sp => speciesList.push(sp));
  const sourceNote = document.getElementById('home-species-source');
  if (sourceNote && referenceUsed) {
    sourceNote.hidden = false;
    sourceNote.textContent = ' Profil referensi website melengkapi katalog; profil ini bukan catatan observasi individu.';
  }

  const grid = document.getElementById('species-grid');
  if (grid) {
    if (!speciesList.length) {
      grid.innerHTML = '<div class="note-strip warn"><i class="fa-solid fa-circle-exclamation"></i><span>Katalog spesies belum dapat dimuat. Periksa koneksi server dan file data/species.json.</span></div>';
      return;
    }
    grid.innerHTML = speciesList.map(sp => {
      const iucn = IUCN[sp.iucn] || IUCN.LC;
      const localBadge = sp.confirmed_local
        ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Teramati di perairan Komodo</span>'
        : '<span class="badge badge-warn"><i class="fa-solid fa-circle-question"></i> Kandidat — belum terkonfirmasi lokal</span>';
      return `
      <article class="card card-hover species-card" data-id="${PG.util.esc(sp.id)}" tabindex="0" role="button"
               aria-label="Detail ${PG.util.esc(sp.name)}">
        <div class="sp-photo">
          <img src="${PG.util.esc(sp.image)}" alt="Foto ${PG.util.esc(sp.name)} (${PG.util.esc(sp.scientific)})" loading="lazy">
          <div class="sp-status">
            <span class="badge badge-navy"><i class="fa-solid fa-list-check"></i> IUCN ${PG.util.esc(sp.iucn)}</span>
            ${localBadge}
          </div>
        </div>
        <div class="sp-body">
          <div>
            <h3>${PG.util.esc(sp.name)}</h3>
            <span class="sp-sci">${PG.util.esc(sp.scientific)}</span>
          </div>
          <p class="sp-desc">${PG.util.esc(sp.description)}</p>
          <div class="sp-meta">
            <span><b>Karakteristik:</b> ${PG.util.esc((sp.characteristics && sp.characteristics[0]) || '-')}</span>
            <span><b>Habitat:</b> ${PG.util.esc(sp.habitat)}</span>
          </div>
          <span class="sp-link">Lihat detail spesies <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      </article>`;
    }).join('');

    // Buka detail saat klik / Enter
    grid.querySelectorAll('.species-card').forEach(card => {
      const open = () => {
        const sp = speciesList.find(x => x.id === card.dataset.id);
        if (!sp) return;
        const iucn = IUCN[sp.iucn] || IUCN.LC;
        PG.ui.openModal({
          title: PG.util.esc(sp.name) + ' <span style="font-weight:500;color:var(--pg-muted)">(' + PG.util.esc(sp.scientific) + ')</span>',
          size: 'lg',
          body: `
            <div class="sp-modal-grid">
              <div>
                <img src="${PG.util.esc(sp.image)}" alt="Foto ${PG.util.esc(sp.name)}">
                <h4>Status Konservasi</h4>
                <p><span class="badge ${iucn[1]} badge-lg"><i class="fa-solid fa-list-check"></i> IUCN ${PG.util.esc(sp.iucn)} — ${iucn[0]}</span></p>
                <h4>Kondisi Lokal</h4>
                <p>${sp.confirmed_local
              ? 'Spesies ini <strong>terdokumentasi</strong> di perairan Taman Nasional Komodo. ' + PG.util.esc(sp.presence_note || '')
              : PG.util.esc(sp.presence_note || 'Keberadaan lokal belum terkonfirmasi.')}</p>
              </div>
              <div>
                <h4>Karakteristik</h4>
                <ul>${(sp.characteristics || []).map(c => '<li>' + PG.util.esc(c) + '</li>').join('')}</ul>
                <h4>Habitat</h4>
                <p>${PG.util.esc(sp.habitat)}</p>
                <h4>Ukuran</h4>
                <p>Panjang karapas dewasa: <strong>${PG.util.esc(sp.ccl_range)}</strong> • Berat: <strong>${PG.util.esc(sp.weight_range)}</strong></p>
                <h4>Deskripsi</h4>
                <p>${PG.util.esc(sp.description)}</p>
              </div>
            </div>`,
          footer: '<button class="btn btn-outline" data-close-sp>Tutup</button><a class="btn btn-primary" href="pages/education.html"><i class="fa-solid fa-book-open"></i> Halaman Edukasi</a>',
          onOpen: function (ov, close) {
            ov.querySelector('[data-close-sp]').addEventListener('click', close);
          }
        });
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }
});
