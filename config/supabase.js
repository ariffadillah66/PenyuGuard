/* =========================================================
 * PenyuGuard — Konfigurasi Supabase
 * ---------------------------------------------------------
 * Untuk mengaktifkan mode PRODUKSI (Supabase Authentication,
 * Database, Storage & RLS), isi dua nilai di bawah ini dengan
 * kredensial project Supabase Anda (Project Settings → API).
 *
 * Jika dibiarkan kosong (''), website otomatis berjalan dalam
 * MODE DEMONSTRASI: autentikasi lokal + data simulasi yang
 * diberi label jelas (bukan data penelitian aktual).
 *
 * Skema database lengkap tersedia di database/schema.sql.
 * ========================================================= */
var PG_RUNTIME = window.PG_RUNTIME_CONFIG || {};
window.PG_CONFIG = {
  supabaseUrl: PG_RUNTIME.supabaseUrl || 'https://avqsfkbdxqemjpbggiwx.supabase.co',
  supabaseAnonKey: PG_RUNTIME.supabaseAnonKey || 'sb_publishable_Z1mu797TbvjnSrv420iupQ_9eYHsBJh',
  appName: 'PenyuGuard',
  version: '1.0.0',
  storageBucket: 'penyuguard-media'
};
