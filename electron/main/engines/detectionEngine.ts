import { randomUUID } from "node:crypto";
import { getActiveWorkspaceId, getArticleById, getDb, logAudit } from "../services/database";
import { fetchBloggerPostsFromApi } from "../services/bloggerApi";
import { computeContentHash } from "../services/security";

export type DetectionStatus =
  | "No Update Required"
  | "Update Recommended"
  | "SEO Optimization Required"
  | "Content Revision Required"
  | "Manual Review Required";

export type DecisionOutcome =
  | "Tidak update"
  | "Revisi AI"
  | "SEO revision"
  | "Content revision"
  | "Manual review"
  | "Skip"
  | "Jangan publish"
  | "Auto publish update";

export interface DetectionAnalysisResult {
  articleId: string;
  bloggerPostId: string | null;
  title: string;
  detectionStatus: DetectionStatus;
  updateDecision: DecisionOutcome;
  priorityScore: number;
  qualityScore: number;
  seoScore: number;
  wordCount: number;
  isDuplicate: boolean;
  duplicateOfArticleId: string | null;
  hasOutdatedReferences: boolean;
  outdatedYearsFound: string[];
  hasUnverifiedClaims: boolean;
  unverifiedClaims: string[];
  missingAltCount: number;
  internalLinksCount: number;
  h2Count: number;
  h3Count: number;
  reasons: string[];
  seoOpportunities: string[];
}

