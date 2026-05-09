// Core type definitions for AI Memory System

export type GlobalMemoryType = 'preference' | 'habit' | 'context';
export type ProjectMemoryType = 'problem' | 'solution' | 'error' | 'decision' | 'note';
export type MemoryStatus = 'active' | 'resolved' | 'archived';
export type MemoryTrustStatus = 'proposed' | 'confirmed' | 'rejected' | 'stale' | 'superseded';
export type MemoryConfidence = 'low' | 'medium' | 'high';
export type MemorySource = 'manual' | 'conversation' | 'commit' | 'error_log' | 'extracted' | 'document';

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

export interface Embedding {
  id: string;
  memoryId: string;
  memoryScope: 'global' | 'project';
  contentHash: string;
  vector: number[];
  model: string;
  dimension: number;
  createdAt: string;
}

export interface SearchResult<T> {
  item: T;
  score: number;
}

export interface ProjectContext {
  project: Project;
  memoryCount: number;
  recentMemories: ProjectMemory[];
  activeProblems: ProjectMemory[];
  recentDecisions: ProjectMemory[];
  userPreferences: GlobalMemory[];
  summary: string;
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

// MCP Tool input types
export interface SearchMemoriesInput {
  query: string;
  projectPath?: string;
  memoryType?: ProjectMemoryType | GlobalMemoryType;
  status?: MemoryStatus;
  limit?: number;
}

export interface AddMemoryInput {
  content: string;
  memoryType: ProjectMemoryType | GlobalMemoryType;
  projectPath?: string;
  tags?: string[];
  source?: MemorySource;
  importance?: number;
}

export interface UpdateMemoryInput {
  memoryId: string;
  projectPath?: string;
  status?: MemoryStatus;
  content?: string;
  addTags?: string[];
  removeTags?: string[];
  resolutionNote?: string;
}

export interface GetProjectContextInput {
  projectPath: string;
  includeResolved?: boolean;
  maxMemories?: number;
}

export interface ExtractAndStoreInput {
  text: string;
  projectPath: string;
  sourceType: 'commit' | 'error_log' | 'conversation' | 'document';
}
