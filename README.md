# Nusa Blogger Automation — Enterprise Edition (Phase 1–8 Complete)

Aplikasi desktop profesional Windows 11 untuk mengelola banyak akun dan blog Blogspot dengan **AI Auto Publish & Auto Update Blogspot**.

## 1. Hasil Audit Source Code Awal (Phase 1) vs Implementasi Lengkap

### Sudah tersedia pada Phase 1 (Fondasi Awal yang Dipertahankan)
- Shell aplikasi desktop Electron (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) + React + TypeScript + Vite (`electron-vite`).
- Inisialisasi SQLite (`better-sqlite3` dalam mode WAL) dengan 9 tabel awal (`workspaces`, `users`, `google_accounts`, `blogs`, `keywords`, `articles`, `article_revisions`, `automation_jobs`, `job_logs`) + `app_settings`.
- IPC bridge dasar untuk statistik ringkas dan pembuatan workspace.

### Modul Baru yang Telah Dibangun & Diuji (Phase 2 – Phase 8)
1. **Database Lengkap (16 Tabel Wajib + Audit & App Settings + Prisma ORM)**:
   - Seluruh 16 tabel wajib tersedia di SQLite (`electron/main/services/database.ts`) dan PostgreSQL/Prisma (`prisma/schema.prisma`):
     1. `users`
     2. `workspaces`
     3. `workspace_members`
     4. `google_accounts`
     5. `blogs`
     6. `blog_settings`
     7. `articles` (dengan `blogger_post_id` unik per blog sebagai identitas postingan asli)
     8. `article_revisions`
     9. `keywords`
     10. `media_assets`
     11. `automation_jobs`
     12. `schedules`
     13. `job_logs`
     14. `ai_settings`
     15. `update_reports`
     16. `source_references`
2. **Keamanan, Enkripsi & RBAC (`electron/main/services/security.ts`)**:
   - Enkripsi AES-256-GCM untuk token Google OAuth 2.0 dan OpenAI API key.
   - Role-Based Access Control (`owner`, `admin`, `editor`, `viewer`) dan isolasi data antar-workspace.
   - Zona waktu `Asia/Jakarta` (WIB) untuk seluruh penjadwalan dan log audit.
3. **Blogger API v3 & Google OAuth 2.0 (`electron/main/services/bloggerApi.ts`)**:
   - Pembuatan URL otorisasi Google OAuth 2.0, manajemen token terenkripsi, retry otomatis dengan exponential backoff.
   - Sinkronisasi artikel dari Blogger (`GET /blogs/{blogId}/posts`), pengambilan artikel tunggal (`GET /blogs/{blogId}/posts/{postId}`), pembaruan artikel asli tanpa membuat post baru (`PATCH /blogs/{blogId}/posts/{postId}`), dan penerbitan artikel baru (`POST /blogs/{blogId}/posts`).
4. **Mesin A — Detection Engine (`electron/main/engines/detectionEngine.ts`)**:
   - Membandingkan hash konten SHA-256, mendeteksi tahun/referensi kedaluwarsa, menganalisis kualitas konten, peluang SEO (H2/H3, meta description, internal link, alt text gambar), duplikasi artikel (Jaccard similarity), dan klaim tanpa sumber referensi.
   - Menghasilkan status: `No Update Required`, `Update Recommended`, `SEO Optimization Required`, `Content Revision Required`, `Manual Review Required`, serta menerapkan tabel Logika Keputusan Auto Update.
5. **Mesin B — AI Revision Engine (`electron/main/engines/revisionEngine.ts`)**:
   - Terintegrasi dengan OpenAI API (`gpt-4o-mini` / `gpt-4o`) serta mesin revisi deterministik berbasis sumber referensi.
   - **Anti-Halusinasi Ketat**: Tidak pernah mengarang fakta, tanggal, statistik, harga, atau sumber referensi. Jika klaim baru tidak dapat diverifikasi oleh `source_references`, informasi lama dipertahankan dan ditandai `Manual Review Required`.
   - Menghasilkan `Original Content`, `Updated Content`, `Change Summary`, `SEO Analysis`, `Source References`, `Quality Score`, dan `Update Recommendation`.
6. **Quality Gate 10 Pemeriksaan (`electron/main/engines/qualityGate.ts`)**:
   - Menjalankan 10 pemeriksaan wajib sebelum publikasi: `Fact Verification`, `Content Accuracy`, `Search Intent`, `SEO Quality`, `Grammar`, `Duplicate Content`, `HTML Validation`, `Internal Link Validation`, `URL Preservation`, dan `Change Detection`.
7. **Mesin C — Publishing Engine & Rollback (`electron/main/engines/publishingEngine.ts`)**:
   - Mengambil versi live sebelum update, membuat backup otomatis di `article_revisions`, memvalidasi Quality Gate, mengirim perubahan via `PATCH` Blogger API v3 dengan mempertahankan `blogger_post_id`, URL/permalink, dan tanggal publikasi, serta mendukung **Rollback** satu-klik.
8. **Auto Publish Engine (`electron/main/engines/autoPublishEngine.ts`)**:
   - Menghasilkan artikel baru dari antrean keyword, menyusun outline, membuat artikel HTML + meta description + aset ilustrasi di `media_assets`, memvalidasi Quality Gate, dan menerbitkan ke Blogger API v3.
9. **Automation Scheduler (`electron/main/engines/schedulerEngine.ts`)**:
   - Mengelola 8 jadwal otomatis (`Auto Sync`, `Auto Detection`, `Auto Revision`, `Auto Publish`, `Auto Update`, `Auto SEO Audit`, `Auto Backup`, `Auto Verification`) dengan **Job Lock**, **Idempotency Key**, batas artikel per batch, batas update harian, dan zona waktu `Asia/Jakarta`.
10. **Dashboard 18 Menu Lengkap (`src/App.tsx`)**:
    - Seluruh 18 menu dan 10 kartu statistik utama berfungsi penuh tanpa mockup.

---

## 2. Panduan Penggunaan di Windows 11

### Persyaratan Sistem
- Windows 11 64-bit.
- Node.js 22 LTS & npm.
- PostgreSQL 16+ (opsional untuk sinkronisasi tim terpusat melalui Prisma; aplikasi menggunakan SQLite WAL secara otomatis untuk penyimpanan lokal cepat).

### Instalasi & Menjalankan Aplikasi
```powershell
npm install
npm run test
npm run typecheck
npm run build
npm run dev
```

### Membuat Installer Windows (.exe NSIS)
```powershell
npm run dist:win
```
File installer NSIS akan dihasilkan di dalam folder `release\`.
