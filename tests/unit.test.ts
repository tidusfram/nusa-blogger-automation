import { describe, expect, it } from "vitest";
import {
  assertPermission,
  computeContentHash,
  decryptSecret,
  encryptSecret,
  formatJakartaTime,
  getJakartaDateKey,
  hasPermission,
  maskSecret
} from "../electron/main/services/security";
import { evaluateQualityGate, validateHtmlStructure } from "../electron/main/engines/qualityGate";
import { calculateJaccardSimilarity, stripHtmlToText } from "../electron/main/engines/detectionEngine";

describe("Unit Tests — Security, RBAC, Timezone & Quality Gate", () => {
  it("encrypts and decrypts OAuth tokens & API keys using AES-256-GCM", () => {
    const plain = "ya29.a0AfB_byC_real_google_oauth_token_2026";
    const cipher = encryptSecret(plain);
    expect(cipher).not.toContain(plain);
    expect(cipher.split(":")).toHaveLength(3);
    expect(decryptSecret(cipher)).toBe(plain);
    expect(maskSecret(plain)).toBe("ya29••••••••2026");
  });

  it("computes deterministic SHA-256 content hashes", () => {
    const h1 = computeContentHash("Judul Artikel", "<p>Isi paragraf pertama</p>");
    const h2 = computeContentHash("Judul Artikel", "<p>Isi   paragraf pertama</p>");
    const h3 = computeContentHash("Judul Berbeda", "<p>Isi paragraf pertama</p>");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("enforces Role-Based Access Control (owner, admin, editor, viewer)", () => {
    expect(hasPermission("owner", "workspace:manage")).toBe(true);
    expect(hasPermission("admin", "schedule:manage")).toBe(true);
    expect(hasPermission("editor", "article:publish")).toBe(true);
    expect(hasPermission("editor", "team:manage")).toBe(false);
    expect(hasPermission("viewer", "article:write")).toBe(false);
    expect(() => assertPermission("viewer", "article:publish")).toThrow(/Akses ditolak/);
  });

  it("formats dates in Asia/Jakarta timezone (WIB)", () => {
    const formatted = formatJakartaTime("2026-11-18T03:00:00Z");
    expect(formatted).toContain("WIB");
    const dateKey = getJakartaDateKey(new Date("2026-11-18T03:00:00Z"));
    expect(dateKey).toBe("2026-11-18");
  });

  it("validates balanced HTML and blocks dangerous <script> injection", () => {
    const valid = validateHtmlStructure("<h2>Subjudul</h2><p>Paragraf <strong>penting</strong>.</p>");
    expect(valid.valid).toBe(true);

    const scriptBad = validateHtmlStructure("<p>Halo</p><script>alert(1)</script>");
    expect(scriptBad.valid).toBe(false);

    const unbalancedBad = validateHtmlStructure("<h2>Judul<p>Paragraf</p>");
    expect(unbalancedBad.valid).toBe(false);
  });

  it("blocks AI revisions that fabricate unverified numeric statistics or prices", () => {
    const originalHtml = "<p>Panduan cloud computing untuk UMKM membantu kolaborasi dokumen tim secara efisien.</p>";
    const hallucinatedHtml =
      "<h2>Manfaat Cloud</h2><p>Panduan cloud computing untuk UMKM menurunkan biaya hingga 94.5% atau Rp 150.000.000 menurut survei fiktif untuk kolaborasi dokumen tim secara efisien dan cepat di seluruh cabang usaha kecil menengah.</p>";

    const qg = evaluateQualityGate({
      originalTitle: "Panduan Cloud Computing untuk UMKM",
      revisedTitle: "Panduan Cloud Computing untuk UMKM",
      originalHtml,
      revisedHtml: hallucinatedHtml,
      metaDescription: "Panduan lengkap cloud computing untuk UMKM guna meningkatkan efisiensi operasional dan kolaborasi tim.",
      originalUrl: "https://nusatekno-id.blogspot.com/2022/04/cloud.html",
      targetUrl: "https://nusatekno-id.blogspot.com/2022/04/cloud.html",
      originalPermalink: "2022/04/cloud.html",
      targetPermalink: "2022/04/cloud.html",
      bloggerPostId: "post-1001",
      isUpdateOperation: true,
      targetKeyword: "panduan cloud computing untuk umkm",
      verifiedSources: []
    });

    expect(qg.passed).toBe(false);
    expect(qg.criticalFailure).toBe(true);
    expect(qg.decision).toBe("Manual review");
    const factCheck = qg.checks.find((c) => c.name === "Fact Verification");
    expect(factCheck?.passed).toBe(false);
  });

  it("blocks update operations if URL or Blogger Post ID is altered", () => {
    const qg = evaluateQualityGate({
      originalTitle: "Panduan Cloud Computing untuk UMKM",
      revisedTitle: "Panduan Cloud Computing untuk UMKM Terbaik",
      originalHtml: "<p>Konten awal pendek.</p>",
      revisedHtml:
        "<h2>Panduan Cloud Computing</h2><p>Konten lengkap panduan cloud computing untuk UMKM agar kolaborasi tim di berbagai kota berjalan lancar, aman, dan terstruktur setiap hari tanpa kendala teknis berarti.</p>",
      metaDescription: "Panduan lengkap cloud computing untuk UMKM agar kolaborasi tim berjalan lancar, aman, dan terstruktur setiap hari.",
      originalUrl: "https://nusatekno-id.blogspot.com/2022/04/cloud.html",
      targetUrl: "https://nusatekno-id.blogspot.com/2026/11/cloud-baru.html", // Altered URL!
      originalPermalink: "2022/04/cloud.html",
      targetPermalink: "2026/11/cloud-baru.html",
      bloggerPostId: "post-1001",
      isUpdateOperation: true,
      targetKeyword: "panduan cloud computing untuk umkm",
      verifiedSources: []
    });

    expect(qg.passed).toBe(false);
    const urlCheck = qg.checks.find((c) => c.name === "URL Preservation");
    expect(urlCheck?.passed).toBe(false);
  });

  it("calculates Jaccard similarity and strips HTML tags accurately", () => {
    const plain = stripHtmlToText("<h2>Halo</h2><p>Dunia <b>Digital</b></p>");
    expect(plain).toBe("Halo Dunia Digital");
    const sim = calculateJaccardSimilarity("panduan cloud umkm indonesia", "panduan cloud umkm indonesia");
    expect(sim).toBe(1);
  });
});
