import { randomUUID } from "node:crypto";
import {
  getActiveWorkspaceId,
  getAiSettings,
  getDb,
  getDecryptedOpenAiKey,
  logAudit,
  recordAiTokenUsage
} from "../services/database";
import { insertNewBloggerPost } from "../services/bloggerApi";
import { computeContentHash } from "../services/security";
import { evaluateQualityGate, QualityGateResult } from "./qualityGate";

export interface AutoPublishOutput {
  articleId: string;
  bloggerPostId: string;
  url: string;
  title: string;
  keyword: string;
  searchIntent: string;
  outline: string[];
  metaDescription: string;
  contentHtml: string;
  mediaAssetId: string;
  qualityGate: QualityGateResult;
  status: "published" | "queued" | "draft";
}

function capitalizeWords(input: string): string {
  return input
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * End-to-End Auto Publish Engine for creating and publishing new Blogspot articles from keywords.
 */
export async function generateAndAutoPublishNewArticle(input: {
  workspaceId?: string;
  blogId: string;
  keywordId?: string;
  customKeyword?: string;
  publishImmediately?: boolean;
}): Promise<AutoPublishOutput> {
  const db = getDb();
  const wsId = input.workspaceId || getActiveWorkspaceId();

  let keywordRow: { id: string; keyword: string; intent: string } | undefined;
  if (input.keywordId) {
    keywordRow = db
      .prepare("SELECT id, keyword, intent FROM keywords WHERE id = ?")
      .get(input.keywordId) as { id: string; keyword: string; intent: string } | undefined;
  } else if (input.customKeyword && input.customKeyword.trim()) {
    const kwId = randomUUID();
    const rawKw = input.customKeyword.trim();
    const intent = rawKw.match(/beli|harga|jasa|paket|terbaik/i) ? "commercial" : "informational";
    db.prepare(`
      INSERT INTO keywords(id, workspace_id, blog_id, keyword, intent, priority, status)
      VALUES (?, ?, ?, ?, ?, 4, 'processing')
    `).run(kwId, wsId, input.blogId, rawKw, intent);
    keywordRow = { id: kwId, keyword: rawKw, intent };
  } else {
    keywordRow = db
      .prepare(
        "SELECT id, keyword, intent FROM keywords WHERE workspace_id = ? AND status = 'queued' ORDER BY priority DESC, created_at ASC LIMIT 1"
      )
      .get(wsId) as { id: string; keyword: string; intent: string } | undefined;
  }

  if (!keywordRow) {
    throw new Error("Tidak ada keyword dalam antrean (queued). Tambahkan keyword baru di Keyword Manager.");
  }

  const keyword = keywordRow.keyword.trim();
  const searchIntent = keywordRow.intent || "informational";
  const titleTopic = capitalizeWords(keyword);
  const seoTitle = `Panduan Lengkap ${titleTopic}: Strategi & Implementasi Praktis`;

  const outline = [
    `Memahami Konsep Dasar ${titleTopic}`,
    `Analisis Kebutuhan dan Manfaat Utama`,
    `Langkah-Langkah Implementasi Terstruktur`,
    `Praktik Terbaik dan Kesalahan yang Harus Dihindari`,
    `Pertanyaan Umum (FAQ)`
  ];

  // Fetch related published article in the same blog for internal linking
  const sibling = db
    .prepare("SELECT title, url FROM articles WHERE blog_id = ? AND status = 'published' AND url IS NOT NULL LIMIT 1")
    .get(input.blogId) as { title: string; url: string } | undefined;

  const internalLinkHtml = sibling
    ? `<p>Untuk melengkapi wawasan operasional Anda, pelajari juga <a href="${sibling.url}">${sibling.title}</a> yang telah kami bahas sebelumnya.</p>`
    : "";

  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const imageUrl = `https://nusatekno-id.blogspot.com/assets/${slug}-featured.svg`;
  const imageAlt = `Ilustrasi panduan ${keyword} untuk bisnis dan profesional`;

  let contentHtml = `<p>Dalam lanskap digital yang terus berkembang, memahami <strong>${keyword}</strong> secara komprehensif merupakan langkah strategis bagi pemilik bisnis maupun praktisi teknologi di Indonesia. Artikel ini membahas kerangka kerja praktis yang dapat langsung diterapkan secara terukur.</p>
<img src="${imageUrl}" alt="${imageAlt}" />
<h2>${outline[0]}</h2>
<p>Penerapan <strong>${keyword}</strong> bertujuan untuk menciptakan proses kerja yang lebih terstandarisasi, transparan, dan mudah dievaluasi. Dengan fondasi yang tepat, tim dapat meminimalkan hambatan teknis sehari-hari.</p>
<h2>${outline[1]}</h2>
<p>Setiap organisasi memiliki prioritas yang berbeda sesuai skala operasionalnya. Evaluasi awal membantu manajemen menentukan indikator keberhasilan yang realistis tanpa pemborosan sumber daya.</p>
<h3>Indikator Keberhasilan Utama</h3>
<p>Pastikan Anda mengukur ketercapaian target berdasarkan kualitas output, konsistensi jadwal kerja, serta kemudahan kolaborasi lintas divisi.</p>
<h2>${outline[2]}</h2>
<p>Mulailah dengan menyusun dokumentasi standar, menyiapkan konfigurasi utama, lalu melakukan uji coba bertahap sebelum diterapkan secara penuh di seluruh unit kerja.</p>
${internalLinkHtml}
<h2>${outline[3]}</h2>
<p>Hindari mengubah konfigurasi kritikal tanpa membuat cadangan (backup) terlebih dahulu. Lakukan peninjauan berkala agar sistem tetap selaras dengan kebutuhan pengguna.</p>
<h2>${outline[4]}</h2>
<h3>Apakah ${keyword} cocok diterapkan oleh tim skala kecil maupun menengah?</h3>
<p>Ya, pendekatan bertahap memungkinkan usaha kecil maupun menengah menyesuaikan kapasitas implementasi sesuai kebutuhan operasional.</p>
<h3>Seberapa sering evaluasi perlu dilakukan?</h3>
<p>Disarankan melakukan audit rutin setiap bulan untuk memastikan kualitas dan performa tetap optimal.</p>`;

  let metaDescription = `Pelajari ${keyword} secara mendalam: panduan langkah demi langkah, strategi optimasi, serta praktik terbaik yang siap diterapkan untuk bisnis Anda.`.slice(0, 155);

  // Optional live OpenAI generation if API key is configured
  const aiSettings = getAiSettings(wsId);
  const apiKey = getDecryptedOpenAiKey(wsId);
  if (apiKey && !apiKey.startsWith("sim_")) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: aiSettings.model,
          temperature: aiSettings.temperature,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Anda adalah AI Article Writer Nusa Blogger Automation. Buat artikel HTML SEO berkualitas tinggi dalam bahasa Indonesia (tanpa mengarang statistik/harga fiktif). Kembalikan JSON dengan kunci: title, metaDescription, contentHtml."
            },
            {
              role: "user",
              content: JSON.stringify({ keyword, searchIntent, outline, imageUrl, imageAlt })
            }
          ]
        })
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw) as { title?: string; metaDescription?: string; contentHtml?: string };
          if (parsed.contentHtml) contentHtml = parsed.contentHtml;
          if (parsed.metaDescription) metaDescription = parsed.metaDescription.slice(0, 155);
          recordAiTokenUsage(wsId, data.usage?.total_tokens ?? 950);
        }
      }
    } catch {
      // Fallback to structured HTML generated above
    }
  } else {
    recordAiTokenUsage(wsId, 720);
  }

  // Evaluate Quality Gate before queueing/publishing
  const qualityGate = evaluateQualityGate({
    originalTitle: seoTitle,
    revisedTitle: seoTitle,
    originalHtml: "",
    revisedHtml: contentHtml,
    metaDescription,
    originalUrl: "",
    targetUrl: "",
    originalPermalink: "",
    targetPermalink: "",
    bloggerPostId: null,
    isUpdateOperation: false,
    targetKeyword: keyword,
    verifiedSources: [],
    minQualityScore: aiSettings.minQualityGate
  });

  const articleId = randomUUID();
  const mediaAssetId = randomUUID();
  const shouldPublish = (input.publishImmediately ?? true) && qualityGate.passed;

  let bloggerPostId = "";
  let publishedUrl = "";
  let permalink = "";
  let finalStatus: "published" | "queued" | "draft" = qualityGate.passed ? "queued" : "draft";

  if (shouldPublish) {
    const postRes = await insertNewBloggerPost(input.blogId, {
      title: seoTitle,
      content: contentHtml,
      labels: [capitalizeWords(keyword.split(" ")[0] || "Panduan"), "SEO", "Bisnis"]
    });
    bloggerPostId = postRes.id;
    publishedUrl = postRes.url;
    try {
      permalink = new URL(publishedUrl).pathname.replace(/^\//, "");
    } catch {
      permalink = publishedUrl;
    }
    finalStatus = "published";
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO articles(
      id, workspace_id, blog_id, keyword_id, blogger_post_id, title, content_html,
      meta_description, labels_json, permalink, url, status, detection_status,
      update_decision, priority_score, quality_score, seo_score, content_hash,
      published_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'No Update Required', 'Tidak update', 10, ?, ?, ?, ?, ?)
  `).run(
    articleId,
    wsId,
    input.blogId,
    keywordRow.id,
    bloggerPostId || null,
    seoTitle,
    contentHtml,
    metaDescription,
    JSON.stringify([capitalizeWords(keyword.split(" ")[0] || "Panduan"), "SEO"]),
    permalink || null,
    publishedUrl || null,
    finalStatus,
    qualityGate.overallScore,
    qualityGate.checks.find((c) => c.name === "SEO Quality")?.score ?? 94,
    computeContentHash(seoTitle, contentHtml),
    shouldPublish ? nowIso : null,
    shouldPublish ? nowIso : null
  );

  // Store generated media asset
  db.prepare(`
    INSERT INTO media_assets(id, workspace_id, blog_id, article_id, file_name, mime_type, url, alt_text, caption, source_type)
    VALUES (?, ?, ?, ?, ?, 'image/svg+xml', ?, ?, ?, 'ai_generated')
  `).run(
    mediaAssetId,
    wsId,
    input.blogId,
    articleId,
    `${slug}-featured.svg`,
    imageUrl,
    imageAlt,
    `Ilustrasi Utama: ${seoTitle}`
  );

  db.prepare("UPDATE keywords SET status = 'used' WHERE id = ?").run(keywordRow.id);

  if (shouldPublish) {
    db.prepare(`
      INSERT INTO update_reports(
        id, workspace_id, blog_id, article_id, revision_id, blogger_post_id,
        action_taken, detection_status, decision_reason, before_score, after_score,
        url_preserved, post_id_preserved, verified_via_api
      ) VALUES (?, ?, ?, ?, NULL, ?, 'published_new', 'No Update Required', ?, 0, ?, 1, 1, 1)
    `).run(
      randomUUID(),
      wsId,
      input.blogId,
      articleId,
      bloggerPostId,
      `Artikel baru diterbitkan otomatis dari keyword '${keyword}' (Post ID: ${bloggerPostId}).`,
      qualityGate.overallScore
    );
  }

  logAudit(
    wsId,
    "autopublish.create",
    "article",
    articleId,
    `Artikel baru '${seoTitle}' dibuat & diterbitkan (${bloggerPostId || "queued"}).`
  );

  return {
    articleId,
    bloggerPostId,
    url: publishedUrl,
    title: seoTitle,
    keyword,
    searchIntent,
    outline,
    metaDescription,
    contentHtml,
    mediaAssetId,
    qualityGate,
    status: finalStatus
  };
}
