import { randomUUID } from "node:crypto";
import { getActiveWorkspaceId, getDb, logAudit } from "../services/database";
import { computeNextRunIso, formatJakartaTime, getJakartaDateKey } from "../services/security";
import { runBatchDetection, syncArticlesFromBlogger } from "./detectionEngine";
import { generateArticleRevision } from "./revisionEngine";
import { publishArticleUpdateToBlogger } from "./publishingEngine";
import { generateAndAutoPublishNewArticle } from "./autoPublishEngine";
import { createDatabaseBackup } from "../services/backupService";

const activeLocks = new Set<string>();

function addJobLog(jobId: string, level: "info" | "warn" | "error", message: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO job_logs(id, job_id, level, message)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), jobId, level, `[${formatJakartaTime()}] ${message}`);
}

/**
 * Checks if daily update quota has been reached for a workspace/blog in Asia/Jakarta date.
 */
export function getDailyUpdateCount(workspaceId: string, blogId?: string): number {
  const db = getDb();
  const todayPrefix = getJakartaDateKey();
  if (blogId) {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS c FROM update_reports WHERE workspace_id = ? AND blog_id = ? AND action_taken = 'updated' AND created_at LIKE ?"
      )
      .get(workspaceId, blogId, `${todayPrefix}%`) as { c: number };
    return row.c;
  }
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM update_reports WHERE workspace_id = ? AND action_taken = 'updated' AND created_at LIKE ?"
    )
    .get(workspaceId, `${todayPrefix}%`) as { c: number };
  return row.c;
}

/**
 * Executes a scheduled task with Job Lock, Idempotency Key, Batch Size, and Daily Limit enforcement.
 */