export function stripHtmlToText(html: string): string {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(getWordTokens(textA));
  const tokensB = new Set(getWordTokens(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Synchronizes articles from Blogger API v3 into local database.
 * Preserves blogger_post_id, title, HTML content, URL, labels, and published_at.
 */
export async function syncArticlesFromBlogger(blogRowId: string) {
  const db = getDb();
  const blog = db
    .prepare("SELECT id, workspace_id, blogger_blog_id, name FROM blogs WHERE id = ?")
    .get(blogRowId) as { id: string; workspace_id: string; blogger_blog_id: string; name: string } | undefined;

  if (!blog) throw new Error("Blog tidak ditemukan untuk sinkronisasi.");

  const remotePosts = await fetchBloggerPostsFromApi(blogRowId);
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const nowIso = new Date().toISOString();

  for (const post of remotePosts) {
    const incomingHash = computeContentHash(post.title, post.content);
    const existing = db
      .prepare("SELECT id, content_hash FROM articles WHERE blog_id = ? AND blogger_post_id = ?")
      .get(blogRowId, post.id) as { id: string; content_hash: string | null } | undefined;

    let permalink = "";
    try {
      const parsedUrl = new URL(post.url);
      permalink = parsedUrl.pathname.replace(/^\//, "");
    } catch {
      permalink = post.url;
    }

    if (!existing) {
      db.prepare(`
        INSERT INTO articles(
          id, workspace_id, blog_id, blogger_post_id, title, content_html,
          labels_json, permalink, url, status, content_hash, published_at, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
      `).run(
        randomUUID(),
        blog.workspace_id,
        blogRowId,
        post.id,
        post.title,
        post.content,
        JSON.stringify(post.labels || []),
        permalink,
        post.url,
        incomingHash,
        post.published,
        nowIso
      );
      inserted += 1;
    } else if (existing.content_hash !== incomingHash) {
      db.prepare(`
        UPDATE articles
        SET title = ?, content_html = ?, labels_json = ?, url = ?, permalink = ?,
            content_hash = ?, last_synced_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        post.title,
        post.content,
        JSON.stringify(post.labels || []),
        post.url,
        permalink,
        incomingHash,
        nowIso,
        existing.id
      );
      updated += 1;
    } else {
      db.prepare("UPDATE articles SET last_synced_at = ? WHERE id = ?").run(nowIso, existing.id);
      unchanged += 1;
    }
  }

  db.prepare("UPDATE blogs SET last_synced_at = ? WHERE id = ?").run(nowIso, blogRowId);
  logAudit(
    blog.workspace_id,
    "blogger.sync",
    "blog",
    blogRowId,
    `Sinkronisasi Blogger selesai: ${inserted} baru, ${updated} diperbarui, ${unchanged} identik.`
  );

  return {
    blogId: blogRowId,
    blogName: blog.name,
    totalFetched: remotePosts.length,
    inserted,
    updated,
    unchanged,
    syncedAt: nowIso
  };
}

/**
 * Analyzes a single article using the Detection Engine and Decision Matrix.
 */
export function analyzeArticleForDetection(articleId: string): DetectionAnalysisResult {
  const db = getDb();
  const article = getArticleById(articleId) as Record<string, unknown> | null;
  if (!article) {
    throw new Error(`Artikel dengan ID '${articleId}' tidak ditemukan.`);
  }

  const title = String(article.title || "");
  const html = String(article.contentHtml || "");
  const metaDesc = String(article.metaDescription || "").trim();
  const targetKeyword = String(article.targetKeyword || "").toLowerCase().trim();
  const plainText = stripHtmlToText(html);
  const words = getWordTokens(plainText);
  const wordCount = words.length;

  const reasons: string[] = [];
  const seoOpportunities: string[] = [];

  // 1. Outdated temporal reference detection (years 2018-2024 in title or body)
  const combinedText = `${title} ${plainText}`;
  const yearMatches = combinedText.match(/\b(201[89]|202[0-4])\b/g) || [];
  const outdatedYearsFound = Array.from(new Set(yearMatches));
  const publishedYear = article.publishedAt ? new Date(String(article.publishedAt)).getUTCFullYear() : 2026;
  const hasOutdatedReferences = outdatedYearsFound.length > 0 || publishedYear <= 2023;

  if (outdatedYearsFound.length > 0) {
    reasons.push(`Ditemukan referensi tahun kedaluwarsa (${outdatedYearsFound.join(", ")}).`);
  } else if (publishedYear <= 2023) {
    reasons.push(`Artikel diterbitkan pada tahun ${publishedYear} dan memerlukan penyegaran konteks terbaru.`);
  }

  // 2. Duplicate detection against sibling articles in the same blog
  const siblings = db
    .prepare("SELECT id, title, content_html FROM articles WHERE blog_id = ? AND id != ?")
    .all(String(article.blogId), articleId) as Array<{ id: string; title: string; content_html: string }>;

  let isDuplicate = false;
  let duplicateOfArticleId: string | null = null;
  for (const sib of siblings) {
    const titleSim = calculateJaccardSimilarity(title, sib.title);
    const bodySim = calculateJaccardSimilarity(plainText, stripHtmlToText(sib.content_html || ""));
    if (titleSim >= 0.85 || bodySim >= 0.82) {
      isDuplicate = true;
      duplicateOfArticleId = sib.id;
      reasons.push(`Terdeteksi duplikat konten tinggi dengan artikel '${sib.title}' (ID: ${sib.id}).`);
      break;
    }
  }

  // 3. Unverified factual claims check (e.g., percentages, currency Rp/USD, or explicit "menurut riset" without source_references)
  const sources = (article.sources as Array<{ verified: number; claimSupported: string }>) || [];
  const verifiedSourceCount = sources.filter((s) => Boolean(s.verified)).length;
  const claimPatterns = plainText.match(/\b(\d+(?:[.,]\d+)?%|\bRp\s?\d[\d.,]*|\bmenurut\s+survei\b|\bdata\s+resmi\s+menyebutkan\b)/gi) || [];
  const unverifiedClaims = verifiedSourceCount === 0 && claimPatterns.length > 0 ? Array.from(new Set(claimPatterns)) : [];
  const hasUnverifiedClaims = unverifiedClaims.length > 0;
  if (hasUnverifiedClaims) {
    reasons.push(
      `Terdapat klaim statistik/angka (${unverifiedClaims.join(", ")}) tanpa referensi sumber terverifikasi.`
    );
  }

  // 4. HTML structure & SEO analysis
  const h2Count = (html.match(/<h2\b[^>]*>/gi) || []).length;
  const h3Count = (html.match(/<h3\b[^>]*>/gi) || []).length;
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  let missingAltCount = 0;
  for (const img of imgTags) {
    if (!/\balt\s*=\s*["'][^"']+["']/i.test(img)) {
      missingAltCount += 1;
    }
  }

  const anchorTags = html.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi) || [];
  const internalLinksCount = anchorTags.length;

  let seoScore = 100;
  if (metaDesc.length < 100 || metaDesc.length > 165) {
    seoScore -= 18;
    seoOpportunities.push("Optimalkan meta description agar panjangnya 120–160 karakter.");
  }
  if (h2Count < 2) {
    seoScore -= 15;
    seoOpportunities.push("Tambahkan subheading H2 terstruktur (minimal 2 H2).");
  }
  if (h3Count < 1) {
    seoScore -= 8;
    seoOpportunities.push("Tambahkan subheading H3 atau bagian FAQ untuk menjawab search intent.");
  }
  if (missingAltCount > 0) {
    seoScore -= 12;
    seoOpportunities.push(`Lengkapi atribut alt text pada ${missingAltCount} gambar.`);
  }
  if (internalLinksCount === 0) {
    seoScore -= 14;
    seoOpportunities.push("Tambahkan internal link relevan ke artikel lain di blog yang sama.");
  }
  if (targetKeyword && !plainText.toLowerCase().includes(targetKeyword)) {
    seoScore -= 15;
    seoOpportunities.push(`Sertakan keyword utama '${targetKeyword}' secara alami di dalam artikel.`);
  }
  seoScore = Math.max(15, Math.min(100, seoScore));

  // 5. Content Quality Score calculation
  let qualityScore = 100;
  if (wordCount < 140) {
    qualityScore -= 30;
    reasons.push(`Konten terlalu singkat (${wordCount} kata); pembahasan perlu diperluas.`);
  } else if (wordCount < 220) {
    qualityScore -= 12;
  }
  if (hasOutdatedReferences) qualityScore -= 25;
  if (h2Count === 0) qualityScore -= 15;
  if (hasUnverifiedClaims) qualityScore -= 25;
  if (isDuplicate) qualityScore -= 40;
  qualityScore = Math.max(10, Math.min(100, qualityScore));

  // 6. Determine Detection Engine Result & Decision Logic (Section 3A & Section 4)
  let detectionStatus: DetectionStatus = "No Update Required";
  let updateDecision: DecisionOutcome = "Tidak update";
  let priorityScore = 15;

  if (isDuplicate) {
    detectionStatus = "Manual Review Required";
    updateDecision = "Skip";
    priorityScore = 5;
  } else if (hasUnverifiedClaims) {
    detectionStatus = "Manual Review Required";
    updateDecision = "Manual review";
    priorityScore = 88;
  } else if (hasOutdatedReferences) {
    detectionStatus = "Update Recommended";
    updateDecision = "Revisi AI";
    priorityScore = 92;
  } else if (wordCount < 140) {
    detectionStatus = "Content Revision Required";
    updateDecision = "Content revision";
    priorityScore = 80;
  } else if (seoScore < 78) {
    detectionStatus = "SEO Optimization Required";
    updateDecision = "SEO revision";
    priorityScore = 72;
  } else {
    detectionStatus = "No Update Required";
    updateDecision = "Tidak update";
    priorityScore = Math.max(10, 100 - Math.round((qualityScore + seoScore) / 2));
  }

  // Persist results to articles table
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE articles
    SET detection_status = ?, update_decision = ?, priority_score = ?,
        quality_score = ?, seo_score = ?, last_detected_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(detectionStatus, updateDecision, priorityScore, qualityScore, seoScore, nowIso, articleId);

  return {
    articleId,
    bloggerPostId: (article.bloggerPostId as string | null) ?? null,
    title,
    detectionStatus,
    updateDecision,
    priorityScore,
    qualityScore,
    seoScore,
    wordCount,
    isDuplicate,
    duplicateOfArticleId,
    hasOutdatedReferences,
    outdatedYearsFound,
    hasUnverifiedClaims,
    unverifiedClaims,
    missingAltCount,
    internalLinksCount,
    h2Count,
    h3Count,
    reasons,
    seoOpportunities
  };
}

export function runBatchDetection(workspaceId?: string, blogId?: string) {
  const db = getDb();
  const wsId = workspaceId || getActiveWorkspaceId();
  const rows = blogId
    ? (db.prepare("SELECT id FROM articles WHERE workspace_id = ? AND blog_id = ?").all(wsId, blogId) as Array<{ id: string }>)
    : (db.prepare("SELECT id FROM articles WHERE workspace_id = ?").all(wsId) as Array<{ id: string }>);

  const results = rows.map((r) => analyzeArticleForDetection(r.id));
  logAudit(
    wsId,
    "detection.batch_run",
    "articles",
    blogId || wsId,
    `Detection Engine menganalisis ${results.length} artikel.`
  );
  return results;
}
