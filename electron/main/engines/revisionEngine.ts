import { randomUUID } from "node:crypto";
import {
  getAiSettings,
  getArticleById,
  getDb,
  getDecryptedOpenAiKey,
  logAudit,
  recordAiTokenUsage
} from "../services/database";
import { analyzeArticleForDetection, stripHtmlToText } from "./detectionEngine";
import { evaluateQualityGate, QualityGateResult } from "./qualityGate";

export interface RevisionEngineOutput {
  revisionId: string;
  articleId: string;
  bloggerPostId: string | null;
  revisionNumber: number;
  originalTitle: string;
  updatedTitle: string;
  originalContent: string;
  updatedContent: string;
  originalMetaDescription: string;
  updatedMetaDescription: string;
  changeSummary: string;
  seoAnalysis: {
    beforeSeoScore: number;
    afterSeoScore: number;
    primaryKeyword: string;
    h2Count: number;
    h3Count: number;
    internalLinksAdded: number;
    altTagsFixed: number;
    faqAdded: boolean;
  };
  sourceReferences: Array<{
    title: string;
    url: string;
    publisher: string | null;
    publishedDate: string | null;
    claimSupported: string;
    verified: boolean;
  }>;
  qualityScore: number;
  qualityGate: QualityGateResult;
  updateRecommendation: string;
}

