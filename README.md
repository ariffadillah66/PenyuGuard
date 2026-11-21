# PenyuGuard — Platform Analitik Konservasi Penyu Laut

**Marine Conservation Analytics Platform • Pulau Rinca, Taman Nasional Komodo, Nusa Tenggara Timur**

PenyuGuard adalah platform sistem informasi & analitik untuk mendukung pemantauan persebaran penyu, analisis karakteristik penyu, pemantauan kondisi oseanografi, analisis dinamika perjumpaan, serta mitigasi interaksi penyu dengan aktivitas masyarakat pesisir di Pulau Rinca. Dikembangkan sebagai produk inovasi mahasiswa Sistem Informasi Kelautan.

---

## ⚠️ Status Data & Fitur (WAJIB DIBACA)

| Komponen | Status |
|---|---|
| Data perjumpaan | Seed berisi data demo dan 76 observasi iNaturalist di Komodo; sinkronisasi 16 Nov 2026 menarik 53 observasi berkoordinat (44 research grade, 9 perlu identifikasi). Setiap titik menyimpan ID/tautan sumber dan kualitas identifikasi. |
| Budidaya | **DATA SIMULASI DEMONSTRASI** — bukan data penelitian aktual. |
| SST Pulau Rinca | **Data produk analisis NASA JPL MUR SST v4.1** — agregat bulanan Januari 2022–November 2026 dan 559 sel grid spasial; gap-filled. |
| Autentikasi produksi | Siap untuk **Supabase Authentication** (lihat bagian integrasi). Sebelum dikonfigurasi, berjalan dalam **Mode Demonstrasi** (autentikasi lokal berlabel jelas). |
| Jalur migrasi penyu | **Tidak ditampilkan** — belum tersedia data GPS/observasi berurutan; sistem tidak membuat jalur fiktif. |
| Oseanografi SSH | **Belum tersedia** — halaman menandai parameter SSH sebagai menunggu dataset; tidak dibuatkan nilai simulasi. |
| Lokasi sensitif | Lokasi peneluran disembunyikan dari peta publik; koordinat dapat diaproksimasi lewat Pengaturan Admin. |
| Laporan publik | Laporan baru berstatus *Menunggu Verifikasi* dan **tidak** tampil di peta/dashboard publik sampai disetujui operator/admin. |

---

## 🚀 Menjalankan Website

### Opsi 1 — Live Server (VS Code)
1. Buka folder `PenyuGuard/` di VS Code.
2. Klik kanan `index.html` → **Open with Live Server**.
3. Website terbuka di `http://127.0.0.1:5500`.

### Opsi 2 — Server statis lain
```bash
cd PenyuGuard
python3 -m http.server 8080
# buka http://localhost:8080
```

### Opsi 3 — Buka langsung (file://)
Semua halaman tetap berfungsi karena tersedia *fallback data tertanam* (`js/data-fallback.js`) — namun beberapa browser membatasi fitur pada mode `file://`; disarankan memakai server lokal.

**Koneksi internet diperlukan** untuk CDN: Font Awesome, Google Fonts, Chart.js, Leaflet, dan basemap OpenStreetMap.

---

## 👥 Akun Demonstrasi (Mode Demo)

| Role | Email | Password | Akses |
|---|---|---|---|
| Administrator | `admin@penyuguard.id` | `demo1234` | Seluruh fitur + manajemen user, log, pengaturan |
| Operator | `operator@penyuguard.id` | `demo1234` | Verifikasi laporan & data operasional |
| User | `budi@contoh.email` | `demo1234` | Melaporkan penyu, riwayat laporan, profil |

Registrasi publik otomatis berperan **User**. Peningkatan peran hanya oleh Administrator (halaman **Manajemen User**).

---

## 🗺️ Struktur Halaman

### Public Website
| Halaman | URL | Ringkasan |
|---|---|---|
| Beranda | `/index.html` | Hero, tentang platform, katalog fokus dua spesies, fitur publik, dan CTA |
| Dashboard | `/pages/dashboard.html` | Ringkasan perjumpaan, budidaya, filter, grafik, dan tautan cepat ke SST, CHL, salinitas, serta SSH |
| Peta Persebaran | `/pages/mapping.html` | Leaflet: titik perjumpaan, lokasi budidaya, dan area kajian awal budidaya; area indikatif perlu verifikasi lapangan |
| Analisis AI | `/pages/ai-analysis.html` | Klasifikasi foto Penyu Hijau dan Penyu Sisik melalui service AI terpisah; hasil tetap perlu verifikasi ahli |
| Oseanografi | `/pages/oceanographic.html` | SST, klorofil-a, salinitas, dan bagian SSH yang menunggu dataset; grafik/peta hanya ditampilkan untuk sumber yang tersedia |
| Edukasi & Konservasi | `/pages/education.html` | Katalog Penyu Hijau dan Penyu Sisik, habitat, status konservasi, ancaman, panduan lapangan, materi edukasi, dan pelaporan |
| Laporkan Penyu | `/pages/report.html` | Formulir laporan + foto + koordinat → antrean verifikasi |
| Login / Registrasi / Lupa Password | `/pages/login.html`, `register.html`, `forgot-password.html` | Validasi, strength meter, demo box |
| Profil / Riwayat Laporan | `/pages/profile.html`, `my-reports.html` | Terproteksi (wajib login) |