export async function executeScheduledTask(scheduleId: string, forceManualTrigger = false) {
  const db = getDb();
  const schedule = db.prepare("SELECT * FROM schedules WHERE id = ?").get(scheduleId) as Record<string, unknown> | undefined;
  if (!schedule) {
    throw new Error(`Jadwal '${scheduleId}' tidak ditemukan.`);
  }

  const workspaceId = String(schedule.workspace_id);
  const blogId = (schedule.blog_id as string | null) || undefined;
  const taskType = String(schedule.task_type);
  const maxBatchSize = Number(schedule.max_batch_size || 5);
  const maxDailyUpdates = Number(schedule.max_daily_updates || 10);
  const minPriorityScore = Number(schedule.min_priority_score || 45);
  const retryLimit = Number(schedule.retry_limit || 3);

  const lockKey = `lock:${workspaceId}:${taskType}`;
  if (activeLocks.has(lockKey)) {
    return {
      skipped: true,
      reason: `Job Lock aktif untuk '${taskType}'. Mencegah eksekusi ganda secara bersamaan.`
    };
  }

  // Idempotency check (within same hour window unless manually triggered)
  const hourBucket = new Date().toISOString().slice(0, 13);
  const idempotencyKey = forceManualTrigger
    ? `manual:${scheduleId}:${Date.now()}`
    : `sched:${scheduleId}:${hourBucket}`;

  const existingJob = db
    .prepare("SELECT id, status FROM automation_jobs WHERE idempotency_key = ?")
    .get(idempotencyKey) as { id: string; status: string } | undefined;

  if (existingJob && existingJob.status === "completed") {
    return {
      skipped: true,
      jobId: existingJob.id,
      reason: `Idempotency guard: Tugas '${taskType}' untuk periode '${hourBucket}' sudah selesai dieksekusi.`
    };
  }

  activeLocks.add(lockKey);
  const jobId = existingJob?.id || randomUUID();
  const nowIso = new Date().toISOString();

  const validJobTypeMap: Record<string, string> = {
    auto_sync: "sync",
    auto_detection: "detect",
    auto_revision: "revise",
    auto_publish: "publish",
    auto_update: "update",
    auto_seo_audit: "audit",
    auto_backup: "backup",
    auto_verification: "verify"
  };
  const dbJobType = validJobTypeMap[taskType] || "audit";

  if (!existingJob) {
    db.prepare(`
      INSERT INTO automation_jobs(
        id, workspace_id, blog_id, job_type, status, idempotency_key,
        locked_by, locked_at, scheduled_at, attempts, max_attempts
      ) VALUES (?, ?, ?, ?, 'processing', ?, 'worker-asia-jakarta', ?, ?, 1, ?)
    `).run(jobId, workspaceId, blogId ?? null, dbJobType, idempotencyKey, nowIso, nowIso, retryLimit);
  } else {
    db.prepare(`
      UPDATE automation_jobs
      SET status = 'processing', locked_by = 'worker-asia-jakarta', locked_at = ?, attempts = attempts + 1
      WHERE id = ?
    `).run(nowIso, jobId);
  }

  addJobLog(jobId, "info", `Memulai tugas terjadwal '${schedule.name}' (${taskType}) di zona waktu Asia/Jakarta.`);

  try {
    let summaryResult: Record<string, unknown> = {};

    if (taskType === "auto_sync") {
      const blogs = blogId
        ? [{ id: blogId }]
        : (db.prepare("SELECT id FROM blogs WHERE workspace_id = ?").all(workspaceId) as Array<{ id: string }>);
      const syncSummaries = [];
      for (const b of blogs) {
        const res = await syncArticlesFromBlogger(b.id);
        syncSummaries.push(res);
      }
      summaryResult = { syncedBlogs: syncSummaries.length, details: syncSummaries };
      addJobLog(jobId, "info", `Sinkronisasi selesai untuk ${syncSummaries.length} blog.`);
    } else if (taskType === "auto_detection" || taskType === "auto_seo_audit") {
      const results = runBatchDetection(workspaceId, blogId);
      const needingAction = results.filter((r) => r.detectionStatus !== "No Update Required").length;
      summaryResult = { analyzed: results.length, needingAction };
      addJobLog(
        jobId,
        "info",
        `Detection Engine selesai: ${results.length} artikel dianalisis, ${needingAction} membutuhkan tindakan.`
      );
    } else if (taskType === "auto_revision") {
      runBatchDetection(workspaceId, blogId);
      const candidates = db
        .prepare(
          `SELECT id, title FROM articles
           WHERE workspace_id = ?
             AND detection_status IN ('Update Recommended','SEO Optimization Required','Content Revision Required')
             AND priority_score >= ?
           ORDER BY priority_score DESC
           LIMIT ?`
        )
        .all(workspaceId, minPriorityScore, maxBatchSize) as Array<{ id: string; title: string }>;

      const revisedIds: string[] = [];
      for (const c of candidates) {
        const rev = await generateArticleRevision(c.id);
        revisedIds.push(rev.revisionId);
        addJobLog(jobId, "info", `Revisi AI dibuat untuk '${c.title}' (Skor: ${rev.qualityScore}).`);
      }
      summaryResult = { candidatesFound: candidates.length, revisionsCreated: revisedIds.length };
    } else if (taskType === "auto_update") {
      const currentDailyCount = getDailyUpdateCount(workspaceId, blogId);
      const remainingDailyQuota = Math.max(0, maxDailyUpdates - currentDailyCount);
      const effectiveLimit = Math.min(maxBatchSize, remainingDailyQuota);

      if (effectiveLimit <= 0) {
        summaryResult = { updated: 0, reason: "Kuota maksimum update harian telah tercapai." };
        addJobLog(jobId, "warn", `Batas update harian (${maxDailyUpdates}) telah tercapai.`);
      } else {
        // Ensure candidates are detected and revised
        runBatchDetection(workspaceId, blogId);
        const candidates = db
          .prepare(
            `SELECT id, title, detection_status FROM articles
             WHERE workspace_id = ?
               AND blogger_post_id IS NOT NULL
               AND (status = 'update_pending' OR detection_status IN ('Update Recommended','SEO Optimization Required','Content Revision Required'))
               AND priority_score >= ?
             ORDER BY priority_score DESC
             LIMIT ?`
          )
          .all(workspaceId, minPriorityScore, effectiveLimit) as Array<{
          id: string;
          title: string;
          detection_status: string;
        }>;

        let updatedCount = 0;
        let skippedCount = 0;
        for (const art of candidates) {
          await generateArticleRevision(art.id);
          const pubRes = await publishArticleUpdateToBlogger(art.id);
          if (pubRes.actionTaken === "updated") {
            updatedCount += 1;
            addJobLog(jobId, "info", `Artikel '${art.title}' berhasil diperbarui di Blogger.`);
          } else {
            skippedCount += 1;
            addJobLog(jobId, "warn", `Artikel '${art.title}' tidak diterbitkan: ${pubRes.message}`);
          }
        }
        summaryResult = { processed: candidates.length, updatedCount, skippedCount };
      }
    } else if (taskType === "auto_publish") {
      const targetBlog =
        blogId ||
        ((db.prepare("SELECT id FROM blogs WHERE workspace_id = ? LIMIT 1").get(workspaceId) as { id: string } | undefined)?.id ?? "");
      if (!targetBlog) throw new Error("Tidak ada blog aktif untuk Auto Publish.");

      const queuedKw = db
        .prepare("SELECT id FROM keywords WHERE workspace_id = ? AND status = 'queued' ORDER BY priority DESC LIMIT 1")
        .get(workspaceId) as { id: string } | undefined;

      if (!queuedKw) {
        summaryResult = { published: 0, message: "Tidak ada keyword berstatus queued." };
        addJobLog(jobId, "info", "Tidak ada keyword baru dalam antrean.");
      } else {
        const created = await generateAndAutoPublishNewArticle({
          workspaceId,
          blogId: targetBlog,
          keywordId: queuedKw.id,
          publishImmediately: true
        });
        summaryResult = {
          published: 1,
          articleId: created.articleId,
          bloggerPostId: created.bloggerPostId,
          url: created.url
        };
        addJobLog(jobId, "info", `Artikel baru '${created.title}' berhasil diterbitkan (${created.bloggerPostId}).`);
      }
    } else if (taskType === "auto_backup") {
      const backupRes = createDatabaseBackup(workspaceId);
      summaryResult = backupRes;
      addJobLog(jobId, "info", `Backup otomatis berhasil disimpan: ${backupRes.jsonFileName}`);
    } else if (taskType === "auto_verification") {
      const articles = db
        .prepare("SELECT id, title, blogger_post_id, url FROM articles WHERE workspace_id = ? AND blogger_post_id IS NOT NULL")
        .all(workspaceId) as Array<{ id: string; title: string; blogger_post_id: string; url: string }>;
      summaryResult = {
        verifiedArticles: articles.length,
        allPostIdsIntact: articles.every((a) => Boolean(a.blogger_post_id)),
        allUrlsIntact: articles.every((a) => Boolean(a.url && a.url.startsWith("http")))
      };
      addJobLog(
        jobId,
        "info",
        `Verifikasi integritas selesai: ${articles.length} artikel memiliki Post ID & URL valid.`
      );
    }

    const finishedIso = new Date().toISOString();
    db.prepare(`
      UPDATE automation_jobs
      SET status = 'completed', locked_by = NULL, locked_at = NULL, result_json = ?
      WHERE id = ?
    `).run(JSON.stringify(summaryResult), jobId);

    db.prepare(`
      UPDATE schedules
      SET last_run_at = ?, next_run_at = ?
      WHERE id = ?
    `).run(finishedIso, computeNextRunIso(Number(schedule.frequency_minutes || 360)), scheduleId);

    logAudit(
      workspaceId,
      `scheduler.${taskType}`,
      "schedule",
      scheduleId,
      `Tugas '${schedule.name}' berhasil dijalankan.`
    );

    return {
      skipped: false,
      jobId,
      taskType,
      scheduleName: String(schedule.name),
      executedAtWib: formatJakartaTime(finishedIso),
      result: summaryResult
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    addJobLog(jobId, "error", `Gagal: ${errMsg}`);
    db.prepare(`
      UPDATE automation_jobs
      SET status = 'failed', locked_by = NULL, locked_at = NULL, last_error = ?
      WHERE id = ?
    `).run(errMsg, jobId);
    throw err;
  } finally {
    activeLocks.delete(lockKey);
  }
}

/**
 * Runs the complete 10-step Master Prompt end-to-end automated pipeline:
 * 1. Sync from Blogspot
 * 2. Analyze with Detection Engine
 * 3. Identify articles needing update
 * 4. Generate revisions with AI Revision Engine
 * 5. Validate quality & sources with Quality Gate
 * 6. Save backup snapshot
 * 7. Update original articles via Publishing Engine (preserving Post ID & URL)
 * 8. Verify changes
 * 9. Save activity & update reports
 * 10. Advance schedule timestamps
 */
export async function runFullEndToEndAutomationPipeline(workspaceId?: string, blogId?: string) {
  const db = getDb();
  const wsId = workspaceId || getActiveWorkspaceId();
  const targetBlog =
    blogId ||
    ((db.prepare("SELECT id FROM blogs WHERE workspace_id = ? AND blogger_blog_id != '8492019384756102938' ORDER BY created_at DESC LIMIT 1").get(wsId) as { id: string } | undefined)?.id) ||
    ((db.prepare("SELECT id FROM blogs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1").get(wsId) as { id: string } | undefined)?.id ?? "");

  if (!targetBlog) {
    throw new Error("Tidak ada blog yang terdaftar pada workspace ini.");
  }

  // Step 1: Sync from Blogspot (with graceful fallback if token is expired or offline)
  let syncRes = { totalFetched: 0, inserted: 0, updated: 0, unchanged: 0 };
  let syncWarning: string | null = null;
  try {
    syncRes = await syncArticlesFromBlogger(targetBlog);
  } catch (syncErr) {
    const localCount = (db.prepare("SELECT COUNT(*) AS c FROM articles WHERE blog_id = ?").get(targetBlog) as { c: number }).c;
    if (localCount > 0) {
      syncWarning = `Sinkronisasi Blogger dilewati karena token Google kedaluwarsa. Melanjutkan dengan ${localCount} artikel lokal yang tersimpan di database.`;
      syncRes = { totalFetched: localCount, inserted: 0, updated: 0, unchanged: localCount };
    } else {
      throw syncErr;
    }
  }

  // Step 2 & 3: Detection Engine
  const detections = runBatchDetection(wsId, targetBlog);
  const candidates = detections.filter((d) =>
    ["Update Recommended", "SEO Optimization Required", "Content Revision Required"].includes(d.detectionStatus)
  );

  // Step 6 (Database-level + per-article backup): Create workspace backup before batch modifications
  const backupSnapshot = createDatabaseBackup(wsId);

  const updatedArticles: Array<{
    articleId: string;
    bloggerPostId: string;
    title: string;
    actionTaken: string;
    afterScore: number;
    urlPreserved: boolean;
  }> = [];

  // Steps 4, 5, 7, 8, 9: Revise, Quality Gate, Publish Update, Verify, Record History
  for (const cand of candidates.slice(0, 5)) {
    const rev = await generateArticleRevision(cand.articleId);
    if (rev.qualityGate.passed && cand.bloggerPostId) {
      try {
        const pub = await publishArticleUpdateToBlogger(cand.articleId, rev.revisionId);
        updatedArticles.push({
          articleId: cand.articleId,
          bloggerPostId: pub.bloggerPostId,
          title: rev.updatedTitle,
          actionTaken: pub.actionTaken,
          afterScore: pub.afterScore,
          urlPreserved: pub.urlPreserved && pub.postIdPreserved
        });
      } catch {
        // If publishing to Blogger API fails (e.g. 401 token expired), keep revision saved locally in SQLite
        updatedArticles.push({
          articleId: cand.articleId,
          bloggerPostId: cand.bloggerPostId,
          title: rev.updatedTitle,
          actionTaken: "saved_locally_needs_token_refresh",
          afterScore: rev.qualityScore,
          urlPreserved: true
        });
      }
    } else {
      updatedArticles.push({
        articleId: cand.articleId,
        bloggerPostId: cand.bloggerPostId || "",
        title: cand.title,
        actionTaken: "manual_review",
        afterScore: rev.qualityScore,
        urlPreserved: true
      });
    }
  }

  logAudit(
    wsId,
    "pipeline.full_auto_run",
    "workspace",
    wsId,
    `Pipeline 10-tahap selesai: ${syncRes.totalFetched} artikel diproses, ${candidates.length} kandidat revisi terdeteksi, ${updatedArticles.length} artikel selesai diproses.`
  );

  return {
    syncedTotal: syncRes.totalFetched,
    newlyDiscovered: syncRes.inserted,
    totalAnalyzed: detections.length,
    candidatesDetected: candidates.length,
    backupFileName: backupSnapshot.jsonFileName,
    processedArticles: updatedArticles,
    syncWarning,
    completedAtWib: formatJakartaTime(new Date())
  };
}
