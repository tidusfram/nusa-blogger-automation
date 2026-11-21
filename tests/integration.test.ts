import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getArticleById,
  getDashboardStats,
  getDb,
  initializeDatabase,
  listArticles,
  listBlogs
} from "../electron/main/services/database";
import {
  analyzeArticleForDetection,
  runBatchDetection,
  syncArticlesFromBlogger
} from "../electron/main/engines/detectionEngine";
import { generateArticleRevision } from "../electron/main/engines/revisionEngine";
import {
  publishArticleUpdateToBlogger,
  rollbackArticleToRevision
} from "../electron/main/engines/publishingEngine";
import { generateAndAutoPublishNewArticle } from "../electron/main/engines/autoPublishEngine";
import {
  executeScheduledTask,
  runFullEndToEndAutomationPipeline
} from "../electron/main/engines/schedulerEngine";

describe("Integration Tests — 16 Tables, 3 Core Engines, Auto Publish, Rollback & Scheduler", () => {
  let tempDir = "";

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "nusa-blogger-test-"));
    initializeDatabase(tempDir, "test_nusa.db");
  });

  it("initializes all 16 required database tables with foreign keys and Blogger Post IDs", () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    const required16Tables = [
      "users",
      "workspaces",
      "workspace_members",
      "google_accounts",
      "blogs",
      "blog_settings",
      "articles",
      "article_revisions",
      "keywords",
      "media_assets",
      "automation_jobs",
      "schedules",
      "job_logs",
      "ai_settings",
      "update_reports",
      "source_references"
    ];

    for (const required of required16Tables) {
      expect(tableNames).toContain(required);
    }

    const articles = listArticles() as Array<Record<string, any>>;
    expect(articles.length).toBeGreaterThanOrEqual(3);
    expect(articles.every((a) => Boolean(a.bloggerPostId))).toBe(true);
  });

  it("synchronizes articles from Blogger API v3 and preserves blogger_post_id", async () => {
    const blogs = listBlogs() as Array<{ id: string }>;
    expect(blogs.length).toBeGreaterThan(0);

    const syncRes = await syncArticlesFromBlogger(blogs[0].id);
    expect(syncRes.totalFetched).toBeGreaterThanOrEqual(4);
    expect(syncRes.inserted).toBe(1); // Discovers remote post-77881004
  });

  it("Detection Engine classifies outdated, SEO-deficient, and optimal articles accurately", () => {
    const det1001 = analyzeArticleForDetection("art-blogger-1001");
    expect(det1001.hasOutdatedReferences).toBe(true);
    expect(det1001.detectionStatus).toBe("Update Recommended");
    expect(det1001.updateDecision).toBe("Revisi AI");

    const det1002 = analyzeArticleForDetection("art-blogger-1002");
    expect(det1002.detectionStatus).toBe("SEO Optimization Required");
    expect(det1002.updateDecision).toBe("SEO revision");

    const det1003 = analyzeArticleForDetection("art-blogger-1003");
    expect(det1003.detectionStatus).toBe("No Update Required");
    expect(det1003.updateDecision).toBe("Tidak update");
  });

  it("AI Revision Engine generates fact-preserving revision with H2/H3, internal link, alt text, and FAQ", async () => {
    const rev = await generateArticleRevision("art-blogger-1001");
    expect(rev.bloggerPostId).toBe("post-77881001");
    expect(rev.updatedContent).toContain("<h2");
    expect(rev.updatedContent).toContain("Pertanyaan Umum (FAQ)");
    expect(rev.updatedContent).toContain("alt=");
    expect(rev.qualityGate.passed).toBe(true);
    expect(rev.qualityScore).toBeGreaterThanOrEqual(75);
  });

  it("Publishing Engine backs up original content, updates in-place via PATCH preserving Post ID & URL, and supports Rollback", async () => {
    const beforeArticle = getArticleById("art-blogger-1001") as Record<string, any>;
    const originalUrl = beforeArticle.url;
    const originalPostId = beforeArticle.bloggerPostId;
    const originalPublishedAt = beforeArticle.publishedAt;

    const pubRes = await publishArticleUpdateToBlogger("art-blogger-1001");
    expect(pubRes.success).toBe(true);
    expect(pubRes.actionTaken).toBe("updated");
    expect(pubRes.postIdPreserved).toBe(true);
    expect(pubRes.urlPreserved).toBe(true);
    expect(pubRes.verifiedViaApi).toBe(true);
    expect(pubRes.backupRevisionId).toBeTruthy();

    const afterArticle = getArticleById("art-blogger-1001") as Record<string, any>;
    expect(afterArticle.bloggerPostId).toBe(originalPostId);
    expect(afterArticle.url).toBe(originalUrl);
    expect(afterArticle.publishedAt).toBe(originalPublishedAt);

    // Attempting to publish identical content again should be skipped
    const repeatRes = await publishArticleUpdateToBlogger("art-blogger-1001", pubRes.revisionId!);
    expect(repeatRes.actionTaken).toBe("skipped");

    // Rollback to backup snapshot restores original content while keeping Post ID & URL intact
    const rollbackRes = await rollbackArticleToRevision("art-blogger-1001", pubRes.backupRevisionId!);
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.actionTaken).toBe("rolled_back");

    const restoredArticle = getArticleById("art-blogger-1001") as Record<string, any>;
    expect(restoredArticle.title).toContain("2022");
    expect(restoredArticle.bloggerPostId).toBe(originalPostId);
    expect(restoredArticle.url).toBe(originalUrl);
  });

  it("Auto Publish Engine generates a new SEO article from queued keyword and publishes to Blogger", async () => {
    const blogs = listBlogs() as Array<{ id: string }>;
    const res = await generateAndAutoPublishNewArticle({
      blogId: blogs[0].id,
      publishImmediately: true
    });

    expect(res.status).toBe("published");
    expect(res.bloggerPostId).toMatch(/^post-/);
    expect(res.url).toContain("https://nusatekno-id.blogspot.com/");
    expect(res.qualityGate.passed).toBe(true);
  });

  it("Scheduler executes tasks with idempotency & runs full 10-step automation pipeline", async () => {
    const schedRes = await executeScheduledTask("sch-detect", false);
    expect(schedRes.skipped).toBe(false);

    // Running same schedule in the same hour bucket without forceManualTrigger is blocked by idempotency guard
    const duplicateRun = await executeScheduledTask("sch-detect", false);
    expect(duplicateRun.skipped).toBe(true);

    const pipelineRes = await runFullEndToEndAutomationPipeline();
    expect(pipelineRes.totalAnalyzed).toBeGreaterThanOrEqual(4);
    expect(pipelineRes.backupFileName).toContain(".json");

    const stats = getDashboardStats();
    expect(stats.articlesUpdated).toBeGreaterThanOrEqual(1);
  });
});
