-- PenyuGuard: PATCH KEAMANAN RLS (jalankan setelah database/schema.sql)
-- Tujuan: pemilik akun tidak dapat menaikkan role/status sendiri dan
-- pelapor tidak dapat menyetujui/mengubah metadata verifikasi laporannya.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Perubahan role hanya dapat dilakukan administrator.';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Perubahan status akun hanya dapat dilakukan administrator.';
    end if;
    if new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'ID dan email akun tidak dapat diubah melalui pembaruan profil.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

create or replace function public.prevent_report_self_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and not public.is_staff() then
    if new.user_id is distinct from old.user_id
      or new.status is distinct from old.status
      or new.operator_note is distinct from old.operator_note
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.data_origin is distinct from old.data_origin then
      raise exception 'Pelapor tidak dapat mengubah status atau metadata verifikasi.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_report_verification on public.public_reports;
create trigger trg_guard_report_verification
before update on public.public_reports
for each row execute function public.prevent_report_self_verification();

-- Pastikan kebijakan UPDATE profil hanya untuk pemilik atau admin.
drop policy if exists "pemilik dapat memperbarui profilnya" on public.profiles;
create policy "pemilik dapat memperbarui profilnya"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Pelapor boleh memperbarui isi laporannya, tetapi trigger di atas melindungi
-- status dan kolom verifikasi. Operator/admin tetap dapat memproses laporan.
drop policy if exists "pemilik memperbarui laporannya" on public.public_reports;
create policy "pemilik memperbarui laporannya"
  on public.public_reports for update
  using (auth.uid() = user_id or public.is_staff())
  with check (auth.uid() = user_id or public.is_staff());
