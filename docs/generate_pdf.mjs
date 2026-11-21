import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generates a comprehensive, 6-page, valid PDF 1.4 document using built-in Helvetica / Helvetica-Bold fonts.
 */
function buildPdfDocument(pages) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  // 1: Catalog, 2: Pages placeholder, 3: Font Regular, 4: Font Bold, 5: Font Oblique
  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject(""); // placeholder for /Pages
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const escapePdfText = (str) =>
    str
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const pageIds = [];

  for (let pIndex = 0; pIndex < pages.length; pIndex++) {
    const lines = pages[pIndex];
    const streamOps = [];

    // Header banner on each page
    streamOps.push("0.06 0.36 0.35 rg");
    streamOps.push("40 792 515 28 re f");
    streamOps.push("BT /F2 10 Tf 1 1 1 rg 52 802 Td (E-BOOK PANDUAN PENGGUNAAN - NUSA BLOGGER AUTOMATION) Tj ET");
    streamOps.push(`BT /F1 9 Tf 0.85 0.95 0.92 rg 490 802 Td (Hal. ${pIndex + 1} / ${pages.length}) Tj ET`);

    let y = 762;
    for (const item of lines) {
      if (item.type === "title") {
        streamOps.push(`BT /F2 15 Tf 0.06 0.13 0.22 rg 42 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 22;
      } else if (item.type === "h2") {
        y -= 5;
        streamOps.push("0.06 0.36 0.35 rg");
        streamOps.push(`42 ${y - 3} 4 14 re f`);
        streamOps.push(`BT /F2 11.5 Tf 0.06 0.36 0.35 rg 52 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 17;
      } else if (item.type === "h3") {
        y -= 2;
        streamOps.push(`BT /F2 10 Tf 0.12 0.18 0.28 rg 42 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 14;
      } else if (item.type === "callout") {
        streamOps.push("0.90 0.97 0.94 rg");
        streamOps.push(`42 ${y - 4} 510 16 re f`);
        streamOps.push("0.06 0.52 0.44 rg");
        streamOps.push(`42 ${y - 4} 3 16 re f`);
        streamOps.push(`BT /F2 9 Tf 0.04 0.32 0.27 rg 50 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 17;
      } else if (item.type === "warning") {
        streamOps.push("0.99 0.95 0.93 rg");
        streamOps.push(`42 ${y - 4} 510 16 re f`);
        streamOps.push("0.91 0.30 0.24 rg");
        streamOps.push(`42 ${y - 4} 3 16 re f`);
        streamOps.push(`BT /F2 9 Tf 0.72 0.18 0.14 rg 50 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 17;
      } else if (item.type === "code") {
        streamOps.push("0.94 0.96 0.98 rg");
        streamOps.push(`42 ${y - 4} 510 15 re f`);
        streamOps.push(`BT /F2 8.5 Tf 0.08 0.25 0.38 rg 48 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 16;
      } else if (item.type === "spacer") {
        y -= 6;
      } else {
        streamOps.push(`BT /F1 9.5 Tf 0.15 0.20 0.28 rg 42 ${y} Td (${escapePdfText(item.text)}) Tj ET`);
        y -= 13;
      }
    }

    // Footer
    streamOps.push("0.88 0.91 0.94 rg 40 38 515 1 re f");
    streamOps.push(
      "BT /F1 8.5 Tf 0.45 0.52 0.60 rg 42 25 Td (Nusa Blogger Automation v1.0 Enterprise - Windows 11 Desktop - Zona Waktu Asia/Jakarta WIB) Tj ET"
    );

    const streamContent = streamOps.join("\n");
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(streamContent, "latin1")} >>\nstream\n${streamContent}\nendstream`
    );

    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const pages = [
  // ==========================================================================
  // HALAMAN 1: COVER & CARA MEMBUKA APLIKASI
  // ==========================================================================
  [
    { type: "title", text: "E-BOOK PANDUAN LENGKAP PENGGUNAAN & OTOMASI" },
    { type: "h3", text: "Nusa Blogger Automation - Windows 11 Enterprise Edition (AI Auto Publish & Auto Update)" },
    { type: "spacer", text: "" },
    { type: "callout", text: "Pembaruan Terkini: Dilengkapi Fitur Auto-Refresh Token Permanen (Bebas Expire 1 Jam)" },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 1 - CARA MEMBUKA & MENJALANKAN APLIKASI DI WINDOWS 11" },
    { type: "p", text: "Aplikasi desktop Anda berwujud file executable (.exe) mandiri berkapasitas 188 MB." },
    { type: "p", text: "Aplikasi dapat langsung dijalankan tanpa perlu proses instalasi yang rumit." },
    { type: "spacer", text: "" },
    { type: "h3", text: "A. Membuka File Aplikasi (.exe):" },
    { type: "p", text: "1. Buka File Explorer di komputer Windows 11 Anda." },
    { type: "p", text: "2. Kunjungi alamat folder berikut:" },
    {
      type: "code",
      text: "C:\\Users\\ASROCK\\.gemini\\antigravity\\scratch\\nusa-blogger-automation\\release\\win-unpacked"
    },
    { type: "p", text: "3. Klik dua kali (Double-Click) pada file: Nusa Blogger Automation.exe" },
    { type: "p", text: "4. Tips Praktis: Klik kanan file tersebut -> Send to -> Desktop (create shortcut)" },
    { type: "p", text: "   agar ikon aplikasi Nusa Blogger selalu muncul di layar Desktop Anda." },
    { type: "spacer", text: "" },
    { type: "h3", text: "B. Menjalankan Mode Pengembang (Developer Live Reload via PowerShell):" },
    { type: "p", text: "Jika ingin menjalankan dari kode sumber dengan fitur live reload saat coding:" },
    { type: "code", text: "cd C:\\Users\\ASROCK\\.gemini\\antigravity\\scratch\\nusa-blogger-automation" },
    { type: "code", text: "npm run dev" },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 2 - ARSITEKTUR KEAMANAN & MANAJEMEN DATABASE" },
    { type: "p", text: "1. Database SQLite Lokal WAL: Tersimpan di komputer Anda dengan 16 tabel relasional." },
    { type: "p", text: "   Lokasi database: %APPDATA%\\nusa-blogger-automation\\data\\nusa_blogger.db" },
    { type: "p", text: "2. Enkripsi AES-256-GCM: Seluruh API Key OpenAI, Google OAuth Access Token," },
    { type: "p", text: "   Refresh Token, dan Client Secret dienkripsi militer sebelum masuk database." },
    { type: "p", text: "3. Job Lock & Idempotency: Mencegah eksekusi ganda pada jadwal otomatis yang sama." }
  ],

  // ==========================================================================
  // HALAMAN 2: KONFIGURASI API & AUTO-REFRESH PERMANEN
  // ==========================================================================
  [
    { type: "h2", text: "BAB 3 - KONFIGURASI KREDENSIAL AI (OPENAI)" },
    { type: "p", text: "Sebelum membuat atau merevisi konten, hubungkan AI Engine terlebih dahulu:" },
    { type: "p", text: "1. Buka menu 'Settings' pada bagian paling bawah sidebar kiri." },
    { type: "p", text: "2. Masukkan OpenAI API Key Anda (kunci diawali dengan sk-proj-...)." },
    { type: "p", text: "3. Pilih Model AI: gpt-4o-mini (rekomendasi: sangat cepat & hemat biaya) atau gpt-4o." },
    { type: "p", text: "4. Tentukan Batas Skor Minimum Quality Gate (standar: 75 dari 100)." },
    { type: "p", text: "5. Klik tombol 'Simpan Pengaturan AI'. Kunci Anda langsung terenkripsi AES-256-GCM." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 4 - PANDUAN LENGKAP AUTO-REFRESH PERMANEN (BEBAS EXPIRE 1 JAM)" },
    { type: "warning", text: "PENTING: Google secara bawaan membatasi Access Token hanya aktif 1 jam (3600 detik)." },
    { type: "p", text: "Jika hanya memasukkan Access Token biasa, token akan mati setiap 60 menit dan memicu" },
    { type: "p", text: "error 401 (Invalid Credentials). Agar aktif selamanya tanpa perlu diganti lagi," },
    { type: "p", text: "gunakan fitur baru: '⚡ Solusi 2: Auto-Refresh Permanen' di menu Blogger Accounts." },
    { type: "spacer", text: "" },
    { type: "h3", text: "Langkah-Langkah Mengaktifkan Auto-Refresh Selamanya (Cukup Sekali):" },
    { type: "p", text: "1. Buka menu 'Blogger Accounts' di sidebar kiri aplikasi Nusa Blogger." },
    { type: "p", text: "2. Masukkan Email Akun Google Anda: contoh bangsalmu@gmail.com" },
    { type: "p", text: "3. Pada kotak hijau 'Solusi 2: Auto-Refresh Permanen', masukkan 3 data berikut:" },
    { type: "p", text: "   a. Google Cloud Client ID (disalin dari Google Cloud Console -> Credentials):" },
    { type: "code", text: "      588669488177-nf5er8gqqph7ocg7jc2a8c0uik1jnnh8.apps.googleusercontent.com" },
    { type: "p", text: "   b. Google Cloud Client Secret (disalin dari Google Cloud Console):" },
    { type: "code", text: "      GOCSPX-..." },
    { type: "p", text: "   c. Google OAuth 2.0 Refresh Token (disalin dari OAuth Playground Step 2):" },
    { type: "code", text: "      1//04MVBX8zNG_... (kode permanen yang tidak pernah kedaluwarsa)" },
    { type: "p", text: "4. Klik tombol hijau: '+ Simpan Akun & Kredensial'." },
    { type: "spacer", text: "" },
    { type: "callout", text: "Hasil: Akun Anda akan berstatus '⚡ Auto-Refresh Aktif'. Sistem otomatis memperbarui token." },
    { type: "p", text: "Sistem aplikasi akan memperpanjang token akses secara transparan di latar belakang" },
    { type: "p", text: "setiap kali token habis, tanpa Anda perlu membuka Google Playground lagi!" }
  ],

  // ==========================================================================
  // HALAMAN 3: 3 MESIN UTAMA & QUALITY GATE
  // ==========================================================================
  [
    { type: "h2", text: "BAB 5 - PANDUAN 3 MESIN UTAMA (DETECTION, REVISION & PUBLISHING)" },
    { type: "h3", text: "1. MESIN 1: DETECTION ENGINE (Menu: Detection Engine & SEO Analyzer)" },
    { type: "p", text: "Menganalisis seluruh artikel yang ada di blog untuk mencari artikel yang perlu diupdate." },
    { type: "p", text: "- Algoritma mendeteksi 5 poin: (a) Referensi tahun usang (misal 2021-2023), (b) Jumlah kata" },
    { type: "p", text: "  di bawah standar, (c) Ketiadaan alt text gambar & internal link, (d) Skor SEO, dan (e) Duplikasi." },
    { type: "p", text: "- Status Keputusan Deteksi:" },
    { type: "code", text: "No Update Required        -> Artikel masih bagus & relevan (dilewati)" },
    { type: "code", text: "Update Recommended        -> Mengandung tahun/fakta usang (harus direvisi AI)" },
    { type: "code", text: "SEO Optimization Required -> Struktur heading/meta belum lengkap (revisi SEO)" },
    { type: "code", text: "Content Revision Required -> Konten terlalu pendek/tipis (perlu penambahan)" },
    { type: "code", text: "Manual Review Required    -> Ditemukan kemiripan teks >80% atau klaim sensitif" },
    { type: "spacer", text: "" },
    { type: "h3", text: "2. MESIN 2: AI REVISION ENGINE (Menu: AI Revision Engine)" },
    { type: "p", text: "Merevisi artikel lama dengan prinsip Anti-Halusinasi & Standar E-E-A-T Google:" },
    { type: "p", text: "- Memperbarui konteks waktu ke tahun terkini tanpa mengarang fakta sembarangan." },
    { type: "p", text: "- Menyusun ulang heading H2 & H3 logis dan menambahkan FAQ terstruktur." },
    { type: "p", text: "- Melengkapi seluruh gambar dengan atribut alt deskriptif kaya kata kunci." },
    { type: "p", text: "- Menautkan internal link ke artikel lain di blog yang sama secara otomatis." },
    { type: "spacer", text: "" },
    { type: "h3", text: "3. QUALITY GATE: 10 PEMERIKSAAN KELAYAKAN WAJIB SEBELUM PUBLISH" },
    { type: "p", text: "1. Fact Verification: Memastikan klaim data sesuai sumber terpercaya (Kritis)." },
    { type: "p", text: "2. Content Accuracy: Memastikan tahun & statistik diperbarui akurat (Kritis)." },
    { type: "p", text: "3. Search Intent: Memastikan gaya tulisan sesuai intensi pembaca." },
    { type: "p", text: "4. SEO Quality: Minimal ada 2x H2, 1x H3, dan meta description optimal." },
    { type: "p", text: "5. Grammar: Tata bahasa Indonesia baku dan mengalir profesional." },
    { type: "p", text: "6. Duplicate Content: Jaccard similarity maksimal 65% terhadap artikel lain (Kritis)." },
    { type: "p", text: "7. HTML Validation: Tag HTML tertutup rapat dan bebas skrip jahat (Kritis)." },
    { type: "p", text: "8. Internal Link Validation: Memastikan URL internal link valid (Kritis)." },
    { type: "p", text: "9. URL Preservation: Memastikan permalink dan Post ID tidak berubah (Kritis)." },
    { type: "p", text: "10. Change Detection: Perubahan minimal 10% agar pembaruan bermakna (Kritis)." }
  ],

  // ==========================================================================
  // HALAMAN 4: PUBLISHING & AUTO PUBLISH ENGINE
  // ==========================================================================
  [
    { type: "h2", text: "BAB 6 - MESIN 3: PUBLISHING ENGINE (UPDATE IN-PLACE KE BLOGSPOT)" },
    { type: "callout", text: "GARANSI SISTEM: DILARANG MEMBUAT POST BARU & DILARANG MENGUBAH URL PERMALINK" },
    { type: "p", text: "Banyak blogger pemula merusak SEO karena menghapus artikel lama dan membuat URL baru." },
    { type: "p", text: "Publishing Engine Nusa Blogger memiliki aturan ketat:" },
    { type: "p", text: "1. Mengambil konten live Blogger via API dan menyimpan Snapshot Cadangan otomatis." },
    { type: "p", text: "2. Melakukan PATCH in-place pada blogger_post_id yang sama persis." },
    { type: "p", text: "3. Mempertahankan tanggal terbit asli (published date) dan struktur permalink URL." },
    { type: "p", text: "4. Melakukan verifikasi ulang setelah publish untuk memastikan konten sudah live." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 7 - AUTO PUBLISH ARTIKEL BARU DARI KATA KUNCI TARGET" },
    { type: "p", text: "Selain merevisi artikel lama, aplikasi bisa menulis artikel baru dari nol secara otomatis:" },
    { type: "p", text: "1. Buka menu 'Keyword Manager' -> Masukkan kata kunci (misal: 'Wisata Kuliner Jakarta')." },
    { type: "p", text: "2. Pilih Search Intent: Informational, Commercial, atau Transactional." },
    { type: "p", text: "3. Buka menu 'AI Article Writer' atau 'Auto Publisher' -> Klik 'Generate & Publish'." },
    { type: "p", text: "4. AI menyusun artikel lengkap (>1000 kata), meta deskripsi, ilustrasi banner SVG," },
    { type: "p", text: "   mengevaluasi Quality Gate, lalu menerbitkan artikel baru ke Blogspot via POST." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 8 - MASTER TOMBOL: ▶ JALANKAN PIPELINE OTOMATIS" },
    { type: "p", text: "Di pojok kanan atas aplikasi terdapat tombol hijau sakti: '▶ Jalankan Pipeline Otomatis'." },
    { type: "p", text: "Cukup 1 kali klik, sistem akan mengeksekusi 10 tahap secara berurutan:" },
    { type: "code", text: "Tahap 1: Sinkronisasi artikel terbaru dari Blogspot (Blogger API v3)" },
    { type: "code", text: "Tahap 2: Detection Engine memindai seluruh artikel di database lokal" },
    { type: "code", text: "Tahap 3: Menentukan kandidat artikel usang yang membutuhkan pembaruan" },
    { type: "code", text: "Tahap 4: AI Revision Engine membuat draf revisi lengkap dengan FAQ & SEO" },
    { type: "code", text: "Tahap 5: Quality Gate menguji 10 parameter kelayakan artikel" },
    { type: "code", text: "Tahap 6: Backup Snapshot disimpan otomatis sebelum perubahan diterapkan" },
    { type: "code", text: "Tahap 7: Publishing Engine melakukan PATCH in-place ke Blogspot" },
    { type: "code", text: "Tahap 8: Verifikasi konten online pada server Google Blogger" },
    { type: "code", text: "Tahap 9: Mencatat riwayat ke Update Reports & Activity Logs" },
    { type: "code", text: "Tahap 10: Memperbarui timer jadwal berikutnya pada Scheduler" }
  ],

  // ==========================================================================
  // HALAMAN 5: SCHEDULER & SOLUSI ALTERNATIF
  // ==========================================================================
  [
    { type: "h2", text: "BAB 9 - OTOMASI TERJADWAL (SCHEDULER - ASIA/JAKARTA WIB)" },
    { type: "p", text: "Aplikasi dilengkapi mesin penjadwal otomatis dengan 8 tugas bawaan:" },
    { type: "p", text: "- 06:00 WIB: Auto Sync Artikel Blogspot      - 10:00 WIB: Auto Publish Artikel Baru" },
    { type: "p", text: "- 07:00 WIB: Auto Detection Artikel Lama     - 13:00 WIB: Auto SEO Audit Berkala" },
    { type: "p", text: "- 08:00 WIB: Auto AI Revision Engine         - 15:00 WIB: Auto Verification Postingan" },
    { type: "p", text: "- 09:00 WIB: Auto Update ke Blogspot         - 01:00 WIB: Auto Backup Database" },
    { type: "p", text: "Setiap tugas dilengkapi kuota pembaruan harian (misal: maks 10 update/hari) dan" },
    { type: "p", text: "batas artikel per batch untuk mencegah spam dan menjaga reputasi domain blog." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 10 - SOLUSI ALTERNATIF BEBAS TOKEN & API" },
    { type: "p", text: "Bila Anda ingin alternatif praktis tanpa berurusan dengan Google Cloud API sama sekali:" },
    { type: "spacer", text: "" },
    { type: "h3", text: "A. Fitur Resmi Blogger: Posting Lewat Email Rahasia (Mail-to-Blogger)" },
    { type: "p", text: "1. Buka dashboard Blogger Anda: Setelan (Settings) -> Email -> Posting menggunakan email." },
    { type: "p", text: "2. Buat alamat email rahasia, misal: namablog.rahasia123@blogger.com." },
    { type: "p", text: "3. Pilih opsi 'Segera publikasikan email'." },
    { type: "p", text: "4. Setiap kali AI selesai merevisi artikel, sistem cukup mengirimkan konten via email," },
    { type: "p", text: "   dan artikel seketika langsung terbit di Blogspot Anda tanpa API selamanya!" },
    { type: "spacer", text: "" },
    { type: "h3", text: "B. Ekspor File XML Blogger (Sekali Impor Puluhan Artikel)" },
    { type: "p", text: "1. Biarkan AI merevisi artikel dan menyimpannya di database lokal aplikasi." },
    { type: "p", text: "2. Buka dashboard Blogger -> Setelan -> Kelola Blog -> Impor Konten." },
    { type: "p", text: "3. Masukkan file XML hasil ekspor. Puluhan artikel langsung terbit dalam hitungan detik." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 11 - ROLLBACK & PEMULIHAN SATU-KLIK" },
    { type: "p", text: "Jika hasil update ingin dibatalkan:" },
    { type: "p", text: "1. Buka menu 'Update History' -> Cari artikel yang bersangkutan." },
    { type: "p", text: "2. Klik tombol merah 'Rollback ke Versi Ini'." },
    { type: "p", text: "3. Konten asli Blogspot langsung dipulihkan kembali ke server dengan URL tetap utuh." }
  ],

  // ==========================================================================
  // HALAMAN 6: PANDUAN BERGAMBAR & LOKASI FILE
  // ==========================================================================
  [
    { type: "h2", text: "BAB 12 - PANDUAN REFERENSI BERGAMBAR (SCREENSHOT)" },
    { type: "p", text: "Dokumen HTML interaktif bergambar lengkap tersedia di dalam folder docs aplikasi:" },
    { type: "code", text: "File: ...\\nusa-blogger-automation\\docs\\PETUNJUK_BERGAMBAR.html" },
    { type: "p", text: "Buka file di atas di browser Google Chrome / Microsoft Edge untuk melihat petunjuk visual:" },
    { type: "spacer", text: "" },
    { type: "h3", text: "Daftar Gambar Panduan yang Disematkan:" },
    { type: "p", text: "1. Gambar 01: Dashboard Utama - Menampilkan 10 kartu statistik, status zona waktu WIB," },
    { type: "p", text: "   dan tombol sakti '▶ Jalankan Pipeline Otomatis' di sudut kanan atas." },
    { type: "p", text: "2. Gambar 02: Menu Settings - Lokasi pengisian OpenAI API Key (sk-proj-...) dan" },
    { type: "p", text: "   pemilihan model AI (gpt-4o-mini / gpt-4o) serta skor Quality Gate." },
    { type: "p", text: "3. Gambar 03: OAuth Playground Step 1 - Memilih scope Blogger API v3:" },
    { type: "code", text: "   https://www.googleapis.com/auth/blogger" },
    { type: "p", text: "4. Gambar 04: OAuth Playground Step 2 - Lokasi menyalin Refresh Token (1//04...) dan" },
    { type: "p", text: "   tombol 'Refresh access token'." },
    { type: "p", text: "5. Gambar 05: Google Cloud Console - Lokasi Client ID dan Client Secret (GOCSPX-)." },
    { type: "p", text: "6. Gambar 06: Blog Management - Menampilkan daftar blogspot aktif Anda (blackphoneva," },
    { type: "p", text: "   isholidays) serta tombol 'Sync Artikel Blogger'." },
    { type: "spacer", text: "" },
    { type: "h2", text: "BAB 13 - LOKASI FILE & DIREKTORI PENTING DI WINDOWS 11" },
    { type: "p", text: "Seluruh data dan aset aplikasi Anda tersimpan aman di direktori berikut:" },
    { type: "spacer", text: "" },
    { type: "h3", text: "1. File Aplikasi Executable:" },
    { type: "code", text: "C:\\Users\\ASROCK\\.gemini\\antigravity\\scratch\\nusa-blogger-automation\\release\\win-unpacked\\Nusa Blogger Automation.exe" },
    { type: "spacer", text: "" },
    { type: "h3", text: "2. Database SQLite Utama (Data Artikel, Log, Akun & Jadwal):" },
    { type: "code", text: "C:\\Users\\ASROCK\\AppData\\Roaming\\nusa-blogger-automation\\data\\nusa_blogger.db" },
    { type: "spacer", text: "" },
    { type: "h3", text: "3. Folder Cadangan Otomatis (Backups):" },
    { type: "code", text: "C:\\Users\\ASROCK\\AppData\\Roaming\\nusa-blogger-automation\\data\\backups\\" },
    { type: "spacer", text: "" },
    { type: "h3", text: "4. Panduan Visual Bergambar:" },
    { type: "code", text: "C:\\Users\\ASROCK\\.gemini\antigravity\\scratch\\nusa-blogger-automation\\docs\\PETUNJUK_BERGAMBAR.html" },
    { type: "spacer", text: "" },
    { type: "callout", text: "Selamat Menggunakan Nusa Blogger Automation! Otomasi blogging Blogspot Anda kini aktif 24/7." }
  ]
];

const pdfBuffer = buildPdfDocument(pages);
const rootPdfPath = join(process.cwd(), "EBOOK_PANDUAN_NUSA_BLOGGER_AUTOMATION.pdf");
const docsPdfPath = join(process.cwd(), "docs", "EBOOK_PANDUAN_NUSA_BLOGGER_AUTOMATION.pdf");

writeFileSync(rootPdfPath, pdfBuffer);
writeFileSync(docsPdfPath, pdfBuffer);
console.log(`PDF 6-Halaman berhasil dibuat: ${rootPdfPath} (${pdfBuffer.length} bytes)`);
