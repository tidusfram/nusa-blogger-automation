import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nusa", {
  getDashboardStats: (workspaceId?: string) => ipcRenderer.invoke("dashboard:stats", workspaceId),
  listWorkspaces: () => ipcRenderer.invoke("workspace:list"),
  createWorkspace: (name: string) => ipcRenderer.invoke("workspace:create", name),
  switchWorkspace: (workspaceId: string) => ipcRenderer.invoke("workspace:switch", workspaceId),

  // Google Accounts
  listGoogleAccounts: (workspaceId?: string) => ipcRenderer.invoke("accounts:list", workspaceId),
  connectGoogleAccount: (payload: {
    workspaceId?: string;
    email: string;
    displayName?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  }) => ipcRenderer.invoke("accounts:connect", payload),
  refreshGoogleAccountToken: (accountId: string) => ipcRenderer.invoke("accounts:refresh", accountId),
  getGoogleOAuthUrl: (clientId: string) => ipcRenderer.invoke("accounts:oauthUrl", clientId),

  // Blogs
  listBlogs: (workspaceId?: string) => ipcRenderer.invoke("blogs:list", workspaceId),
  saveBlog: (payload: {
    workspaceId?: string;
    googleAccountId?: string;
    bloggerBlogId: string;
    name: string;
    url: string;
    minQualityScore?: number;
    maxDailyUpdates?: number;
    writingTone?: string;
  }) => ipcRenderer.invoke("blogs:save", payload),
  syncBlogArticles: (blogId: string) => ipcRenderer.invoke("blogs:sync", blogId),

  // Keywords
  listKeywords: (workspaceId?: string) => ipcRenderer.invoke("keywords:list", workspaceId),
  addKeyword: (payload: {
    workspaceId?: string;
    blogId: string;
    keyword: string;
    intent?: string;
    priority?: number;
  }) => ipcRenderer.invoke("keywords:add", payload),

  // Articles & Sources
  listArticles: (workspaceId?: string, blogId?: string) =>
    ipcRenderer.invoke("articles:list", workspaceId, blogId),
  getArticle: (articleId: string) => ipcRenderer.invoke("articles:get", articleId),
  addSourceReference: (payload: {
    articleId: string;
    title: string;
    url: string;
    publisher?: string;
    publishedDate?: string;
    claimSupported: string;
    verified?: boolean;
  }) => ipcRenderer.invoke("articles:addSource", payload),

  // Detection Engine
  analyzeArticle: (articleId: string) => ipcRenderer.invoke("detection:analyzeOne", articleId),
  analyzeAllArticles: (workspaceId?: string, blogId?: string) =>
    ipcRenderer.invoke("detection:analyzeAll", workspaceId, blogId),

  // AI Revision Engine
  generateRevision: (articleId: string) => ipcRenderer.invoke("revision:generate", articleId),
  listRevisions: (articleId?: string) => ipcRenderer.invoke("revision:list", articleId),

  // Publishing Engine & Auto Publish
  publishArticleUpdate: (articleId: string, revisionId?: string) =>
    ipcRenderer.invoke("publishing:update", articleId, revisionId),
  rollbackArticle: (articleId: string, revisionId: string) =>
    ipcRenderer.invoke("publishing:rollback", articleId, revisionId),
  autoPublishNewArticle: (payload: {
    workspaceId?: string;
    blogId: string;
    keywordId?: string;
    customKeyword?: string;
    publishImmediately?: boolean;
  }) => ipcRenderer.invoke("publishing:autoPublishNew", payload),
  runFullPipeline: (workspaceId?: string, blogId?: string) =>
    ipcRenderer.invoke("pipeline:runFull", workspaceId, blogId),

  // Scheduler & Jobs
  listSchedules: (workspaceId?: string) => ipcRenderer.invoke("schedules:list", workspaceId),
  updateSchedule: (payload: {
    id: string;
    enabled?: boolean;
    frequencyMinutes?: number;
    executionTime?: string;
    maxBatchSize?: number;
    maxDailyUpdates?: number;
    minPriorityScore?: number;
  }) => ipcRenderer.invoke("schedules:update", payload),
  runScheduleNow: (scheduleId: string) => ipcRenderer.invoke("schedules:runNow", scheduleId),
  listJobs: (workspaceId?: string) => ipcRenderer.invoke("jobs:list", workspaceId),
  listJobLogs: (jobId?: string) => ipcRenderer.invoke("jobs:logs", jobId),

  // Reports
  listUpdateReports: (workspaceId?: string) => ipcRenderer.invoke("reports:list", workspaceId),

  // Backup & Restore
  createBackup: (workspaceId?: string) => ipcRenderer.invoke("backup:create", workspaceId),
  listBackups: () => ipcRenderer.invoke("backup:list"),
  restoreBackup: (fileName: string) => ipcRenderer.invoke("backup:restore", fileName),

  // Team & Settings
  listTeamMembers: (workspaceId?: string) => ipcRenderer.invoke("team:list", workspaceId),
  addTeamMember: (payload: {
    workspaceId?: string;
    displayName: string;
    email: string;
    role: "owner" | "admin" | "editor" | "viewer";
  }) => ipcRenderer.invoke("team:add", payload),
  getAiSettings: (workspaceId?: string) => ipcRenderer.invoke("settings:getAi", workspaceId),
  updateAiSettings: (payload: {
    workspaceId?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
    minQualityGate?: number;
    strictFactCheck?: boolean;
    dailyTokenLimit?: number;
  }) => ipcRenderer.invoke("settings:updateAi", payload)
});
