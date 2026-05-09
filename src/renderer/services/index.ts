// HTTP API client for browser
import type {
  ApiToken,
  BrainOverview,
  BrainSnapshot,
  BrainSnapshotCompare,
  GlobalMemory,
  GlobalMemoryType,
  GlobalStats,
  MemoryStatus,
  OperationLog,
  OverallStats,
  Project,
  ProjectMemory,
  ProjectMemoryType,
  ProjectStats,
  ReviewQueueItem,
  ReviewQueueStatus,
  SearchResult,
} from '../../shared/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface RuntimeStatus {
  databasePath: string;
  embedder: {
    model: string;
    dimension: number;
    hasApiKey: boolean;
    semanticSearchEnabled: boolean;
  };
  mcp: {
    serverPath: string;
    requiredEnv: string[];
  };
}

export interface McpSelfTestResult {
  success: boolean;
  token: {
    id: string;
    name: string;
    projectId: string | null;
    projectName?: string;
    tokenPreview: string;
  };
  tools: string[];
  project?: {
    name: string;
    path: string;
  };
  counts?: Record<string, number>;
  quality?: {
    score: number;
    gaps: string[];
    runCommands: string[];
    verificationCommands: string[];
  };
  permissionMatrix: Array<{
    name: string;
    success: boolean;
    expected: boolean;
    detail: string;
  }>;
  handoffText?: string;
  handoffPreview: string[];
  issues: string[];
  diagnostics: {
    command: string;
    args: string[];
    cwd: string;
    projectPath: string;
    stderr: string[];
  };
  error?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  project: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (name: string, path: string, description?: string) =>
      request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, path, description }),
      }),
    update: (id: string, updates: { globalMemoryPermission?: boolean }) =>
      request<Project>(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    getStats: (id: string) => request<ProjectStats>(`/projects/${id}/stats`),
  },

  memory: {
    getGlobal: (id: string) => request<GlobalMemory>(`/memories/global/${id}`),
    listGlobal: (filters?: { memoryType?: GlobalMemoryType; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters?.memoryType) params.set('memoryType', filters.memoryType);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<GlobalMemory[]>(`/memories/global${query}`);
    },
    addGlobal: (data: { content: string; memoryType: GlobalMemoryType; importance?: number }) =>
      request<GlobalMemory>('/memories/global', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateGlobal: (id: string, updates: { content?: string; importance?: number }) =>
      request<GlobalMemory>(`/memories/global/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    deleteGlobal: (id: string) =>
      request<{ success: boolean }>(`/memories/global/${id}`, { method: 'DELETE' }),

    getProject: (projectId: string, memoryId: string) => request<ProjectMemory>(`/memories/project/${projectId}/${memoryId}`),
    listByProject: (projectId: string, filters?: { memoryType?: ProjectMemoryType; status?: MemoryStatus; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters?.memoryType) params.set('memoryType', filters.memoryType);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<ProjectMemory[]>(`/memories/project/${projectId}${query}`);
    },
    addProject: (data: { projectId: string; content: string; memoryType: ProjectMemoryType; tags?: string[]; importance?: number }) =>
      request<ProjectMemory>('/memories/project', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateProject: (id: string, updates: { status?: MemoryStatus; content?: string; addTags?: string[]; removeTags?: string[] }) =>
      request<ProjectMemory>(`/memories/project/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    deleteProject: (id: string) =>
      request<{ success: boolean }>(`/memories/project/${id}`, { method: 'DELETE' }),
    deleteAllInProject: (projectId: string) =>
      request<{ success: boolean }>(`/memories/project-all/${projectId}`, { method: 'DELETE' }),
  },

  search: {
    semantic: (query: string, options?: { projectPath?: string; limit?: number }) => {
      const params = new URLSearchParams({ q: query });
      if (options?.projectPath) params.set('projectPath', options.projectPath);
      if (options?.limit) params.set('limit', String(options.limit));
      return request<SearchResult<ProjectMemory | GlobalMemory>[]>(`/search?${params.toString()}`);
    },
  },

  stats: {
    getOverall: () => request<OverallStats>('/stats/overall'),
    getGlobal: () => request<GlobalStats>('/stats/global'),
    getProjectStats: (projectId: string) => request<ProjectStats>(`/stats/project/${projectId}`),
  },

  logs: {
    getByEntity: (entityType: string, entityId: string, limit = 20) =>
      request<OperationLog[]>(`/logs/entity/${entityType}/${entityId}?limit=${limit}`),
    getRecent: (limit = 50) => request<OperationLog[]>(`/logs/recent?limit=${limit}`),
  },

  token: {
    list: () => request<Omit<ApiToken, 'token'>[]>('/tokens'),
    reveal: (id: string) => request<ApiToken>(`/tokens/${id}/reveal`, { method: 'POST' }),
    create: (name: string, projectId?: string) =>
      request<ApiToken>('/tokens', {
        method: 'POST',
        body: JSON.stringify({ name, projectId }),
      }),
    bind: (id: string, projectId: string | null) =>
      request<Omit<ApiToken, 'token'>>(`/tokens/${id}/bind`, {
        method: 'PUT',
        body: JSON.stringify({ projectId }),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/tokens/${id}`, { method: 'DELETE' }),
  },

  runtime: {
    status: () => request<RuntimeStatus>('/runtime/status'),
    mcpSelfTest: (tokenId: string) =>
      request<McpSelfTestResult>('/runtime/mcp-self-test', {
        method: 'POST',
        body: JSON.stringify({ tokenId }),
      }),
  },

  brain: {
    overview: (projectLimit = 6) => request<BrainOverview>(`/brain/overview?projectLimit=${projectLimit}`),
    saveSnapshots: (projectLimit = 8) =>
      request<{ success: boolean; snapshots: BrainSnapshot[] }>('/brain/snapshots', {
        method: 'POST',
        body: JSON.stringify({ projectLimit }),
      }),
    listSnapshots: (filters?: { limit?: number; snapshotType?: BrainSnapshot['snapshotType'] }) => {
      const params = new URLSearchParams();
      params.set('limit', String(filters?.limit || 20));
      if (filters?.snapshotType) params.set('snapshotType', filters.snapshotType);
      return request<BrainSnapshot[]>(`/brain/snapshots?${params.toString()}`);
    },
    compareSnapshots: (fromId: string, toId: string) =>
      request<BrainSnapshotCompare>(`/brain/snapshots/compare?fromId=${fromId}&toId=${toId}`),
    createReviewItemsFromSnapshotCompare: (fromId: string, toId: string) =>
      request<{ success: boolean; items: ReviewQueueItem[] }>('/brain/snapshots/compare/review', {
        method: 'POST',
        body: JSON.stringify({ fromId, toId }),
      }),
    createProfileCandidates: (limit = 20) =>
      request<{ success: boolean; items: ReviewQueueItem[] }>('/brain/profile-candidates', {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }),
    listReviewQueue: (filters?: { status?: ReviewQueueStatus; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      params.set('limit', String(filters?.limit || 50));
      return request<ReviewQueueItem[]>(`/brain/review-queue?${params.toString()}`);
    },
    approveReviewItem: (id: string) =>
      request<ReviewQueueItem>(`/brain/review-queue/${id}/approve`, { method: 'POST' }),
    updateReviewItem: (id: string, updates: { content?: string; confidence?: ReviewQueueItem['confidence'] }) =>
      request<ReviewQueueItem>(`/brain/review-queue/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    rejectReviewItem: (id: string, reason?: string) =>
      request<ReviewQueueItem>(`/brain/review-queue/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },
};
