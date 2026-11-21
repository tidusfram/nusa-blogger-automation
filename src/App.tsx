import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BookOpen,
  Bot,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileSearch,
  FileText,
  Globe2,
  History,
  KeyRound,
  LayoutDashboard,
  Link2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles
} from "lucide-react";
import type { DashboardStats } from "./env";

const MENU_ITEMS = [
  ["Dashboard", LayoutDashboard],
  ["Blogger Accounts", KeyRound],
  ["Blog Management", Globe2],
  ["Keyword Manager", BookOpen],
  ["AI Article Writer", WandSparkles],
  ["Article Library", FileText],
  ["Detection Engine", FileSearch],
  ["AI Revision Engine", Sparkles],
  ["Publishing Engine", Send],
  ["Auto Publisher", Bot],
  ["Auto Updater", RefreshCw],
  ["SEO Analyzer", Activity],
  ["Scheduler", CalendarClock],
  ["Backup & Restore", ArchiveRestore],
  ["Update History", History],
  ["Reports", ChartNoAxesCombined],
  ["Team Management", Users],
  ["Settings", Settings]
] as const;

type MenuName = (typeof MENU_ITEMS)[number][0];

function statusBadgeTone(status: string): string {
  if (
    status === "No Update Required" ||
    status === "published" ||
    status === "connected" ||
    status === "updated" ||
    status === "published_new" ||
    status === "completed" ||
    status === "Auto publish update"
  ) {
    return "green";
  }
  if (
    status === "Update Recommended" ||
    status === "SEO Optimization Required" ||
    status === "Content Revision Required" ||
    status === "update_pending" ||
    status === "queued" ||
    status === "Revisi AI" ||
    status === "SEO revision" ||
    status === "Content revision"
  ) {
    return "amber";
  }
  if (status === "Manual Review Required" || status === "Manual review" || status === "rolled_back") {
    return "violet";
  }
  if (status === "failed" || status === "Jangan publish" || status === "disconnected") {
    return "red";
  }
  return "slate";
}

