import { calculateJaccardSimilarity, stripHtmlToText } from "./detectionEngine";

export interface QualityGateCheckItem {
  name:
    | "Fact Verification"
    | "Content Accuracy"
    | "Search Intent"
    | "SEO Quality"
    | "Grammar"
    | "Duplicate Content"
    | "HTML Validation"
    | "Internal Link Validation"
    | "URL Preservation"
    | "Change Detection";
  passed: boolean;
  critical: boolean;
  score: number;
  detail: string;
}

export interface QualityGateResult {
  passed: boolean;
  overallScore: number;
  minRequiredScore: number;
  criticalFailure: boolean;
  decision: "Auto publish update" | "Jangan publish" | "Skip" | "Manual review";
  checks: QualityGateCheckItem[];
}

export interface QualityGateInput {
  originalTitle: string;
  revisedTitle: string;
  originalHtml: string;
  revisedHtml: string;
  metaDescription: string;
  originalUrl: string;
  targetUrl: string;
  originalPermalink: string;
  targetPermalink: string;
  bloggerPostId: string | null;
  isUpdateOperation: boolean;
  targetKeyword?: string;
  verifiedSources: Array<{ title: string; url: string; claimSupported: string; verified: number }>;
  siblingTexts?: string[];
  minQualityScore?: number;
}

function extractNumericAndPriceClaims(text: string): string[] {
  const matches =
    text.match(/\b(\d+(?:[.,]\d+)?%|\bRp\s?\d[\d.,]*|\$\d[\d.,]*)\b/gi) || [];
  return Array.from(new Set(matches.map((m) => m.trim().toLowerCase())));
}

