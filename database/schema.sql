-- ============================================================
-- PenyuGuard — Skema Database Supabase (PostgreSQL)
-- Jalankan di Supabase SQL Editor setelah membuat project baru.
-- Lengkap dengan Row Level Security (RLS) sesuai hak akses:
--   • Pengunjung (anon) : hanya baca data publik yang "approved/published"
--   • User              : membuat & membaca laporan miliknya sendiri
--   • Operator          : mengelola data operasional (tanpa akun & settings)
--   • Administrator     : akses penuh
-- ============================================================

-- ---------- Helper: ambil role dari profiles ----------
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_my_role() in ('operator','admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_my_role() = 'admin', false);
$$;

-- ============================================================
-- 1. PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'user' check (role in ('user','operator','admin')),
  status text not null default 'active' check (status in ('active','disabled')),
  phone text default '',
  avatar text default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profil dapat dibaca pemilik/admin"
  on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "staff boleh melihat daftar profil"
  on public.profiles for select using (public.is_staff());
create policy "pemilik dapat memperbarui profilnya"
  on public.profiles for update using (auth.uid() = id);
create policy "admin mengelola seluruh profil"
  on public.profiles for all using (public.is_admin());

-- Auto-buat profile saat user mendaftar (role default USER — tidak bisa dipilih sendiri)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    'user',
    'active'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. TURTLE_SPECIES (katalog — dikelola admin)
-- ============================================================
create table if not exists public.turtle_species (
  id text primary key,
  name text not null,
  scientific text not null,
  iucn text check (iucn in ('CR','EN','VU','NT','LC')),
  image text default '',
  confirmed_local boolean not null default false,
  presence_note text default '',
  ccl_range text default '',
  weight_range text default '',
  characteristics jsonb default '[]',
  habitat text default '',
  description text default '',
  updated_at timestamptz not null default now()
);
alter table public.turtle_species enable row level security;
create policy "katalog spesies dapat dibaca semua"
  on public.turtle_species for select using (true);
create policy "admin mengelola katalog"
  on public.turtle_species for all using (public.is_admin());

-- ============================================================
-- 3. TURTLE_SIGHTINGS (data utama perjumpaan — hanya approved yang publik)
-- ============================================================
create table if not exists public.turtle_sightings (
  id text primary key,
  report_no text,
  date date not null,
  time text default '',
  species text not null,
  location_name text not null,
  lat double precision not null,
  lng double precision not null,
  carapace_length_cm double precision,
  condition text not null default 'Sehat',
  source text default 'Laporan Masyarakat',
  notes text default '',
  photo text default '',
  data_origin text not null default 'demo' check (data_origin in ('demo','community_report','iNaturalist','research')),
  quality_grade text check (quality_grade is null or quality_grade in ('research','needs_id')),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.turtle_sightings enable row level security;
create policy "publik membaca data terverifikasi"
  on public.turtle_sightings for select using (status = 'approved' or public.is_staff());
create policy "staff mengelola data perjumpaan"
  on public.turtle_sightings for all using (public.is_staff());

-- ============================================================
-- 4. SPATIAL_LOCATIONS (zona/titik spasial)
-- ============================================================
create table if not exists public.spatial_locations (
  id text primary key,
  name text not null,
  type text not null check (type in ('interaction_zone','nesting_sensitive','hotspot')),
  lat double precision not null,
  lng double precision not null,
  radius_m int default 0,
  description text default '',
  public_visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.spatial_locations enable row level security;
create policy "publik membaca lokasi yang ditujukan publik"
  on public.spatial_locations for select using (public_visible = true or public.is_staff());
create policy "staff mengelola lokasi spasial"
  on public.spatial_locations for all using (public.is_staff());

-- ============================================================
-- 5. AQUACULTURE_SITES (budidaya rumput laut)
-- ============================================================
create table if not exists public.aquaculture_sites (
  id text primary key,
  name text not null,
  village text default '',
  lat double precision not null,
  lng double precision not null,
  area_ha double precision default 0,
  production_normal_kg double precision default 0,
  production_actual_kg double precision default 0,
  price_per_kg double precision default 0,
  "group" text default '',
  notes text default '',
  data_origin text not null default 'demo' check (data_origin in ('demo','research')),
  created_at timestamptz not null default now()
);
alter table public.aquaculture_sites enable row level security;
create policy "publik membaca lokasi budidaya"
  on public.aquaculture_sites for select using (true);
create policy "staff mengelola lokasi budidaya"
  on public.aquaculture_sites for all using (public.is_staff());

-- ============================================================
-- 6. PUBLIC_REPORTS (laporan warga — RLS paling ketat)
-- ============================================================
create table if not exists public.public_reports (
  id text primary key default gen_random_uuid()::text,
  report_no text unique,
  user_id uuid not null references public.profiles(id),
  user_name text default '',
  email text default '',
  incident_type text not null,
  species text,
  condition text default '',
  location_name text not null,
  lat double precision not null,
  lng double precision not null,
  incident_datetime timestamptz not null,
  description text not null,
  photo text default '',
  data_origin text not null default 'community_report' check (data_origin in ('community_report','research')),
  status text not null default 'Menunggu Verifikasi'
    check (status in ('Menunggu Verifikasi','Sedang Diperiksa','Disetujui','Ditolak','Perlu Revisi')),
  operator_note text default '',
  verified_by text default '',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.public_reports enable row level security;
-- user hanya melihat laporan miliknya; staff melihat semua; anon tidak melihat apa pun
create policy "pemilik melihat laporannya"
  on public.public_reports for select using (auth.uid() = user_id or public.is_staff());
create policy "user membuat laporannya sendiri"
  on public.public_reports for insert with check (auth.uid() = user_id and status = 'Menunggu Verifikasi');
-- pelapor boleh memperbarui laporan miliknya hanya saat minta revisi (kolom terbatas pada praktiknya)
create policy "pemilik memperbarui laporannya"
  on public.public_reports for update using (auth.uid() = user_id);
create policy "staff memproses laporan"
  on public.public_reports for update using (public.is_staff());

-- ============================================================
-- 7. SST_DATA (oseanografi)
-- ============================================================
create table if not exists public.sst_data (
  id text primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  sst_mean_c double precision not null,
  sst_min_c double precision,
  sst_max_c double precision,
  data_origin text not null default 'research' check (data_origin in ('demo','research')),
  unique (year, month)
);
alter table public.sst_data enable row level security;
create policy "publik membaca SST"
  on public.sst_data for select using (true);
create policy "staff mengelola SST"
  on public.sst_data for all using (public.is_staff());

-- ============================================================
-- 8. AI_ANALYSES (riwayat analisis AI per pengguna)
-- ============================================================
create table if not exists public.ai_analyses (
  id text primary key default gen_random_uuid()::text,
  user_id uuid references public.profiles(id),
  user_name text default '',
  image_name text default '',
  thumb text default '',
  estimated_carapace_cm double precision,
  size_class text default '',
  confidence double precision,
  mode text default 'demo',
  note text default '',
  created_at timestamptz not null default now()
);
alter table public.ai_analyses enable row level security;
create policy "pemilik melihat analisisnya, staff membaca semua"
  on public.ai_analyses for select using (auth.uid() = user_id or public.is_staff());
create policy "user menyimpan analisisnya"
  on public.ai_analyses for insert with check (auth.uid() = user_id);
create policy "pemilik menghapus analisisnya"
  on public.ai_analyses for delete using (auth.uid() = user_id);

-- ============================================================
-- 9. EDUCATION_ARTICLES
-- ============================================================
create table if not exists public.education_articles (
  id text primary key,
  title text not null,
  category text default '',
  excerpt text default '',
  content text default '',
  image text default '',
  published boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.education_articles enable row level security;
create policy "publik membaca artikel terbit"
  on public.education_articles for select using (published = true or public.is_staff());
create policy "admin mengelola artikel"
  on public.education_articles for all using (public.is_admin());

-- ============================================================
-- 10. ACTIVITY_LOGS (hanya staff/admin, insert via app)
-- ============================================================
create table if not exists public.activity_logs (
  id text primary key default gen_random_uuid()::text,
  timestamp timestamptz not null default now(),
  actor text default '',
  role text default '',
  action text not null,
  target text default '',
  detail text default ''
);
alter table public.activity_logs enable row level security;
create policy "staff membaca log"
  on public.activity_logs for select using (public.is_staff());
create policy "admin mengelola log"
  on public.activity_logs for all using (public.is_admin());

-- ============================================================
-- STORAGE bucket foto & dokumentasi
-- ============================================================
insert into storage.buckets (id, name, public)
values ('penyuguard-media', 'penyuguard-media', true)
on conflict (id) do nothing;

create policy "publik membaca media konservasi"
  on storage.objects for select using (bucket_id = 'penyuguard-media');
create policy "user mengunggah dokumentasi laporannya"
  on storage.objects for insert with check (
    bucket_id = 'penyuguard-media' and auth.role() = 'authenticated'
  );
create policy "staff mengelola media"
  on storage.objects for all using (
    bucket_id = 'penyuguard-media' and public.is_staff()
  );

-- ============================================================
-- CATATAN PENGISIAN DATA
-- ------------------------------------------------------------
-- 1. Data awal (katalog spesies, artikel edukasi) dapat diunggah
--    dari file data/*.json pada repo (insert per tabel).
-- 2. Data pada repo adalah DATA SIMULASI DEMONSTRASI — jangan
--    ditampilkan sebagai data penelitian aktual.
-- 3. Laporan publik baru selalu berstatus 'Menunggu Verifikasi';
--    operator/admin memverifikasinya melalui halaman Admin.
-- ============================================================
