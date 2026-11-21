import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import {
  computeContentHash,
  computeNextRunIso,
  decryptSecret,
  encryptSecret,
  formatJakartaTime,
  maskSecret
} from "./security";

let db: Database.Database;
let currentDbPath = "";

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database belum diinisialisasi. Panggil initializeDatabase terlebih dahulu.");
  }
  return db;
}

export function getDatabasePath(): string {
  return currentDbPath;
}

export function initializeDatabase(userDataPath: string, customDbFileName = "nusa_blogger.db") {
  const dataDir = join(userDataPath, "data");
  mkdirSync(dataDir, { recursive: true });
  currentDbPath = join(dataDir, customDbFileName);
  db = new Database(currentDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    -- 1. workspaces
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor'
        CHECK(role IN ('owner','admin','editor','viewer')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','invited','disabled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, email),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    -- 3. workspace_members
    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor'
        CHECK(role IN ('owner','admin','editor','viewer')),
      permissions_json TEXT NOT NULL DEFAULT '[]',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 4. google_accounts
    CREATE TABLE IF NOT EXISTS google_accounts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      token_reference TEXT,
      encrypted_access_token TEXT,
      encrypted_refresh_token TEXT,
      token_expires_at TEXT,
      scopes TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/blogger',
      status TEXT NOT NULL DEFAULT 'disconnected',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    -- 5. blogs
    CREATE TABLE IF NOT EXISTS blogs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      google_account_id TEXT,
      blogger_blog_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, blogger_blog_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(google_account_id) REFERENCES google_accounts(id) ON DELETE SET NULL
    );

    -- 6. blog_settings
    CREATE TABLE IF NOT EXISTS blog_settings (
      id TEXT PRIMARY KEY,
      blog_id TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL DEFAULT 'id',
      target_audience TEXT NOT NULL DEFAULT 'Pembaca Indonesia',
      writing_tone TEXT NOT NULL DEFAULT 'profesional, informatif, terpercaya',
      min_quality_score INTEGER NOT NULL DEFAULT 75,
      auto_publish_enabled INTEGER NOT NULL DEFAULT 1,
      auto_update_enabled INTEGER NOT NULL DEFAULT 1,
      max_daily_updates INTEGER NOT NULL DEFAULT 10,
      max_batch_size INTEGER NOT NULL DEFAULT 5,
      preserve_publish_date INTEGER NOT NULL DEFAULT 1,
      internal_linking_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE CASCADE
    );

    -- 9. keywords (defined before articles due to FK)
    CREATE TABLE IF NOT EXISTS keywords (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT,
      keyword TEXT NOT NULL,
      intent TEXT,
      priority INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE SET NULL
    );

    -- 7. articles
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT NOT NULL,
      keyword_id TEXT,
      blogger_post_id TEXT,
      title TEXT NOT NULL,
      content_html TEXT,
      meta_description TEXT,
      labels_json TEXT NOT NULL DEFAULT '[]',
      permalink TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','queued','published','update_pending','failed','archived')),
      detection_status TEXT NOT NULL DEFAULT 'No Update Required',
      update_decision TEXT NOT NULL DEFAULT 'Tidak update',
      priority_score INTEGER NOT NULL DEFAULT 0,
      quality_score INTEGER NOT NULL DEFAULT 0,
      seo_score INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      published_at TEXT,
      last_synced_at TEXT,
      last_detected_at TEXT,
      last_updated_at_blogger TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE CASCADE,
      FOREIGN KEY(keyword_id) REFERENCES keywords(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_blogger_post
      ON articles(blog_id, blogger_post_id)
      WHERE blogger_post_id IS NOT NULL;

    -- 8. article_revisions
    CREATE TABLE IF NOT EXISTS article_revisions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      old_title TEXT,
      new_title TEXT,
      old_content TEXT,
      new_content TEXT,
      old_meta_description TEXT,
      new_meta_description TEXT,
      change_summary TEXT,
      seo_analysis_json TEXT NOT NULL DEFAULT '{}',
      quality_gate_json TEXT NOT NULL DEFAULT '{}',
      quality_score INTEGER NOT NULL DEFAULT 0,
      update_recommendation TEXT,
      applied_to_blogger INTEGER NOT NULL DEFAULT 0,
      is_backup_snapshot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    -- 10. media_assets
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT,
      article_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/svg+xml',
      url TEXT NOT NULL,
      alt_text TEXT NOT NULL,
      caption TEXT,
      source_type TEXT NOT NULL DEFAULT 'ai_generated',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE SET NULL,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
    );

    -- 11. automation_jobs
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT,
      article_id TEXT,
      job_type TEXT NOT NULL CHECK(job_type IN ('generate','publish','update','sync','audit','detect','revise','backup','verify')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','processing','completed','failed','cancelled','skipped')),
      idempotency_key TEXT UNIQUE,
      locked_by TEXT,
      locked_at TEXT,
      scheduled_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE SET NULL,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
    );

    -- 12. schedules
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT,
      name TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN (
        'auto_sync',
        'auto_detection',
        'auto_revision',
        'auto_publish',
        'auto_update',
        'auto_seo_audit',
        'auto_backup',
        'auto_verification'
      )),
      cron_expression TEXT NOT NULL DEFAULT '0 */6 * * *',
      frequency_minutes INTEGER NOT NULL DEFAULT 360,
      execution_time TEXT NOT NULL DEFAULT '08:00',
      timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
      max_batch_size INTEGER NOT NULL DEFAULT 5,
      max_daily_updates INTEGER NOT NULL DEFAULT 10,
      min_priority_score INTEGER NOT NULL DEFAULT 50,
      api_quota_limit INTEGER NOT NULL DEFAULT 100,
      retry_limit INTEGER NOT NULL DEFAULT 3,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE SET NULL
    );

    -- 13. job_logs
    CREATE TABLE IF NOT EXISTS job_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
    );

    -- 14. ai_settings
    CREATE TABLE IF NOT EXISTS ai_settings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'openai',
      model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      encrypted_api_key TEXT,
      temperature REAL NOT NULL DEFAULT 0.3,
      max_tokens INTEGER NOT NULL DEFAULT 4096,
      min_quality_gate INTEGER NOT NULL DEFAULT 75,
      strict_fact_check INTEGER NOT NULL DEFAULT 1,
      total_requests INTEGER NOT NULL DEFAULT 0,
      total_tokens_used INTEGER NOT NULL DEFAULT 0,
      daily_token_limit INTEGER NOT NULL DEFAULT 250000,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    -- 15. update_reports
    CREATE TABLE IF NOT EXISTS update_reports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      blog_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      revision_id TEXT,
      blogger_post_id TEXT,
      action_taken TEXT NOT NULL,
      detection_status TEXT NOT NULL,
      decision_reason TEXT NOT NULL,
      before_score INTEGER NOT NULL DEFAULT 0,
      after_score INTEGER NOT NULL DEFAULT 0,
      url_preserved INTEGER NOT NULL DEFAULT 1,
      post_id_preserved INTEGER NOT NULL DEFAULT 1,
      verified_via_api INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(blog_id) REFERENCES blogs(id) ON DELETE CASCADE,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    -- 16. source_references
    CREATE TABLE IF NOT EXISTS source_references (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      publisher TEXT,
      published_date TEXT,
      claim_supported TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    -- Additional operational tables: audit_logs & app_settings
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_email TEXT NOT NULL DEFAULT 'admin@nusablogger.id',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO app_settings(key, value) VALUES
      ('approval_mode', 'auto'),
      ('account_limit', 'unlimited'),
      ('deployment_mode', 'team'),
      ('timezone', 'Asia/Jakarta'),
      ('postgres_url', 'postgresql://postgres:postgres@localhost:5432/nusa_blogger'),
      ('active_workspace_id', 'default-workspace'),
      ('active_user_role', 'owner');

    INSERT OR IGNORE INTO workspaces(id, name)
      VALUES ('default-workspace', 'Nusa Workspace');
  `);

  runSafeColumnMigrations();
  seedInitialWorkspaceData();
}

function runSafeColumnMigrations() {
  const safeAlter = (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      // Column already exists
    }
  };
  safeAlter("ALTER TABLE google_accounts ADD COLUMN encrypted_access_token TEXT");
  safeAlter("ALTER TABLE google_accounts ADD COLUMN encrypted_refresh_token TEXT");
  safeAlter("ALTER TABLE google_accounts ADD COLUMN token_expires_at TEXT");
  safeAlter("ALTER TABLE google_accounts ADD COLUMN client_id TEXT");
  safeAlter("ALTER TABLE google_accounts ADD COLUMN encrypted_client_secret TEXT");
  safeAlter("ALTER TABLE google_accounts ADD COLUMN scopes TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/blogger'");
  safeAlter("ALTER TABLE blogs ADD COLUMN last_synced_at TEXT");
  safeAlter("ALTER TABLE articles ADD COLUMN detection_status TEXT NOT NULL DEFAULT 'No Update Required'");
  safeAlter("ALTER TABLE articles ADD COLUMN update_decision TEXT NOT NULL DEFAULT 'Tidak update'");
  safeAlter("ALTER TABLE articles ADD COLUMN priority_score INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE articles ADD COLUMN quality_score INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE articles ADD COLUMN seo_score INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE articles ADD COLUMN last_detected_at TEXT");
  safeAlter("ALTER TABLE articles ADD COLUMN last_updated_at_blogger TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN old_title TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN new_title TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN old_meta_description TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN new_meta_description TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN seo_analysis_json TEXT NOT NULL DEFAULT '{}'");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN quality_gate_json TEXT NOT NULL DEFAULT '{}'");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN quality_score INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN update_recommendation TEXT");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN applied_to_blogger INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE article_revisions ADD COLUMN is_backup_snapshot INTEGER NOT NULL DEFAULT 0");
  safeAlter("ALTER TABLE automation_jobs ADD COLUMN idempotency_key TEXT");
  safeAlter("ALTER TABLE automation_jobs ADD COLUMN locked_by TEXT");
  safeAlter("ALTER TABLE automation_jobs ADD COLUMN locked_at TEXT");
  safeAlter("ALTER TABLE automation_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3");
  safeAlter("ALTER TABLE automation_jobs ADD COLUMN result_json TEXT NOT NULL DEFAULT '{}'");
}

function seedInitialWorkspaceData() {
  const workspaceId = "default-workspace";

  // Seed default AI settings
  db.prepare(`
    INSERT OR IGNORE INTO ai_settings(
      id, workspace_id, provider, model, temperature, max_tokens, min_quality_gate, strict_fact_check
    ) VALUES (?, ?, 'openai', 'gpt-4o-mini', 0.3, 4096, 75, 1)
  `).run("ai-default-workspace", workspaceId);

  // Seed default team users & workspace_members if none
  const userCount = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE workspace_id = ?").get(workspaceId) as { c: number }).c;
  if (userCount === 0) {
    const ownerId = "user-owner-1";
    const editorId = "user-editor-1";
    db.prepare(
      "INSERT INTO users(id, workspace_id, display_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ownerId, workspaceId, "Budi Santoso (Owner)", "admin@nusablogger.id", "owner", "active");
    db.prepare(
      "INSERT INTO users(id, workspace_id, display_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(editorId, workspaceId, "Siti Rahma (SEO Editor)", "editor@nusablogger.id", "editor", "active");

    db.prepare(
      "INSERT OR IGNORE INTO workspace_members(id, workspace_id, user_id, role, permissions_json) VALUES (?, ?, ?, ?, ?)"
    ).run("wm-owner-1", workspaceId, ownerId, "owner", JSON.stringify(["all"]));
    db.prepare(
      "INSERT OR IGNORE INTO workspace_members(id, workspace_id, user_id, role, permissions_json) VALUES (?, ?, ?, ?, ?)"
    ).run("wm-editor-1", workspaceId, editorId, "editor", JSON.stringify(["article:write", "article:publish"]));
  }

  // Seed default Google Account & Blog if none exist
  const blogCount = (db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE workspace_id = ?").get(workspaceId) as { c: number }).c;
  if (blogCount === 0) {
    const accountId = "ga-nusa-primary";
    db.prepare(`
      INSERT INTO google_accounts(
        id, workspace_id, email, display_name, token_reference, encrypted_access_token, encrypted_refresh_token, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')
    `).run(
      accountId,
      workspaceId,
      "publisher@nusadigital.id",
      "Nusa Digital Publisher",
      "oauth2:google:nusa-primary",
      encryptSecret("ya29.nusa_simulated_blogger_token_active"),
      encryptSecret("1//0g_nusa_simulated_refresh_token")
    );

    const blogId = "blog-nusa-tekno";
    db.prepare(`
      INSERT INTO blogs(id, workspace_id, google_account_id, blogger_blog_id, name, url, status, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      blogId,
      workspaceId,
      accountId,
      "8492019384756102938",
      "Nusa Tekno & Bisnis",
      "https://nusatekno-id.blogspot.com",
      new Date().toISOString()
    );

    db.prepare(`
      INSERT OR IGNORE INTO blog_settings(
        id, blog_id, language, target_audience, writing_tone, min_quality_score,
        auto_publish_enabled, auto_update_enabled, max_daily_updates, max_batch_size,
        preserve_publish_date, internal_linking_active
      ) VALUES (?, ?, 'id', 'Profesional & UMKM Indonesia', 'informatif, akurat, ramah SEO', 75, 1, 1, 10, 5, 1, 1)
    `).run("bs-nusa-tekno", blogId);

    // Seed keywords
    const kw1 = "kw-cloud-umkm";
    const kw2 = "kw-keamanan-siber";
    const kw3 = "kw-otomatisasi-blog";
    db.prepare(`
      INSERT INTO keywords(id, workspace_id, blog_id, keyword, intent, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(kw1, workspaceId, blogId, "panduan cloud computing untuk umkm", "informational", 5, "used");
    db.prepare(`
      INSERT INTO keywords(id, workspace_id, blog_id, keyword, intent, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(kw2, workspaceId, blogId, "cara mengamankan akun bisnis dari phishing", "informational", 4, "used");
    db.prepare(`
      INSERT INTO keywords(id, workspace_id, blog_id, keyword, intent, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(kw3, workspaceId, blogId, "strategi seo blogspot untuk bisnis lokal", "commercial", 5, "queued");

    // Seed realistic Blogger articles with genuine blogger_post_id
    // Article 1: Outdated 2022 article needing AI Revision
    const a1Title = "Panduan Cloud Computing untuk UMKM di Tahun 2022";
    const a1Html = `<p>Panduan cloud computing untuk UMKM pada tahun 2022 membantu pelaku usaha menyimpan dokumen kerja secara daring.</p>
<h2>Mengapa UMKM Membutuhkan Cloud</h2>
<p>Pada 2022, adopsi layanan komputasi awan mulai meningkat di berbagai kota. Biaya server fisik masih cukup mahal bagi usaha kecil.</p>
<img src="https://nusatekno-id.blogspot.com/images/cloud-2022.png" />
<p>Gunakan penyimpanan cloud agar tim dapat bekerja dari mana saja.</p>`;
    db.prepare(`
      INSERT INTO articles(
        id, workspace_id, blog_id, keyword_id, blogger_post_id, title, content_html,
        meta_description, labels_json, permalink, url, status, content_hash, published_at, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, '2022-04-12T08:30:00Z', ?)
    `).run(
      "art-blogger-1001",
      workspaceId,
      blogId,
      kw1,
      "post-77881001",
      a1Title,
      a1Html,
      "Panduan singkat cloud UMKM 2022.",
      JSON.stringify(["Cloud", "UMKM", "Teknologi"]),
      "2022/04/panduan-cloud-computing-umkm.html",
      "https://nusatekno-id.blogspot.com/2022/04/panduan-cloud-computing-umkm.html",
      computeContentHash(a1Title, a1Html),
      new Date().toISOString()
    );

    // Source reference for Article 1
    db.prepare(`
      INSERT INTO source_references(id, article_id, title, url, publisher, published_date, claim_supported, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      "src-1001",
      "art-blogger-1001",
      "Pedoman Transformasi Digital UMKM Indonesia",
      "https://kominfo.go.id/pedoman-umkm-digital",
      "Kementerian Komunikasi dan Digital",
      "2025-11-10",
      "Adopsi cloud computing membantu efisiensi operasional dan kolaborasi jarak jauh bagi UMKM."
    );

    // Article 2: SEO Optimization Required (good length, missing meta description, missing alt text, weak headings)
    const a2Title = "Cara Mengamankan Akun Bisnis dari Phishing dan Pencurian Data";
    const a2Html = `<p>Cara mengamankan akun bisnis dari phishing sangat penting bagi seluruh perusahaan digital maupun toko daring di Indonesia. Serangan rekayasa sosial sering menargetkan email karyawan.</p>
<p>Langkah pertama adalah mengaktifkan autentikasi dua faktor (2FA) pada semua akun email, dashboard perbankan, dan manajemen toko. Jangan pernah membagikan kode OTP kepada siapa pun.</p>
<p>Selain itu, lakukan pelatihan rutin kepada anggota tim untuk mengenali tautan palsu, memeriksa domain pengirim email, dan menggunakan pengelola kata sandi terenkripsi.</p>
<p>Pastikan sistem pencadangan data berjalan otomatis setiap minggu agar operasional bisnis tetap aman apabila terjadi insiden keamanan siber.</p>
<img src="https://nusatekno-id.blogspot.com/images/security-shield.png" />`;
    db.prepare(`
      INSERT INTO articles(
        id, workspace_id, blog_id, keyword_id, blogger_post_id, title, content_html,
        meta_description, labels_json, permalink, url, status, content_hash, published_at, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, '2025-09-15T09:00:00Z', ?)
    `).run(
      "art-blogger-1002",
      workspaceId,
      blogId,
      kw2,
      "post-77881002",
      a2Title,
      a2Html,
      "",
      JSON.stringify(["Keamanan Siber", "Bisnis"]),
      "2025/09/cara-mengamankan-akun-bisnis-phishing.html",
      "https://nusatekno-id.blogspot.com/2025/09/cara-mengamankan-akun-bisnis-phishing.html",
      computeContentHash(a2Title, a2Html),
      new Date().toISOString()
    );

    db.prepare(`
      INSERT INTO source_references(id, article_id, title, url, publisher, published_date, claim_supported, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      "src-1002",
      "art-blogger-1002",
      "Panduan Keamanan Siber BSSN untuk Organisasi",
      "https://bssn.go.id/panduan-keamanan-akun",
      "Badan Siber dan Sandi Negara (BSSN)",
      "2025-08-20",
      "Autentikasi dua faktor (2FA) dan edukasi anti-phishing menurunkan risiko pengambilalihan akun."
    );

    // Article 3: Well-optimized recent article (No Update Required)
    const a3Title = "Arsitektur Manajemen Inventaris Digital untuk Ritel Modern";
    const a3Html = `<p>Arsitektur manajemen inventaris digital untuk ritel modern membantu pemilik toko memantau pergerakan stok secara akurat dan real-time di berbagai cabang.</p>
<h2>Komponen Utama Sistem Inventaris</h2>
<p>Sistem inventaris modern mengintegrasikan pencatatan barang masuk, pemindaian barcode di kasir, serta peringatan stok minimum secara otomatis agar tidak terjadi kehabisan barang.</p>
<h3>Integrasi Laporan Keuangan dan Gudang</h3>
<p>Dengan menghubungkan data gudang dan pencatatan penjualan, manajemen dapat menyusun proyeksi pengadaan barang yang jauh lebih presisi. Pelajari juga <a href="https://nusatekno-id.blogspot.com/2025/09/cara-mengamankan-akun-bisnis-phishing.html">cara mengamankan akun bisnis dari phishing</a> untuk menjaga keamanan akses sistem kasir Anda.</p>
<h2>Manfaat Jangka Panjang bagi Ritel</h2>
<p>Standarisasi proses opname stok mengurangi selisih pencatatan dan mempercepat layanan pelanggan di seluruh saluran distribusi.</p>
<h2>Pertanyaan Umum (FAQ)</h2>
<h3>Apakah sistem inventaris digital cocok untuk toko skala kecil?</h3>
<p>Ya, sistem berbasis cloud dapat digunakan mulai dari satu gerai hingga puluhan cabang dengan biaya terukur.</p>
<img src="https://nusatekno-id.blogspot.com/images/inventory-architecture.png" alt="Arsitektur manajemen inventaris digital untuk ritel modern" />`;
    db.prepare(`
      INSERT INTO articles(
        id, workspace_id, blog_id, keyword_id, blogger_post_id, title, content_html,
        meta_description, labels_json, permalink, url, status, detection_status, update_decision,
        priority_score, quality_score, seo_score, content_hash, published_at, last_synced_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'published', 'No Update Required', 'Tidak update', 12, 92, 94, ?, '2026-10-10T10:00:00Z', ?)
    `).run(
      "art-blogger-1003",
      workspaceId,
      blogId,
      "post-77881003",
      a3Title,
      a3Html,
      "Pelajari arsitektur manajemen inventaris digital untuk ritel modern guna mengoptimalkan kontrol stok gudang, integrasi kasir, dan akurasi laporan.",
      JSON.stringify(["Ritel", "Inventaris", "Sistem Informasi"]),
      "2026/10/arsitektur-manajemen-inventaris-digital.html",
      "https://nusatekno-id.blogspot.com/2026/10/arsitektur-manajemen-inventaris-digital.html",
      computeContentHash(a3Title, a3Html),
      new Date().toISOString()
    );

    // Seed all 8 default scheduler tasks in Asia/Jakarta
    const defaultSchedules: Array<[string, string, string, number, string]> = [
      ["sch-sync", "Auto Sync Artikel Blogspot", "auto_sync", 180, "06:00"],
      ["sch-detect", "Auto Detection Artikel Lama", "auto_detection", 240, "07:00"],
      ["sch-revise", "Auto AI Revision Engine", "auto_revision", 360, "08:00"],
      ["sch-update", "Auto Update ke Blogspot", "auto_update", 360, "09:00"],
      ["sch-publish", "Auto Publish Artikel Baru", "auto_publish", 720, "10:00"],
      ["sch-seo", "Auto SEO Audit Berkala", "auto_seo_audit", 720, "13:00"],
      ["sch-backup", "Auto Backup Database & Revisi", "auto_backup", 1440, "01:00"],
      ["sch-verify", "Auto Verification Postingan", "auto_verification", 360, "15:00"]
    ];
    for (const [id, name, taskType, freq, execTime] of defaultSchedules) {
      db.prepare(`
        INSERT OR IGNORE INTO schedules(
          id, workspace_id, blog_id, name, task_type, frequency_minutes, execution_time,
          timezone, max_batch_size, max_daily_updates, min_priority_score, api_quota_limit, retry_limit, enabled, next_run_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Asia/Jakarta', 5, 10, 45, 100, 3, 1, ?)
      `).run(id, workspaceId, blogId, name, taskType, freq, execTime, computeNextRunIso(freq));
    }
  }
}

export function getActiveWorkspaceId(): string {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'active_workspace_id'")
    .get() as { value: string } | undefined;
  return row?.value || "default-workspace";
}

export function setActiveWorkspaceId(workspaceId: string) {
  db.prepare(`
    INSERT INTO app_settings(key, value, updated_at) VALUES ('active_workspace_id', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(workspaceId);
  return { activeWorkspaceId: workspaceId };
}

export function logAudit(
  workspaceId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
  actorEmail = "admin@nusablogger.id"
) {
  db.prepare(`
    INSERT INTO audit_logs(id, workspace_id, actor_email, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), workspaceId, actorEmail, action, entityType, entityId ?? null, details ?? null);
}

export function getDashboardStats(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  const countWs = (table: string, extraWhere = "") =>
    (
      db
        .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE workspace_id = ? ${extraWhere}`)
        .get(wsId) as { total: number }
    ).total;

  const totalWorkspaces = (db.prepare("SELECT COUNT(*) AS total FROM workspaces").get() as { total: number }).total;
  const aiRow = db
    .prepare("SELECT total_requests, total_tokens_used, daily_token_limit, model FROM ai_settings WHERE workspace_id = ?")
    .get(wsId) as
    | { total_requests: number; total_tokens_used: number; daily_token_limit: number; model: string }
    | undefined;

  const nextSchedule = db
    .prepare(
      "SELECT name, task_type, next_run_at, execution_time, timezone FROM schedules WHERE workspace_id = ? AND enabled = 1 ORDER BY next_run_at ASC LIMIT 1"
    )
    .get(wsId) as
    | { name: string; task_type: string; next_run_at: string; execution_time: string; timezone: string }
    | undefined;

  const recentActivities = db
    .prepare(
      "SELECT id, action, entity_type AS entityType, details, created_at AS createdAt FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 8"
    )
    .all(wsId) as Array<{ id: string; action: string; entityType: string; details: string; createdAt: string }>;

  const articlesNeedingUpdate = countWs(
    "articles",
    "AND detection_status IN ('Update Recommended','SEO Optimization Required','Content Revision Required','Manual Review Required')"
  );
  const articlesUpdated = (
    db
      .prepare("SELECT COUNT(*) AS total FROM update_reports WHERE workspace_id = ? AND action_taken = 'updated'")
      .get(wsId) as { total: number }
  ).total;
  const articlesFailed = (
    db
      .prepare("SELECT COUNT(*) AS total FROM update_reports WHERE workspace_id = ? AND action_taken = 'failed'")
      .get(wsId) as { total: number }
  ).total;
  const articlesSkipped = (
    db
      .prepare("SELECT COUNT(*) AS total FROM update_reports WHERE workspace_id = ? AND action_taken = 'skipped'")
      .get(wsId) as { total: number }
  ).total;
  const totalPublished = countWs("articles", "AND status = 'published'");

  return {
    workspaces: totalWorkspaces,
    activeWorkspaceId: wsId,
    users: countWs("users"),
    blogs: countWs("blogs"),
    articles: countWs("articles"),
    articlesNeedingUpdate,
    articlesUpdated,
    articlesFailed,
    articlesSkipped,
    totalPublished,
    pendingJobs: countWs("automation_jobs", "AND status = 'pending'"),
    failedJobs: countWs("automation_jobs", "AND status = 'failed'"),
    completedJobs: countWs("automation_jobs", "AND status = 'completed'"),
    aiUsage: {
      requests: aiRow?.total_requests ?? 0,
      tokensUsed: aiRow?.total_tokens_used ?? 0,
      dailyLimit: aiRow?.daily_token_limit ?? 250000,
      model: aiRow?.model ?? "gpt-4o-mini"
    },
    nextSchedule: nextSchedule
      ? {
          name: nextSchedule.name,
          taskType: nextSchedule.task_type,
          nextRunAt: formatJakartaTime(nextSchedule.next_run_at),
          executionTime: nextSchedule.execution_time,
          timezone: nextSchedule.timezone
        }
      : null,
    recentActivities: recentActivities.map((a) => ({
      ...a,
      createdAtWib: formatJakartaTime(a.createdAt)
    }))
  };
}

export function listWorkspaces() {
  return db.prepare("SELECT id, name, created_at AS createdAt FROM workspaces ORDER BY created_at").all() as Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
}

export function createWorkspace(name: string) {
  const id = randomUUID();
  db.prepare("INSERT INTO workspaces(id, name) VALUES (?, ?)").run(id, name);
  db.prepare(`
    INSERT OR IGNORE INTO ai_settings(
      id, workspace_id, provider, model, temperature, max_tokens, min_quality_gate, strict_fact_check
    ) VALUES (?, ?, 'openai', 'gpt-4o-mini', 0.3, 4096, 75, 1)
  `).run(randomUUID(), id);
  logAudit(id, "workspace.create", "workspace", id, `Workspace '${name}' dibuat.`);
  return { id, name };
}

// ============================================================================
// GOOGLE ACCOUNTS & BLOG MANAGEMENT
// ============================================================================

export function listGoogleAccounts(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  const rows = db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, email, display_name AS displayName,
              token_reference AS tokenReference, encrypted_access_token, encrypted_refresh_token,
              client_id, encrypted_client_secret, token_expires_at, status, created_at AS createdAt
       FROM google_accounts WHERE workspace_id = ? ORDER BY created_at DESC`
    )
    .all(wsId) as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const decrypted = decryptSecret(r.encrypted_access_token as string | null);
    const hasRefresh = Boolean(decryptSecret(r.encrypted_refresh_token as string | null));
    const hasSecret = Boolean(decryptSecret(r.encrypted_client_secret as string | null));
    const clientId = r.client_id ? String(r.client_id) : "";
    const autoRefreshCapable = hasRefresh && Boolean(clientId) && hasSecret;

    return {
      id: String(r.id),
      workspaceId: String(r.workspaceId),
      email: String(r.email),
      displayName: String(r.displayName || r.email),
      tokenReference: String(r.tokenReference || ""),
      maskedToken: maskSecret(decrypted),
      hasValidToken: Boolean(decrypted),
      hasRefreshToken: hasRefresh,
      hasClientCredentials: Boolean(clientId) && hasSecret,
      autoRefreshActive: autoRefreshCapable,
      tokenExpiresAt: r.token_expires_at ? String(r.token_expires_at) : null,
      status: String(r.status),
      createdAt: String(r.createdAt)
    };
  });
}

export function connectGoogleAccount(input: {
  workspaceId?: string;
  email: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const wsId = input.workspaceId || getActiveWorkspaceId();
  const encAccess = input.accessToken?.trim() ? encryptSecret(input.accessToken.trim()) : null;
  const encRefresh = input.refreshToken?.trim() ? encryptSecret(input.refreshToken.trim()) : null;
  const encSecret = input.clientSecret?.trim() ? encryptSecret(input.clientSecret.trim()) : null;
  const clientId = input.clientId?.trim() || null;
  const email = input.email.trim();
  const displayName = input.displayName?.trim() || email;

  // Check if account already exists for this email
  const existing = db
    .prepare("SELECT id FROM google_accounts WHERE workspace_id = ? AND email = ?")
    .get(wsId, email) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE google_accounts
      SET display_name = ?,
          encrypted_access_token = COALESCE(?, encrypted_access_token),
          encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
          client_id = COALESCE(?, client_id),
          encrypted_client_secret = COALESCE(?, encrypted_client_secret),
          status = 'connected'
      WHERE id = ?
    `).run(displayName, encAccess, encRefresh, clientId, encSecret, existing.id);

    logAudit(wsId, "google_account.update", "google_account", existing.id, `Akun Google ${email} diperbarui.`);
    return { id: existing.id, email, status: "connected" };
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO google_accounts(
      id, workspace_id, email, display_name, token_reference,
      encrypted_access_token, encrypted_refresh_token, client_id, encrypted_client_secret, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected')
  `).run(
    id,
    wsId,
    email,
    displayName,
    `oauth2:google:${id.slice(0, 8)}`,
    encAccess,
    encRefresh,
    clientId,
    encSecret
  );

  logAudit(wsId, "google_account.connect", "google_account", id, `Akun Google ${email} dihubungkan.`);
  return { id, email, status: "connected" };
}

export function getGoogleAccountDecryptedToken(accountId: string): string {
  const row = db
    .prepare("SELECT encrypted_access_token FROM google_accounts WHERE id = ?")
    .get(accountId) as { encrypted_access_token: string | null } | undefined;
  return decryptSecret(row?.encrypted_access_token);
}

/**
 * Automatically requests a fresh access_token from Google OAuth 2.0 endpoint using the stored refresh_token.
 */
export async function refreshGoogleAccessToken(accountId: string): Promise<string> {
  const row = db
    .prepare(
      `SELECT id, email, client_id, encrypted_client_secret, encrypted_refresh_token, encrypted_access_token
       FROM google_accounts WHERE id = ?`
    )
    .get(accountId) as {
      id: string;
      email: string;
      client_id: string | null;
      encrypted_client_secret: string | null;
      encrypted_refresh_token: string | null;
      encrypted_access_token: string | null;
    } | undefined;

  if (!row) throw new Error("Akun Google tidak ditemukan.");

  const refreshToken = decryptSecret(row.encrypted_refresh_token);
  const clientSecret = decryptSecret(row.encrypted_client_secret);
  const clientId = row.client_id?.trim();

  if (!refreshToken) {
    throw new Error("Refresh token belum diisi. Masukkan Refresh Token dari Google Cloud / Playground.");
  }

  if (!clientId || !clientSecret) {
    throw new Error("Client ID & Client Secret wajib diisi agar sistem bisa melakukan auto-refresh otomatis selamanya.");
  }

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth Refresh Error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  const encAccess = encryptSecret(data.access_token);

  db.prepare(`
    UPDATE google_accounts
    SET encrypted_access_token = ?, token_expires_at = ?, status = 'connected'
    WHERE id = ?
  `).run(encAccess, expiresAt, accountId);

  logAudit(
    "default-workspace",
    "google_account.refresh_token",
    "google_account",
    accountId,
    `Token akses Google untuk ${row.email} berhasil diperpanjang otomatis secara permanen (berlaku s.d. ${expiresAt}).`
  );

  return data.access_token;
}

/**
 * Returns a valid access token. If expired and auto-refresh credentials exist, automatically refreshes it.
 */
export async function getValidGoogleAccessToken(accountId: string): Promise<string> {
  const row = db
    .prepare(
      `SELECT id, encrypted_access_token, encrypted_refresh_token, token_expires_at, client_id, encrypted_client_secret
       FROM google_accounts WHERE id = ?`
    )
    .get(accountId) as {
      id: string;
      encrypted_access_token: string | null;
      encrypted_refresh_token: string | null;
      token_expires_at: string | null;
      client_id: string | null;
      encrypted_client_secret: string | null;
    } | undefined;

  if (!row) return "";

  const hasRefresh = Boolean(
    row.encrypted_refresh_token && row.client_id && row.encrypted_client_secret
  );

  const isExpired = row.token_expires_at
    ? new Date(row.token_expires_at).getTime() <= Date.now() + 120000
    : false;

  if (hasRefresh && (isExpired || !row.encrypted_access_token)) {
    try {
      return await refreshGoogleAccessToken(accountId);
    } catch {
      // Fallback to decrypted existing token
    }
  }

  return decryptSecret(row.encrypted_access_token);
}

export function listBlogs(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT b.id, b.workspace_id AS workspaceId, b.google_account_id AS googleAccountId,
              b.blogger_blog_id AS bloggerBlogId, b.name, b.url, b.status, b.last_synced_at AS lastSyncedAt,
              g.email AS accountEmail,
              bs.language, bs.target_audience AS targetAudience, bs.writing_tone AS writingTone,
              bs.min_quality_score AS minQualityScore, bs.auto_publish_enabled AS autoPublishEnabled,
              bs.auto_update_enabled AS autoUpdateEnabled, bs.max_daily_updates AS maxDailyUpdates,
              bs.max_batch_size AS maxBatchSize, bs.preserve_publish_date AS preservePublishDate,
              bs.internal_linking_active AS internalLinkingActive,
              (SELECT COUNT(*) FROM articles a WHERE a.blog_id = b.id) AS articleCount
       FROM blogs b
       LEFT JOIN google_accounts g ON g.id = b.google_account_id
       LEFT JOIN blog_settings bs ON bs.blog_id = b.id
       WHERE b.workspace_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(wsId);
}

export function createOrUpdateBlog(input: {
  workspaceId?: string;
  googleAccountId?: string;
  bloggerBlogId: string;
  name: string;
  url: string;
  minQualityScore?: number;
  maxDailyUpdates?: number;
  writingTone?: string;
}) {
  const wsId = input.workspaceId || getActiveWorkspaceId();
  const existing = db
    .prepare("SELECT id FROM blogs WHERE workspace_id = ? AND blogger_blog_id = ?")
    .get(wsId, input.bloggerBlogId.trim()) as { id: string } | undefined;

  const blogId = existing?.id || randomUUID();
  if (existing) {
    db.prepare(`
      UPDATE blogs SET name = ?, url = ?, google_account_id = COALESCE(?, google_account_id)
      WHERE id = ?
    `).run(input.name.trim(), input.url.trim(), input.googleAccountId || null, blogId);
  } else {
    db.prepare(`
      INSERT INTO blogs(id, workspace_id, google_account_id, blogger_blog_id, name, url, status, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      blogId,
      wsId,
      input.googleAccountId || null,
      input.bloggerBlogId.trim(),
      input.name.trim(),
      input.url.trim(),
      new Date().toISOString()
    );
  }

  db.prepare(`
    INSERT INTO blog_settings(
      id, blog_id, min_quality_score, max_daily_updates, writing_tone
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(blog_id) DO UPDATE SET
      min_quality_score = excluded.min_quality_score,
      max_daily_updates = excluded.max_daily_updates,
      writing_tone = excluded.writing_tone,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    randomUUID(),
    blogId,
    input.minQualityScore ?? 75,
    input.maxDailyUpdates ?? 10,
    input.writingTone || "informatif, akurat, ramah SEO"
  );

  logAudit(wsId, "blog.upsert", "blog", blogId, `Blog '${input.name}' (${input.bloggerBlogId}) disimpan.`);
  return { id: blogId, bloggerBlogId: input.bloggerBlogId, name: input.name, url: input.url };
}

// ============================================================================
// KEYWORDS & SOURCE REFERENCES
// ============================================================================

export function listKeywords(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT k.id, k.workspace_id AS workspaceId, k.blog_id AS blogId, b.name AS blogName,
              k.keyword, k.intent, k.priority, k.status, k.created_at AS createdAt
       FROM keywords k
       LEFT JOIN blogs b ON b.id = k.blog_id
       WHERE k.workspace_id = ?
       ORDER BY k.priority DESC, k.created_at DESC`
    )
    .all(wsId);
}

export function addKeyword(input: {
  workspaceId?: string;
  blogId: string;
  keyword: string;
  intent?: string;
  priority?: number;
}) {
  const wsId = input.workspaceId || getActiveWorkspaceId();
  const id = randomUUID();
  const kw = input.keyword.trim();
  const detectedIntent =
    input.intent ||
    (kw.match(/beli|harga|jasa|paket|murah|terbaik/i)
      ? "commercial"
      : kw.match(/cara|panduan|apa itu|tips|tutorial/i)
      ? "informational"
      : "informational");

  db.prepare(`
    INSERT INTO keywords(id, workspace_id, blog_id, keyword, intent, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, 'queued')
  `).run(id, wsId, input.blogId, kw, detectedIntent, input.priority ?? 3);

  logAudit(wsId, "keyword.add", "keyword", id, `Keyword '${kw}' (${detectedIntent}) ditambahkan.`);
  return { id, keyword: kw, intent: detectedIntent, priority: input.priority ?? 3, status: "queued" };
}

export function listSourceReferences(articleId: string) {
  return db
    .prepare(
      `SELECT id, article_id AS articleId, title, url, publisher,
              published_date AS publishedDate, claim_supported AS claimSupported,
              verified, created_at AS createdAt
       FROM source_references WHERE article_id = ? ORDER BY created_at DESC`
    )
    .all(articleId) as Array<{
    id: string;
    articleId: string;
    title: string;
    url: string;
    publisher: string | null;
    publishedDate: string | null;
    claimSupported: string;
    verified: number;
    createdAt: string;
  }>;
}

export function addSourceReference(input: {
  articleId: string;
  title: string;
  url: string;
  publisher?: string;
  publishedDate?: string;
  claimSupported: string;
  verified?: boolean;
}) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO source_references(id, article_id, title, url, publisher, published_date, claim_supported, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.articleId,
    input.title.trim(),
    input.url.trim(),
    input.publisher?.trim() || "Sumber Resmi",
    input.publishedDate || new Date().toISOString().slice(0, 10),
    input.claimSupported.trim(),
    input.verified === false ? 0 : 1
  );
  return { id, ...input };
}

// ============================================================================
// ARTICLES, REVISIONS & UPDATE REPORTS
// ============================================================================

export function listArticles(workspaceId?: string, blogId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  const params: unknown[] = [wsId];
  let blogFilter = "";
  if (blogId) {
    blogFilter = "AND a.blog_id = ?";
    params.push(blogId);
  }
  const rows = db
    .prepare(
      `SELECT a.id, a.workspace_id AS workspaceId, a.blog_id AS blogId, b.name AS blogName,
              a.keyword_id AS keywordId, k.keyword AS targetKeyword, k.intent AS searchIntent,
              a.blogger_post_id AS bloggerPostId, a.title, a.content_html AS contentHtml,
              a.meta_description AS metaDescription, a.labels_json AS labelsJson,
              a.permalink, a.url, a.status, a.detection_status AS detectionStatus,
              a.update_decision AS updateDecision, a.priority_score AS priorityScore,
              a.quality_score AS qualityScore, a.seo_score AS seoScore,
              a.content_hash AS contentHash, a.published_at AS publishedAt,
              a.last_synced_at AS lastSyncedAt, a.last_detected_at AS lastDetectedAt,
              a.last_updated_at_blogger AS lastUpdatedAtBlogger,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM article_revisions r WHERE r.article_id = a.id) AS revisionCount
       FROM articles a
       LEFT JOIN blogs b ON b.id = a.blog_id
       LEFT JOIN keywords k ON k.id = a.keyword_id
       WHERE a.workspace_id = ? ${blogFilter}
       ORDER BY a.priority_score DESC, a.updated_at DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...r,
    labels: JSON.parse(String(r.labelsJson || "[]")) as string[],
    sources: listSourceReferences(String(r.id))
  }));
}

export function getArticleById(articleId: string) {
  const row = db
    .prepare(
      `SELECT a.id, a.workspace_id AS workspaceId, a.blog_id AS blogId, b.name AS blogName,
              b.blogger_blog_id AS bloggerBlogId, b.url AS blogUrl, b.google_account_id AS googleAccountId,
              a.keyword_id AS keywordId, k.keyword AS targetKeyword, k.intent AS searchIntent,
              a.blogger_post_id AS bloggerPostId, a.title, a.content_html AS contentHtml,
              a.meta_description AS metaDescription, a.labels_json AS labelsJson,
              a.permalink, a.url, a.status, a.detection_status AS detectionStatus,
              a.update_decision AS updateDecision, a.priority_score AS priorityScore,
              a.quality_score AS qualityScore, a.seo_score AS seoScore,
              a.content_hash AS contentHash, a.published_at AS publishedAt,
              a.last_synced_at AS lastSyncedAt, a.last_detected_at AS lastDetectedAt,
              a.last_updated_at_blogger AS lastUpdatedAtBlogger,
              a.created_at AS createdAt, a.updated_at AS updatedAt
       FROM articles a
       LEFT JOIN blogs b ON b.id = a.blog_id
       LEFT JOIN keywords k ON k.id = a.keyword_id
       WHERE a.id = ?`
    )
    .get(articleId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    ...row,
    labels: JSON.parse(String(row.labelsJson || "[]")) as string[],
    sources: listSourceReferences(articleId),
    revisions: listArticleRevisions(articleId)
  };
}

export function listArticleRevisions(articleId?: string) {
  if (articleId) {
    return db
      .prepare(
        `SELECT id, article_id AS articleId, revision_number AS revisionNumber,
                old_title AS oldTitle, new_title AS newTitle,
                old_content AS oldContent, new_content AS newContent,
                old_meta_description AS oldMetaDescription, new_meta_description AS newMetaDescription,
                change_summary AS changeSummary, seo_analysis_json AS seoAnalysisJson,
                quality_gate_json AS qualityGateJson, quality_score AS qualityScore,
                update_recommendation AS updateRecommendation,
                applied_to_blogger AS appliedToBlogger, is_backup_snapshot AS isBackupSnapshot,
                created_at AS createdAt
         FROM article_revisions WHERE article_id = ? ORDER BY revision_number DESC`
      )
      .all(articleId);
  }
  const wsId = getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT r.id, r.article_id AS articleId, a.title AS articleTitle, a.blogger_post_id AS bloggerPostId,
              r.revision_number AS revisionNumber, r.old_title AS oldTitle, r.new_title AS newTitle,
              r.old_content AS oldContent, r.new_content AS newContent,
              r.change_summary AS changeSummary, r.seo_analysis_json AS seoAnalysisJson,
              r.quality_gate_json AS qualityGateJson, r.quality_score AS qualityScore,
              r.update_recommendation AS updateRecommendation,
              r.applied_to_blogger AS appliedToBlogger, r.is_backup_snapshot AS isBackupSnapshot,
              r.created_at AS createdAt
       FROM article_revisions r
       JOIN articles a ON a.id = r.article_id
       WHERE a.workspace_id = ?
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all(wsId);
}

export function listUpdateReports(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT u.id, u.workspace_id AS workspaceId, u.blog_id AS blogId, b.name AS blogName,
              u.article_id AS articleId, a.title AS articleTitle, a.url AS articleUrl,
              u.revision_id AS revisionId, u.blogger_post_id AS bloggerPostId,
              u.action_taken AS actionTaken, u.detection_status AS detectionStatus,
              u.decision_reason AS decisionReason, u.before_score AS beforeScore,
              u.after_score AS afterScore, u.url_preserved AS urlPreserved,
              u.post_id_preserved AS postIdPreserved, u.verified_via_api AS verifiedViaApi,
              u.created_at AS createdAt
       FROM update_reports u
       LEFT JOIN blogs b ON b.id = u.blog_id
       LEFT JOIN articles a ON a.id = u.article_id
       WHERE u.workspace_id = ?
       ORDER BY u.created_at DESC LIMIT 100`
    )
    .all(wsId);
}

// ============================================================================
// TEAM & RBAC MANAGEMENT
// ============================================================================

export function listTeamMembers(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT u.id, u.workspace_id AS workspaceId, u.display_name AS displayName,
              u.email, u.role, u.status, u.created_at AS createdAt
       FROM users u
       WHERE u.workspace_id = ?
       ORDER BY CASE u.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'editor' THEN 3
         ELSE 4 END, u.created_at ASC`
    )
    .all(wsId);
}

export function addTeamMember(input: {
  workspaceId?: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
}) {
  const wsId = input.workspaceId || getActiveWorkspaceId();
  const userId = randomUUID();
  db.prepare(`
    INSERT INTO users(id, workspace_id, display_name, email, role, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(userId, wsId, input.displayName.trim(), input.email.trim().toLowerCase(), input.role);

  db.prepare(`
    INSERT INTO workspace_members(id, workspace_id, user_id, role, permissions_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), wsId, userId, input.role, JSON.stringify([input.role]));

  logAudit(wsId, "team.member_added", "user", userId, `Anggota tim ${input.email} (${input.role}) ditambahkan.`);
  return { id: userId, displayName: input.displayName, email: input.email, role: input.role, status: "active" };
}

// ============================================================================
// AI SETTINGS & APP SETTINGS
// ============================================================================

export function getAiSettings(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  const row = db
    .prepare("SELECT * FROM ai_settings WHERE workspace_id = ?")
    .get(wsId) as Record<string, unknown> | undefined;
  const decryptedKey = decryptSecret(row?.encrypted_api_key as string | null);
  return {
    id: String(row?.id || ""),
    workspaceId: wsId,
    provider: String(row?.provider || "openai"),
    model: String(row?.model || "gpt-4o-mini"),
    hasApiKey: Boolean(decryptedKey),
    maskedApiKey: maskSecret(decryptedKey),
    temperature: Number(row?.temperature ?? 0.3),
    maxTokens: Number(row?.max_tokens ?? 4096),
    minQualityGate: Number(row?.min_quality_gate ?? 75),
    strictFactCheck: Boolean(row?.strict_fact_check ?? 1),
    totalRequests: Number(row?.total_requests ?? 0),
    totalTokensUsed: Number(row?.total_tokens_used ?? 0),
    dailyTokenLimit: Number(row?.daily_token_limit ?? 250000)
  };
}

export function getDecryptedOpenAiKey(workspaceId?: string): string {
  const wsId = workspaceId || getActiveWorkspaceId();
  const row = db
    .prepare("SELECT encrypted_api_key FROM ai_settings WHERE workspace_id = ?")
    .get(wsId) as { encrypted_api_key: string | null } | undefined;
  return decryptSecret(row?.encrypted_api_key) || process.env.OPENAI_API_KEY || "";
}

export function updateAiSettings(input: {
  workspaceId?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  minQualityGate?: number;
  strictFactCheck?: boolean;
  dailyTokenLimit?: number;
}) {
  const wsId = input.workspaceId || getActiveWorkspaceId();
  const current = db
    .prepare("SELECT encrypted_api_key FROM ai_settings WHERE workspace_id = ?")
    .get(wsId) as { encrypted_api_key: string | null } | undefined;

  const newEncryptedKey =
    input.apiKey && input.apiKey.trim().length > 5
      ? encryptSecret(input.apiKey.trim())
      : current?.encrypted_api_key ?? null;

  db.prepare(`
    INSERT INTO ai_settings(
      id, workspace_id, provider, model, encrypted_api_key, temperature,
      max_tokens, min_quality_gate, strict_fact_check, daily_token_limit, updated_at
    ) VALUES (?, ?, 'openai', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id) DO UPDATE SET
      model = excluded.model,
      encrypted_api_key = excluded.encrypted_api_key,
      temperature = excluded.temperature,
      max_tokens = excluded.max_tokens,
      min_quality_gate = excluded.min_quality_gate,
      strict_fact_check = excluded.strict_fact_check,
      daily_token_limit = excluded.daily_token_limit,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    randomUUID(),
    wsId,
    input.model || "gpt-4o-mini",
    newEncryptedKey,
    input.temperature ?? 0.3,
    input.maxTokens ?? 4096,
    input.minQualityGate ?? 75,
    input.strictFactCheck === false ? 0 : 1,
    input.dailyTokenLimit ?? 250000
  );

  logAudit(wsId, "ai_settings.update", "ai_settings", wsId, `Konfigurasi AI (${input.model || "gpt-4o-mini"}) diperbarui.`);
  return getAiSettings(wsId);
}

export function recordAiTokenUsage(workspaceId: string, tokensUsed: number) {
  db.prepare(`
    UPDATE ai_settings
    SET total_requests = total_requests + 1,
        total_tokens_used = total_tokens_used + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ?
  `).run(Math.max(1, tokensUsed), workspaceId);
}

// ============================================================================
// SCHEDULES, JOBS & LOCKING
// ============================================================================

export function listSchedules(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT s.id, s.workspace_id AS workspaceId, s.blog_id AS blogId, b.name AS blogName,
              s.name, s.task_type AS taskType, s.cron_expression AS cronExpression,
              s.frequency_minutes AS frequencyMinutes, s.execution_time AS executionTime,
              s.timezone, s.max_batch_size AS maxBatchSize, s.max_daily_updates AS maxDailyUpdates,
              s.min_priority_score AS minPriorityScore, s.api_quota_limit AS apiQuotaLimit,
              s.retry_limit AS retryLimit, s.enabled, s.last_run_at AS lastRunAt,
              s.next_run_at AS nextRunAt
       FROM schedules s
       LEFT JOIN blogs b ON b.id = s.blog_id
       WHERE s.workspace_id = ?
       ORDER BY s.execution_time ASC`
    )
    .all(wsId);
}

export function updateScheduleConfig(input: {
  id: string;
  enabled?: boolean;
  frequencyMinutes?: number;
  executionTime?: string;
  maxBatchSize?: number;
  maxDailyUpdates?: number;
  minPriorityScore?: number;
}) {
  const row = db.prepare("SELECT * FROM schedules WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Jadwal tidak ditemukan.");

  const freq = input.frequencyMinutes ?? Number(row.frequency_minutes);
  const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : Number(row.enabled);
  const execTime = input.executionTime ?? String(row.execution_time);
  const batchSize = input.maxBatchSize ?? Number(row.max_batch_size);
  const dailyUpdates = input.maxDailyUpdates ?? Number(row.max_daily_updates);
  const minPrio = input.minPriorityScore ?? Number(row.min_priority_score);

  db.prepare(`
    UPDATE schedules
    SET enabled = ?, frequency_minutes = ?, execution_time = ?,
        max_batch_size = ?, max_daily_updates = ?, min_priority_score = ?,
        next_run_at = ?
    WHERE id = ?
  `).run(enabled, freq, execTime, batchSize, dailyUpdates, minPrio, computeNextRunIso(freq), input.id);

  return listSchedules(String(row.workspace_id));
}

export function listJobs(workspaceId?: string) {
  const wsId = workspaceId || getActiveWorkspaceId();
  return db
    .prepare(
      `SELECT j.id, j.workspace_id AS workspaceId, j.blog_id AS blogId, b.name AS blogName,
              j.article_id AS articleId, a.title AS articleTitle, j.job_type AS jobType,
              j.status, j.idempotency_key AS idempotencyKey, j.locked_by AS lockedBy,
              j.attempts, j.max_attempts AS maxAttempts, j.last_error AS lastError,
              j.result_json AS resultJson, j.created_at AS createdAt
       FROM automation_jobs j
       LEFT JOIN blogs b ON b.id = j.blog_id
       LEFT JOIN articles a ON a.id = j.article_id
       WHERE j.workspace_id = ?
       ORDER BY j.created_at DESC LIMIT 100`
    )
    .all(wsId);
}

export function listJobLogs(jobId?: string) {
  if (jobId) {
    return db
      .prepare("SELECT id, job_id AS jobId, level, message, created_at AS createdAt FROM job_logs WHERE job_id = ? ORDER BY created_at ASC")
      .all(jobId);
  }
  return db
    .prepare("SELECT id, job_id AS jobId, level, message, created_at AS createdAt FROM job_logs ORDER BY created_at DESC LIMIT 100")
    .all();
}
