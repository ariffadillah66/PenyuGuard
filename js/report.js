/* ============================================================
 * PenyuGuard — report.js
 * Formulir pelaporan publik (wajib login via body[data-require]).
 * Laporan baru berstatus "Menunggu Verifikasi" — tidak langsung
 * tampil di peta/statistik publik sebelum Disetujui.
 * ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await PGAuth.ready;

  var U = PG.util;
  var form = document.getElementById('report-form');
  var formCard = document.getElementById('report-form-card');
  var successCard = document.getElementById('report-success');
  if (!form) return;

  var photo = { dataUrl: '', name: '', size: 0 };
  var submitting = false;

  /* ---------- Prefill dari akun ---------- */
  var u = PGAuth.user;
  var inName = document.getElementById('r-name');
  var inEmail = document.getElementById('r-email');
  if (u) {
    if (inName) inName.value = u.full_name || '';
    if (inEmail) inEmail.value = u.email || '';
  }

  /* ---------- Isi select ---------- */
  var selType = document.getElementById('r-type');
  var selCondition = document.getElementById('r-condition');
  if (selType) selType.innerHTML = PG.optionHtml(PG.INCIDENT_TYPES, '', '— Pilih jenis kejadian —');
  if (selCondition) selCondition.innerHTML = PG.optionHtml(PG.CONDITIONS, '', '— Pilih kondisi penyu —');

  /* ---------- Default waktu kejadian = sekarang ---------- */
  function nowLocalValue() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  var inDatetime = document.getElementById('r-datetime');
  if (inDatetime && !inDatetime.value) inDatetime.value = nowLocalValue();

  /* ---------- Geolokasi ---------- */
  var btnGeo = document.getElementById('btn-geo');
  if (btnGeo) {
    btnGeo.addEventListener('click', function () {
      if (!navigator.geolocation) {
        PG.toast('Peramban Anda tidak mendukung geolokasi. Isi koordinat secara manual.', 'warn');
        return;
      }
      PG.toast('Mengambil lokasi perangkat…', 'info');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = document.getElementById('r-lat');
        var lng = document.getElementById('r-lng');
        if (lat) lat.value = Number(pos.coords.latitude).toFixed(6);
        if (lng) lng.value = Number(pos.coords.longitude).toFixed(6);
        PG.toast('Koordinat berhasil diambil dari GPS perangkat.', 'success');
      }, function (err) {
        var msg = err && err.code === 1
          ? 'Izin lokasi ditolak. Isi koordinat secara manual.'
          : 'Gagal mengambil lokasi. Isi koordinat secara manual.';
        PG.toast(msg, 'warn');
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
  }

  /* ---------- Foto dokumentasi ---------- */
  var photoInput = document.getElementById('photo-input');
  var photoDrop = document.getElementById('photo-drop');
  var photoError = document.getElementById('photo-error');
  var photoPreview = document.getElementById('photo-preview');
  var photoImg = document.getElementById('photo-img');
  var photoMeta = document.getElementById('photo-meta');

  function setPhotoError(msg) {
    if (photoError) { photoError.textContent = msg || ''; photoError.classList.toggle('show', !!msg); }
  }
  function clearPhoto() {
    photo.dataUrl = ''; photo.name = ''; photo.size = 0;
    if (photoPreview) photoPreview.hidden = true;
    if (photoInput) photoInput.value = '';
    setPhotoError('');
  }
  function loadPhoto(file) {
    var okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file) return;
    if (okTypes.indexOf(file.type) === -1) {
      setPhotoError('Format tidak didukung. Gunakan foto JPG, PNG, atau WebP.');
      PG.toast('Format foto tidak didukung.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Ukuran foto melebihi 5 MB. Kompres foto terlebih dahulu.');
      PG.toast('Ukuran foto melebihi 5 MB.', 'error');
      return;
    }
    U.readFile(file).then(function (dataUrl) {
      photo.dataUrl = dataUrl;
      photo.name = file.name || 'foto.jpg';
      photo.size = file.size || 0;
      if (photoImg) photoImg.src = dataUrl;
      if (photoPreview) photoPreview.hidden = false;
      var kb = photo.size < 1024 * 1024 ? (photo.size / 1024).toFixed(1) + ' KB' : (photo.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (photoMeta) photoMeta.textContent = photo.name + ' • ' + kb;
      setPhotoError('');
    }).catch(function () {
      setPhotoError('Gagal membaca berkas. Coba berkas lain.');
    });
  }
  if (photoInput) photoInput.addEventListener('change', function () { loadPhoto(photoInput.files && photoInput.files[0]); });
  if (photoDrop) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      photoDrop.addEventListener(ev, function (e) { e.preventDefault(); photoDrop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      photoDrop.addEventListener(ev, function (e) { e.preventDefault(); photoDrop.classList.remove('dragover'); });
    });
    photoDrop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadPhoto(f);
    });
  }
  var photoRemove = document.getElementById('photo-remove');
  if (photoRemove) photoRemove.addEventListener('click', clearPhoto);

  /* ---------- Validasi ---------- */
  function markError(inputEl, msg) {
    PG.showFieldError(inputEl, msg);
    return inputEl;
  }

  function validate() {
    PG.clearFieldErrors(form);
    var invalid = [];

    var dt = document.getElementById('r-datetime');
    if (!dt.value || isNaN(new Date(dt.value).getTime())) {
      invalid.push(markError(dt, 'Tanggal & waktu kejadian wajib diisi dengan benar.'));
    }

    var loc = document.getElementById('r-location');
    if (!loc.value.trim()) {
      invalid.push(markError(loc, 'Lokasi kejadian wajib diisi.'));
    }

    var lat = document.getElementById('r-lat');
    var latV = lat.value.trim();
    if (latV === '' || isNaN(Number(latV))) {
      invalid.push(markError(lat, 'Latitude wajib diisi (angka).'));
    } else if (Number(latV) < -90 || Number(latV) > 90) {
      invalid.push(markError(lat, 'Latitude harus di rentang -90 sampai 90.'));
    }

    var lng = document.getElementById('r-lng');
    var lngV = lng.value.trim();
    if (lngV === '' || isNaN(Number(lngV))) {
      invalid.push(markError(lng, 'Longitude wajib diisi (angka).'));
    } else if (Number(lngV) < -180 || Number(lngV) > 180) {
      invalid.push(markError(lng, 'Longitude harus di rentang -180 sampai 180.'));
    }

    var type = document.getElementById('r-type');
    if (!type.value) {
      invalid.push(markError(type, 'Pilih jenis kejadian.'));
    }

    var cond = document.getElementById('r-condition');
    if (!cond.value) {
      invalid.push(markError(cond, 'Pilih kondisi penyu.'));
    }

    var desc = document.getElementById('r-desc');
    if (desc.value.trim().length < 20) {
      invalid.push(markError(desc, 'Deskripsi minimal 20 karakter agar petugas dapat memahami kejadian.'));
    }

    return invalid;
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submitting) return;
    if (!PGAuth.user) {
      PG.toast('Sesi berakhir. Silakan login kembali.', 'warn');
      return;
    }
    var invalid = validate();
    if (invalid.length) {
      PG.toast('Periksa kembali isian yang ditandai merah.', 'error');
      invalid[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitting = true;
    var btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Mengirim…';
    }

    try {
      var thumb = photo.dataUrl ? await U.downscaleImage(photo.dataUrl, 900, 0.8) : '';
      if (thumb && PGConfig.isConfigured) thumb = await PGStore.uploadDataUrl(thumb, 'laporan-penyu.jpg', 'reports/' + PGAuth.user.id);
      var dtValue = document.getElementById('r-datetime').value;
      var dtISO = new Date(dtValue).toISOString();
      var speciesVal = document.getElementById('r-species').value;

      var saved = await PGStore.insert('public_reports', {
        user_id: PGAuth.user.id,
        user_name: PGAuth.user.full_name,
        email: PGAuth.user.email,
        incident_type: document.getElementById('r-type').value,
        species: speciesVal === 'Tidak diketahui' ? null : speciesVal,
        condition: document.getElementById('r-condition').value,
        location_name: document.getElementById('r-location').value.trim(),
        lat: Number(document.getElementById('r-lat').value),
        lng: Number(document.getElementById('r-lng').value),
        incident_datetime: dtISO,
        description: document.getElementById('r-desc').value.trim(),
        photo: thumb,
        status: 'Menunggu Verifikasi',
        operator_note: '',
        verified_by: '',
        verified_at: null
      });

      showSuccess(saved);
    } catch (err) {
      console.warn('[PenyuGuard] Gagal mengirim laporan:', err);
      PG.toast('Gagal mengirim laporan: ' + (err && err.message ? err.message : 'kesalahan tidak diketahui'), 'error');
    } finally {
      submitting = false;
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Laporan';
      }
    }
  });

  /* ---------- Layar sukses ---------- */
  function showSuccess(saved) {
    var noEl = document.getElementById('success-report-no');
    if (noEl) noEl.textContent = (saved && saved.report_no) || '-';
    var summary = document.getElementById('success-summary');
    if (summary) {
      var rows = [
        ['Jenis Kejadian', document.getElementById('r-type').value],
        ['Spesies', (document.getElementById('r-species').value === 'Tidak diketahui') ? 'Tidak diketahui' : document.getElementById('r-species').value],
        ['Kondisi Penyu', document.getElementById('r-condition').value],
        ['Lokasi', document.getElementById('r-location').value.trim() +
          ' (' + Number(document.getElementById('r-lat').value).toFixed(4) + ', ' +
          Number(document.getElementById('r-lng').value).toFixed(4) + ')'],
        ['Waktu Kejadian', U.fmtDateTime(new Date(document.getElementById('r-datetime').value).toISOString())],
        ['Foto Dokumentasi', photo.dataUrl ? 'Terlampir' : 'Tidak ada']
      ];
      summary.innerHTML = '<i class="fa-solid fa-clipboard-check"></i><span style="display:flex;flex-direction:column;gap:4px">' +
        rows.map(function (r) {
          return '<span><strong>' + U.esc(r[0]) + ':</strong> ' + U.esc(r[1]) + '</span>';
        }).join('') + '</span>';
    }
    formCard.hidden = true;
    successCard.hidden = false;
    successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Reset / kirim lagi ---------- */
  function resetForm() {
    form.reset();
    clearPhoto();
    if (inName) inName.value = u ? (u.full_name || '') : '';
    if (inEmail) inEmail.value = u ? (u.email || '') : '';
    if (inDatetime) inDatetime.value = nowLocalValue();
    PG.clearFieldErrors(form);
    successCard.hidden = true;
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  var btnAgain = document.getElementById('btn-again');
  if (btnAgain) btnAgain.addEventListener('click', resetForm);
  var btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.addEventListener('click', function () {
    resetForm();
    PG.toast('Formulir dibersihkan.', 'info');
  });
});
