-- PenyuGuard: patch integrasi Supabase untuk versi website saat ini.
-- Jalankan setelah schema.sql + security_patch.sql; patch ini aman dijalankan ulang.

-- Provenance kolom untuk membedakan seed demo dari observasi/laporan sumber.
alter table public.turtle_sightings add column if not exists data_origin text not null default 'demo';
alter table public.turtle_sightings add column if not exists quality_grade text;
alter table public.turtle_sightings drop constraint if exists turtle_sightings_quality_grade_check;
alter table public.turtle_sightings add constraint turtle_sightings_quality_grade_check check (quality_grade is null or quality_grade in ('research','needs_id'));
alter table public.aquaculture_sites add column if not exists data_origin text not null default 'demo';
alter table public.public_reports add column if not exists data_origin text not null default 'community_report';
alter table public.sst_data add column if not exists data_origin text not null default 'research';
alter table public.turtle_sightings drop constraint if exists turtle_sightings_data_origin_check;
alter table public.turtle_sightings add constraint turtle_sightings_data_origin_check check (data_origin in ('demo','community_report','iNaturalist','research'));
alter table public.aquaculture_sites drop constraint if exists aquaculture_sites_data_origin_check;
alter table public.aquaculture_sites add constraint aquaculture_sites_data_origin_check check (data_origin in ('demo','research'));
alter table public.public_reports drop constraint if exists public_reports_data_origin_check;
alter table public.public_reports add constraint public_reports_data_origin_check check (data_origin in ('community_report','research'));
alter table public.sst_data drop constraint if exists sst_data_data_origin_check;
alter table public.sst_data add constraint sst_data_data_origin_check check (data_origin in ('demo','research'));
create or replace function public.set_public_report_origin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then new.data_origin := 'community_report'; end if;
  return new;
end;
$$;
drop trigger if exists trg_set_public_report_origin on public.public_reports;
create trigger trg_set_public_report_origin before insert on public.public_reports
for each row execute function public.set_public_report_origin();

-- Bucket privat: foto laporan dan analisis hanya dapat dibaca pemilik atau staff.
insert into storage.buckets (id, name, public)
values ('penyuguard-media', 'penyuguard-media', false)
on conflict (id) do update set public = false;

drop policy if exists "publik membaca media konservasi" on storage.objects;
drop policy if exists "user mengunggah dokumentasi laporannya" on storage.objects;
drop policy if exists "staff mengelola media" on storage.objects;
drop policy if exists "pemilik dan staff membaca media" on storage.objects;
drop policy if exists "pemilik dan staff mengunggah media" on storage.objects;
drop policy if exists "pemilik dan staff memperbarui media" on storage.objects;
drop policy if exists "pemilik dan staff menghapus media" on storage.objects;

create policy "pemilik dan staff membaca media" on storage.objects
  for select using (
    bucket_id = 'penyuguard-media' and (
      public.is_staff() or (
        auth.uid() is not null
        and split_part(name, '/', 1) in ('reports', 'ai-analyses')
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );
create policy "pemilik dan staff mengunggah media" on storage.objects
  for insert with check (
    bucket_id = 'penyuguard-media' and (
      public.is_staff() or (
        auth.uid() is not null
        and split_part(name, '/', 1) in ('reports', 'ai-analyses')
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );
create policy "pemilik dan staff memperbarui media" on storage.objects
  for update using (
    bucket_id = 'penyuguard-media' and (
      public.is_staff() or (
        auth.uid() is not null
        and split_part(name, '/', 1) in ('reports', 'ai-analyses')
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  ) with check (
    bucket_id = 'penyuguard-media' and (
      public.is_staff() or (
        auth.uid() is not null
        and split_part(name, '/', 1) in ('reports', 'ai-analyses')
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );
create policy "pemilik dan staff menghapus media" on storage.objects
  for delete using (
    bucket_id = 'penyuguard-media' and (
      public.is_staff() or (
        auth.uid() is not null
        and split_part(name, '/', 1) in ('reports', 'ai-analyses')
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

-- Aktivitas pribadi dapat dibaca pemilik; staff dapat membaca seluruh log.
alter table public.activity_logs add column if not exists user_id uuid references public.profiles(id) on delete set null;
drop policy if exists "staff membaca log" on public.activity_logs;
create policy "staff membaca log" on public.activity_logs
  for select using (public.is_staff() or auth.uid() = user_id);
drop policy if exists "user menulis log sendiri" on public.activity_logs;
create policy "user menulis log sendiri" on public.activity_logs
  for insert with check (auth.uid() = user_id);

-- Staff dapat menghapus riwayat gambar AI dari panel admin.
drop policy if exists "pemilik menghapus analisisnya" on public.ai_analyses;
create policy "pemilik dan staff menghapus analisis" on public.ai_analyses
  for delete using (auth.uid() = user_id or public.is_staff());

-- Hindari user mengganti identitas kepemilikan atau data hasil verifikasi.
-- Trigger dari security_patch.sql tetap menjadi lapisan perlindungan tambahan.

-- Pembuatan akun staff dilakukan melalui Supabase Auth (Dashboard/undangan),
-- bukan insert langsung ke profiles dari browser. Setelah user terdaftar,
-- administrator dapat mengubah role dengan query berikut (ganti email):
-- update public.profiles set role = 'operator' where email = 'operator@contoh.id';
