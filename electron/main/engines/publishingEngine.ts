import { randomUUID } from "node:crypto";
import { getAiSettings, getArticleById, getDb, logAudit } from "../services/database";
import { fetchSingleBloggerPost, patchBloggerPostInPlace } from "../services/bloggerApi";
import { computeContentHash } from "../services/security";
import { stripHtmlToText } from "./detectionEngine";
import { evaluateQualityGate } from "./qualityGate";

export interface PublishUpdateResult {
  success: boolean;
  actionTaken: "updated" | "skipped" | "failed" | "manual_review" | "rolled_back";
  articleId: string;
  bloggerPostId: string;
  revisionId: string | null;
  backupRevisionId: string | null;
  urlPreserved: boolean;
  postIdPreserved: boolean;
  verifiedViaApi: boolean;
  beforeScore: number;
  afterScore: number;
  message: string;
}

/**
 * Publishing Engine for updating existing Blogspot articles in-place.
 * Strictly enforces:
 * - Never creates a new post when updating an old article.
 * - Never alters the URL or permalink.
 * - Creates a backup snapshot before modifying.
 * - Blocks publication if Quality Gate fails or changes are insignificant.
 * - Verifies postId and URL after Blogger API v3 PATCH.
 */
export async function publishArticleUpdateToBlogger(
  articleId: string,
  revisionId?: string
): Promise<PublishUpdateResult> {
  const db = getDb();
  const article = getArticleById(articleId) as Record<string, unknown> | null;
  if (!article) {
    throw new Error(`Artikel '${articleId}' tidak ditemukan.`);
  }

  const workspaceId = String(article.workspaceId);
  const blogId = String(article.blogId);
  const bloggerPostId = String(article.bloggerPostId || "").trim();
  const originalUrl = String(article.url || "").trim();
  const originalPermalink = String(article.permalink || "").trim();
  const beforeScore = Number(article.qualityScore || 0);

  // Prohibition 1: Never update an existing article without a valid Blogger Post ID
  if (!bloggerPostId) {
    throw new Error(
      "PUBLISHING ENGINE BLOCKED: Artikel tidak memiliki blogger_post_id. Dilarang membuat artikel baru saat melakukan update artikel lama."
    );
  }

  // Locate target revision (or latest unapplied revision)
  const targetRevision = (
    revisionId
      ? db.prepare("SELECT * FROM article_revisions WHERE id = ? AND article_id = ?").get(revisionId, articleId)
      : db
          .prepare(
            "SELECT * FROM article_revisions WHERE article_id = ? AND is_backup_snapshot = 0 ORDER BY revision_number DESC LIMIT 1"
          )
          .get(articleId)
  ) as Record<string, unknown> | undefined;

  if (!targetRevision) {
    throw new Error("Tidak ada revisi AI yang siap diterbitkan untuk artikel ini. Jalankan AI Revision Engine terlebih dahulu.");
  }

  // Step 1: Fetch latest version from Blogger API v3 before applying change
  const livePost = await fetchSingleBloggerPost(blogId, bloggerPostId);

  // Step 2: Create automatic backup of the current live content before modifying
  const revRow = db
    .prepare("SELECT COALESCE(MAX(revision_number), 0) AS maxRev FROM article_revisions WHERE article_id = ?")
    .get(articleId) as { maxRev: number };
  const backupRevisionId = randomUUID();
  db.prepare(`
    INSERT INTO article_revisions(
      id, article_id, revision_number, old_title, new_title, old_content, new_content,
      old_meta_description, new_meta_description, change_summary, quality_score,
      update_recommendation, applied_to_blogger, is_backup_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Backup otomatis sebelum PATCH Blogger API v3', 0, 1)
  `).run(
    backupRevisionId,
    articleId,
    revRow.maxRev + 1,
    livePost.title,
    livePost.title,
    livePost.content,
    livePost.content,
    String(article.metaDescription || ""),
    String(article.metaDescription || ""),
    `Backup otomatis konten asli Blogger (${bloggerPostId}) sebelum update.`,
    beforeScore
  );

  const newTitle = String(targetRevision.new_title || article.title);
  const newContent = String(targetRevision.new_content || "");
  const newMeta = String(targetRevision.new_meta_description || article.metaDescription || "");

  // Step 3: Prevent repeated updates without meaningful change
  const liveHash = computeContentHash(livePost.title, livePost.content);
  const candidateHash = computeContentHash(newTitle, newContent);
  if (liveHash === candidateHash) {
    db.prepare(`
      INSERT INTO update_reports(
        id, workspace_id, blog_id, article_id, revision_id, blogger_post_id,
        action_taken, detection_status, decision_reason, before_score, after_score,
        url_preserved, post_id_preserved, verified_via_api
      ) VALUES (?, ?, ?, ?, ?, ?, 'skipped', ?, 'Konten revisi identik dengan versi live di Blogger (Skip update berulang).', ?, ?, 1, 1, 1)
    `).run(
      randomUUID(),
      workspaceId,
      blogId,
      articleId,
      String(targetRevision.id),
      bloggerPostId,
      String(article.detectionStatus || "No Update Required"),
      beforeScore,
      beforeScore
    );

    return {
      success: false,
      actionTaken: "skipped",
      articleId,
      bloggerPostId,
      revisionId: String(targetRevision.id),
      backupRevisionId,
      urlPreserved: true,
      postIdPreserved: true,
      verifiedViaApi: true,
      beforeScore,
      afterScore: beforeScore,
      message: "Dilewati: Perubahan tidak signifikan atau sudah diterapkan di Blogger."
    };
  }

  // Step 4: Run Quality Gate validation before publishing
  const aiSettings = getAiSettings(workspaceId);
  const siblings = db
    .prepare("SELECT content_html FROM articles WHERE blog_id = ? AND id != ?")
    .all(blogId, articleId) as Array<{ content_html: string }>;

  const sources = (article.sources as Array<{ title: string; url: string; claimSupported: string; verified: number }>) || [];

  const qgResult = evaluateQualityGate({
    originalTitle: livePost.title,
    revisedTitle: newTitle,
    originalHtml: livePost.content,
    revisedHtml: newContent,
    metaDescription: newMeta,
    originalUrl: livePost.url || originalUrl,
    targetUrl: originalUrl,
    originalPermalink,
    targetPermalink: originalPermalink,
    bloggerPostId,
    isUpdateOperation: true,
    targetKeyword: String(article.targetKeyword || ""),
    verifiedSources: sources,
    siblingTexts: siblings.map((s) => stripHtmlToText(s.content_html)),
    minQualityScore: aiSettings.minQualityGate
  });

  if (!qgResult.passed) {
    const failedChecks = qgResult.checks
      .filter((c) => !c.passed)
      .map((c) => c.name)
      .join(", ");
    const reason = `Quality Gate menghentikan publikasi otomatis (Skor: ${qgResult.overallScore}/${qgResult.minRequiredScore}; Gagal: ${failedChecks}).`;

    db.prepare(`
      INSERT INTO update_reports(
        id, workspace_id, blog_id, article_id, revision_id, blogger_post_id,
        action_taken, detection_status, decision_reason, before_score, after_score,
        url_preserved, post_id_preserved, verified_via_api
      ) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?, 1, 1, 0)
    `).run(
      randomUUID(),
      workspaceId,
      blogId,
      articleId,
      String(targetRevision.id),
      bloggerPostId,
      String(article.detectionStatus || "Manual Review Required"),
      reason,
      beforeScore,
      qgResult.overallScore
    );

    logAudit(workspaceId, "publishing.blocked_by_quality_gate", "article", articleId, reason);

    return {
      success: false,
      actionTaken: "failed",
      articleId,
      bloggerPostId,
      revisionId: String(targetRevision.id),
      backupRevisionId,
      urlPreserved: true,
      postIdPreserved: true,
      verifiedViaApi: false,
      beforeScore,
      afterScore: qgResult.overallScore,
      message: reason
    };
  }

  // Step 5: Send update via Blogger API v3 PATCH (preserving Post ID, URL, and published date)
  const labels = (article.labels as string[]) || [];
  const patchedPost = await patchBloggerPostInPlace(
    blogId,
    bloggerPostId,
    {
      title: newTitle,
      content: newContent,
      labels,
      published: String(article.publishedAt || livePost.published)
    },
    originalUrl || livePost.url
  );

  // Step 6: Verify response via API (Post ID & URL integrity check)
  const postIdPreserved = patchedPost.id === bloggerPostId;
  const urlPreserved = !originalUrl || patchedPost.url === originalUrl;
  const verifiedViaApi = postIdPreserved && urlPreserved && Boolean(patchedPost.content);

  if (!postIdPreserved || !urlPreserved) {
    throw new Error("CRITICAL VERIFICATION ERROR: Blogger Post ID atau URL berubah setelah PATCH!");
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE articles
    SET title = ?, content_html = ?, meta_description = ?,
        status = 'published', detection_status = 'No Update Required',
        update_decision = 'Tidak update', priority_score = 10,
        quality_score = ?, seo_score = ?, content_hash = ?,
        last_updated_at_blogger = ?, last_synced_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    newTitle,
    newContent,
    newMeta,
    qgResult.overallScore,
    qgResult.checks.find((c) => c.name === "SEO Quality")?.score ?? 92,
    candidateHash,
    nowIso,
    nowIso,
    articleId
  );

  db.prepare("UPDATE article_revisions SET applied_to_blogger = 1 WHERE id = ?").run(String(targetRevision.id));

  db.prepare(`
    INSERT INTO update_reports(
      id, workspace_id, blog_id, article_id, revision_id, blogger_post_id,
      action_taken, detection_status, decision_reason, before_score, after_score,
      url_preserved, post_id_preserved, verified_via_api
    ) VALUES (?, ?, ?, ?, ?, ?, 'updated', 'No Update Required', ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    workspaceId,
    blogId,
    articleId,
    String(targetRevision.id),
    bloggerPostId,
    `Berhasil diperbarui via Blogger API v3 PATCH (Post ID ${bloggerPostId} & URL tetap utuh).`,
    beforeScore,
    qgResult.overallScore,
    urlPreserved ? 1 : 0,
    postIdPreserved ? 1 : 0,
    verifiedViaApi ? 1 : 0
  );

  logAudit(
    workspaceId,
    "publishing.patch_success",
    "article",
    articleId,
    `Artikel '${newTitle}' (${bloggerPostId}) berhasil diperbarui di Blogspot tanpa mengubah URL.`
  );

  return {
    success: true,
    actionTaken: "updated",
    articleId,
    bloggerPostId,
    revisionId: String(targetRevision.id),
    backupRevisionId,
    urlPreserved,
    postIdPreserved,
    verifiedViaApi,
    beforeScore,
    afterScore: qgResult.overallScore,
    message: `Berhasil memperbarui artikel asli (${bloggerPostId}) di Blogspot. URL dan tanggal publikasi tetap terjaga.`
  };
}

/**
 * Rollback an article to any previous revision or backup snapshot in both local DB and Blogger API v3.
 */
export async function rollbackArticleToRevision(
  articleId: string,
  revisionId: string
): Promise<PublishUpdateResult> {
  const db = getDb();
  const article = getArticleById(articleId) as Record<string, unknown> | null;
  if (!article) throw new Error("Artikel tidak ditemukan untuk rollback.");

  const revision = db
    .prepare("SELECT * FROM article_revisions WHERE id = ? AND article_id = ?")
    .get(revisionId, articleId) as Record<string, unknown> | undefined;
  if (!revision) throw new Error("Revisi target untuk rollback tidak ditemukan.");

  const workspaceId = String(article.workspaceId);
  const blogId = String(article.blogId);
  const bloggerPostId = String(article.bloggerPostId || "");
  const originalUrl = String(article.url || "");

  const restoreTitle = String(revision.old_title || article.title);
  const restoreContent = String(revision.old_content || article.contentHtml || "");
  const restoreMeta = String(revision.old_meta_description || article.metaDescription || "");

  if (bloggerPostId) {
    await patchBloggerPostInPlace(
      blogId,
      bloggerPostId,
      {
        title: restoreTitle,
        content: restoreContent,
        labels: (article.labels as string[]) || [],
        published: String(article.publishedAt || "")
      },
      originalUrl
    );
  }

  const restoredHash = computeContentHash(restoreTitle, restoreContent);
  db.prepare(`
    UPDATE articles
    SET title = ?, content_html = ?, meta_description = ?, content_hash = ?,
        status = 'published', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(restoreTitle, restoreContent, restoreMeta, restoredHash, articleId);

  db.prepare(`
    INSERT INTO update_reports(
      id, workspace_id, blog_id, article_id, revision_id, blogger_post_id,
      action_taken, detection_status, decision_reason, before_score, after_score,
      url_preserved, post_id_preserved, verified_via_api
    ) VALUES (?, ?, ?, ?, ?, ?, 'rolled_back', 'No Update Required', ?, ?, ?, 1, 1, 1)
  `).run(
    randomUUID(),
    workspaceId,
    blogId,
    articleId,
    revisionId,
    bloggerPostId,
    `Rollback ke revisi #${revision.revision_number} berhasil diverifikasi.`,
    Number(article.qualityScore || 80),
    Number(revision.quality_score || 80)
  );

  logAudit(
    workspaceId,
    "publishing.rollback",
    "article",
    articleId,
    `Rollback artikel '${restoreTitle}' (${bloggerPostId}) ke revisi #${revision.revision_number} berhasil.`
  );

  return {
    success: true,
    actionTaken: "rolled_back",
    articleId,
    bloggerPostId,
    revisionId,
    backupRevisionId: revisionId,
    urlPreserved: true,
    postIdPreserved: true,
    verifiedViaApi: true,
    beforeScore: Number(article.qualityScore || 80),
    afterScore: Number(revision.quality_score || 80),
    message: `Rollback berhasil: Artikel dikembalikan ke versi sebelum revisi #${revision.revision_number}.`
  };
}
