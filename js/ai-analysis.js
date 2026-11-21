/* Railway FastAPI + YOLOv8 + ArUco + VBGF Integration for PenyuGuard */
document.addEventListener('DOMContentLoaded', async function () {
  await PGAuth.ready;
  var U = PG.util, ROOT = U.getRoot();

  // PASTIKAN URL INI SESUAI DENGAN DOMAIN RAILWAY AKTIF ANDA
  var RAILWAY_API_URL = 'https://penyuguard-ai-production.up.railway.app';

  var state = {
    fileName: 'foto-penyu.jpg',
    dataUrl: '',
    result: null,
    saved: false,
    running: false,
    stream: null,
    activeMode: 'upload' // 'upload' | 'webcam' | 'paste'
  };

  var input = document.getElementById('file-input');
  var drop = document.getElementById('file-drop');
  var webcamWrap = document.getElementById('webcam-wrap');
  var pasteWrap = document.getElementById('paste-wrap');
  var previewWrap = document.getElementById('preview-wrap');
  var error = document.getElementById('file-error');
  var btn = document.getElementById('btn-analyze');
  var save = document.getElementById('btn-save');
  var historyWrap = document.getElementById('history-wrap');
  var markerInput = document.getElementById('marker-size-input');

  var modeUploadBtn = document.getElementById('mode-upload-btn');
  var modeWebcamBtn = document.getElementById('mode-webcam-btn');
  var modePasteBtn = document.getElementById('mode-paste-btn');

  function setError(message) {
    if (!error) return;
    error.textContent = message || '';
    error.classList.toggle('show', !!message);
  }

  function setStatus(message, ready) {
    var el = document.getElementById('ai-status');
    if (!el) return;
    el.innerHTML = (ready ? '<i class="fa-solid fa-circle-check"></i> ' : '<i class="fa-solid fa-triangle-exclamation"></i> ') + message;
    el.className = 'badge badge-lg ' + (ready ? 'badge-success' : 'badge-warn');
  }

  async function checkApiHealth() {
    try {
      var res = await fetch(RAILWAY_API_URL + '/api/health');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setStatus('Layanan AI Aktif · YOLOv8 + ArUco + VBGF', true);
    } catch (e) {
      setStatus('Layanan AI tidak merespons — periksa koneksi atau status server', false);
    }
  }

  function setActiveChip(mode) {
    state.activeMode = mode;
    if (modeUploadBtn) modeUploadBtn.classList.toggle('active', mode === 'upload');
    if (modeWebcamBtn) modeWebcamBtn.classList.toggle('active', mode === 'webcam');
    if (modePasteBtn) modePasteBtn.classList.toggle('active', mode === 'paste');
  }

  function hideAllInputAreas() {
    if (drop) drop.hidden = true;
    if (webcamWrap) webcamWrap.hidden = true;
    if (pasteWrap) pasteWrap.hidden = true;
  }

  function stopWebcam() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    if (webcamWrap) webcamWrap.hidden = true;
  }

  function resetResultPanel() {
    state.result = null;
    state.saved = false;
    var oWrap = document.getElementById('overlay-wrap');
    if (oWrap) oWrap.hidden = true;
    document.getElementById('result-body').hidden = true;
    document.getElementById('result-empty').hidden = false;
    document.getElementById('pipeline').hidden = true;
    if (save) save.disabled = true;
  }

  // Kembalikan tampilan ke kotak input sesuai mode aktif saat tidak ada foto
  function showEmptyInputMode(mode) {
    stopWebcam();
    hideAllInputAreas();
    if (previewWrap) previewWrap.hidden = true;
    state.dataUrl = '';
    btn.disabled = true;
    setError('');
    if (input) input.value = '';
    resetResultPanel();

    var targetMode = mode || state.activeMode || 'upload';
    setActiveChip(targetMode);
    if (targetMode === 'upload' && drop) drop.hidden = false;
    if (targetMode === 'paste' && pasteWrap) pasteWrap.hidden = false;
  }

  // Tampilkan pratinjau foto & tutup semua kotak input (Upload, Webcam, Paste)
  function setImageFromDataUrl(dataUrl, name, sizeLabel) {
    stopWebcam();
    hideAllInputAreas();
    resetResultPanel();
    setError('');

    state.dataUrl = dataUrl;
    state.fileName = name || 'capture-' + Date.now() + '.jpg';
    document.getElementById('preview-img').src = dataUrl;
    if (previewWrap) previewWrap.hidden = false;
    document.getElementById('file-meta').textContent = state.fileName + (sizeLabel ? ' · ' + sizeLabel : '');
    btn.disabled = false;
    btn.click(); // Otomatis jalankan analisis
  }

  function loadFile(file) {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setError('Gunakan foto JPG, PNG, atau WebP.');
    }
    if (file.size > 8 * 1024 * 1024) {
      return setError('Ukuran berkas maksimum 8 MB.');
    }
    U.readFile(file).then(function (url) {
      setImageFromDataUrl(url, file.name || 'pasted-image.png', (file.size / 1024).toFixed(1) + ' KB');
    }).catch(function () {
      setError('Foto tidak dapat dibaca.');
    });
  }

  // --- MODE 1: UPLOAD FILE & DRAG-DROP ---
  if (modeUploadBtn) {
    modeUploadBtn.addEventListener('click', function () {
      showEmptyInputMode('upload');
    });
  }

  if (input) {
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) {
        setActiveChip('upload');
        loadFile(input.files[0]);
      }
    });
  }

  if (drop) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files[0]) {
        setActiveChip('upload');
        loadFile(e.dataTransfer.files[0]);
      }
    });
  }

  // --- MODE 2: WEBCAM ---
  var btnCaptureWebcam = document.getElementById('btn-capture-webcam');
  var btnCloseWebcam = document.getElementById('btn-close-webcam');
  var videoEl = document.getElementById('webcam-video');

  if (modeWebcamBtn) {
    modeWebcamBtn.addEventListener('click', async function () {
      setError('');
      stopWebcam();
      hideAllInputAreas();
      if (previewWrap) previewWrap.hidden = true;
      resetResultPanel();
      setActiveChip('webcam');

      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoEl.srcObject = state.stream;
        if (webcamWrap) webcamWrap.hidden = false;
      } catch (err) {
        setError('Kamera tidak dapat diakses. Periksa izin kamera di peramban.');
        showEmptyInputMode('upload');
      }
    });
  }

  if (btnCaptureWebcam) {
    btnCaptureWebcam.addEventListener('click', function () {
      if (!videoEl || !videoEl.videoWidth) return;
      var canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext('2d').drawImage(videoEl, 0, 0);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setImageFromDataUrl(dataUrl, 'webcam-' + Date.now() + '.jpg', 'Webcam');
    });
  }

  if (btnCloseWebcam) {
    btnCloseWebcam.addEventListener('click', function () {
      showEmptyInputMode('upload');
    });
  }

  // --- MODE 3: PASTE (CTRL+V & TOMBOL PASTE) ---
  async function readImageFromClipboard() {
    try {
      var clipItems = await navigator.clipboard.read();
      for (var i = 0; i < clipItems.length; i++) {
        var imgType = clipItems[i].types.find(function (t) { return t.startsWith('image/'); });
        if (imgType) {
          var blob = await clipItems[i].getType(imgType);
          loadFile(blob);
          return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  if (modePasteBtn) {
    modePasteBtn.addEventListener('click', async function () {
      showEmptyInputMode('paste');
      var pasted = await readImageFromClipboard();
      if (!pasted) {
        PG.toast('Silakan tekan Ctrl+V pada keyboard untuk menempelkan gambar.', 'info');
      }
    });
  }

  var btnTriggerPaste = document.getElementById('btn-trigger-paste');
  if (btnTriggerPaste) {
    btnTriggerPaste.addEventListener('click', async function () {
      var pasted = await readImageFromClipboard();
      if (!pasted) {
        PG.toast('Tidak ada gambar di clipboard atau browser memblokir akses. Tekan Ctrl+V langsung.', 'warn');
      }
    });
  }

  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData)).items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var blob = items[i].getAsFile();
        setActiveChip('paste');
        loadFile(blob);
        break;
      }
    }
  });

  // --- TOMBOL GANTI FILE & HAPUS FOTO ---
  var btnChangeFile = document.getElementById('btn-change-file');
  if (btnChangeFile) {
    btnChangeFile.addEventListener('click', function () {
      if (input) {
        input.value = '';
        input.click();
      }
    });
  }

  ['remove-photo', 'preview-remove'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', function () {
        showEmptyInputMode(state.activeMode);
      });
    }
  });

  // --- TAMPILKAN HASIL ANALISIS ---
  function showResult(apiRes) {
    state.result = apiRes;
    var overlayWrap = document.getElementById('overlay-wrap');
    var overlayImg = document.getElementById('overlay-img');
    var statusBadge = document.getElementById('analysis-result-status');

    if (apiRes.annotated_image) {
      overlayImg.src = apiRes.annotated_image;
      overlayWrap.hidden = false;
    }

    if (!apiRes.detected || !apiRes.turtles || apiRes.turtles.length === 0) {
      statusBadge.textContent = 'Penyu Tidak Terdeteksi (ambang keyakinan ≥ 75%)';
      statusBadge.className = 'badge badge-warn badge-lg';
      document.getElementById('species-value').textContent = 'Tidak Terdeteksi';
      document.getElementById('species-scientific').textContent = 'Pastikan objek utama adalah penyu laut';
      document.getElementById('confidence-value').textContent = '0%';
      document.getElementById('aruco-status-text').textContent = apiRes.marker_found ? 'Terdeteksi (' + apiRes.cm_per_pixel + ' cm/px)' : 'Tidak ditemukan';
      document.getElementById('scl-value').textContent = '–';
      document.getElementById('age-value').textContent = '–';
      document.getElementById('stage-value').textContent = '–';
      document.getElementById('ai-limitation').textContent = 'Penyu belum terdeteksi dengan tingkat keyakinan minimal 75%. Coba gunakan foto yang menampilkan penyu dengan jelas.';
      save.disabled = true;
    } else {
      var t = apiRes.turtles[0];
      statusBadge.textContent = apiRes.turtles.length > 1
        ? 'Terdeteksi ' + apiRes.turtles.length + ' Penyu'
        : 'Penyu Terdeteksi';
      statusBadge.className = 'badge badge-success badge-lg';

      document.getElementById('species-value').textContent = t.common_name;
      document.getElementById('species-scientific').textContent = t.scientific_name;
      document.getElementById('confidence-value').textContent = (t.confidence * 100).toFixed(1) + '%';

      if (apiRes.marker_found) {
        document.getElementById('aruco-status-text').textContent = 'Terkalibrasi (' + apiRes.cm_per_pixel + ' cm/px)';
        document.getElementById('scl-value').textContent = t.est_length_cm + ' cm';
        document.getElementById('age-value').textContent = t.est_age;
        document.getElementById('stage-value').textContent = t.stage;
        document.getElementById('ai-limitation').textContent = 'Estimasi panjang karapas dan usia dihitung menggunakan kalibrasi ArUco Marker dan kurva pertumbuhan Von Bertalanffy (Ramirez et al., 2021).';
      } else {
        document.getElementById('aruco-status-text').textContent = 'Tidak ada marker di foto';
        document.getElementById('scl-value').textContent = 'Memerlukan marker ArUco';
        document.getElementById('age-value').textContent = 'Memerlukan marker ArUco';
        document.getElementById('stage-value').textContent = 'Memerlukan marker ArUco';
        document.getElementById('ai-limitation').textContent = 'Identifikasi spesies tetap berjalan tanpa marker. Sertakan ArUco Marker di samping penyu untuk mengestimasi panjang karapas, fase hidup, dan usia.';
      }
      save.disabled = false;
    }

    document.getElementById('result-empty').hidden = true;
    document.getElementById('result-body').hidden = false;
  }

  // --- KIRIM FOTO KE RAILWAY ---
  btn.addEventListener('click', async function () {
    if (!state.dataUrl || state.running) return;
    state.running = true;
    state.result = null;
    state.saved = false;
    save.disabled = true;
    setError('');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menganalisis…';
    document.getElementById('result-empty').hidden = true;
    document.getElementById('result-body').hidden = true;
    document.getElementById('pipeline').hidden = false;

    try {
      var markerCm = markerInput ? parseFloat(markerInput.value) || 10.0 : 10.0;
      var response = await fetch(RAILWAY_API_URL + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: state.dataUrl, marker_size_cm: markerCm })
      });
      if (!response.ok) throw new Error('Server AI mengembalikan error HTTP ' + response.status);
      var apiRes = await response.json();
      if (apiRes.status === 'error') throw new Error(apiRes.message);
      showResult(apiRes);
    } catch (e) {
      document.getElementById('result-empty').hidden = false;
      setError('Analisis gagal dijalankan. Periksa koneksi dan status layanan AI, lalu coba lagi. ' + (e.message || e));
    } finally {
      state.running = false;
      document.getElementById('pipeline').hidden = true;
      btn.disabled = !state.dataUrl;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analisis Ulang';
    }
  });

  // --- SIMPAN HASIL KE RIWAYAT ---
  save.addEventListener('click', async function () {
    if (!state.result || !state.result.detected || state.saved) return;
    if (!PGAuth.user) {
      PG.toast('Silakan login terlebih dahulu untuk menyimpan hasil ke riwayat.', 'warn');
      window.location.href = ROOT + 'pages/login.html?next=ai-analysis.html';
      return;
    }
    save.disabled = true;
    try {
      var thumb = await U.downscaleImage(state.result.annotated_image || state.dataUrl, 320, 0.8);
      if (thumb && PGConfig.isConfigured) {
        thumb = await PGStore.uploadDataUrl(thumb, state.fileName, 'ai-analyses/' + PGAuth.user.id);
      }
      var t = state.result.turtles[0];
      await PGStore.insert('ai_analyses', {
        user_id: PGAuth.user.id,
        user_name: PGAuth.user.full_name,
        image_name: state.fileName,
        thumb: thumb || '',
        estimated_carapace_cm: t.est_length_cm || null,
        size_class: t.common_name + ' (' + t.scientific_name + ')',
        confidence: t.confidence,
        mode: state.result.marker_found ? 'YOLOv8 + ArUco + VBGF' : 'YOLOv8 Identifikasi',
        note: JSON.stringify({
          est_age: t.est_age,
          stage: t.stage,
          marker_found: state.result.marker_found
        })
      });
      state.saved = true;
      PG.toast('Hasil analisis berhasil disimpan ke riwayat.', 'success');
      renderHistory();
    } catch (err) {
      PG.toast('Gagal menyimpan hasil. Periksa koneksi internet.', 'error');
      save.disabled = false;
    }
  });

  function esc(v) { return U.esc(v == null ? '—' : String(v)); }

  // --- RENDER TABEL RIWAYAT ANALISIS ---
  async function renderHistory() {
    if (!historyWrap) return;
    if (!PGAuth.user) {
      historyWrap.innerHTML = PG.ui.emptyState(
        'fa-right-to-bracket',
        'Masuk untuk melihat riwayat',
        'Riwayat analisis AI tersimpan per akun pengguna.',
        '<a class="btn btn-primary" href="' + ROOT + 'pages/login.html?next=ai-analysis.html">Login Sekarang</a>'
      );
      return;
    }
    var rows = [];
    try {
      rows = (await PGStore.all('ai_analyses')).filter(function (r) { return r && r.user_id === PGAuth.user.id; });
    } catch (_) {}

    if (!rows.length) {
      historyWrap.innerHTML = '<p class="text-muted">Belum ada hasil analisis yang tersimpan.</p>';
      return;
    }

    var html = '<div class="table-wrap"><table class="pg-table"><thead><tr>' +
      '<th>Tanggal</th><th>Foto</th><th>Spesies</th><th>Keyakinan</th><th>Panjang Karapas</th><th>Estimasi Usia</th><th>Aksi</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (r) {
      var meta = {};
      try { meta = JSON.parse(r.note || '{}'); } catch (_) {}
      var confText = typeof r.confidence === 'number' ? (r.confidence * 100).toFixed(1) + '%' : '—';
      var cmText = typeof r.estimated_carapace_cm === 'number' ? r.estimated_carapace_cm + ' cm' : 'Tanpa marker';
      var ageText = meta.est_age || '—';
      var thumbHtml = r.thumb
        ? '<img src="' + esc(r.thumb) + '" alt="thumb" style="width:48px;height:36px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px">'
        : '';

      html += '<tr>' +
        '<td>' + esc(U.fmtDateTime(r.created_at)) + '</td>' +
        '<td>' + thumbHtml + esc(r.image_name) + '</td>' +
        '<td><strong>' + esc(r.size_class) + '</strong></td>' +
        '<td>' + esc(confText) + '</td>' +
        '<td>' + esc(cmText) + '</td>' +
        '<td>' + esc(ageText) + '</td>' +
        '<td><button class="btn btn-outline btn-sm" data-del="' + esc(r.id) + '">Hapus</button></td>' +
        '</tr>';
    });

    historyWrap.innerHTML = html + '</tbody></table></div>';

    historyWrap.querySelectorAll('button[data-del]').forEach(function (el) {
      el.addEventListener('click', async function () {
        if (!await PG.ui.confirm({ title: 'Hapus riwayat', message: 'Hapus data analisis ini dari riwayat?', okLabel: 'Hapus', danger: true })) return;
        try {
          await PGStore.remove('ai_analyses', el.dataset.del);
          PG.toast('Riwayat dihapus.', 'success');
          renderHistory();
        } catch (_) {
          PG.toast('Gagal menghapus riwayat.', 'error');
        }
      });
    });
  }

  checkApiHealth();
  renderHistory();
});
