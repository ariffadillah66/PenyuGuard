/* ============================================================
 * PenyuGuard — oceanographic.js
 * Halaman analitik oseanografi publik (data simulasi demonstrasi).
 * ============================================================ */
(function () {
  'use strict';

  var MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  var D = { sst: [], chl: [], salinity: [], sightings: [] };
  var map = null, markerLayer = null, chlMap = null, salMap = null;
  var chlLayer = null, salLayer = null, salGeo = null, salAvailableMonths = [];

  /* ---------------- helper umum ---------------- */
  function byId(id) { return document.getElementById(id); }
  function yOf(s) { return parseInt(String(s || '').slice(0, 4), 10) || 0; }
  function mOf(s) { return parseInt(String(s || '').slice(5, 7), 10) || 0; }
  function fmt1(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmt2(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ymKey(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }
  function ymLabel(key) {
    var y = String(key).slice(0, 4), m = parseInt(String(key).slice(5, 7), 10);
    return (MONTHS_SHORT[m - 1] || '?') + ' ' + y;
  }
  function avg(arr) {
    if (!arr.length) return null;
    var s = 0; arr.forEach(function (v) { s += Number(v) || 0; });
    return s / arr.length;
  }
  function distinct(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v !== undefined && v !== null && v !== '' && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }
  function countBy(rows, keyFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + 1; });
    return m;
  }

  /* Regresi linear sederhana → kemiringan (slope) */
  function slope(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var num = 0, den = 0;
    for (i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    return den === 0 ? null : num / den;
  }

  /* Korelasi Pearson r */
  function pearson(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var num = 0, dx = 0, dy = 0;
    for (i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) * (xs[i] - mx);
      dy += (ys[i] - my) * (ys[i] - my);
    }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
  }

  /* ---------------- filter ---------------- */
  function getF() {
    var y = byId('f-year'), m = byId('f-month'), tn = byId('f-tmin'), tx = byId('f-tmax');
    function num(id) { var el=byId(id); return el && el.value!=='' ? parseFloat(el.value) : null; }
    return {
      year: (y && y.value) || '',
      month: (m && m.value) || '',
      tmin: tn && tn.value !== '' ? parseFloat(tn.value) : null,
      tmax: tx && tx.value !== '' ? parseFloat(tx.value) : null,
      chlmin:num('f-chl-min'), chlmax:num('f-chl-max'), salmin:num('f-sal-min'), salmax:num('f-sal-max')
    };
  }
  function fSst(f) {
    return D.sst.filter(function (r) {
      if (f.year && r.year !== +f.year) return false;
      if (f.month && r.month !== +f.month) return false;
      var t = Number(r.sst_mean_c);
      if (f.tmin != null && !isNaN(f.tmin) && t < f.tmin) return false;
      if (f.tmax != null && !isNaN(f.tmax) && t > f.tmax) return false;
      return true;
    });
  }

  /* ---------------- kartu statistik ---------------- */
  function renderCards(f) {
    var host = byId('sst-cards');
    if (!host) return;
    var rows = fSst(f);
    if (!rows.length) {
      host.innerHTML = PG.ui.emptyState('fa-temperature-half', 'Tidak ada data pada rentang filter', 'Ubah filter tahun, bulan, atau rentang suhu untuk menampilkan statistik SST.');
      return;
    }
    var means = rows.map(function (r) { return Number(r.sst_mean_c); });
    var mins = rows.map(function (r) { return Number(r.sst_min_c); }).filter(function (v) { return !isNaN(v); });
    var maxs = rows.map(function (r) { return Number(r.sst_max_c); }).filter(function (v) { return !isNaN(v); });
    var vMin = mins.length ? Math.min.apply(null, mins) : Math.min.apply(null, means);
    var vMax = maxs.length ? Math.max.apply(null, maxs) : Math.max.apply(null, means);
    var vAvg = avg(means);

    /* Tren: regresi linear rata-rata tahunan */
    var annualMap = {};
    rows.forEach(function (r) {
      (annualMap[r.year] = annualMap[r.year] || []).push(Number(r.sst_mean_c));
    });
    var years = Object.keys(annualMap).map(Number).sort();
    var xs = [], ys = [];
    years.forEach(function (y) {
      var a = avg(annualMap[y]);
      if (a != null) { xs.push(y); ys.push(a); }
    });
    var sl = slope(xs, ys);
    var trendVal = '–';
    if (sl != null) {
      var dec = sl * 10;
      trendVal = (dec >= 0 ? '+' : '−') + fmt1(Math.abs(dec)) + ' °C';
    }

    host.innerHTML =
      PG.ui.statCard({ icon: 'fa-temperature-arrow-down', tone: 'navy', value: fmt2(vMin) + ' °C', label: 'Suhu Minimum', sub: 'SST terendah pada periode terpilih' }) +
      PG.ui.statCard({ icon: 'fa-temperature-arrow-up', tone: 'warn', value: fmt2(vMax) + ' °C', label: 'Suhu Maksimum', sub: 'SST tertinggi pada periode terpilih' }) +
      PG.ui.statCard({ icon: 'fa-temperature-half', tone: 'teal', value: fmt2(vAvg) + ' °C', label: 'Suhu Rata-rata', sub: 'rata-rata SST periode terpilih' }) +
      PG.ui.statCard({ icon: 'fa-arrow-trend-up', value: trendVal, label: 'Tren SST per Dekade', sub: 'estimasi linear dari rerata tahunan' });
  }

  /* ---------------- Grafik 1: SST bulanan (band min–max) ---------------- */
  function renderMonthly(f) {
    var rows = fSst(f).slice().sort(function (a, b) { return (a.year - b.year) || (a.month - b.month); });
    var labels, dMin, dMax, dMean;
    if (f.year) {
      labels = MONTHS_SHORT.slice();
      var mm = {}, mn = {}, mx = {};
      rows.forEach(function (r) {
        mm[r.month] = Number(r.sst_mean_c);
        mn[r.month] = Number(r.sst_min_c);
        mx[r.month] = Number(r.sst_max_c);
      });
      dMin = MONTHS_SHORT.map(function (_, i) { return mn[i + 1] != null && !isNaN(mn[i + 1]) ? mn[i + 1] : null; });
      dMax = MONTHS_SHORT.map(function (_, i) { return mx[i + 1] != null && !isNaN(mx[i + 1]) ? mx[i + 1] : null; });
      dMean = MONTHS_SHORT.map(function (_, i) { return mm[i + 1] != null ? mm[i + 1] : null; });
    } else {
      labels = rows.map(function (r) { return ymLabel(ymKey(r.year, r.month)); });
      dMin = rows.map(function (r) { var v = Number(r.sst_min_c); return isNaN(v) ? null : v; });
      dMax = rows.map(function (r) { var v = Number(r.sst_max_c); return isNaN(v) ? null : v; });
      dMean = rows.map(function (r) { return Number(r.sst_mean_c); });
    }
    PG.charts.make('ch-sst-monthly', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'SST minimum', data: dMin,
            borderColor: 'rgba(0,0,255,.65)', backgroundColor: 'transparent',
            borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: .35, spanGaps: true
          },
          {
            label: 'SST maksimum', data: dMax,
            borderColor: 'rgba(217,255,71,.65)', backgroundColor: 'rgba(217,255,71,.14)',
            fill: '-1', borderWidth: 1.5, pointRadius: 0, tension: .35, spanGaps: true
          },
          {
            label: 'SST rata-rata', data: dMean,
            borderColor: '#D9FF47', backgroundColor: 'transparent',
            borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: .35, spanGaps: true
          }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { title: { display: true, text: '°C' } },
          x: { ticks: { autoSkip: true, maxRotation: 0 } }
        }
      }
    });
  }

  /* ---------------- Grafik 2: scatter SST vs perjumpaan (seluruh tahun) ---------------- */
  function renderScatter() {
    var perYm = countBy(D.sightings, function (r) { return ymKey(yOf(r.date), mOf(r.date)); });
    var pts = D.sst.map(function (r) {
      return { x: Number(r.sst_mean_c), y: perYm[ymKey(r.year, r.month)] || 0 };
    });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var r = pearson(xs, ys);
    var host = byId('sst-corr');
    if (host) {
      host.innerHTML = '<i class="fa-solid fa-braille"></i> Korelasi Pearson r = ' +
        (r == null || isNaN(r) ? '–' : fmt2(r));
    }
    PG.charts.make('ch-sst-scatter', {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Bulan (seluruh tahun)',
          data: pts,
          backgroundColor: 'rgba(217,255,71,.72)',
          borderColor: '#D9FF47',
          pointRadius: 4.5, pointHoverRadius: 6.5
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'SST rata-rata bulanan (°C)' } },
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Jumlah perjumpaan' } }
        }
      }
    });
  }

  /* ---------------- Peta SST berbasis GeoJSON NASA JPL MUR ---------------- */
  var sstGrid = null;
  var SST_MIN = 26, SST_MAX = 31;
  var sstCellLat = 0.01, sstCellLon = 0.01;
  function inferCellSize(features, index) {
    var values=distinct(features.map(function(feature){var p=feature.properties||{},c=feature.geometry&&feature.geometry.coordinates;return Number(index===0?(c&&c[0]!=null?c[0]:p.lon):(c&&c[1]!=null?c[1]:p.lat));}).filter(isFinite)).sort(function(a,b){return a-b;}),step=Infinity;
    for(var i=1;i<values.length;i++){var d=values[i]-values[i-1];if(d>1e-7&&d<step)step=d;}
    return isFinite(step)?step:0.01;
  }
  function colorForTemp(v) {
    var stops = [
      {v:26,c:[36,85,214]}, {v:27,c:[32,184,213]},
      {v:28,c:[53,184,107]}, {v:29,c:[242,212,61]},
      {v:30,c:[242,140,40]}, {v:31,c:[217,39,39]}
    ];
    var x = Math.max(SST_MIN, Math.min(SST_MAX, Number(v)));
    for (var i=0;i<stops.length-1;i++) {
      if (x <= stops[i+1].v) {
        var t=(x-stops[i].v)/(stops[i+1].v-stops[i].v);
        var a=stops[i].c,b=stops[i+1].c;
        return 'rgb('+a.map(function(n,j){return Math.round(n+(b[j]-n)*t);}).join(',')+')';
      }
    }
    return 'rgb(217,39,39)';
  }
  function selectedGridValue(props, f) {
    var keys = Object.keys(props).filter(function(k){return /^\d{4}-\d{2}$/.test(k);}).sort();
    if (f.year && f.month) return props[ymKey(+f.year,+f.month)];
    var chosen = keys.filter(function(k){
      return (!f.year || yOf(k) === +f.year) && (!f.month || mOf(k) === +f.month);
    }).map(function(k){return Number(props[k]);}).filter(function(v){
      return isFinite(v) && (f.tmin==null || !isFinite(f.tmin) || v>=f.tmin) && (f.tmax==null || !isFinite(f.tmax) || v<=f.tmax);
    });
    return chosen.length ? avg(chosen) : null;
  }
  function initMap() {
    var host = byId('sst-map'), shell = byId('sst-map-shell');
    if (!host || !shell) return;
    if (typeof L === 'undefined') {
      shell.innerHTML = PG.ui.emptyState('fa-map', 'Peta tidak dapat dimuat', 'Leaflet gagal dimuat. Periksa koneksi internet lalu muat ulang.');
      return;
    }
    if (map) { map.remove(); map = null; }
    map = L.map(host, { scrollWheelZoom: false }).setView([-8.84,119.56], 10);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Sources: Esri, TomTom, Garmin, FAO, NOAA, USGS, and the GIS User Community'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    fetch(PGRoot() + 'data/sst-rinca.geojson', {cache:'no-store'})
      .then(function(r){if(!r.ok) throw new Error('HTTP '+r.status+' saat membaca GeoJSON SST'); return r.json();})
      .then(function(gj){
        if (!gj || !Array.isArray(gj.features)) throw new Error('Format GeoJSON SST tidak valid.');
        sstGrid = gj;
        sstCellLon=inferCellSize(gj.features,0);
        sstCellLat=inferCellSize(gj.features,1);
        renderMapMarkers();
        var bounds = L.geoJSON(gj).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.08));
        setTimeout(function(){map.invalidateSize();},150);
      })
      .catch(function(err){
        console.error('[PenyuGuard] GeoJSON SST gagal dimuat:',err);
        var msg=byId('sst-map-error');
        if(msg) msg.textContent='Data grid SST gagal dimuat: '+err.message+' Pastikan folder data/sst-rinca.geojson tersedia dan jalankan melalui server lokal.';
      });
  }
  function renderMapMarkers() {
    if (!map || !markerLayer || !sstGrid) return;
    var f=getF(), points=[];
    sstGrid.features.forEach(function(feature){
      var p=feature.properties||{}, geometry=feature.geometry||{}, coords=geometry.coordinates||[];
      var value=selectedGridValue(p,f);
      if(value==null || !isFinite(Number(value))) return;
      value=Number(value);
      if(f.tmin!=null && isFinite(f.tmin) && value<f.tmin) return;
      if(f.tmax!=null && isFinite(f.tmax) && value>f.tmax) return;
      // The source SST GeoJSON uses point centers, so draw a cell around each point.
      var bounds=null, lon, lat;
      if(geometry.type==='Point') { lon=Number(coords[0]); lat=Number(coords[1]); }
      else { bounds=L.geoJSON(feature).getBounds(); var center=bounds.isValid()?bounds.getCenter():null; lon=center?center.lng:Number(p.lon); lat=center?center.lat:Number(p.lat); }
      if(!isFinite(lat)||!isFinite(lon)) return;
      points.push({lat:lat,lon:lon,value:value,id:p.id,bounds:bounds});
    });
    markerLayer.clearLayers();
    points.forEach(function(pt){
      var periodText = f.year && f.month ? ymLabel(ymKey(+f.year,+f.month)) : (f.year ? 'Rata-rata tahun ' + f.year : 'Rata-rata seluruh periode');
      var gridId = pt.id == null ? '–' : String(pt.id).replace(/[&<>"']/g, '');
      var popup = '<div class="sst-popup-card">' +
        '<div class="sst-popup-head"><span>NASA JPL MUR · GRID ' + gridId + '</span><strong>Suhu Permukaan Laut</strong></div>' +
        '<div class="sst-popup-body">' +
          '<div class="sst-popup-period"><i class="fa-regular fa-calendar"></i><span>' + periodText + '</span></div>' +
          '<div class="sst-popup-temperature"><span>Suhu permukaan</span><strong>' + fmt2(pt.value) + '<small>°C</small></strong></div>' +
          '<div class="sst-popup-coordinate"><span>Koordinat</span><strong>' + pt.lat.toFixed(4) + ', ' + pt.lon.toFixed(4) + '</strong></div>' +
        '</div>' +
      '</div>';
      L.rectangle(pt.bounds&&pt.bounds.isValid()?pt.bounds:[[pt.lat-sstCellLat/2,pt.lon-sstCellLon/2],[pt.lat+sstCellLat/2,pt.lon+sstCellLon/2]],{
        color:'#ffffff', weight:0.45,
        fillColor:colorForTemp(pt.value), fillOpacity:0.88
      }).bindPopup(popup, { className:'sst-map-popup', minWidth:220, maxWidth:270, autoPan:true, autoPanPadding:[20,20] }).addTo(markerLayer);
    });
    var minEl=byId('lg-min'), maxEl=byId('lg-max');
    if(minEl) minEl.textContent=SST_MIN.toFixed(0)+' °C';
    if(maxEl) maxEl.textContent=SST_MAX.toFixed(0)+' °C';
    var count=byId('sst-grid-count');
    if(count) count.textContent=points.length+' / '+sstGrid.features.length+' sel grid ditampilkan';
    var err=byId('sst-map-error');
    if(err) err.textContent=points.length ? '' : 'Tidak ada sel grid yang memiliki nilai pada filter ini.';
  }

  /* ---------------- render & binding ---------------- */
  function renderCharts() {
    var f = getF();
    renderCards(f);
    renderMonthly(f);
    renderMapMarkers();
    renderExtraCharts();
    renderSalMap();
    if(chlLayer) chlLayer.setStyle(function(feat){var f=getF(),p=feat.properties||{},months=(window.CHL_GEO.properties||{}).bulan||[],idx=f.year&&f.month?months.indexOf(ymKey(+f.year,+f.month)):-1,v;if(idx>=0)v=(p.v||[])[idx];else{var vals=(p.v||[]).filter(function(x,i){return x!=null&&(!f.year||yOf(months[i])===+f.year)&&(!f.month||mOf(months[i])===+f.month);});v=avg(vals);}var visible=v!=null&&(f.chlmin==null||v>=f.chlmin)&&(f.chlmax==null||v<=f.chlmax);return {fillColor:!visible?'#b8c4cc':ramp(v,0,3),fillOpacity:visible?.82:.08};});
  }

  function fillFilters() {
    var years = distinct(D.sst.map(function (r) { return r.year; })).sort();
    var ySel = byId('f-year');
    var yearOptions = years.map(function (y) { return { value: String(y), label: String(y) }; });
    if (ySel) ySel.innerHTML = PG.optionHtml(yearOptions, '', 'Semua Tahun');
    var mSel = byId('f-month');
    var monthOptions = MONTHS_ID.map(function (m, i) { return { value: String(i + 1), label: m }; });
    if (mSel) mSel.innerHTML = PG.optionHtml(monthOptions, '', 'Semua Bulan');
    var parameterYear = byId('parameter-year'), parameterMonth = byId('parameter-month');
    if (parameterYear) parameterYear.innerHTML = PG.optionHtml(yearOptions, '', 'Semua Tahun');
    if (parameterMonth) parameterMonth.innerHTML = PG.optionHtml(monthOptions, '', 'Semua Bulan');
  }

  function bindFilters() {
    ['f-year', 'f-month'].forEach(function (id) {
      var elx = byId(id);
      if (elx) elx.addEventListener('change', function () {
        var paired = byId(id === 'f-year' ? 'parameter-year' : 'parameter-month');
        if (paired) paired.value = elx.value;
        renderCharts();
      });
    });
    [['parameter-year','f-year'],['parameter-month','f-month']].forEach(function (ids) {
      var local = byId(ids[0]), global = byId(ids[1]);
      if (local) local.addEventListener('change', function () {
        if (global) global.value = local.value;
        renderCharts();
      });
    });
    var periodReset = byId('parameter-period-reset');
    if (periodReset) periodReset.addEventListener('click', function () {
      ['f-year','f-month','parameter-year','parameter-month'].forEach(function (id) {
        var field = byId(id);
        if (field) field.value = '';
      });
      renderCharts();
    });
    var onNum = PG.util.debounce(renderCharts, 300);
    ['f-tmin', 'f-tmax','f-chl-min','f-chl-max','f-sal-min','f-sal-max'].forEach(function (id) {
      var elx = byId(id);
      if (elx) elx.addEventListener('input', onNum);
    });
    var reset = byId('sst-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        var y = byId('f-year'), m = byId('f-month'), tn = byId('f-tmin'), tx = byId('f-tmax');
        if (y) y.value = '';
        if (m) m.value = '';
        if (tn) tn.value = '';
        if (tx) tx.value = '';
        ['f-chl-min','f-chl-max','f-sal-min','f-sal-max'].forEach(function(id){var el=byId(id);if(el)el.value='';});
        renderCharts();
        PG.toast('Filter oseanografi diatur ulang.', 'info');
      });
    }
  }

  /* ---------------- Klorofil-a dan salinitas ---------------- */
  function valueForPeriod(row, field, f) {
    var rows = D[field] || [];
    var filtered = rows.filter(function(r){return (!f.year || +r.year===+f.year) && (!f.month || +r.month===+f.month) && Number.isFinite(Number(r[field==='chl'?'chl_mean_mg_m3':'sal_mean_psu']));});
    var key = field==='chl'?'chl_mean_mg_m3':'sal_mean_psu';
    return avg(filtered.map(function(r){return Number(r[key]);}));
  }
  function renderExtraCharts(){
    var f=getF();
    function draw(entity,field,canvas,label,unit,cardId){
      var key=field==='chl'?'chl_mean_mg_m3':'sal_mean_psu';
      var lo=field==='chl'?f.chlmin:f.salmin, hi=field==='chl'?f.chlmax:f.salmax;
      var rows=(D[field]||[]).filter(function(r){var v=Number(r[key]);return (!f.year||+r.year===+f.year)&&(!f.month||+r.month===+f.month)&&Number.isFinite(v)&&(lo==null||v>=lo)&&(hi==null||v<=hi);}).sort(function(a,b){return a.year-b.year||a.month-b.month;});
      var host=byId(cardId); if(host){host.innerHTML=rows.length?PG.ui.statCard({icon:field==='chl'?'fa-leaf':'fa-water',tone:'teal',value:fmt2(avg(rows.map(function(r){return Number(r[key]);})))+' '+unit,label:label,sub:rows.length+' periode valid'}):PG.ui.emptyState('fa-database','Data belum tersedia','Impor dataset '+label+' melalui dashboard admin.');}
      var labels=rows.map(function(r){return ymLabel(ymKey(r.year,r.month));});
      PG.charts.make(canvas,{type:'line',data:{labels:labels,datasets:[{label:label+' ('+unit+')',data:rows.map(function(r){return Number(r[key]);}),borderColor:field==='chl'?'#0000FF':'#D9FF47',backgroundColor:field==='chl'?'rgba(0,0,255,.18)':'rgba(217,255,71,.14)',fill:true,tension:.3,pointRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{title:{display:true,text:unit}}}}});
    }
    draw('chl_data','chl','ch-chl-monthly','Klorofil-a','mg/m³','chl-cards');
    draw('salinity_data','salinity','ch-sal-monthly','Salinitas','PSU','salinity-cards');
  }
  function ramp(v,min,max){var t=Math.max(0,Math.min(1,(Number(v)-min)/(max-min)));var a=[36,85,214],b=[217,39,39];return 'rgb('+a.map(function(x,i){return Math.round(x+(b[i]-x)*t);}).join(',')+')';}
  function makeBaseMap(id){var el=byId(id);if(!el||typeof L==='undefined')return null;var m=L.map(el,{scrollWheelZoom:false}).setView([-8.72,119.69],9);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(m);return m;}
  function initExtraMaps(){
    chlMap=makeBaseMap('chl-map');
    if(chlMap&&window.CHL_GEO){chlLayer=L.geoJSON(window.CHL_GEO,{style:function(feat){var f=getF(),p=feat.properties||{},months=(window.CHL_GEO.properties||{}).bulan||[],idx=-1;if(f.year&&f.month)idx=months.indexOf(ymKey(+f.year,+f.month));else {var vals=(p.v||[]).filter(function(v,i){return (!f.year||yOf(months[i])===+f.year)&&(!f.month||mOf(months[i])===+f.month)&&v!=null;});return {color:'#fff',weight:.35,fillColor:ramp(avg(vals)||0,0,3),fillOpacity:.82};}var v=idx>=0?(p.v||[])[idx]:null;return {color:'#fff',weight:.35,fillColor:v==null?'#b8c4cc':ramp(v,0,3),fillOpacity:v==null?0.15:.82};},onEachFeature:function(feat,layer){layer.on('click',function(){var f=getF(),months=window.CHL_GEO.properties.bulan,idx=f.year&&f.month?months.indexOf(ymKey(+f.year,+f.month)):-1,vals=feat.properties.v||[],v;if(idx>=0)v=vals[idx];else{var chosen=vals.filter(function(x,i){return x!=null&&(!f.year||yOf(months[i])===+f.year)&&(!f.month||mOf(months[i])===+f.month);});v=avg(chosen);}var value=v==null?'Tidak tersedia':fmt2(v),content='<div class="ocean-param-popup-content"><span>Klorofil-a</span><strong>'+value+' <small>mg/m³</small></strong></div>';layer.bindPopup(content,{className:'ocean-param-popup',minWidth:190,maxWidth:220}).openPopup();});}}).addTo(chlMap);var b=chlLayer.getBounds();if(b.isValid())chlMap.fitBounds(b.pad(.05));}
    fetch(PGRoot()+'data/oceanographic/SALINITAS.geojson').then(function(r){if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(function(g){salGeo=g;salAvailableMonths=Object.keys((g.features[0]||{}).properties||{}).filter(function(k){return /^\d{4}-\d{2}$/.test(k)&&g.features.some(function(f){return (f.properties||{})[k] != null && (f.properties||{})[k] !== '' && Number.isFinite(Number((f.properties||{})[k]));});}).sort();var ys=distinct(salAvailableMonths.map(yOf)).sort();var sy=byId('sal-year'),sm=byId('sal-month');if(sy){sy.innerHTML=PG.optionHtml(ys.map(function(y){return {value:String(y),label:String(y)};}),String(ys[ys.length-1]||''),'Pilih Tahun');}function months(){var available=salAvailableMonths.filter(function(k){return !sy||!sy.value||yOf(k)===+sy.value;});if(sm){sm.innerHTML=PG.optionHtml(available.map(function(k){return {value:String(mOf(k)),label:MONTHS_ID[mOf(k)-1]};}),String(mOf(available[available.length-1]||'')||''),'Pilih Bulan');}}months();if(sy)sy.addEventListener('change',function(){months();renderSalMap();});if(sm)sm.addEventListener('change',renderSalMap);salMap=makeBaseMap('salinity-map');renderSalMap();if(salMap){var b=L.geoJSON(g).getBounds();if(b.isValid())salMap.fitBounds(b.pad(.05));}}).catch(function(e){console.warn('GeoJSON salinitas:',e);var c=byId('salinity-map-count');if(c)c.textContent='GeoJSON salinitas gagal dimuat: '+e.message;});
    var cc=byId('chl-map-count');if(cc&&window.CHL_GEO)cc.textContent=(window.CHL_GEO.features||[]).length+' sel grid klorofil-a';
  }
  function renderSalMap(){
    if(!salMap||!salGeo)return;if(salLayer)salMap.removeLayer(salLayer);
    var f=getF(),sy=byId('sal-year'),sm=byId('sal-month'),key=sy&&sm&&sy.value&&sm.value?ymKey(+sy.value,+sm.value):null;
    var availableValues=[];salAvailableMonths.forEach(function(k){salGeo.features.forEach(function(feat){var raw=(feat.properties||{})[k],x=Number(raw);if(raw!=null&&raw!==''&&Number.isFinite(x))availableValues.push(x);});});var salMin=availableValues.length?Math.min.apply(null,availableValues):0,salMax=availableValues.length?Math.max.apply(null,availableValues):1;var legendMin=byId('salinity-lg-min'),legendMax=byId('salinity-lg-max');if(legendMin)legendMin.textContent=fmt2(salMin)+' PSU';if(legendMax)legendMax.textContent=fmt2(salMax)+' PSU';
    function value(p){if(key)return p[key];var vals=Object.keys(p).filter(function(k){return /^\d{4}-\d{2}$/.test(k)&&(!f.year||yOf(k)===+f.year)&&(!f.month||mOf(k)===+f.month);}).map(function(k){return p[k]==null||p[k]===''?NaN:Number(p[k]);}).filter(Number.isFinite);return avg(vals);}
    function visible(v){return v!=null&&Number.isFinite(Number(v))&&(f.salmin==null||v>=f.salmin)&&(f.salmax==null||v<=f.salmax);}
    salLayer=L.geoJSON(salGeo,{style:function(feat){var v=value(feat.properties||{}),ok=visible(v);return {color:'#fff',weight:.25,fillColor:ok?ramp(v,salMin,salMax):'#cbd5e1',fillOpacity:ok?.8:.08};},onEachFeature:function(feat,layer){layer.on('click',function(){var v=value(feat.properties||{}),valueText=v==null?'Tidak tersedia':fmt2(v),content='<div class="ocean-param-popup-content"><span>Salinitas</span><strong>'+valueText+' <small>PSU</small></strong></div>';layer.bindPopup(content,{className:'ocean-param-popup',minWidth:190,maxWidth:220}).openPopup();});}}).addTo(salMap);
    var count=salGeo.features.filter(function(feat){return visible(value(feat.properties||{}));}).length;
    var el=byId('salinity-map-count');if(el)el.textContent=count+' / '+salGeo.features.length+' sel grid salinitas ditampilkan';
  }
  function loadEntity(entity, fallbackFile) {
    if (entity === 'salinity_data') {
      return fetch(PGRoot() + 'data/oceanographic/' + fallbackFile).then(function (r) {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return PGStore.all(entity).then(function (rows) {
      if (rows && rows.length) return rows;
      if (PGStore._remote()) return [];
      return fetch(PGRoot() + 'data/oceanographic/' + fallbackFile).then(function (r) {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.json();
      });
    }).catch(function (err) {
      if (PGStore._remote()) {
        console.error('[PenyuGuard] Gagal membaca ' + entity + ' dari Supabase:', err);
        return [];
      }
      return fetch(PGRoot() + 'data/oceanographic/' + fallbackFile).then(function (r) {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.json();
      });
    });
  }

  function initHabitatGAM(){
    var status=byId('gam-status'),summary=byId('gam-summary-grid'),mapHost=byId('habitat-suitability-map');
    if(!status||!summary||!mapHost)return;
    function setError(message){status.classList.add('error');status.textContent='Hasil analisis kesesuaian habitat belum dapat dimuat. '+message;}
    function fmtP(value){if(value==null||!Number.isFinite(Number(value)))return 'tidak tersedia';var n=Number(value);return n<.001?'p < 0,001':'p = '+n.toFixed(3).replace('.',',');}
    function rangeText(item){var r=item&&item.optimal_range;if(!r)return 'Rentang belum teridentifikasi';return Number(r.minimum).toFixed(2).replace('.',',')+'–'+Number(r.maximum).toFixed(2).replace('.',',')+' '+item.unit;}
    function renderCurves(doc){
      var keys=[['SST','Suhu Permukaan Laut','gam-chart-sst'],['Salinitas','Salinitas','gam-chart-salinity'],['Klorofil-a','Klorofil-a','gam-chart-chl']];
      var descriptions={
        'SST':'Rentang dengan respons relatif tinggi pada kurva model. Ini bukan batas toleransi fisiologis penyu.',
        'Salinitas':'Rentang yang berkaitan dengan respons model relatif tinggi; bukan bukti penyu menghindari kadar lain.',
        'Klorofil-a':'Nilai p menunjukkan bukti statistik paling kuat pada model ini; ini bukan bukti sebab-akibat.'
      };
      var publicNames={Salinitas:'Salinitas <small>(keasinan)</small>','Klorofil-a':'Klorofil-a <small>(indikator kesuburan perairan)</small>'};
      summary.innerHTML=keys.map(function(k){var p=doc.parameters[k[0]]||{},badge=p.p_value!=null&&Number(p.p_value)<.05?'<span class="gam-factor-badge">Signifikan pada model</span>':'';return '<article class="gam-summary-card"><div class="gam-summary-heading"><h3>'+(publicNames[k[0]]||k[1])+'</h3>'+badge+'</div><div class="gam-range">'+rangeText(p)+'</div><div class="gam-range-label">Kisaran respons model relatif tinggi</div><p class="gam-card-description">'+descriptions[k[0]]+'</p></article>';}).join('');
      var intro=byId('gam-intro');if(intro)intro.textContent='Model membandingkan catatan perjumpaan penyu dengan kondisi perairan Rinca. Kisaran berikut merangkum pola yang muncul; ini bukan batas kebutuhan biologis atau bukti bahwa penyu memilih kondisi tersebut.';
      var sig=byId('gam-significance');if(sig)sig.innerHTML='<h3>Uji signifikansi spline</h3><p>Nilai p menguji kontribusi tiap spline pada model ini; nilai tersebut tidak mengukur sebab-akibat atau kepentingan ekologis.</p><ul>'+keys.map(function(k){var p=(doc.parameters[k[0]]||{}).p_value,interpretation=p!=null&&Number(p)<.05?'Signifikan secara statistik pada α = 0,05':'Belum signifikan pada α = 0,05';return '<li><span>'+k[1]+'</span><strong>'+fmtP(p)+'</strong><small>'+interpretation+'</small></li>';}).join('')+'</ul>';
      var method=byId('gam-method-note'),counts=doc.sample_counts||{};if(method)method.textContent='LogisticGAM (Generalized Additive Model) dilatih dengan '+(counts.presence||0)+' catatan kehadiran iNaturalist dan '+(counts.background_valid||0)+' titik latar acak (pseudo-absence), menggunakan rasio awal 1:2. Parameter lingkungan diringkas sebagai klimatologi bulanan '+(doc.environmental_period||'')+'. Kisaran pada kartu dihitung pada bagian kurva dengan respons ≥80% dari puncaknya. Karena titik latar bukan absensi terverifikasi, indeks dan nilai p bersifat eksploratif serta bergantung pada rancangan sampling.';
      keys.forEach(function(k){var item=doc.parameters[k[0]],canvas=byId(k[2]);if(!item||!canvas||typeof Chart==='undefined')return;var labels=item.x||[],datasets=[
        {label:'Batas bawah 95%',data:labels.map(function(x,i){return {x:Number(x),y:Number((item.lower_ci||[])[i])};}),borderColor:'rgba(217,255,71,0)',pointRadius:0,borderWidth:0,fill:false},
        {label:'Interval kepercayaan 95%',data:labels.map(function(x,i){return {x:Number(x),y:Number((item.upper_ci||[])[i])};}),borderColor:'rgba(217,255,71,0)',pointRadius:0,borderWidth:0,fill:'-1',backgroundColor:'rgba(217,255,71,.16)'},
        {label:'Respons model',data:labels.map(function(x,i){return {x:Number(x),y:Number((item.partial_dependence||[])[i])};}),borderColor:'#D9FF47',backgroundColor:'rgba(217,255,71,.12)',pointRadius:0,borderWidth:2.5,tension:.25,fill:false}
      ];new Chart(canvas,{type:'line',data:{datasets:datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{color:'#DCE4F8',boxWidth:12,filter:function(item){return item.text!=='Batas bawah 95%';}}},tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+Number(ctx.parsed.y).toFixed(3).replace('.',',');},title:function(items){return items.length?Number(items[0].parsed.x).toFixed(2).replace('.',',')+' '+item.unit:'';}}}},scales:{x:{type:'linear',ticks:{color:'#AAB5D4',maxTicksLimit:5,callback:function(value){return Number(value).toFixed(1).replace('.',',');}},grid:{color:'rgba(201,212,255,.08)'},title:{display:true,text:k[1]+' ('+item.unit+')',color:'#DCE4F8'}},y:{min:0,max:1,ticks:{color:'#AAB5D4',maxTicksLimit:5},grid:{color:'rgba(201,212,255,.08)'},title:{display:true,text:'Respons relatif',color:'#DCE4F8'}}}}});
      });
      var disclosure=document.querySelector('.scientific-details');if(disclosure)disclosure.addEventListener('toggle',function(){if(!disclosure.open||typeof Chart==='undefined')return;setTimeout(function(){keys.forEach(function(k){var canvas=byId(k[2]),chart=canvas&&Chart.getChart?Chart.getChart(canvas):null;if(chart)chart.resize();});},80);});
    }
    function renderSuitability(data){
      if(typeof L==='undefined')throw Error('Pustaka peta Leaflet tidak tersedia.');
      if(!data||data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Format GeoJSON tidak sesuai.');
      var map=makeBaseMap('habitat-suitability-map');if(!map)throw Error('Peta tidak dapat diinisialisasi.');
      var colors={'Sangat Sesuai':'#D9FF47','Cukup Sesuai':'#0000FF','Kurang Sesuai':'#68718E'};
      var layer=L.geoJSON(data,{style:function(feature){var p=feature.properties||{};return {color:'rgba(245,248,255,.8)',weight:.55,fillColor:colors[p.category]||'#68718E',fillOpacity:.78};},onEachFeature:function(feature,layer){var p=feature.properties||{},score=(Number(p.probability)*100).toFixed(1).replace('.',',');var body='<div class="gam-popup-card"><div class="gam-popup-head"><div><span class="gam-popup-kicker">Indeks kesesuaian model</span><strong>'+String(p.category||'Kelas tidak tersedia')+'</strong></div><span class="gam-popup-score">'+score+'<small>%</small></span></div><div class="gam-popup-grid"><div class="gam-popup-row"><span>Suhu permukaan laut</span><strong>'+Number(p.SST).toFixed(2).replace('.',',')+' °C</strong></div><div class="gam-popup-row"><span>Salinitas</span><strong>'+Number(p.Salinitas).toFixed(2).replace('.',',')+' PSU</strong></div><div class="gam-popup-row"><span>Klorofil-a</span><strong>'+Number(p["Klorofil-a"]).toFixed(3).replace('.',',')+' mg/m³</strong></div></div><p class="gam-popup-note">Skor relatif model; bukan peluang absolut keberadaan penyu.</p></div>';layer.bindPopup(body,{className:'gam-popup',maxWidth:300,minWidth:250,autoPan:true,autoPanPadding:[24,24]});}}).addTo(map);
      var bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds.pad(.06));setTimeout(function(){map.invalidateSize();},100);
      var count=byId('gam-map-count');if(count)count.textContent=data.features.length+' sel grid';
    }
    Promise.all([
      fetch(PGRoot()+'data/oceanographic/gam-habitat-curves.json').then(function(r){if(!r.ok)throw Error('Data kurva tidak tersedia (HTTP '+r.status+').');return r.json();}),
      fetch(PGRoot()+'data/oceanographic/habitat-suitability.geojson').then(function(r){if(!r.ok)throw Error('Data peta tidak tersedia (HTTP '+r.status+').');return r.json();})
    ]).then(function(results){renderCurves(results[0]);renderSuitability(results[1]);status.textContent='Ringkasan kisaran perairan berhasil dimuat. Kisaran ini menggambarkan pola pada model, bukan kondisi ideal biologis yang telah divalidasi.';}).catch(function(error){console.warn('[PenyuGuard] Hasil GAM:',error);setError(error.message||'Periksa ketersediaan berkas data hasil pemodelan.');});
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', async function () {
    await PGAuth.ready;
    try {
      var loaded = await Promise.all([loadEntity('sst_data','sst-timeseries.json'), loadEntity('chl_data','chl-timeseries.json'), loadEntity('salinity_data','salinity-timeseries.json'), PGStore.all('turtle_sightings').catch(function(){return [];})]);
      D.sst = loaded[0] || []; D.chl = loaded[1] || []; D.salinity = loaded[2] || [];
      D.sightings = (loaded[3] || []).filter(function (r) { return r.status === 'approved'; });
      fillFilters(); bindFilters(); renderCharts(); renderScatter(); initMap(); initExtraMaps(); initHabitatGAM(); renderCharts();
    } catch (err) {
      console.error('[PenyuGuard] Gagal memuat data oseanografi.', err);
      var host = byId('sst-cards');
      if (host) host.innerHTML = PG.ui.emptyState('fa-triangle-exclamation', 'Data tidak dapat dimuat', 'Terjadi kesalahan saat memuat data oseanografi. Periksa koneksi dan file data/oceanographic. Muat ulang halaman.');
    }
  });
})();

