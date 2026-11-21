-- Jalankan sekali di Supabase SQL Editor. Menyiapkan tabel time-series oseanografi.
alter table public.sst_data alter column id set default gen_random_uuid()::text;
alter table public.sst_data add column if not exists period text;
alter table public.sst_data add column if not exists data_origin text not null default 'research';
create table if not exists public.chl_data (id text primary key default gen_random_uuid()::text, year int not null, month int not null check(month between 1 and 12), chl_mean_mg_m3 double precision not null, image_count int default 0, period text, data_origin text not null default 'research', unique(year,month));
create table if not exists public.salinity_data (id text primary key default gen_random_uuid()::text, year int not null, month int not null check(month between 1 and 12), sal_mean_psu double precision not null, sal_min_psu double precision, sal_max_psu double precision, image_count int default 0, pixel_count int default 0, period text, data_origin text not null default 'research', unique(year,month));
alter table public.chl_data add column if not exists data_origin text not null default 'research';
alter table public.salinity_data add column if not exists data_origin text not null default 'research';
alter table public.chl_data enable row level security; alter table public.salinity_data enable row level security;
drop policy if exists "public read chl_data" on public.chl_data; create policy "public read chl_data" on public.chl_data for select using(true);
drop policy if exists "staff manage chl_data" on public.chl_data; create policy "staff manage chl_data" on public.chl_data for all using(public.is_staff()) with check(public.is_staff());
drop policy if exists "public read salinity_data" on public.salinity_data; create policy "public read salinity_data" on public.salinity_data for select using(true);
drop policy if exists "staff manage salinity_data" on public.salinity_data; create policy "staff manage salinity_data" on public.salinity_data for all using(public.is_staff()) with check(public.is_staff());