export default function App() {
  const [active, setActive] = useState<MenuName>("Dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
  const [accounts, setAccounts] = useState<Array<Record<string, any>>>([]);
  const [blogs, setBlogs] = useState<Array<Record<string, any>>>([]);
  const [keywords, setKeywords] = useState<Array<Record<string, any>>>([]);
  const [articles, setArticles] = useState<Array<Record<string, any>>>([]);
  const [revisions, setRevisions] = useState<Array<Record<string, any>>>([]);
  const [schedules, setSchedules] = useState<Array<Record<string, any>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, any>>>([]);
  const [jobLogs, setJobLogs] = useState<Array<Record<string, any>>>([]);
  const [reports, setReports] = useState<Array<Record<string, any>>>([]);
  const [backups, setBackups] = useState<Array<Record<string, any>>>([]);
  const [team, setTeam] = useState<Array<Record<string, any>>>([]);
  const [aiSettings, setAiSettings] = useState<Record<string, any> | null>(null);

  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [selectedDetection, setSelectedDetection] = useState<Record<string, any> | null>(null);
  const [latestRevisionOutput, setLatestRevisionOutput] = useState<Record<string, any> | null>(null);
  const [latestPublishOutput, setLatestPublishOutput] = useState<Record<string, any> | null>(null);
  const [latestWriterOutput, setLatestWriterOutput] = useState<Record<string, any> | null>(null);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  // Forms
  const [workspaceName, setWorkspaceName] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [accName, setAccName] = useState("");
  const [accToken, setAccToken] = useState("");
  const [accClientId, setAccClientId] = useState("");
  const [accClientSecret, setAccClientSecret] = useState("");
  const [accRefreshToken, setAccRefreshToken] = useState("");
  const [oauthUrlPreview, setOauthUrlPreview] = useState("");

  const [blogBloggerId, setBlogBloggerId] = useState("");
  const [blogName, setBlogName] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [blogMinQuality, setBlogMinQuality] = useState(75);
  const [blogDailyMax, setBlogDailyMax] = useState(10);

  const [kwText, setKwText] = useState("");
  const [kwIntent, setKwIntent] = useState("informational");
  const [kwPriority, setKwPriority] = useState(4);

  const [writerKeyword, setWriterKeyword] = useState("");
  const [srcTitle, setSrcTitle] = useState("");
  const [srcUrl, setSrcUrl] = useState("");
  const [srcClaim, setSrcClaim] = useState("");

  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"owner" | "admin" | "editor" | "viewer">("editor");

  const [aiModelInput, setAiModelInput] = useState("gpt-4o-mini");
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiMinGateInput, setAiMinGateInput] = useState(75);

  function notify(text: string, isError = false) {
    setToast({ text, isError });
  }

  async function refreshAll() {
    try {
      const [
        st,
        wsList,
        accList,
        blogList,
        kwList,
        artList,
        revList,
        schList,
        jobList,
        logList,
        repList,
        bakList,
        teamList,
        aiCfg
      ] = await Promise.all([
        window.nusa.getDashboardStats(),
        window.nusa.listWorkspaces(),
        window.nusa.listGoogleAccounts(),
        window.nusa.listBlogs(),
        window.nusa.listKeywords(),
        window.nusa.listArticles(),
        window.nusa.listRevisions(),
        window.nusa.listSchedules(),
        window.nusa.listJobs(),
        window.nusa.listJobLogs(),
        window.nusa.listUpdateReports(),
        window.nusa.listBackups(),
        window.nusa.listTeamMembers(),
        window.nusa.getAiSettings()
      ]);

      setStats(st);
      setWorkspaces(wsList);
      setAccounts(accList);
      setBlogs(blogList);
      setKeywords(kwList);
      setArticles(artList);
      setRevisions(revList);
      setSchedules(schList);
      setJobs(jobList);
      setJobLogs(logList);
      setReports(repList);
      setBackups(bakList);
      setTeam(teamList);
      setAiSettings(aiCfg);
      setAiModelInput(aiCfg.model || "gpt-4o-mini");
      setAiMinGateInput(aiCfg.minQualityGate ?? 75);

      if (!selectedArticleId && artList.length > 0) {
        setSelectedArticleId(String(artList[0].id));
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal memuat data aplikasi.", true);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  const currentBlogId = blogs[0]?.id ? String(blogs[0].id) : "";
  const selectedArticle = articles.find((a) => String(a.id) === selectedArticleId) || articles[0] || null;

  async function handleRunFullPipeline() {
    setBusy(true);
    try {
      const res = await window.nusa.runFullPipeline(undefined, currentBlogId || undefined);
      const note = res.syncWarning ? ` (${res.syncWarning})` : "";
      notify(
        `Pipeline Otomatis Selesai (${res.completedAtWib}): ${res.totalAnalyzed} artikel dianalisis, ${res.candidatesDetected} kandidat revisi, ${res.processedArticles.length} diproses.${note}`
      );
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Pipeline gagal dijalankan.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkspace() {
    if (workspaceName.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await window.nusa.createWorkspace(workspaceName.trim());
      setWorkspaceName("");
      notify(`Workspace "${res.name}" berhasil dibuat.`);
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal membuat workspace.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchWorkspace(wsId: string) {
    setBusy(true);
    try {
      await window.nusa.switchWorkspace(wsId);
      setSelectedArticleId("");
      await refreshAll();
      notify(`Berpindah ke workspace aktif: ${wsId}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyzeOne(articleId: string) {
    setBusy(true);
    try {
      const res = await window.nusa.analyzeArticle(articleId);
      setSelectedDetection(res);
      notify(`Detection Engine: "${res.title}" → ${res.detectionStatus} (Keputusan: ${res.updateDecision})`);
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal menganalisis artikel.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyzeAll() {
    setBusy(true);
    try {
      const res = await window.nusa.analyzeAllArticles();
      if (res.length > 0) setSelectedDetection(res[0]);
      notify(`Detection Engine selesai menganalisis ${res.length} artikel.`);
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal menjalankan Detection Engine.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateRevision(articleId: string) {
    setBusy(true);
    try {
      const res = await window.nusa.generateRevision(articleId);
      setLatestRevisionOutput(res);
      notify(
        `AI Revision Engine membuat Revisi #${res.revisionNumber} (Skor Quality Gate: ${res.qualityScore}/100 — ${res.updateRecommendation})`
      );
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal membuat revisi AI.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishUpdate(articleId: string, revisionId?: string) {
    setBusy(true);
    try {
      const res = await window.nusa.publishArticleUpdate(articleId, revisionId);
      setLatestPublishOutput(res);
      notify(res.message, !res.success);
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal mengirim update ke Blogger.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback(articleId: string, revisionId: string) {
    setBusy(true);
    try {
      const res = await window.nusa.rollbackArticle(articleId, revisionId);
      setLatestPublishOutput(res);
      notify(res.message);
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Rollback gagal.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleWriteAndPublishNew(publishNow: boolean) {
    if (!currentBlogId) {
      notify("Tambahkan blog terlebih dahulu di Blog Management.", true);
      return;
    }
    setBusy(true);
    try {
      const res = await window.nusa.autoPublishNewArticle({
        blogId: currentBlogId,
        customKeyword: writerKeyword.trim() || undefined,
        publishImmediately: publishNow
      });
      setLatestWriterOutput(res);
      setWriterKeyword("");
      notify(
        `Artikel baru "${res.title}" berhasil dibuat (${res.status === "published" ? `Post ID: ${res.bloggerPostId}` : "Masuk antrean"})`
      );
      await refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Gagal membuat artikel baru.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NUSA</strong>
            <span>BLOGGER AUTOMATION</span>
          </div>
        </div>

        <div className="workspace-switcher">
          <span className="online-dot" />
          <select
            aria-label="Pilih Workspace"
            value={stats?.activeWorkspaceId || "default-workspace"}
            onChange={(e) => void handleSwitchWorkspace(e.target.value)}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>

        <div className="nav-label">18 MODUL SISTEM</div>
        <nav>
          {MENU_ITEMS.map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-item ${active === label ? "active" : ""}`}
              onClick={() => setActive(label)}
            >
              <Icon size={15} strokeWidth={1.9} />
              <span>{label}</span>
              {label === "Detection Engine" && stats && stats.articlesNeedingUpdate > 0 ? (
                <small>{stats.articlesNeedingUpdate}</small>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-card">
            <span className="online-dot" /> Engines Ready · Asia/Jakarta
            <p>SQLite WAL + Prisma · Blogger v3</p>
          </div>
          <div className="profile">
            <div className="avatar">NA</div>
            <div>
              <strong>Budi Santoso</strong>
              <span>Owner · Full Auto + Quality Gate</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="breadcrumbs">
              Nusa Workspace <span>/</span> {active}
            </div>
            <h1>{active}</h1>
          </div>
          <div className="top-actions">
            <span className="tz-pill">
              <Clock size={13} /> WIB (Asia/Jakarta)
            </span>
            <span className="mode-pill">
              <ShieldCheck size={14} /> Quality Gate Active (Min {aiSettings?.minQualityGate ?? 75})
            </span>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void handleRunFullPipeline()}
              title="Jalankan 10 Tahap Otomatis: Sync → Detect → Revise → Quality Gate → Backup → PATCH Update"
            >
              <Play size={14} /> Jalankan Pipeline Otomatis
            </button>
            <button className="icon-button" onClick={() => void refreshAll()} title="Muat Ulang Data">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        {toast && (
          <div className={`banner-toast ${toast.isError ? "error" : ""}`}>
            <span>{toast.text}</span>
            <button
              style={{ border: 0, background: "transparent", fontWeight: 700 }}
              onClick={() => setToast(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="content">
          {/* 1. DASHBOARD */}
          {active === "Dashboard" && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow">AI AUTO PUBLISH &amp; AUTO UPDATE BLOGSPOT</div>
                  <h2>Pusat Kendali Otomasi Multi-Blog &amp; Mesin Revisi Artikel Lama</h2>
                  <p>
                    Deteksi artikel kedaluwarsa, perbarui konten &amp; SEO dengan AI tanpa mengarang fakta,
                    validasi melalui 10 pemeriksaan Quality Gate, dan perbarui langsung ke Blogspot via PATCH
                    dengan mempertahankan <code>blogger_post_id</code> serta URL asli.
                  </p>
                </div>
                <div className="welcome-actions">
                  <button className="secondary-button" onClick={() => setActive("Detection Engine")}>
                    <FileSearch size={14} /> Buka Detection Engine
                  </button>
                  <button className="primary-button" onClick={() => setActive("AI Revision Engine")}>
                    <Sparkles size={14} /> Buka AI Revision Engine
                  </button>
                </div>
              </section>

              {/* 10 Statistik Wajib (Section 9) */}
              <section className="stats-grid-5">
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Total Blog</span>
                    <div className="stat-icon blue"><Globe2 size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.blogs ?? 0}</div>
                  <div className="stat-foot">Blogspot API v3 aktif</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Total Artikel</span>
                    <div className="stat-icon violet"><FileText size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.articles ?? 0}</div>
                  <div className="stat-foot">Memiliki Blogger Post ID</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Artikel Perlu Update</span>
                    <div className="stat-icon amber"><AlertTriangle size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.articlesNeedingUpdate ?? 0}</div>
                  <div className="stat-foot">Terdeteksi Detection Engine</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Sudah Diperbarui</span>
                    <div className="stat-icon green"><CheckCircle2 size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.articlesUpdated ?? 0}</div>
                  <div className="stat-foot">URL &amp; Post ID terjaga</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Gagal Diperbarui</span>
                    <div className="stat-icon red"><Activity size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.articlesFailed ?? 0}</div>
                  <div className="stat-foot">Diblokir Quality Gate / API</div>
                </div>

                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Artikel Dilewati (Skip)</span>
                    <div className="stat-icon slate"><RotateCcw size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.articlesSkipped ?? 0}</div>
                  <div className="stat-foot">Relevan / tanpa perubahan berarti</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Total Publikasi</span>
                    <div className="stat-icon green"><Send size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.totalPublished ?? 0}</div>
                  <div className="stat-foot">Status LIVE di Blogspot</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Penggunaan AI API</span>
                    <div className="stat-icon blue"><Cpu size={16} /></div>
                  </div>
                  <div className="stat-value">{stats?.aiUsage.tokensUsed.toLocaleString("id-ID") ?? 0}</div>
                  <div className="stat-foot">
                    Token ({stats?.aiUsage.requests ?? 0} req · {stats?.aiUsage.model ?? "gpt-4o-mini"})
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Jadwal Berikutnya</span>
                    <div className="stat-icon violet"><CalendarClock size={16} /></div>
                  </div>
                  <div className="stat-value" style={{ fontSize: "13px", marginTop: "4px" }}>
                    {stats?.nextSchedule?.name ?? "Semua Selesai"}
                  </div>
                  <div className="stat-foot">{stats?.nextSchedule?.nextRunAt ?? "Asia/Jakarta"}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">Anggota &amp; Workspace</span>
                    <div className="stat-icon blue"><Users size={16} /></div>
                  </div>
                  <div className="stat-value">
                    {stats?.users ?? 0} / {stats?.workspaces ?? 1}
                  </div>
                  <div className="stat-foot">Multi-user RBAC aktif</div>
                </div>
              </section>

              <section className="two-col">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Aktivitas Terakhir (Audit Log · Asia/Jakarta)</h3>
                      <p>Riwayat sinkronisasi, deteksi, revisi AI, dan publikasi Blogger</p>
                    </div>
                    <Activity size={18} />
                  </div>
                  {stats?.recentActivities && stats.recentActivities.length > 0 ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Waktu (WIB)</th>
                          <th>Aksi</th>
                          <th>Keterangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recentActivities.map((act) => (
                          <tr key={act.id}>
                            <td style={{ whiteSpace: "nowrap" }}>{act.createdAtWib}</td>
                            <td><span className="badge blue">{act.action}</span></td>
                            <td>{act.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ fontSize: "12px", color: "#64748b" }}>
                      Klik tombol "Jalankan Pipeline Otomatis" di kanan atas untuk merekam aktivitas pertama.
                    </p>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Manajemen Workspace Multi-Tenant</h3>
                      <p>Isolasi data antar-tim dengan dukungan SQLite lokal &amp; skema Prisma PostgreSQL</p>
                    </div>
                    <Database size={18} />
                  </div>
                  <div className="field-grid">
                    <div className="field-group">
                      <label htmlFor="ws-input">Buat Workspace Baru</label>
                      <input
                        id="ws-input"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder="Contoh: Divisi Konten B2B"
                      />
                    </div>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy || workspaceName.trim().length < 2}
                    onClick={() => void handleCreateWorkspace()}
                  >
                    <Plus size={14} /> Buat Workspace
                  </button>

                  <div style={{ marginTop: "16px" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID Workspace</th>
                          <th>Nama Workspace</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspaces.map((ws) => (
                          <tr key={ws.id}>
                            <td><code>{ws.id}</code></td>
                            <td><strong>{ws.name}</strong></td>
                            <td>
                              {stats?.activeWorkspaceId === ws.id ? (
                                <span className="badge green">Aktif</span>
                              ) : (
                                <button
                                  className="secondary-button"
                                  onClick={() => void handleSwitchWorkspace(ws.id)}
                                >
                                  Aktifkan
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* 2. BLOGGER ACCOUNTS */}
          {active === "Blogger Accounts" && (
            <div className="two-col">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Hubungkan Akun Google Blogger</h3>
                    <p>Pilih mode Auto-Refresh Permanen agar tidak perlu mengganti token tiap jam</p>
                  </div>
                  <KeyRound size={18} />
                </div>

                <div className="field-grid">
                  <div className="field-group">
                    <label>Email Akun Google *</label>
                    <input
                      value={accEmail}
                      onChange={(e) => setAccEmail(e.target.value)}
                      placeholder="contoh: bangsalmu@gmail.com"
                    />
                  </div>
                  <div className="field-group">
                    <label>Nama Tampilan</label>
                    <input
                      value={accName}
                      onChange={(e) => setAccName(e.target.value)}
                      placeholder="contoh: Akun Blogger Utama"
                    />
                  </div>
                </div>

                {/* MODE 1: AUTO REFRESH PERMANEN */}
                <div style={{ marginTop: "14px", padding: "12px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 6px 0", color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                    <RefreshCw size={14} /> Solusi 2: Auto-Refresh Permanen (Aktif Selamanya)
                  </h4>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: "0 0 10px 0" }}>
                    Dengan mengisi data ini, sistem akan otomatis memperpanjang token sendiri di latar belakang tanpa Anda perlu buka Google Playground lagi.
                  </p>
                  <div className="field-group" style={{ marginBottom: "8px" }}>
                    <label>Google Cloud Client ID</label>
                    <input
                      value={accClientId}
                      onChange={(e) => setAccClientId(e.target.value)}
                      placeholder="contoh: 588669488177-...apps.googleusercontent.com"
                    />
                  </div>
                  <div className="field-group" style={{ marginBottom: "8px" }}>
                    <label>Google Cloud Client Secret</label>
                    <input
                      type="password"
                      value={accClientSecret}
                      onChange={(e) => setAccClientSecret(e.target.value)}
                      placeholder="contoh: GOCSPX-..."
                    />
                  </div>
                  <div className="field-group" style={{ marginBottom: "10px" }}>
                    <label>Google OAuth 2.0 Refresh Token</label>
                    <input
                      type="password"
                      value={accRefreshToken}
                      onChange={(e) => setAccRefreshToken(e.target.value)}
                      placeholder="contoh: 1//04MVBX8zNG_... (dari Google Playground / Cloud)"
                    />
                  </div>
                </div>

                {/* MODE 2: TOKEN AKSES MANUAL */}
                <div style={{ marginTop: "12px", padding: "10px", background: "rgba(100, 116, 139, 0.08)", border: "1px solid rgba(100, 116, 139, 0.2)", borderRadius: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Atau: Access Token Manual (Masa aktif 1 jam)</label>
                  <input
                    type="password"
                    style={{ marginTop: "4px" }}
                    value={accToken}
                    onChange={(e) => setAccToken(e.target.value)}
                    placeholder="ya29.a0AfB_byC... (Opsional jika sudah mengisi Refresh Token di atas)"
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                  <button
                    className="primary-button"
                    disabled={busy || !accEmail.trim() || (!accToken.trim() && !accRefreshToken.trim())}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await window.nusa.connectGoogleAccount({
                          email: accEmail,
                          displayName: accName || accEmail,
                          accessToken: accToken || undefined,
                          refreshToken: accRefreshToken || undefined,
                          clientId: accClientId || undefined,
                          clientSecret: accClientSecret || undefined
                        });
                        setAccEmail("");
                        setAccName("");
                        setAccToken("");
                        setAccClientId("");
                        setAccClientSecret("");
                        setAccRefreshToken("");
                        notify("Akun Google berhasil disimpan dan dienkripsi AES-256-GCM.");
                        await refreshAll();
                      } catch (err) {
                        notify(err instanceof Error ? err.message : "Gagal menyimpan akun Google.", true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Plus size={14} /> Simpan Akun &amp; Kredensial
                  </button>
                  <button
                    className="secondary-button"
                    onClick={async () => {
                      const cid = accClientId.trim() || "588669488177-nf5er8gqqph7ocg7jc2a8c0uik1jnnh8.apps.googleusercontent.com";
                      const url = await window.nusa.getGoogleOAuthUrl(cid);
                      setOauthUrlPreview(url);
                    }}
                  >
                    <Link2 size={14} /> Buat URL OAuth
                  </button>
                </div>
                {oauthUrlPreview && (
                  <div className="code-box" style={{ marginTop: "12px" }}>
                    {oauthUrlPreview}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Daftar Akun Google Terhubung</h3>
                    <p>Status Auto-Refresh dan pengujian token aktif</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Mode Refresh</th>
                      <th>Token</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td>
                          <strong>{acc.email}</strong>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{acc.displayName}</div>
                        </td>
                        <td>
                          {acc.autoRefreshActive ? (
                            <span className="badge green" title="Token akan diperpanjang otomatis di latar belakang tanpa henti">
                              ⚡ Auto-Refresh Aktif
                            </span>
                          ) : acc.hasRefreshToken ? (
                            <span className="badge blue" title="Perlu Client ID & Secret untuk auto-refresh otomatis">
                              Refresh Token Siap
                            </span>
                          ) : (
                            <span className="badge orange" title="Masa aktif token 1 jam">
                              Token Manual (1 Jam)
                            </span>
                          )}
                        </td>
                        <td><code>{acc.maskedToken}</code></td>
                        <td>
                          <button
                            className="secondary-button"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                const fresh = await window.nusa.refreshGoogleAccountToken(acc.id);
                                notify(`Token berhasil diperbarui (${fresh.slice(0, 10)}...).`);
                                await refreshAll();
                              } catch (err) {
                                notify(err instanceof Error ? err.message : "Gagal memperpanjang token.", true);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <RefreshCw size={11} /> Perpanjang Token
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. BLOG MANAGEMENT */}
          {active === "Blog Management" && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Daftar Blog Blogspot Terhubung</h3>
                    <p>Sinkronkan artikel langsung dari Blogger API v3 dengan mempertahankan Blogger Post ID</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nama Blog</th>
                      <th>Blogger Blog ID</th>
                      <th>URL Blogspot</th>
                      <th>Min Skor Quality Gate</th>
                      <th>Batas Update/Hari</th>
                      <th>Artikel</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blogs.map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.name}</strong></td>
                        <td><code>{b.bloggerBlogId}</code></td>
                        <td><a href={b.url} target="_blank" rel="noreferrer">{b.url}</a></td>
                        <td>{b.minQualityScore ?? 75}/100</td>
                        <td>{b.maxDailyUpdates ?? 10} artikel</td>
                        <td><strong>{b.articleCount ?? 0}</strong></td>
                        <td>
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                const res = await window.nusa.syncBlogArticles(String(b.id));
                                notify(
                                  `Sinkronisasi "${res.blogName}" selesai: ${res.inserted} artikel baru, ${res.updated} diperbarui, ${res.unchanged} identik.`
                                );
                                await refreshAll();
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <RefreshCw size={13} /> Sync Artikel Blogger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Tambah / Konfigurasi Blog Baru</h3>
                    <p>Hubungkan Blog ID dari Blogger API v3 beserta pengaturan Quality Gate</p>
                  </div>
                </div>
                <div className="field-grid">
                  <div className="field-group">
                    <label>Blogger Blog ID</label>
                    <input
                      value={blogBloggerId}
                      onChange={(e) => setBlogBloggerId(e.target.value)}
                      placeholder="Contoh: 8492019384756102938"
                    />
                  </div>
                  <div className="field-group">
                    <label>Nama Blog</label>
                    <input
                      value={blogName}
                      onChange={(e) => setBlogName(e.target.value)}
                      placeholder="Contoh: Nusa Bisnis & Keuangan"
                    />
                  </div>
                  <div className="field-group">
                    <label>URL Blogspot</label>
                    <input
                      value={blogUrl}
                      onChange={(e) => setBlogUrl(e.target.value)}
                      placeholder="https://nusabisnis.blogspot.com"
                    />
                  </div>
                  <div className="field-group">
                    <label>Skor Quality Gate Minimum</label>
                    <input
                      type="number"
                      value={blogMinQuality}
                      onChange={(e) => setBlogMinQuality(Number(e.target.value))}
                    />
                  </div>
                  <div className="field-group">
                    <label>Maksimum Update Harian</label>
                    <input
                      type="number"
                      value={blogDailyMax}
                      onChange={(e) => setBlogDailyMax(Number(e.target.value))}
                    />
                  </div>
                </div>
                <button
                  className="primary-button"
                  disabled={busy || !blogBloggerId.trim() || !blogName.trim() || !blogUrl.trim()}
                  onClick={async () => {
                    await window.nusa.saveBlog({
                      googleAccountId: accounts[0]?.id,
                      bloggerBlogId: blogBloggerId,
                      name: blogName,
                      url: blogUrl,
                      minQualityScore: blogMinQuality,
                      maxDailyUpdates: blogDailyMax
                    });
                    setBlogBloggerId("");
                    setBlogName("");
                    setBlogUrl("");
                    notify("Blog berhasil disimpan.");
                    await refreshAll();
                  }}
                >
                  <Plus size={14} /> Simpan Blog
                </button>
              </div>
            </>
          )}

          {/* 4. KEYWORD MANAGER */}
          {active === "Keyword Manager" && (
            <div className="two-col">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Tambah Keyword Target Baru</h3>
                    <p>Digunakan oleh AI Article Writer, Detection Engine, dan Auto Publisher</p>
                  </div>
                </div>
                <div className="field-group" style={{ marginBottom: "10px" }}>
                  <label>Kata Kunci Utama (Keyword)</label>
                  <input
                    value={kwText}
                    onChange={(e) => setKwText(e.target.value)}
                    placeholder="Contoh: cara membuat pembukuan digital untuk toko ritel"
                  />
                </div>
                <div className="field-grid">
                  <div className="field-group">
                    <label>Search Intent</label>
                    <select value={kwIntent} onChange={(e) => setKwIntent(e.target.value)}>
                      <option value="informational">Informational (Edukasi / Panduan)</option>
                      <option value="commercial">Commercial (Perbandingan / Solusi)</option>
                      <option value="transactional">Transactional (Konversi / Layanan)</option>
                      <option value="navigational">Navigational</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label>Prioritas (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={kwPriority}
                      onChange={(e) => setKwPriority(Number(e.target.value))}
                    />
                  </div>
                </div>
                <button
                  className="primary-button"
                  disabled={busy || !kwText.trim() || !currentBlogId}
                  onClick={async () => {
                    await window.nusa.addKeyword({
                      blogId: currentBlogId,
                      keyword: kwText,
                      intent: kwIntent,
                      priority: kwPriority
                    });
                    setKwText("");
                    notify("Keyword berhasil ditambahkan ke antrean.");
                    await refreshAll();
                  }}
                >
                  <Plus size={14} /> Tambah ke Antrean Keyword
                </button>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Antrean Keyword &amp; Search Intent</h3>
                    <p>Daftar kata kunci yang siap diproses Auto Publish Engine</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Search Intent</th>
                      <th>Prioritas</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((k) => (
                      <tr key={k.id}>
                        <td><strong>{k.keyword}</strong></td>
                        <td><span className="badge blue">{k.intent}</span></td>
                        <td>P{k.priority}</td>
                        <td><span className={`badge ${statusBadgeTone(k.status)}`}>{k.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. AI ARTICLE WRITER & 10. AUTO PUBLISHER */}
          {(active === "AI Article Writer" || active === "Auto Publisher") && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>AI Article Writer &amp; Auto Publish Engine (Artikel Baru)</h3>
                    <p>
                      Menganalisis search intent, menyusun outline, menghasilkan artikel SEO HTML + gambar
                      ilustrasi, memvalidasi Quality Gate, dan menerbitkan ke Blogger API v3
                    </p>
                  </div>
                  <WandSparkles size={18} />
                </div>
                <div className="field-grid">
                  <div className="field-group">
                    <label>Kata Kunci Artikel Baru (Kosongkan untuk mengambil otomatis dari antrean Keyword)</label>
                    <input
                      value={writerKeyword}
                      onChange={(e) => setWriterKeyword(e.target.value)}
                      placeholder="Contoh: strategi optimasi seo blogspot untuk umkm kuliner"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void handleWriteAndPublishNew(true)}
                  >
                    <Send size={14} /> Generate AI &amp; Auto Publish ke Blogger
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void handleWriteAndPublishNew(false)}
                  >
                    <FileText size={14} /> Generate &amp; Masukkan ke Antrean (Queued)
                  </button>
                </div>
              </div>

              {latestWriterOutput && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Hasil Pembuatan Artikel Baru: {latestWriterOutput.title}</h3>
                      <p>
                        Blogger Post ID: <code>{latestWriterOutput.bloggerPostId || "queued"}</code> · URL:{" "}
                        <code>{latestWriterOutput.url || "menunggu publikasi"}</code> · Skor Quality Gate:{" "}
                        <strong>{latestWriterOutput.qualityGate.overallScore}/100</strong>
                      </p>
                    </div>
                    <span className={`badge ${statusBadgeTone(latestWriterOutput.status)}`}>
                      {latestWriterOutput.status}
                    </span>
                  </div>
                  <div className="diff-grid">
                    <div>
                      <strong>Outline &amp; Meta Description</strong>
                      <div className="preview-box">
                        <p><strong>Search Intent:</strong> {latestWriterOutput.searchIntent}</p>
                        <p><strong>Meta Description:</strong> {latestWriterOutput.metaDescription}</p>
                        <ul>
                          {latestWriterOutput.outline.map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div>
                      <strong>Konten HTML yang Dihasilkan</strong>
                      <div className="code-box">{latestWriterOutput.contentHtml}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 6. ARTICLE LIBRARY */}
          {active === "Article Library" && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Pustaka Artikel Blogspot (Identitas Post ID Asli)</h3>
                    <p>Setiap artikel terhubung dengan blogger_post_id, permalink/URL asli, dan sumber referensi</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Blogger Post ID</th>
                      <th>Judul Artikel &amp; URL</th>
                      <th>Terbit</th>
                      <th>Status Deteksi</th>
                      <th>Keputusan</th>
                      <th>Skor Kualitas / SEO</th>
                      <th>Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((art) => (
                      <tr key={art.id}>
                        <td><code>{art.bloggerPostId || "draft"}</code></td>
                        <td>
                          <strong>{art.title}</strong>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px" }}>
                            {art.url}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {art.publishedAt ? String(art.publishedAt).slice(0, 10) : "—"}
                        </td>
                        <td>
                          <span className={`badge ${statusBadgeTone(String(art.detectionStatus))}`}>
                            {art.detectionStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${statusBadgeTone(String(art.updateDecision))}`}>
                            {art.updateDecision}
                          </span>
                        </td>
                        <td>
                          <strong>{art.qualityScore}</strong> / {art.seoScore}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="secondary-button"
                              onClick={() => {
                                setSelectedArticleId(String(art.id));
                                void handleAnalyzeOne(String(art.id));
                                setActive("Detection Engine");
                              }}
                            >
                              Deteksi
                            </button>
                            <button
                              className="primary-button"
                              onClick={() => {
                                setSelectedArticleId(String(art.id));
                                void handleGenerateRevision(String(art.id));
                                setActive("AI Revision Engine");
                              }}
                            >
                              Revisi AI
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedArticle && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Sumber Referensi Terverifikasi untuk: {selectedArticle.title}</h3>
                      <p>Digunakan oleh AI Revision Engine &amp; Quality Gate agar tidak mengarang fakta</p>
                    </div>
                  </div>
                  <div className="field-grid">
                    <div className="field-group">
                      <label>Pilih Artikel</label>
                      <select
                        value={selectedArticle.id}
                        onChange={(e) => setSelectedArticleId(e.target.value)}
                      >
                        {articles.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.bloggerPostId}] {a.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Judul Sumber Resmi</label>
                      <input
                        value={srcTitle}
                        onChange={(e) => setSrcTitle(e.target.value)}
                        placeholder="Laporan Tahunan / Panduan Resmi"
                      />
                    </div>
                    <div className="field-group">
                      <label>URL Referensi</label>
                      <input
                        value={srcUrl}
                        onChange={(e) => setSrcUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="field-group">
                      <label>Klaim Fakta yang Didukung</label>
                      <input
                        value={srcClaim}
                        onChange={(e) => setSrcClaim(e.target.value)}
                        placeholder="Fakta/data yang diverifikasi oleh sumber ini"
                      />
                    </div>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy || !srcTitle.trim() || !srcUrl.trim() || !srcClaim.trim()}
                    onClick={async () => {
                      await window.nusa.addSourceReference({
                        articleId: String(selectedArticle.id),
                        title: srcTitle,
                        url: srcUrl,
                        claimSupported: srcClaim,
                        verified: true
                      });
                      setSrcTitle("");
                      setSrcUrl("");
                      setSrcClaim("");
                      notify("Sumber referensi terverifikasi berhasil ditambahkan.");
                      await refreshAll();
                    }}
                  >
                    <Plus size={14} /> Tambah Sumber Referensi
                  </button>

                  <table className="data-table" style={{ marginTop: "12px" }}>
                    <thead>
                      <tr>
                        <th>Judul Sumber</th>
                        <th>URL</th>
                        <th>Klaim Fakta yang Didukung</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedArticle.sources || []).map((s: Record<string, any>) => (
                        <tr key={s.id}>
                          <td><strong>{s.title}</strong></td>
                          <td><code>{s.url}</code></td>
                          <td>{s.claimSupported}</td>
                          <td><span className="badge green">Terverifikasi</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* 7. DETECTION ENGINE & 12. SEO ANALYZER */}
          {(active === "Detection Engine" || active === "SEO Analyzer") && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Mesin A: Detection Engine &amp; SEO Analyzer</h3>
                    <p>
                      Mendeteksi informasi kedaluwarsa, kualitas konten, peluang SEO, klaim tanpa sumber, dan
                      duplikasi artikel
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void handleAnalyzeAll()}
                    >
                      <FileSearch size={14} /> Analisis Semua Artikel ({articles.length})
                    </button>
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Post ID</th>
                      <th>Judul Artikel</th>
                      <th>Hasil Detection Engine</th>
                      <th>Keputusan Matriks</th>
                      <th>Prioritas</th>
                      <th>Kualitas</th>
                      <th>Skor SEO</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((art) => (
                      <tr key={art.id}>
                        <td><code>{art.bloggerPostId}</code></td>
                        <td><strong>{art.title}</strong></td>
                        <td>
                          <span className={`badge ${statusBadgeTone(String(art.detectionStatus))}`}>
                            {art.detectionStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${statusBadgeTone(String(art.updateDecision))}`}>
                            {art.updateDecision}
                          </span>
                        </td>
                        <td><strong>{art.priorityScore}/100</strong></td>
                        <td>{art.qualityScore}/100</td>
                        <td>{art.seoScore}/100</td>
                        <td>
                          <button
                            className="secondary-button"
                            onClick={() => void handleAnalyzeOne(String(art.id))}
                          >
                            Inspeksi Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedDetection && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Detail Analisis: {selectedDetection.title}</h3>
                      <p>
                        Post ID: <code>{selectedDetection.bloggerPostId}</code> · Jumlah Kata:{" "}
                        <strong>{selectedDetection.wordCount}</strong> · H2: {selectedDetection.h2Count} · H3:{" "}
                        {selectedDetection.h3Count} · Internal Link: {selectedDetection.internalLinksCount} ·
                        Gambar Tanpa Alt: {selectedDetection.missingAltCount}
                      </p>
                    </div>
                    <span className={`badge ${statusBadgeTone(selectedDetection.detectionStatus)}`}>
                      {selectedDetection.detectionStatus} → {selectedDetection.updateDecision}
                    </span>
                  </div>
                  <div className="two-col">
                    <div>
                      <strong>Temuan Konten &amp; Ketepatan Waktu:</strong>
                      <ul>
                        {(selectedDetection.reasons || []).length > 0 ? (
                          selectedDetection.reasons.map((r: string) => <li key={r}>{r}</li>)
                        ) : (
                          <li>Artikel masih relevan dan tidak memiliki referensi kedaluwarsa.</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <strong>Peluang Optimasi SEO:</strong>
                      <ul>
                        {(selectedDetection.seoOpportunities || []).length > 0 ? (
                          selectedDetection.seoOpportunities.map((o: string) => <li key={o}>{o}</li>)
                        ) : (
                          <li>Struktur H2/H3, meta description, alt gambar, dan internal link sudah optimal.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 8. AI REVISION ENGINE */}
          {active === "AI Revision Engine" && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Mesin B: AI Revision Engine (Anti-Halusinasi &amp; Optimasi SEO)</h3>
                    <p>
                      Memperbaiki informasi kedaluwarsa berdasarkan sumber terverifikasi, mengoptimalkan H2/H3,
                      internal link, alt gambar, dan FAQ tanpa mengarang fakta
                    </p>
                  </div>
                </div>
                <div className="field-grid">
                  <div className="field-group">
                    <label>Pilih Artikel untuk Direvisi</label>
                    <select
                      value={selectedArticle?.id || ""}
                      onChange={(e) => setSelectedArticleId(e.target.value)}
                    >
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          [{a.bloggerPostId}] {a.title} ({a.detectionStatus})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedArticle && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void handleGenerateRevision(String(selectedArticle.id))}
                    >
                      <Sparkles size={14} /> Buat Revisi AI Sekarang
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setActive("Publishing Engine");
                      }}
                    >
                      <Send size={14} /> Lanjut ke Publishing Engine
                    </button>
                  </div>
                )}
              </div>

              {latestRevisionOutput && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>
                        Hasil AI Revision Engine — Revisi #{latestRevisionOutput.revisionNumber} (Post ID:{" "}
                        {latestRevisionOutput.bloggerPostId})
                      </h3>
                      <p>
                        <strong>Change Summary:</strong> {latestRevisionOutput.changeSummary}
                      </p>
                    </div>
                    <span className={`badge ${statusBadgeTone(latestRevisionOutput.qualityGate.decision)}`}>
                      Skor Quality Gate: {latestRevisionOutput.qualityScore}/100 ·{" "}
                      {latestRevisionOutput.qualityGate.decision}
                    </span>
                  </div>

                  <div className="three-col">
                    <div className="stat-card">
                      <div className="stat-label">SEO Score (Sebelum → Sesudah)</div>
                      <div className="stat-value">
                        {latestRevisionOutput.seoAnalysis.beforeSeoScore} →{" "}
                        {latestRevisionOutput.seoAnalysis.afterSeoScore}
                      </div>
                      <div className="stat-foot">
                        Keyword: {latestRevisionOutput.seoAnalysis.primaryKeyword}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Peningkatan Struktur HTML</div>
                      <div className="stat-value">
                        H2: {latestRevisionOutput.seoAnalysis.h2Count} · H3:{" "}
                        {latestRevisionOutput.seoAnalysis.h3Count}
                      </div>
                      <div className="stat-foot">
                        Alt diperbaiki: {latestRevisionOutput.seoAnalysis.altTagsFixed} · Internal link: +
                        {latestRevisionOutput.seoAnalysis.internalLinksAdded}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Rekomendasi Update</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "6px", color: "#0f766e" }}>
                        {latestRevisionOutput.updateRecommendation}
                      </div>
                    </div>
                  </div>

                  <div className="diff-grid">
                    <div>
                      <strong>Original Content ({latestRevisionOutput.originalTitle})</strong>
                      <div className="code-box">{latestRevisionOutput.originalContent}</div>
                    </div>
                    <div>
                      <strong>Updated Content ({latestRevisionOutput.updatedTitle})</strong>
                      <div className="code-box">{latestRevisionOutput.updatedContent}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 9. PUBLISHING ENGINE & 11. AUTO UPDATER */}
          {(active === "Publishing Engine" || active === "Auto Updater") && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Mesin C: Publishing Engine &amp; 10 Pemeriksaan Quality Gate</h3>
                    <p>
                      Membuat backup konten lama, memvalidasi Quality Gate, mengirim PATCH ke Blogger API v3
                      tanpa mengubah blogger_post_id maupun URL, serta mendukung Rollback instan
                    </p>
                  </div>
                </div>
                <div className="field-grid">
                  <div className="field-group">
                    <label>Pilih Artikel yang Akan Diperbarui ke Blogspot</label>
                    <select
                      value={selectedArticle?.id || ""}
                      onChange={(e) => setSelectedArticleId(e.target.value)}
                    >
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          [{a.bloggerPostId}] {a.title} — Status: {a.status} ({a.detectionStatus})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedArticle && (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void handleGenerateRevision(String(selectedArticle.id))}
                    >
                      <Sparkles size={14} /> 1. Siapkan Revisi AI &amp; Cek Quality Gate
                    </button>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void handlePublishUpdate(String(selectedArticle.id))}
                    >
                      <Send size={14} /> 2. Terbitkan Revisi via Blogger API v3 PATCH (Pertahankan Post ID &amp; URL)
                    </button>
                  </div>
                )}
              </div>

              {latestPublishOutput && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Status Publikasi Blogger API v3: {latestPublishOutput.message}</h3>
                      <p>
                        Blogger Post ID Terjaga: <strong>{latestPublishOutput.postIdPreserved ? "YA" : "TIDAK"}</strong>{" "}
                        (<code>{latestPublishOutput.bloggerPostId}</code>) · URL Permalink Terjaga:{" "}
                        <strong>{latestPublishOutput.urlPreserved ? "YA" : "TIDAK"}</strong> · Terverifikasi via API:{" "}
                        <strong>{latestPublishOutput.verifiedViaApi ? "YA" : "TIDAK"}</strong>
                      </p>
                    </div>
                    <span className={`badge ${statusBadgeTone(latestPublishOutput.actionTaken)}`}>
                      {latestPublishOutput.actionTaken}
                    </span>
                  </div>
                </div>
              )}

              {latestRevisionOutput?.qualityGate && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Hasil 10 Pemeriksaan Quality Gate Sebelum Publikasi</h3>
                      <p>
                        Skor Gabungan: <strong>{latestRevisionOutput.qualityGate.overallScore}/100</strong> (Minimum:{" "}
                        {latestRevisionOutput.qualityGate.minRequiredScore})
                      </p>
                    </div>
                  </div>
                  <div className="check-grid">
                    {latestRevisionOutput.qualityGate.checks.map((chk: Record<string, any>) => (
                      <div key={chk.name} className={`check-card ${chk.passed ? "pass" : "fail"}`}>
                        <div>
                          <strong>
                            {chk.passed ? "✓" : "✕"} {chk.name}{" "}
                            {chk.critical ? <small style={{ color: "#64748b" }}>(Kritis)</small> : null}
                          </strong>
                          <div style={{ fontSize: "11px", color: "#475569", marginTop: "3px" }}>{chk.detail}</div>
                        </div>
                        <span className={`badge ${chk.passed ? "green" : "red"}`}>{chk.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 13. SCHEDULER */}
          {active === "Scheduler" && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Automation Scheduler (Zona Waktu Asia/Jakarta · Job Lock &amp; Idempotency)</h3>
                    <p>
                      Mengatur 8 jadwal otomatis dengan batas artikel per batch, batas update harian, dan
                      pencegahan eksekusi ganda
                    </p>
                  </div>
                  <CalendarClock size={18} />
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nama Tugas</th>
                      <th>Tipe Task</th>
                      <th>Jam Eksekusi (WIB)</th>
                      <th>Frekuensi</th>
                      <th>Batch / Kuota Harian</th>
                      <th>Jadwal Berikutnya</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td><code>{s.taskType}</code></td>
                        <td>{s.executionTime} WIB</td>
                        <td>Setiap {s.frequencyMinutes} mnt</td>
                        <td>
                          Max {s.maxBatchSize}/batch · {s.maxDailyUpdates}/hari
                        </td>
                        <td style={{ fontSize: "10.5px" }}>{s.nextRunAt ? String(s.nextRunAt).slice(0, 19) : "—"}</td>
                        <td>
                          <span className={`badge ${s.enabled ? "green" : "slate"}`}>
                            {s.enabled ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="primary-button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const res = await window.nusa.runScheduleNow(String(s.id));
                                  notify(
                                    res.skipped
                                      ? String(res.reason)
                                      : `Tugas "${res.scheduleName}" selesai dieksekusi (${res.executedAtWib}).`
                                  );
                                  await refreshAll();
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <Play size={12} /> Jalankan
                            </button>
                            <button
                              className="secondary-button"
                              onClick={async () => {
                                await window.nusa.updateSchedule({
                                  id: String(s.id),
                                  enabled: !s.enabled
                                });
                                await refreshAll();
                              }}
                            >
                              {s.enabled ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="two-col">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Antrean Automation Jobs &amp; Idempotency Key</h3>
                      <p>Setiap pekerjaan terkunci oleh worker agar tidak berjalan ganda</p>
                    </div>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tipe</th>
                        <th>Status</th>
                        <th>Idempotency Key</th>
                        <th>Percobaan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.slice(0, 10).map((j) => (
                        <tr key={j.id}>
                          <td><strong>{j.jobType}</strong></td>
                          <td><span className={`badge ${statusBadgeTone(String(j.status))}`}>{j.status}</span></td>
                          <td><code>{j.idempotencyKey || j.id.slice(0, 10)}</code></td>
                          <td>
                            {j.attempts}/{j.maxAttempts}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Job Logs (Worker Log)</h3>
                      <p>Catatan eksekusi detail dari Background Worker</p>
                    </div>
                  </div>
                  <div className="code-box">
                    {jobLogs.length > 0
                      ? jobLogs.map((l) => `[${String(l.level).toUpperCase()}] ${l.message}`).join("\n")
                      : "Belum ada log pekerjaan. Klik 'Jalankan' pada salah satu jadwal di atas."}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 14. BACKUP & RESTORE */}
          {active === "Backup & Restore" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Database Backup &amp; Restore</h3>
                  <p>
                    Cadangkan seluruh database SQLite dan snapshot JSON workspace sebelum pembaruan massal
                  </p>
                </div>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await window.nusa.createBackup();
                      notify(
                        `Backup berhasil dibuat (${res.createdAtWib}): ${res.jsonFileName} (${res.articleCount} artikel).`
                      );
                      await refreshAll();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <ArchiveRestore size={14} /> Buat Backup Sekarang
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama File Backup</th>
                    <th>Tipe</th>
                    <th>Ukuran</th>
                    <th>Waktu Pembuatan (WIB)</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.fileName}>
                      <td><code>{b.fileName}</code></td>
                      <td><span className="badge blue">{b.type}</span></td>
                      <td>{(Number(b.sizeBytes) / 1024).toFixed(1)} KB</td>
                      <td>{b.createdAtWib}</td>
                      <td>
                        {b.type === "workspace_json" && (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={async () => {
                              const res = await window.nusa.restoreBackup(String(b.fileName));
                              notify(
                                `Restore selesai (${res.restoredAtWib}): ${res.restoredArticles} artikel dipulihkan.`
                              );
                              await refreshAll();
                            }}
                          >
                            <RotateCcw size={12} /> Pulihkan Snapshot
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 15. UPDATE HISTORY */}
          {active === "Update History" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Riwayat Revisi Artikel &amp; Rollback Satu-Klik</h3>
                  <p>
                    Setiap perubahan menyimpan konten lama (backup) sehingga Anda dapat melakukan Rollback ke
                    versi mana pun
                  </p>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artikel &amp; Post ID</th>
                    <th>Revisi #</th>
                    <th>Tipe</th>
                    <th>Ringkasan Perubahan</th>
                    <th>Skor</th>
                    <th>Status di Blogger</th>
                    <th>Rollback</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.articleTitle || r.newTitle}</strong>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>
                          Post ID: <code>{r.bloggerPostId}</code>
                        </div>
                      </td>
                      <td><strong>#{r.revisionNumber}</strong></td>
                      <td>
                        <span className={`badge ${r.isBackupSnapshot ? "violet" : "blue"}`}>
                          {r.isBackupSnapshot ? "Backup Asli" : "Revisi AI"}
                        </span>
                      </td>
                      <td>{r.changeSummary}</td>
                      <td>{r.qualityScore}/100</td>
                      <td>
                        <span className={`badge ${r.appliedToBlogger ? "green" : "slate"}`}>
                          {r.appliedToBlogger ? "Diterapkan" : "Tersimpan"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="danger-button"
                          disabled={busy}
                          onClick={() => void handleRollback(String(r.articleId), String(r.id))}
                        >
                          <RotateCcw size={12} /> Rollback ke Versi Ini
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 16. REPORTS */}
          {active === "Reports" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Laporan Pembaruan &amp; Integritas URL / Post ID</h3>
                  <p>
                    Bukti verifikasi bahwa setiap operasi update mempertahankan blogger_post_id dan URL asli
                  </p>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Judul Artikel</th>
                    <th>Blogger Post ID</th>
                    <th>Tindakan</th>
                    <th>Skor (Sebelum → Sesudah)</th>
                    <th>URL &amp; Post ID Utuh</th>
                    <th>Alasan Keputusan</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((rep) => (
                    <tr key={rep.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{String(rep.createdAt).slice(0, 19)}</td>
                      <td><strong>{rep.articleTitle}</strong></td>
                      <td><code>{rep.bloggerPostId}</code></td>
                      <td>
                        <span className={`badge ${statusBadgeTone(String(rep.actionTaken))}`}>
                          {rep.actionTaken}
                        </span>
                      </td>
                      <td>
                        {rep.beforeScore} → <strong>{rep.afterScore}</strong>
                      </td>
                      <td>
                        <span className="badge green">
                          {rep.urlPreserved && rep.postIdPreserved ? "✓ URL & Post ID Utuh" : "Periksa"}
                        </span>
                      </td>
                      <td>{rep.decisionReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 17. TEAM MANAGEMENT */}
          {active === "Team Management" && (
            <div className="two-col">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Tambah Anggota Tim (Role-Based Access Control)</h3>
                    <p>Atur hak akses Owner, Admin, Editor, dan Viewer pada workspace ini</p>
                  </div>
                </div>
                <div className="field-group" style={{ marginBottom: "10px" }}>
                  <label>Nama Lengkap</label>
                  <input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Contoh: Andi Pratama"
                  />
                </div>
                <div className="field-group" style={{ marginBottom: "10px" }}>
                  <label>Email</label>
                  <input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="andi@nusablogger.id"
                  />
                </div>
                <div className="field-group" style={{ marginBottom: "12px" }}>
                  <label>Role RBAC</label>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as typeof memberRole)}
                  >
                    <option value="owner">Owner (Akses Penuh)</option>
                    <option value="admin">Admin (Kelola Blog, Jadwal, dan Tim)</option>
                    <option value="editor">Editor (Tulis, Revisi, dan Publish Artikel)</option>
                    <option value="viewer">Viewer (Hanya Baca Laporan)</option>
                  </select>
                </div>
                <button
                  className="primary-button"
                  disabled={busy || !memberName.trim() || !memberEmail.trim()}
                  onClick={async () => {
                    await window.nusa.addTeamMember({
                      displayName: memberName,
                      email: memberEmail,
                      role: memberRole
                    });
                    setMemberName("");
                    setMemberEmail("");
                    notify("Anggota tim berhasil ditambahkan.");
                    await refreshAll();
                  }}
                >
                  <Plus size={14} /> Tambah Anggota Tim
                </button>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Daftar Anggota Tim Workspace</h3>
                    <p>Tersinkronisasi dengan tabel users &amp; workspace_members</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.displayName}</strong></td>
                        <td>{m.email}</td>
                        <td><span className="badge blue">{m.role}</span></td>
                        <td><span className="badge green">{m.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 18. SETTINGS */}
          {active === "Settings" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Konfigurasi OpenAI API, Quality Gate &amp; Database</h3>
                  <p>API Key dienkripsi dengan AES-256-GCM. Sistem menolak halusinasi fakta secara ketat.</p>
                </div>
                <Settings size={18} />
              </div>
              <div className="field-grid">
                <div className="field-group">
                  <label>Model OpenAI</label>
                  <select value={aiModelInput} onChange={(e) => setAiModelInput(e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini (Cepat &amp; Efisien)</option>
                    <option value="gpt-4o">gpt-4o (Akurasi Maksimum)</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>OpenAI API Key ({aiSettings?.maskedApiKey || "Belum diatur"})</label>
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    placeholder="sk-proj-..."
                  />
                </div>
                <div className="field-group">
                  <label>Skor Minimum Quality Gate (0–100)</label>
                  <input
                    type="number"
                    min={50}
                    max={98}
                    value={aiMinGateInput}
                    onChange={(e) => setAiMinGateInput(Number(e.target.value))}
                  />
                </div>
              </div>
              <button
                className="primary-button"
                disabled={busy}
                onClick={async () => {
                  await window.nusa.updateAiSettings({
                    model: aiModelInput,
                    apiKey: aiKeyInput || undefined,
                    minQualityGate: aiMinGateInput,
                    strictFactCheck: true
                  });
                  setAiKeyInput("");
                  notify("Pengaturan AI & Quality Gate berhasil disimpan.");
                  await refreshAll();
                }}
              >
                <ShieldCheck size={14} /> Simpan Pengaturan Sistem
              </button>
            </div>
          )}
        </div>

        <footer>
          <span>© 2026 Nusa Blogger Automation · Windows 11 Desktop Enterprise Edition</span>
          <span>Zona Waktu: Asia/Jakarta · Blogger API v3 + OpenAI + Prisma/SQLite</span>
        </footer>
      </main>
    </div>
  );
}