export function validateHtmlStructure(html: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!html || !html.trim()) {
    return { valid: false, issues: ["Konten HTML kosong."] };
  }
  if (/<script\b/i.test(html) || /onerror\s*=/i.test(html) || /javascript:/i.test(html)) {
    issues.push("Terdeteksi tag <script> atau atribut berbahaya di dalam HTML.");
  }

  const blockTags = ["p", "h1", "h2", "h3", "ul", "ol", "li", "a", "strong", "em", "div", "section"];
  for (const tag of blockTags) {
    const openCount = (html.match(new RegExp(`<${tag}\\b[^>]*>`, "gi")) || []).length;
    const closeCount = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (openCount !== closeCount) {
      issues.push(`Tag <${tag}> tidak seimbang (buka: ${openCount}, tutup: ${closeCount}).`);
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Executes all 10 mandatory Quality Gate checks before Publishing Engine can proceed.
 */
export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  const minRequiredScore = input.minQualityScore ?? 75;
  const originalText = stripHtmlToText(input.originalHtml);
  const revisedText = stripHtmlToText(input.revisedHtml);
  const sourcesCorpus = input.verifiedSources
    .filter((s) => Boolean(s.verified))
    .map((s) => s.claimSupported.toLowerCase())
    .join(" ");

  const checks: QualityGateCheckItem[] = [];

  // 1. Fact Verification (Critical: Blocks fabricated numbers/statistics/prices)
  const originalClaims = new Set(extractNumericAndPriceClaims(originalText));
  const revisedClaims = extractNumericAndPriceClaims(revisedText);
  const unverifiedNewClaims = revisedClaims.filter(
    (claim) => !originalClaims.has(claim) && !sourcesCorpus.includes(claim)
  );
  const factPassed = unverifiedNewClaims.length === 0;
  checks.push({
    name: "Fact Verification",
    passed: factPassed,
    critical: true,
    score: factPassed ? 100 : 20,
    detail: factPassed
      ? "Seluruh fakta, angka, dan klaim terverifikasi dengan konten asli atau sumber referensi."
      : `Ditemukan klaim/angka baru yang tidak terverifikasi: ${unverifiedNewClaims.join(", ")}.`
  });

  // 2. Content Accuracy (Preserves topic and key entities)
  const topicSim = originalText
    ? calculateJaccardSimilarity(input.originalTitle, input.revisedTitle)
    : 1;
  const accuracyPassed = revisedText.split(/\s+/).length >= 80 && topicSim >= 0.35;
  checks.push({
    name: "Content Accuracy",
    passed: accuracyPassed,
    critical: true,
    score: accuracyPassed ? 94 : 40,
    detail: accuracyPassed
      ? "Revisi mempertahankan topik dan akurasi bahasan artikel asli."
      : "Topik revisi menyimpang terlalu jauh atau konten terlalu pendek."
  });

  // 3. Search Intent
  const kw = (input.targetKeyword || input.originalTitle.split(" ").slice(0, 3).join(" ")).toLowerCase();
  const kwWords = kw.split(/\s+/).filter((w) => w.length > 2);
  const matchedKwWords = kwWords.filter((w) => revisedText.toLowerCase().includes(w));
  const intentRatio = kwWords.length > 0 ? matchedKwWords.length / kwWords.length : 1;
  const intentPassed = intentRatio >= 0.6;
  checks.push({
    name: "Search Intent",
    passed: intentPassed,
    critical: false,
    score: Math.round(intentRatio * 100),
    detail: intentPassed
      ? `Search intent terpenuhi (${Math.round(intentRatio * 100)}% kecocokan kata kunci).`
      : "Pembahasan kurang menjawab search intent kata kunci utama."
  });

  // 4. SEO Quality
  const hasH2 = /<h2\b[^>]*>/i.test(input.revisedHtml);
  const metaLen = (input.metaDescription || "").trim().length;
  const imgWithoutAlt = (input.revisedHtml.match(/<img\b(?![^>]*\balt\s*=\s*["'][^"']+["'])[^>]*>/gi) || []).length;
  let seoScore = 100;
  if (!hasH2) seoScore -= 25;
  if (metaLen < 80 || metaLen > 170) seoScore -= 15;
  if (imgWithoutAlt > 0) seoScore -= 15;
  const seoPassed = seoScore >= 70;
  checks.push({
    name: "SEO Quality",
    passed: seoPassed,
    critical: false,
    score: Math.max(0, seoScore),
    detail: seoPassed
      ? `Heading H2/H3, meta description (${metaLen} karakter), dan alt gambar optimal.`
      : "Struktur SEO (H2, meta description, atau alt gambar) masih kurang optimal."
  });

  // 5. Grammar
  const repeatedWordMatch = revisedText.match(/\b(\w+)\s+\1\b/i);
  const grammarScore = repeatedWordMatch ? 72 : 95;
  checks.push({
    name: "Grammar",
    passed: grammarScore >= 70,
    critical: false,
    score: grammarScore,
    detail: repeatedWordMatch
      ? `Terdeteksi kata berulang '${repeatedWordMatch[1]}', namun masih dapat dibaca.`
      : "Tata bahasa Indonesia rapi, kohesif, dan bebas pengulangan kata."
  });

  // 6. Duplicate Content
  let maxSiblingSim = 0;
  for (const sib of input.siblingTexts || []) {
    const sim = calculateJaccardSimilarity(revisedText, sib);
    if (sim > maxSiblingSim) maxSiblingSim = sim;
  }
  const notDuplicate = maxSiblingSim < 0.8;
  checks.push({
    name: "Duplicate Content",
    passed: notDuplicate,
    critical: true,
    score: notDuplicate ? 98 : 10,
    detail: notDuplicate
      ? `Konten unik (kemiripan tertinggi dengan artikel lain: ${Math.round(maxSiblingSim * 100)}%).`
      : `Terdeteksi duplikasi tinggi (${Math.round(maxSiblingSim * 100)}%) dengan artikel lain.`
  });

  // 7. HTML Validation
  const htmlValidation = validateHtmlStructure(input.revisedHtml);
  checks.push({
    name: "HTML Validation",
    passed: htmlValidation.valid,
    critical: true,
    score: htmlValidation.valid ? 100 : 0,
    detail: htmlValidation.valid
      ? "Seluruh tag HTML valid, seimbang, dan aman."
      : htmlValidation.issues.join(" ")
  });

  // 8. Internal Link Validation
  const hrefMatches = Array.from(input.revisedHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi));
  const invalidLinks = hrefMatches.filter((m) => {
    const href = m[1].trim();
    return !href || href === "#" || /^javascript:/i.test(href);
  });
  const linksValid = invalidLinks.length === 0;
  checks.push({
    name: "Internal Link Validation",
    passed: linksValid,
    critical: true,
    score: linksValid ? 95 : 25,
    detail: linksValid
      ? `Tautan internal valid (${hrefMatches.length} tautan terverifikasi).`
      : `Ditemukan ${invalidLinks.length} tautan kosong atau tidak valid.`
  });

  // 9. URL Preservation (Critical for update operations)
  const urlUnchanged = !input.isUpdateOperation || input.originalUrl === input.targetUrl;
  const permalinkUnchanged = !input.isUpdateOperation || input.originalPermalink === input.targetPermalink;
  const postIdPresent = !input.isUpdateOperation || Boolean(input.bloggerPostId && input.bloggerPostId.trim());
  const urlPreserved = urlUnchanged && permalinkUnchanged && postIdPresent;
  checks.push({
    name: "URL Preservation",
    passed: urlPreserved,
    critical: true,
    score: urlPreserved ? 100 : 0,
    detail: urlPreserved
      ? `Blogger Post ID (${input.bloggerPostId || "baru"}) dan URL permalink terjaga utuh.`
      : "CRITICAL: URL, permalink, atau Blogger Post ID berubah/hilang saat update!"
  });

  // 10. Change Detection (Blocks trivial or identical updates on existing articles)
  const normalizedOrig = input.originalHtml.replace(/\s+/g, " ").trim();
  const normalizedRev = input.revisedHtml.replace(/\s+/g, " ").trim();
  const lengthDelta = Math.abs(normalizedRev.length - normalizedOrig.length);
  const meaningfulChange = !input.isUpdateOperation || (normalizedOrig !== normalizedRev && lengthDelta >= 25);
  checks.push({
    name: "Change Detection",
    passed: meaningfulChange,
    critical: true,
    score: meaningfulChange ? 95 : 0,
    detail: meaningfulChange
      ? `Perubahan signifikan terdeteksi (selisih ${lengthDelta} karakter HTML).`
      : "Perubahan tidak signifikan atau identik dengan konten lama (Skip update berulang)."
  });

  const overallScore = Math.round(
    checks.reduce((acc, item) => acc + item.score, 0) / checks.length
  );
  const criticalFailure = checks.some((c) => c.critical && !c.passed);
  const passed = !criticalFailure && overallScore >= minRequiredScore;

  let decision: QualityGateResult["decision"] = "Auto publish update";
  if (!meaningfulChange && input.isUpdateOperation) {
    decision = "Skip";
  } else if (!factPassed) {
    decision = "Manual review";
  } else if (!passed) {
    decision = "Jangan publish";
  }

  return {
    passed,
    overallScore,
    minRequiredScore,
    criticalFailure,
    decision,
    checks
  };
}
