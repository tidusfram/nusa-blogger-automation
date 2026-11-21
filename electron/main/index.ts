import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import {
  addKeyword,
  addSourceReference,
  addTeamMember,
  connectGoogleAccount,
  createOrUpdateBlog,
  createWorkspace,
  getAiSettings,
  getArticleById,
  getDashboardStats,
  initializeDatabase,
  listArticleRevisions,
  listArticles,
  listBlogs,
  listGoogleAccounts,
  listJobLogs,
  listJobs,
  listKeywords,
  listSchedules,
  listTeamMembers,
  listUpdateReports,
  listWorkspaces,
  refreshGoogleAccessToken,
  setActiveWorkspaceId,
  updateAiSettings,
  updateScheduleConfig
} from "./services/database";
import { buildGoogleOAuthUrl } from "./services/bloggerApi";
import {
  analyzeArticleForDetection,
  runBatchDetection,
  syncArticlesFromBlogger
} from "./engines/detectionEngine";
import { generateArticleRevision } from "./engines/revisionEngine";
import {
  publishArticleUpdateToBlogger,
  rollbackArticleToRevision
} from "./engines/publishingEngine";
import { generateAndAutoPublishNewArticle } from "./engines/autoPublishEngine";
import {
  executeScheduledTask,
  runFullEndToEndAutomationPipeline
} from "./engines/schedulerEngine";
import {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreWorkspaceSnapshot
} from "./services/backupService";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 740,
    title: "Nusa Blogger Automation — AI Auto Publish & Auto Update Blogspot",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("dashboard:stats", (_e, workspaceId?: string) => getDashboardStats(workspaceId));
  ipcMain.handle("workspace:list", () => listWorkspaces());
  ipcMain.handle("workspace:create", (_e, name: unknown) => {
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
      throw new Error("Nama workspace harus 2–80 karakter.");
    }
    return createWorkspace(name.trim());
  });
  ipcMain.handle("workspace:switch", (_e, workspaceId: string) => setActiveWorkspaceId(workspaceId));

  // Google Accounts & OAuth
  ipcMain.handle("accounts:list", (_e, workspaceId?: string) => listGoogleAccounts(workspaceId));
  ipcMain.handle("accounts:connect", (_e, payload: Parameters<typeof connectGoogleAccount>[0]) =>
    connectGoogleAccount(payload)
  );
  ipcMain.handle("accounts:refresh", (_e, accountId: string) => refreshGoogleAccessToken(accountId));
  ipcMain.handle("accounts:oauthUrl", (_e, clientId: string) =>
    buildGoogleOAuthUrl({ clientId: clientId || "nusa-blogger-desktop-client.apps.googleusercontent.com" })
  );

  // Blogs
  ipcMain.handle("blogs:list", (_e, workspaceId?: string) => listBlogs(workspaceId));
  ipcMain.handle("blogs:save", (_e, payload: Parameters<typeof createOrUpdateBlog>[0]) =>
    createOrUpdateBlog(payload)
  );
  ipcMain.handle("blogs:sync", (_e, blogId: string) => syncArticlesFromBlogger(blogId));

  // Keywords
  ipcMain.handle("keywords:list", (_e, workspaceId?: string) => listKeywords(workspaceId));
  ipcMain.handle("keywords:add", (_e, payload: Parameters<typeof addKeyword>[0]) => addKeyword(payload));

  // Articles & Sources
  ipcMain.handle("articles:list", (_e, workspaceId?: string, blogId?: string) =>
    listArticles(workspaceId, blogId)
  );
  ipcMain.handle("articles:get", (_e, articleId: string) => getArticleById(articleId));
  ipcMain.handle("articles:addSource", (_e, payload: Parameters<typeof addSourceReference>[0]) =>
    addSourceReference(payload)
  );

  // Detection Engine
  ipcMain.handle("detection:analyzeOne", (_e, articleId: string) => analyzeArticleForDetection(articleId));
  ipcMain.handle("detection:analyzeAll", (_e, workspaceId?: string, blogId?: string) =>
    runBatchDetection(workspaceId, blogId)
  );

  // AI Revision Engine
  ipcMain.handle("revision:generate", (_e, articleId: string) => generateArticleRevision(articleId));
  ipcMain.handle("revision:list", (_e, articleId?: string) => listArticleRevisions(articleId));

  // Publishing Engine & Auto Publisher
  ipcMain.handle("publishing:update", (_e, articleId: string, revisionId?: string) =>
    publishArticleUpdateToBlogger(articleId, revisionId)
  );
  ipcMain.handle("publishing:rollback", (_e, articleId: string, revisionId: string) =>
    rollbackArticleToRevision(articleId, revisionId)
  );
  ipcMain.handle("publishing:autoPublishNew", (_e, payload: Parameters<typeof generateAndAutoPublishNewArticle>[0]) =>
    generateAndAutoPublishNewArticle(payload)
  );
  ipcMain.handle("pipeline:runFull", (_e, workspaceId?: string, blogId?: string) =>
    runFullEndToEndAutomationPipeline(workspaceId, blogId)
  );

  // Scheduler & Jobs
  ipcMain.handle("schedules:list", (_e, workspaceId?: string) => listSchedules(workspaceId));
  ipcMain.handle("schedules:update", (_e, payload: Parameters<typeof updateScheduleConfig>[0]) =>
    updateScheduleConfig(payload)
  );
  ipcMain.handle("schedules:runNow", (_e, scheduleId: string) => executeScheduledTask(scheduleId, true));
  ipcMain.handle("jobs:list", (_e, workspaceId?: string) => listJobs(workspaceId));
  ipcMain.handle("jobs:logs", (_e, jobId?: string) => listJobLogs(jobId));

  // Reports & History
  ipcMain.handle("reports:list", (_e, workspaceId?: string) => listUpdateReports(workspaceId));

  // Backup & Restore
  ipcMain.handle("backup:create", (_e, workspaceId?: string) => createDatabaseBackup(workspaceId));
  ipcMain.handle("backup:list", () => listDatabaseBackups());
  ipcMain.handle("backup:restore", (_e, fileName: string) => restoreWorkspaceSnapshot(fileName));

  // Team & Settings
  ipcMain.handle("team:list", (_e, workspaceId?: string) => listTeamMembers(workspaceId));
  ipcMain.handle("team:add", (_e, payload: Parameters<typeof addTeamMember>[0]) => addTeamMember(payload));
  ipcMain.handle("settings:getAi", (_e, workspaceId?: string) => getAiSettings(workspaceId));
  ipcMain.handle("settings:updateAi", (_e, payload: Parameters<typeof updateAiSettings>[0]) =>
    updateAiSettings(payload)
  );
}

app.whenReady().then(() => {
  initializeDatabase(app.getPath("userData"));
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