### Admin Dashboard (`/admin/`)
Sidebar + topbar; guard berbasis role.
| Halaman | Keterangan |
|---|---|
| `login.html` | Portal admin (operator & administrator) |
| `dashboard.html` | 8 kartu statistik, grafik, laporan terbaru, aktivitas |
| `turtles.html` | CRUD data perjumpaan (search, filter, paginasi, foto) |
| `mapping.html` | Peta + tambah/edit/hapus titik & zona (mode tambah via klik peta) |
| `verification.html` | Verifikasi laporan: Setujui/Tolak/Revisi/Sedang Diperiksa + catatan + teruskan ke data utama |
| `oceanographic.html` | Impor CSV SST, validasi, CRUD, grafik |
| `education.html` | CRUD artikel edukasi + katalog spesies |
| `users.html` | Tambah operator, ubah role, nonaktifkan, riwayat akun (admin saja) |
| `activity-logs.html` | Log login/logout/CRUD/verifikasi + ekspor CSV (admin saja) |
| `settings.html` | Umum, kebijakan publikasi (aproksimasi koordinat, mode penerusan data), status integrasi, reset demo (admin saja) |

---

## 🔐 Integrasi Supabase (mode produksi)

1. Buat project di [supabase.com](https://supabase.com), lalu jalankan berurutan **`database/schema.sql`**, **`database/security_patch.sql`**, **`database/integration_patch.sql`**, dan **`database/oceanographic_tables.sql`** di SQL Editor. Langkah terakhir menyiapkan tabel SST, klorofil-a, dan salinitas.
2. Salin **Project URL** dan **anon/public key** (Project Settings → API Keys) ke **`config/supabase.js`**:
   ```js
   window.PG_CONFIG = {
     supabaseUrl: 'https://xxxx.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...',
     ...
   };
   ```
3. Muat ulang website — autentikasi memakai Supabase Auth dan CRUD memakai PostgreSQL melalui adapter `PGStore`. Foto diunggah ke bucket privat Storage; database menyimpan path objek dan aplikasi membuat signed URL sesuai akses pemilik/staff.
4. Daftarkan akun pertama melalui halaman registrasi. Setelah akun muncul di `public.profiles`, jadikan administrator satu kali melalui SQL Editor: `update public.profiles set role = 'admin' where email = 'EMAIL_ADMIN_ANDA';`.
5. Buat akun operator melalui Supabase Authentication (Dashboard/invite), kemudian set `role = 'operator'` melalui SQL Editor. Pembuatan akun staff dari browser sengaja dinonaktifkan agar tidak membutuhkan `service_role` key.
6. Opsional: nonaktifkan konfirmasi email di Authentication → Providers (atau biarkan aktif; registrasi akan meminta konfirmasi).

**Penting:** hanya `anon/public key` yang boleh berada di frontend. Jangan pernah menaruh `service_role` key di `config/supabase.js`, HTML, JavaScript, atau repository publik. Seed yang berlabel `demo` bukan data penelitian. Observasi iNaturalist dan time-series SST/CHL/salinitas mempertahankan penanda asalnya; jangan mengubah sumber atau kualitas data saat impor.

Sinkronisasi observasi penyu dapat dijalankan ulang dengan `python scripts/sync_inaturalist.py`. Script memakai API publik iNaturalist untuk taxon Chelonioidea di place Taman Nasional Komodo, hanya mengambil quality grade `research` dan `needs_id`, lalu membuat snapshot di `data/inaturalist-komodo-observations.json`, memperbarui seed/fallback dan CSV, serta menghasilkan upsert aman-ulang `database/import_inaturalist_komodo.sql`. Jalankan SQL upsert itu setelah skema dan migration selesai agar data juga masuk ke Supabase; impor memakai ID observasi iNaturalist sebagai primary key.

Sistem keamanan: password tidak pernah disimpan aplikasi (Supabase Auth), RLS membatasi baca/tulis per role, laporan pribadi hanya terlihat pemiliknya, role tidak dapat ditentukan sendiri saat registrasi. Jika koneksi Supabase gagal, aplikasi tidak otomatis menurunkan dirinya ke mode demo.

> Pada **Mode Demonstrasi** (tanpa Supabase), autentikasi memakai localStorage dengan hash sederhana — **hanya untuk demonstrasi, bukan sistem login produksi**.

---

## 🧪 Pengujian yang Telah Dilakukan

Butir berikut menggambarkan pengujian mode demonstrasi lokal dan pemeriksaan implementasi. **Belum membuktikan koneksi ke project Supabase live.** Integrasi Supabase baru dapat dinyatakan lolos setelah seluruh SQL migrasi dijalankan di project yang benar dan alur laporan/foto diuji dengan akun user serta operator pada project tersebut.

- Navigasi seluruh halaman & tautan internal (link checker otomatis).
- Login, logout, registrasi, lupa password (mode demo), guard halaman terproteksi.
- Formulir pelaporan + upload foto + nomor laporan otomatis → verifikasi admin → diteruskan ke data utama → tampil di dashboard/peta publik (mode demonstrasi lokal).
- CRUD data penyu, SST (termasuk impor CSV), titik persebaran, artikel, spesies.
- Pembatasan role (user/operator/admin), termasuk halaman admin-only.
- Peta Leaflet (layer, filter, heatmap, pencarian), grafik Chart.js, kalkulator ekonomi.
- Responsivitas desktop/tablet/smartphone (hamburger & drawer).
- Smoke test headless browser tanpa error konsol pada halaman-halaman utama.

---

## 📁 Struktur Folder

```
PenyuGuard/
├── index.html                  # Beranda publik
├── pages/                      # 11 halaman publik
├── admin/                      # 10 halaman admin
├── css/                        # style, home, auth, dashboard, admin, mapping, responsive
├── js/                         # main, auth, components, data, data-fallback, per halaman
│   └── admin/                  # admin.js, verification.js, users.js, data-management.js, admin-mapping.js
├── assets/                     # images (13 foto), icons, logo (SVG)
├── data/                       # JSON simulasi (turtle-sightings, aquaculture, sst, species, articles, …)
├── config/supabase.js          # Konfigurasi Supabase (isi untuk mode produksi)
├── database/schema.sql         # Skema + RLS + trigger + storage bucket
└── README.md
```

## 🌐 Deploy

Karena seluruh path relatif, website dapat dideploy langsung ke Netlify (drag & drop folder), Vercel (framework: *Other*), GitHub Pages, atau hosting statis apa pun. Tidak ada proses build.

## © 2026 PenyuGuard — Marine Conservation Analytics Platform
Dikembangkan sebagai produk inovasi mahasiswa Sistem Informasi Kelautan. Data demo diberi keterangan pada halaman terkait; data sebaran penyu juga memuat observasi iNaturalist.


### Data SST Pulau Rinca (integrasi 12 November 2026)
- Sumber: NASA JPL MUR SST v4.1 (`analysed_sst`), resolusi sekitar 1 km / 0,01°, diunduh melalui NOAA CoastWatch ERDDAP.
- `data/sst.json`: ringkasan bulanan (mean, minimum, maksimum, jumlah sel valid) Januari 2022–November 2026, dihitung dari nilai sel pada GeoJSON.
- `data/sst-rinca.geojson`: 559 titik grid dengan nilai SST per bulan untuk peta Leaflet.
- Skala warna peta dijaga tetap 26–31 °C untuk membandingkan antarbulan.
- Catatan metodologis: MUR adalah produk analisis gap-filled; nilai pada area tanpa observasi langsung dapat merupakan hasil interpolasi.

---

## AI MVP (service lokal, fallback terukur)

Lihat README_MVP_RUN.md untuk menjalankan service FastAPI lokal, website, uji endpoint, memasukkan SCL manual, membaca VBGF, dan eksperimen segmentasi di Google Colab. Service tidak menyimulasikan classifier atau mask. Checkpoint segmentasi eksperimen tersedia di ai_service/models; runtime segmentasi aktif setelah dependency Ultralytics terpasang. Klasifikasi tetap meminta konfirmasi operator karena classifier dua spesies tervalidasi belum tersedia.

Dataset saat ini belum menyediakan identitas individu verified untuk split independen, classifier dua spesies tervalidasi, kalibrasi skala, atau pasangan foto-SCL-umur. Karena itu estimasi VBGF hanya simulasi dengan parameter asumsi awal, bukan umur kronologis maupun parameter lokal terverifikasi. Lihat reports/MVP_IMPLEMENTATION_REPORT.md, reports/MVP_TEST_REPORT.md, dan reports/SEGMENTATION_TRAINING_ARTIFACT_AUDIT.md.
