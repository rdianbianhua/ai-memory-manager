// Shared types between main and renderer processes

export type GlobalMemoryType = 'preference' | 'habit' | 'context';
export type ProjectMemoryType = 'problem' | 'solution' | 'error' | 'decision' | 'note';
export type MemoryStatus = 'active' | 'resolved' | 'archived';
export type MemoryTrustStatus = 'proposed' | 'confirmed' | 'rejected' | 'stale' | 'superseded';
export type MemoryConfidence = 'low' | 'medium' | 'high';
export type MemorySource = 'manual' | 'conversation' | 'commit' | 'error_log' | 'extracted' | 'document';
export type OperationAction = 'create' | 'update' | 'delete';
export type ReviewQueueStatus = 'pending' | 'approved' | 'rejected';
export type ReviewQueueAction = 'create' | 'update' | 'supersede';

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  repoUrl?: string;
  globalMemoryPermission?: boolean;
  createdAt: string;
  lastAccessedAt: string;
}

export interface GlobalMemory {
  id: string;
  content: string;
  memoryType: GlobalMemoryType;
  trustStatus?: MemoryTrustStatus;
  confidence?: MemoryConfidence;
  evidenceRefs?: string[];
  lastVerifiedAt?: string | null;
  supersedesId?: string | null;
  source: MemorySource;
  metadata?: Record<string, unknown>;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemory {
  id: string;
  projectId: string;
  content: string;
  memoryType: ProjectMemoryType;
  status: MemoryStatus;
  trustStatus?: MemoryTrustStatus;
  confidence?: MemoryConfidence;
  evidenceRefs?: string[];
  lastVerifiedAt?: string | null;
  supersedesId?: string | null;
  source: MemorySource;
  tags: string[];
  metadata?: Record<string, unknown>;
  importance: number;
  commitHash?: string;
  language?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  viewCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult<T> {
  item: T;
  score: number;
}

export interface OverallStats {
  projectCount: number;
  totalMemories: number;
  globalMemoryCount: number;
  projectMemoryCount: number;
  problemCount: number;
  solutionCount: number;
  errorCount: number;
  resolvedCount: number;
  activeCount: number;
  confirmedMemoryCount?: number;
  nonConfirmedMemoryCount?: number;
}

export interface GlobalStats {
  total: number;
  byType: Record<GlobalMemoryType, number>;
  byTrustStatus?: Record<MemoryTrustStatus, number>;
}

export interface ProjectStats {
  projectId: string;
  total: number;
  byType: Record<ProjectMemoryType, number>;
  byStatus: Record<MemoryStatus, number>;
  byTrustStatus?: Record<MemoryTrustStatus, number>;
}

export interface OperationLog {
  id: string;
  entityType: 'project' | 'global_memory' | 'project_memory';
  entityId: string;
  action: OperationAction;
  changes?: string;
  metadata?: string;
  createdAt: string;
}

export interface ApiToken {
  id: string;
  token: string;
  name: string;
  projectId: string | null;
  projectName?: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface BrainSnapshot {
  id: string;
  scope: 'global' | 'project';
  projectId?: string | null;
  snapshotType: 'user_profile' | 'project_brief' | 'ai_startup_context';
  content: string;
  sourceMemoryIds: string[];
  generatedAt: string;
}

export interface BrainSnapshotCompare {
  from: BrainSnapshot;
  to: BrainSnapshot;
  addedLines: string[];
  removedLines: string[];
  unchangedLineCount: number;
}

export interface ReviewQueueItem {
  id: string;
  scope: 'global' | 'project';
  projectId?: string | null;
  content: string;
  memoryType: GlobalMemoryType | ProjectMemoryType;
  proposedAction: ReviewQueueAction;
  status: ReviewQueueStatus;
  confidence: MemoryConfidence;
  evidenceRefs: string[];
  supersedesId?: string | null;
  source: 'manual' | 'snapshot_compare' | 'profile_promotion';
  fromSnapshotId?: string | null;
  toSnapshotId?: string | null;
  lineIndex?: number | null;
  approvedMemoryId?: string | null;
  rejectionReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
}

export interface CreateReviewQueueItemInput {
  scope: 'global' | 'project';
  projectId?: string | null;
  content: string;
  memoryType: GlobalMemoryType | ProjectMemoryType;
  proposedAction?: ReviewQueueAction;
  confidence?: MemoryConfidence;
  evidenceRefs?: string[];
  supersedesId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BrainProjectBrief {
  project: Project;
  stats: ProjectStats;
  activeProblems: ProjectMemory[];
  recentDecisions: ProjectMemory[];
  recentNotes: ProjectMemory[];
  risks: ProjectMemory[];
  handoffText: string;
}

export interface BrainOverview {
  generatedAt: string;
  userProfile: {
    preferences: GlobalMemory[];
    habits: GlobalMemory[];
    contexts: GlobalMemory[];
    profileText: string;
  };
  projects: BrainProjectBrief[];
  activeProblemsTotal: number;
  recentDecisionsTotal: number;
  staleSignals: string[];
  startupContext: string;
  latestSnapshots: BrainSnapshot[];
}

// IPC API types
export interface IElectronAPI {
  project: {
    list(): Promise<Project[]>;
    get(id: string): Promise<Project | null>;
    create(name: string, path: string, description?: string): Promise<Project>;
    delete(id: string): Promise<void>;
    getStats(id: string): Promise<ProjectStats>;
  };
  memory: {
    listGlobal(filters?: { memoryType?: GlobalMemoryType; limit?: number }): Promise<GlobalMemory[]>;
    addGlobal(data: { content: string; memoryType: GlobalMemoryType; source?: MemorySource; importance?: number }): Promise<GlobalMemory>;
    updateGlobal(id: string, updates: { content?: string; importance?: number }): Promise<GlobalMemory | null>;
    deleteGlobal(id: string): Promise<void>;
    listByProject(projectId: string, filters?: { memoryType?: ProjectMemoryType; status?: MemoryStatus; limit?: number }): Promise<ProjectMemory[]>;
    addProject(data: { projectId: string; content: string; memoryType: ProjectMemoryType; tags?: string[]; importance?: number }): Promise<ProjectMemory>;
    updateProject(id: string, updates: { status?: MemoryStatus; content?: string; addTags?: string[]; removeTags?: string[] }): Promise<ProjectMemory | null>;
    deleteProject(id: string): Promise<void>;
    deleteAllInProject(projectId: string): Promise<void>;
  };
  search: {
    semantic(query: string, options?: { projectPath?: string; limit?: number }): Promise<SearchResult<ProjectMemory | GlobalMemory>[]>;
    keyword(query: string, options?: { projectPath?: string; limit?: number }): Promise<SearchResult<ProjectMemory | GlobalMemory>[]>;
  };
  stats: {
    getOverall(): Promise<OverallStats>;
    getGlobal(): Promise<GlobalStats>;
    getProjectStats(projectId: string): Promise<ProjectStats>;
  };
  logs: {
    getByEntity(entityType: string, entityId: string, limit?: number): Promise<OperationLog[]>;
    getRecent(limit?: number): Promise<OperationLog[]>;
  };
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
