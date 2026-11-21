export {};

export interface DashboardStats {
  workspaces: number;
  activeWorkspaceId: string;
  users: number;
  blogs: number;
  articles: number;
  articlesNeedingUpdate: number;
  articlesUpdated: number;
  articlesFailed: number;
  articlesSkipped: number;
  totalPublished: number;
  pendingJobs: number;
  failedJobs: number;
  completedJobs: number;
  aiUsage: {
    requests: number;
    tokensUsed: number;
    dailyLimit: number;
    model: string;
  };
  nextSchedule: {
    name: string;
    taskType: string;
    nextRunAt: string;
    executionTime: string;
    timezone: string;
  } | null;
  recentActivities: Array<{
    id: string;
    action: string;
    entityType: string;
    details: string;
    createdAt: string;
    createdAtWib: string;
  }>;
}

declare global {
  interface Window {
    nusa: {
      getDashboardStats: (workspaceId?: string) => Promise<DashboardStats>;
      listWorkspaces: () => Promise<Array<{ id: string; name: string; createdAt: string }>>;
      createWorkspace: (name: string) => Promise<{ id: string; name: string }>;
      switchWorkspace: (workspaceId: string) => Promise<{ activeWorkspaceId: string }>;

      listGoogleAccounts: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      connectGoogleAccount: (payload: {
        workspaceId?: string;
        email: string;
        displayName?: string;
        accessToken?: string;
        refreshToken?: string;
        clientId?: string;
        clientSecret?: string;
      }) => Promise<Record<string, any>>;
      refreshGoogleAccountToken: (accountId: string) => Promise<string>;
      getGoogleOAuthUrl: (clientId: string) => Promise<string>;

      listBlogs: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      saveBlog: (payload: {
        workspaceId?: string;
        googleAccountId?: string;
        bloggerBlogId: string;
        name: string;
        url: string;
        minQualityScore?: number;
        maxDailyUpdates?: number;
        writingTone?: string;
      }) => Promise<Record<string, any>>;
      syncBlogArticles: (blogId: string) => Promise<Record<string, any>>;

      listKeywords: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      addKeyword: (payload: {
        workspaceId?: string;
        blogId: string;
        keyword: string;
        intent?: string;
        priority?: number;
      }) => Promise<Record<string, any>>;

      listArticles: (workspaceId?: string, blogId?: string) => Promise<Array<Record<string, any>>>;
      getArticle: (articleId: string) => Promise<Record<string, any> | null>;
      addSourceReference: (payload: {
        articleId: string;
        title: string;
        url: string;
        publisher?: string;
        publishedDate?: string;
        claimSupported: string;
        verified?: boolean;
      }) => Promise<Record<string, any>>;

      analyzeArticle: (articleId: string) => Promise<Record<string, any>>;
      analyzeAllArticles: (workspaceId?: string, blogId?: string) => Promise<Array<Record<string, any>>>;

      generateRevision: (articleId: string) => Promise<Record<string, any>>;
      listRevisions: (articleId?: string) => Promise<Array<Record<string, any>>>;

      publishArticleUpdate: (articleId: string, revisionId?: string) => Promise<Record<string, any>>;
      rollbackArticle: (articleId: string, revisionId: string) => Promise<Record<string, any>>;
      autoPublishNewArticle: (payload: {
        workspaceId?: string;
        blogId: string;
        keywordId?: string;
        customKeyword?: string;
        publishImmediately?: boolean;
      }) => Promise<Record<string, any>>;
      runFullPipeline: (workspaceId?: string, blogId?: string) => Promise<Record<string, any>>;

      listSchedules: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      updateSchedule: (payload: {
        id: string;
        enabled?: boolean;
        frequencyMinutes?: number;
        executionTime?: string;
        maxBatchSize?: number;
        maxDailyUpdates?: number;
        minPriorityScore?: number;
      }) => Promise<Array<Record<string, any>>>;
      runScheduleNow: (scheduleId: string) => Promise<Record<string, any>>;
      listJobs: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      listJobLogs: (jobId?: string) => Promise<Array<Record<string, any>>>;

      listUpdateReports: (workspaceId?: string) => Promise<Array<Record<string, any>>>;

      createBackup: (workspaceId?: string) => Promise<Record<string, any>>;
      listBackups: () => Promise<Array<Record<string, any>>>;
      restoreBackup: (fileName: string) => Promise<Record<string, any>>;

      listTeamMembers: (workspaceId?: string) => Promise<Array<Record<string, any>>>;
      addTeamMember: (payload: {
        workspaceId?: string;
        displayName: string;
        email: string;
        role: "owner" | "admin" | "editor" | "viewer";
      }) => Promise<Record<string, any>>;
      getAiSettings: (workspaceId?: string) => Promise<Record<string, any>>;
      updateAiSettings: (payload: {
        workspaceId?: string;
        model?: string;
        apiKey?: string;
        temperature?: number;
        maxTokens?: number;
        minQualityGate?: number;
        strictFactCheck?: boolean;
        dailyTokenLimit?: number;
      }) => Promise<Record<string, any>>;
    };
  }
}