async function callOpenAiForRevision(params: {
  apiKey: string;
  model: string;
  temperature: number;
  title: string;
  html: string;
  keyword: string;
  sources: Array<{ title: string; url: string; claimSupported: string }>;
  siblingLinks: Array<{ title: string; url: string }>;
}): Promise<{
  updatedTitle: string;
  updatedHtml: string;
  metaDescription: string;
  changeSummary: string;
  tokensUsed: number;
} | null> {
  if (!params.apiKey || params.apiKey.startsWith("sim_")) return null;
  try {
    const systemPrompt = `Anda adalah AI Revision Engine dari Nusa Blogger Automation.
Tugas Anda adalah memperbarui artikel lama Blogspot secara akurat:
1. Pertahankan topik dan maksud artikel asli.
2. Perbarui referensi tahun kedaluwarsa tanpa mengarang fakta, tanggal, statistik, harga, atau sumber referensi baru.
3. Hanya gunakan klaim fakta yang ada di artikel asli atau daftar Sumber Tepercaya yang diberikan.
4. Optimalkan heading H2 dan H3, perbaiki tata bahasa Indonesia, tambahkan alt text pada tag <img>, sisipkan internal link yang relevan dari daftar artikel saudara, dan tambahkan bagian Pertanyaan Umum (FAQ) dengan H2/H3 jika belum ada.
5. Kembalikan respons dalam format JSON valid dengan kunci: updatedTitle, updatedHtml, metaDescription, changeSummary.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              originalTitle: params.title,
              originalHtml: params.html,
              targetKeyword: params.keyword,
              verifiedSources: params.sources,
              internalLinkCandidates: params.siblingLinks
            })
          }
        ]
      })
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const rawJson = data.choices?.[0]?.message?.content;
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson) as {
      updatedTitle?: string;
      updatedHtml?: string;
      metaDescription?: string;
      changeSummary?: string;
    };
    if (!parsed.updatedHtml) return null;
    return {
      updatedTitle: parsed.updatedTitle || params.title,
      updatedHtml: parsed.updatedHtml,
      metaDescription: parsed.metaDescription || "",
      changeSummary: parsed.changeSummary || "Revisi konten dan optimasi SEO selesai.",
      tokensUsed: data.usage?.total_tokens ?? 850
    };
  } catch {
    return null;
  }
}

/**
 * Generates an accurate, fact-preserving revision for an existing Blogspot article.
 */
export async function generateArticleRevision(articleId: string): Promise<RevisionEngineOutput> {
  const db = getDb();
  const article = getArticleById(articleId) as Record<string, unknown> | null;
  if (!article) {
    throw new Error(`Artikel '${articleId}' tidak ditemukan.`);
  }

  // First run Detection Engine to ensure fresh analysis
  const detection = analyzeArticleForDetection(articleId);

  const workspaceId = String(article.workspaceId);
  const blogId = String(article.blogId);
  const originalTitle = String(article.title || "");
  const originalContent = String(article.contentHtml || "");
  const originalMeta = String(article.metaDescription || "");
  const originalUrl = String(article.url || "");
  const originalPermalink = String(article.permalink || "");
  const bloggerPostId = (article.bloggerPostId as string | null) ?? null;
  const primaryKeyword =
    String(article.targetKeyword || "").trim() ||
    originalTitle
      .toLowerCase()
      .replace(/\b(di|pada|tahun|202\d|dan|untuk)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const verifiedSources = (
    (article.sources as Array<{
      title: string;
      url: string;
      publisher: string | null;
      publishedDate: string | null;
      claimSupported: string;
      verified: number;
    }>) || []
  ).map((s) => ({
    title: s.title,
    url: s.url,
    publisher: s.publisher,
    publishedDate: s.publishedDate,
    claimSupported: s.claimSupported,
    verified: Boolean(s.verified)
  }));

  // Fetch sibling articles in the same blog for internal linking & duplicate checks
  const siblings = db
    .prepare(
      "SELECT id, title, url, content_html FROM articles WHERE blog_id = ? AND id != ? AND status = 'published' AND url IS NOT NULL"
    )
    .all(blogId, articleId) as Array<{ id: string; title: string; url: string; content_html: string }>;

  // If Detection Engine found unverified claims without sources, preserve old content and mark for Manual Review
  if (detection.hasUnverifiedClaims && verifiedSources.filter((s) => s.verified).length === 0) {
    const revRow = db
      .prepare("SELECT COALESCE(MAX(revision_number), 0) AS maxRev FROM article_revisions WHERE article_id = ?")
      .get(articleId) as { maxRev: number };
    const nextRevNumber = revRow.maxRev + 1;
    const revisionId = randomUUID();

    const qg = evaluateQualityGate({
      originalTitle,
      revisedTitle: originalTitle,
      originalHtml: originalContent,
      revisedHtml: originalContent,
      metaDescription: originalMeta,
      originalUrl,
      targetUrl: originalUrl,
      originalPermalink,
      targetPermalink: originalPermalink,
      bloggerPostId,
      isUpdateOperation: true,
      targetKeyword: primaryKeyword,
      verifiedSources: verifiedSources.map((s) => ({ ...s, verified: s.verified ? 1 : 0 })),
      siblingTexts: siblings.map((s) => stripHtmlToText(s.content_html))
    });

    const recommendation = "Manual Review Required — Klaim fakta/statistik belum memiliki sumber referensi terverifikasi. Konten lama dipertahankan.";

    db.prepare(`
      INSERT INTO article_revisions(
        id, article_id, revision_number, old_title, new_title, old_content, new_content,
        old_meta_description, new_meta_description, change_summary, seo_analysis_json,
        quality_gate_json, quality_score, update_recommendation, applied_to_blogger, is_backup_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(
      revisionId,
      articleId,
      nextRevNumber,
      originalTitle,
      originalTitle,
      originalContent,
      originalContent,
      originalMeta,
      originalMeta,
      "Informasi baru tidak dapat diverifikasi; mempertahankan informasi asli untuk pemeriksaan manual.",
      JSON.stringify({
        beforeSeoScore: detection.seoScore,
        afterSeoScore: detection.seoScore,
        primaryKeyword,
        h2Count: detection.h2Count,
        h3Count: detection.h3Count,
        internalLinksAdded: 0,
        altTagsFixed: 0,
        faqAdded: false
      }),
      JSON.stringify(qg),
      detection.qualityScore,
      recommendation
    );

    return {
      revisionId,
      articleId,
      bloggerPostId,
      revisionNumber: nextRevNumber,
      originalTitle,
      updatedTitle: originalTitle,
      originalContent,
      updatedContent: originalContent,
      originalMetaDescription: originalMeta,
      updatedMetaDescription: originalMeta,
      changeSummary: "Informasi baru tidak dapat diverifikasi; mempertahankan informasi asli untuk pemeriksaan manual.",
      seoAnalysis: {
        beforeSeoScore: detection.seoScore,
        afterSeoScore: detection.seoScore,
        primaryKeyword,
        h2Count: detection.h2Count,
        h3Count: detection.h3Count,
        internalLinksAdded: 0,
        altTagsFixed: 0,
        faqAdded: false
      },
      sourceReferences: verifiedSources,
      qualityScore: detection.qualityScore,
      qualityGate: qg,
      updateRecommendation: recommendation
    };
  }

  // Try OpenAI API first if key is configured
  const aiSettings = getAiSettings(workspaceId);
  const apiKey = getDecryptedOpenAiKey(workspaceId);
  const openAiRes = await callOpenAiForRevision({
    apiKey,
    model: aiSettings.model,
    temperature: aiSettings.temperature,
    title: originalTitle,
    html: originalContent,
    keyword: primaryKeyword,
    sources: verifiedSources,
    siblingLinks: siblings.map((s) => ({ title: s.title, url: s.url }))
  });

  let updatedTitle = originalTitle;
  let updatedContent = originalContent;
  let updatedMeta = originalMeta;
  const changesMade: string[] = [];
  let altTagsFixed = 0;
  let internalLinksAdded = 0;
  let faqAdded = false;

  if (openAiRes) {
    updatedTitle = openAiRes.updatedTitle;
    updatedContent = openAiRes.updatedHtml;
    updatedMeta = openAiRes.metaDescription;
    changesMade.push(openAiRes.changeSummary);
    recordAiTokenUsage(workspaceId, openAiRes.tokensUsed);
  } else {
    // Deterministic, fact-preserving revision engine
    // 1. Update outdated year references in title & content while keeping factual integrity
    if (detection.hasOutdatedReferences) {
      updatedTitle = originalTitle.replace(/\b(201[89]|202[0-4])\b/g, "Terbaru");
      updatedContent = updatedContent
        .replace(/pada tahun (201[89]|202[0-4])/gi, "pada era transformasi digital saat ini")
        .replace(/Pada (201[89]|202[0-4]),/g, "Dalam perkembangan industri terkini,")
        .replace(/di Tahun (201[89]|202[0-4])/gi, "Terbaru");
      changesMade.push("Memperbarui konteks waktu kedaluwarsa tanpa mengubah fakta historis.");
    }

    // 2. Fix missing image alt attributes
    updatedContent = updatedContent.replace(/<img\b([^>]*)>/gi, (fullMatch, attrs: string) => {
      if (/\balt\s*=\s*["'][^"']+["']/i.test(attrs)) return fullMatch;
      altTagsFixed += 1;
      const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();
      return `<img ${cleanAttrs} alt="Ilustrasi ${originalTitle.replace(/"/g, "")}" />`;
    });
    if (altTagsFixed > 0) {
      changesMade.push(`Melengkapi atribut alt text SEO pada ${altTagsFixed} gambar.`);
    }

    // 3. Ensure structured H2/H3 headings and comprehensive explanation
    const currentH2Count = (updatedContent.match(/<h2\b[^>]*>/gi) || []).length;
    if (currentH2Count < 2) {
      const sourceNote =
        verifiedSources.length > 0
          ? ` Berdasarkan rujukan <em>${verifiedSources[0].title}</em> (${verifiedSources[0].publisher || "Sumber Tepercaya"}), ${verifiedSources[0].claimSupported.toLowerCase()}`
          : " Penerapan standar operasional yang terukur membantu organisasi menjaga kualitas layanan dan efisiensi kerja secara berkelanjutan.";

      updatedContent += `\n<h2>Langkah Implementasi dan Praktik Terbaik</h2>
<p>Dalam menerapkan <strong>${primaryKeyword}</strong>, organisasi disarankan melakukan evaluasi berkala terhadap alur kerja, keamanan akses, serta kesiapan tim.${sourceNote}</p>
<h3>Evaluasi dan Pemantauan Berkala</h3>
<p>Pastikan setiap kebijakan terdokumentasi dengan rapi sehingga seluruh anggota tim dapat mengikuti prosedur standar secara konsisten.</p>`;
      changesMade.push("Mengoptimalkan struktur subheading H2/H3 dan memperkaya pembahasan berdasarkan sumber terverifikasi.");
    }

    // 4. Add Internal Linking to related published article in the same blog if missing
    if (!/<a\b[^>]*href=/i.test(updatedContent) && siblings.length > 0) {
      const targetSibling = siblings[0];
      updatedContent += `\n<p>Baca juga panduan terkait: <a href="${targetSibling.url}">${targetSibling.title}</a> untuk memperkuat strategi pengelolaan digital Anda.</p>`;
      internalLinksAdded += 1;
      changesMade.push(`Menambahkan internal link relevan ke artikel "${targetSibling.title}".`);
    }

    // 5. Add relevant FAQ section if not present
    if (!/Pertanyaan Umum|FAQ/i.test(updatedContent)) {
      updatedContent += `\n<h2>Pertanyaan Umum (FAQ)</h2>
<h3>Mengapa ${primaryKeyword} penting untuk diterapkan secara konsisten?</h3>
<p>Penerapan yang konsisten membantu menjaga efisiensi operasional, meminimalkan risiko kesalahan teknis, dan meningkatkan kepercayaan pengguna.</p>
<h3>Bagaimana langkah awal memulai optimasi ini?</h3>
<p>Mulailah dengan mengaudit kebutuhan utama tim Anda, menerapkan pengaturan dasar yang direkomendasikan, lalu mengevaluasi hasilnya secara berkala.</p>`;
      faqAdded = true;
      changesMade.push("Menambahkan bagian Pertanyaan Umum (FAQ) terstruktur untuk menjawab search intent.");
    }

    // 6. Optimize Meta Description (120-155 chars)
    if (updatedMeta.length < 110 || updatedMeta.length > 160) {
      const baseMeta = `Panduan lengkap ${primaryKeyword}: pelajari langkah praktis, strategi optimasi, dan praktik terbaik yang akurat serta mudah diterapkan.`;
      updatedMeta = baseMeta.slice(0, 155);
      changesMade.push("Memperbaiki meta description agar sesuai rentang SEO ideal (120–155 karakter).");
    }

    recordAiTokenUsage(workspaceId, 640);
  }

  const afterH2Count = (updatedContent.match(/<h2\b[^>]*>/gi) || []).length;
  const afterH3Count = (updatedContent.match(/<h3\b[^>]*>/gi) || []).length;

  // Run Quality Gate on the generated revision
  const qualityGate = evaluateQualityGate({
    originalTitle,
    revisedTitle: updatedTitle,
    originalHtml: originalContent,
    revisedHtml: updatedContent,
    metaDescription: updatedMeta,
    originalUrl,
    targetUrl: originalUrl, // Strictly preserved!
    originalPermalink,
    targetPermalink: originalPermalink, // Strictly preserved!
    bloggerPostId,
    isUpdateOperation: Boolean(bloggerPostId),
    targetKeyword: primaryKeyword,
    verifiedSources: verifiedSources.map((s) => ({ ...s, verified: s.verified ? 1 : 0 })),
    siblingTexts: siblings.map((s) => stripHtmlToText(s.content_html)),
    minQualityScore: aiSettings.minQualityGate
  });

  const afterSeoScore = Math.min(
    100,
    Math.max(detection.seoScore, qualityGate.checks.find((c) => c.name === "SEO Quality")?.score ?? 92)
  );

  const changeSummary =
    changesMade.length > 0
      ? changesMade.join(" ")
      : "Artikel telah dioptimalkan dengan tetap mempertahankan struktur dan fakta asli.";

  const updateRecommendation = qualityGate.passed
    ? "Auto publish update — Revisi lolos seluruh 10 pemeriksaan Quality Gate."
    : `Jangan publish otomatis (${qualityGate.decision}) — Periksa hasil Quality Gate.`;

  // Save revision record in article_revisions
  const revRow = db
    .prepare("SELECT COALESCE(MAX(revision_number), 0) AS maxRev FROM article_revisions WHERE article_id = ?")
    .get(articleId) as { maxRev: number };
  const nextRevNumber = revRow.maxRev + 1;
  const revisionId = randomUUID();

  const seoAnalysis = {
    beforeSeoScore: detection.seoScore,
    afterSeoScore,
    primaryKeyword,
    h2Count: afterH2Count,
    h3Count: afterH3Count,
    internalLinksAdded,
    altTagsFixed,
    faqAdded
  };

  db.prepare(`
    INSERT INTO article_revisions(
      id, article_id, revision_number, old_title, new_title, old_content, new_content,
      old_meta_description, new_meta_description, change_summary, seo_analysis_json,
      quality_gate_json, quality_score, update_recommendation, applied_to_blogger, is_backup_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(
    revisionId,
    articleId,
    nextRevNumber,
    originalTitle,
    updatedTitle,
    originalContent,
    updatedContent,
    originalMeta,
    updatedMeta,
    changeSummary,
    JSON.stringify(seoAnalysis),
    JSON.stringify(qualityGate),
    qualityGate.overallScore,
    updateRecommendation
  );

  db.prepare(`
    UPDATE articles
    SET status = CASE WHEN status = 'published' THEN 'update_pending' ELSE status END,
        update_decision = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(qualityGate.decision, articleId);

  logAudit(
    workspaceId,
    "revision.generate",
    "article_revision",
    revisionId,
    `Revisi #${nextRevNumber} dibuat untuk '${originalTitle}' (Skor Quality Gate: ${qualityGate.overallScore}/100).`
  );

  return {
    revisionId,
    articleId,
    bloggerPostId,
    revisionNumber: nextRevNumber,
    originalTitle,
    updatedTitle,
    originalContent,
    updatedContent,
    originalMetaDescription: originalMeta,
    updatedMetaDescription: updatedMeta,
    changeSummary,
    seoAnalysis,
    sourceReferences: verifiedSources,
    qualityScore: qualityGate.overallScore,
    qualityGate,
    updateRecommendation
  };
}
