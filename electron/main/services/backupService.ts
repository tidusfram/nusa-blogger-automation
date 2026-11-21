import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getActiveWorkspaceId, getDatabasePath, getDb, logAudit } from "./database";
import { formatJakartaTime } from "./security";

export interface BackupEntry {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  createdAtWib: string;
  type: "sqlite_binary" | "workspace_json";
}

function getBackupDir(): string {
  const dbPath = getDatabasePath();
  const baseDir = dbPath ? dirname(dbPath) : join(process.cwd(), "data");
  const backupDir = join(baseDir, "backups");
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

export function createDatabaseBackup(workspaceId?: string) {
  const db = getDb();
  const wsId = workspaceId || getActiveWorkspaceId();
  const backupDir = getBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  // 1. Create JSON snapshot of workspace tables
  const snapshot = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    timezone: "Asia/Jakarta",
    workspaceId: wsId,
    blogs: db.prepare("SELECT * FROM blogs WHERE workspace_id = ?").all(wsId),
    blogSettings: db
      .prepare("SELECT bs.* FROM blog_settings bs JOIN blogs b ON b.id = bs.blog_id WHERE b.workspace_id = ?")
      .all(wsId),
    keywords: db.prepare("SELECT * FROM keywords WHERE workspace_id = ?").all(wsId),
    articles: db.prepare("SELECT * FROM articles WHERE workspace_id = ?").all(wsId),
    revisions: db
      .prepare("SELECT r.* FROM article_revisions r JOIN articles a ON a.id = r.article_id WHERE a.workspace_id = ?")
      .all(wsId),
    sources: db
      .prepare("SELECT s.* FROM source_references s JOIN articles a ON a.id = s.article_id WHERE a.workspace_id = ?")
      .all(wsId),
    schedules: db.prepare("SELECT * FROM schedules WHERE workspace_id = ?").all(wsId),
    updateReports: db.prepare("SELECT * FROM update_reports WHERE workspace_id = ?").all(wsId)
  };

  const jsonFileName = `nusa_snapshot_${wsId}_${stamp}.json`;
  const jsonFilePath = join(backupDir, jsonFileName);
  writeFileSync(jsonFilePath, JSON.stringify(snapshot, null, 2), "utf8");

  // 2. Also copy SQLite DB file if present on disk
  const dbPath = getDatabasePath();
  let sqliteFileName = "";
  if (dbPath && existsSync(dbPath)) {
    sqliteFileName = `nusa_blogger_${stamp}.db`;
    copyFileSync(dbPath, join(backupDir, sqliteFileName));
  }

  logAudit(
    wsId,
    "backup.create",
    "database",
    jsonFileName,
    `Backup berhasil dibuat: ${jsonFileName}${sqliteFileName ? ` & ${sqliteFileName}` : ""}.`
  );

  return {
    jsonFileName,
    sqliteFileName,
    backupDir,
    articleCount: snapshot.articles.length,
    revisionCount: snapshot.revisions.length,
    createdAtWib: formatJakartaTime(new Date())
  };
}

export function listDatabaseBackups(): BackupEntry[] {
  const backupDir = getBackupDir();
  if (!existsSync(backupDir)) return [];
  const files = readdirSync(backupDir).filter((f) => f.endsWith(".json") || f.endsWith(".db"));
  return files
    .map((fileName) => {
      const filePath = join(backupDir, fileName);
      const st = statSync(filePath);
      return {
        fileName,
        filePath,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        createdAtWib: formatJakartaTime(st.mtime),
        type: (fileName.endsWith(".db") ? "sqlite_binary" : "workspace_json") as BackupEntry["type"]
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreWorkspaceSnapshot(fileName: string) {
  const backupDir = getBackupDir();
  const filePath = join(backupDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`File backup '${fileName}' tidak ditemukan.`);
  }
  if (!fileName.endsWith(".json")) {
    throw new Error("Pilih file snapshot .json untuk memulihkan data workspace secara online.");
  }

  const raw = readFileSync(filePath, "utf8");
  const snapshot = JSON.parse(raw) as {
    workspaceId: string;
    articles?: Array<Record<string, unknown>>;
    revisions?: Array<Record<string, unknown>>;
  };

  const db = getDb();
  let restoredArticles = 0;

  const tx = db.transaction(() => {
    for (const art of snapshot.articles || []) {
      db.prepare(`
        INSERT INTO articles(
          id, workspace_id, blog_id, keyword_id, blogger_post_id, title, content_html,
          meta_description, labels_json, permalink, url, status, detection_status,
          update_decision, priority_score, quality_score, seo_score, content_hash,
          published_at, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          content_html = excluded.content_html,
          meta_description = excluded.meta_description,
          status = excluded.status,
          detection_status = excluded.detection_status,
          update_decision = excluded.update_decision,
          quality_score = excluded.quality_score,
          seo_score = excluded.seo_score,
          content_hash = excluded.content_hash,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        art.id,
        art.workspace_id,
        art.blog_id,
        art.keyword_id ?? null,
        art.blogger_post_id ?? null,
        art.title,
        art.content_html ?? "",
        art.meta_description ?? "",
        art.labels_json ?? "[]",
        art.permalink ?? null,
        art.url ?? null,
        art.status ?? "published",
        art.detection_status ?? "No Update Required",
        art.update_decision ?? "Tidak update",
        art.priority_score ?? 0,
        art.quality_score ?? 80,
        art.seo_score ?? 80,
        art.content_hash ?? null,
        art.published_at ?? null,
        art.last_synced_at ?? null
      );
      restoredArticles += 1;
    }
  });
  tx();

  logAudit(
    snapshot.workspaceId || getActiveWorkspaceId(),
    "backup.restore",
    "database",
    fileName,
    `Memulihkan ${restoredArticles} artikel dari backup ${fileName}.`
  );

  return {
    restoredFileName: fileName,
    restoredArticles,
    restoredAtWib: formatJakartaTime(new Date())
  };
}
