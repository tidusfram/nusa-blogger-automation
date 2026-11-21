# Dokumentasi Operasional Windows 11 — Nusa Blogger Automation

## 1. Lokasi Penyimpanan Data & Backup di Windows 11
Secara default, database SQLite lokal dan folder backup disimpan pada direktori `userData` Electron:
- **Database Utama**: `%APPDATA%\nusa-blogger-automation\data\nusa_blogger.db`
- **Folder Backup Otomatis**: `%APPDATA%\nusa-blogger-automation\data\backups\`

Setiap kali **Publishing Engine** memperbarui artikel lama di Blogspot:
1. Sistem mengambil versi live terbaru dari Blogger API v3 (`GET /blogs/{blogId}/posts/{postId}`).
2. Sistem menyimpan salinan utuh konten asli ke tabel `article_revisions` dengan penanda `is_backup_snapshot = 1`.
3. Sistem memvalidasi 10 pemeriksaan **Quality Gate**.
4. Sistem mengirim `PATCH` ke Blogger API v3 sehingga `blogger_post_id`, permalink/URL, dan `published_at` tetap utuh.

## 2. Konfigurasi PostgreSQL (Prisma ORM untuk Mode Server Tim)
Untuk menghubungkan skema Prisma ke database produksi PostgreSQL:
1. Atur variabel lingkungan `DATABASE_URL` pada file `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/nusa_blogger?schema=public"
   ```
2. Jalankan migrasi skema Prisma:
   ```powershell
   npx prisma generate
   npx prisma db push
   ```

## 3. Pengujian Otomatis (Unit & Integration Testing)
Jalankan seluruh pengujian otomatis sebelum melakukan rilis:
```powershell
npm run test:unit
npm run test:integration
npm run typecheck
npm run build
```
