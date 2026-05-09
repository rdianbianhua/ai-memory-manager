import { getDatabase } from '../db/index.js';
import { getEmbedder, EmbedderService } from './embedder.js';
import { getMemoryService, MemoryService } from './memory.service.js';
import { logger } from '../utils/logger.js';
import type { ProjectMemory, GlobalMemory, SearchResult, ProjectMemoryType, GlobalMemoryType, MemoryStatus, MemoryTrustStatus } from '../types/index.js';

export interface SearchOptions {
  projectId?: string;
  projectPath?: string;
  memoryType?: ProjectMemoryType | GlobalMemoryType;
  status?: MemoryStatus;
  trustStatus?: MemoryTrustStatus;
  includeUnconfirmed?: boolean;
  limit?: number;
  includeResolved?: boolean;
}

export class SearchService {
  private embedder: EmbedderService;
  private memoryService: MemoryService;

  constructor() {
    this.embedder = getEmbedder();
    this.memoryService = getMemoryService();
  }

  private get db() {
    return getDatabase();
  }

  async semanticSearch(query: string, options: SearchOptions = {}): Promise<SearchResult<ProjectMemory | GlobalMemory>[]> {
    const limit = options.limit || 10;

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);
    const queryVector = queryEmbedding.vector;

    // Get all embeddings and compute similarities
    const embeddings = this.getStoredEmbeddings(options.projectId, options.projectPath);

    const similarities: Array<{ memoryId: string; memoryScope: 'global' | 'project'; score: number }> = [];

    for (const emb of embeddings) {
      const storedVector = this.bufferToVector(Buffer.from(emb.embedding as ArrayBuffer));
      const score = this.embedder.cosineSimilarity(queryVector, storedVector);
      similarities.push({
        memoryId: emb.memory_id as string,
        memoryScope: emb.memory_scope as 'global' | 'project',
        score,
      });
    }

    // Sort by score and take top N
    similarities.sort((a, b) => b.score - a.score);
    const topResults = similarities.slice(0, limit);

    // Fetch full memory objects
    const results: SearchResult<ProjectMemory | GlobalMemory>[] = [];

    for (const result of topResults) {
      if (result.memoryScope === 'project') {
        const memory = this.memoryService.getProjectMemoryById(result.memoryId);
        if (memory && this.matchesFilters(memory, options)) {
          if (!options.includeUnconfirmed && memory.trustStatus !== 'confirmed') {
            continue;
          }
          if (!options.includeResolved && memory.status === 'resolved') {
            continue;
          }
          results.push({ item: memory, score: result.score });
        }
      } else {
        const memory = this.memoryService.getGlobalMemoryById(result.memoryId);
        if (memory && this.matchesGlobalFilters(memory, options)) {
          if (!options.includeUnconfirmed && memory.trustStatus !== 'confirmed') {
            continue;
          }
          results.push({ item: memory, score: result.score });
        }
      }
    }

    return results;
  }

  async searchInProject(query: string, projectId: string, options: Omit<SearchOptions, 'projectId'> = {}): Promise<SearchResult<ProjectMemory>[]> {
    const results = await this.semanticSearch(query, { ...options, projectId });
    return results as SearchResult<ProjectMemory>[];
  }

  async searchGlobal(query: string, options: Omit<SearchOptions, 'projectId'> = {}): Promise<SearchResult<GlobalMemory>[]> {
    const results = await this.semanticSearch(query, options);
    return results as SearchResult<GlobalMemory>[];
  }

  private getStoredEmbeddings(projectId?: string, projectPath?: string): Record<string, unknown>[] {
    let query = 'SELECT memory_id, memory_scope, embedding FROM embeddings WHERE 1=1';
    const params: unknown[] = [];

    if (projectPath) {
      const project = this.memoryService.getProjectByPath(projectPath);
      if (project) {
        query += ' AND (memory_scope = ? OR memory_id IN (SELECT id FROM project_memories WHERE project_id = ?))';
        params.push('global', project.id);
      } else {
        return [];
      }
    } else if (projectId) {
      if (!this.memoryService.getProjectById(projectId)) return [];
      query += ' AND (memory_scope = ? OR memory_id IN (SELECT id FROM project_memories WHERE project_id = ?))';
      params.push('global', projectId);
    }

    const results: Record<string, unknown>[] = [];
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  }

  private bufferToVector(buffer: Buffer): number[] {
    const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    return Array.from(float32Array);
  }

  private matchesFilters(memory: ProjectMemory, options: SearchOptions): boolean {
    if (options.memoryType && memory.memoryType !== options.memoryType) {
      return false;
    }
    if (options.status && memory.status !== options.status) {
      return false;
    }
    if (options.trustStatus && memory.trustStatus !== options.trustStatus) {
      return false;
    }
    return true;
  }

  private matchesGlobalFilters(memory: GlobalMemory, options: SearchOptions): boolean {
    if (options.memoryType && memory.memoryType !== options.memoryType) {
      return false;
    }
    if (options.trustStatus && memory.trustStatus !== options.trustStatus) {
      return false;
    }
    return true;
  }

  async keywordSearch(query: string, options: SearchOptions = {}): Promise<SearchResult<ProjectMemory | GlobalMemory>[]> {
    const limit = options.limit || 10;
    const results: SearchResult<ProjectMemory | GlobalMemory>[] = [];

    if (options.projectId || options.projectPath) {
      const projectId = options.projectId || this.memoryService.getProjectByPath(options.projectPath!)?.id;
      if (projectId) {
        const memories = this.memoryService.listProjectMemories(projectId, {
          memoryType: options.memoryType as ProjectMemoryType | undefined,
          status: options.status,
          limit: limit * 2,
        });

        for (const memory of memories) {
          if (!options.includeUnconfirmed && memory.trustStatus !== 'confirmed') {
            continue;
          }
          const score = this.keywordMatchScore(query, memory.content, memory.tags);
          if (score > 0) {
            results.push({ item: memory, score });
          }
        }
      }
    } else {
      const memories = this.memoryService.listGlobalMemories({
        memoryType: options.memoryType as GlobalMemoryType | undefined,
        limit: limit * 2,
      });

      for (const memory of memories) {
        if (!options.includeUnconfirmed && memory.trustStatus !== 'confirmed') {
          continue;
        }
        const score = this.keywordMatchScore(query, memory.content, []);
        if (score > 0) {
          results.push({ item: memory, score });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private keywordMatchScore(query: string, content: string, tags: string[]): number {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const contentLower = content.toLowerCase();
    const tagStr = tags.join(' ').toLowerCase();

    let score = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) score += 0.3;
      if (tagStr.includes(word)) score += 0.5;
    }

    return score;
  }
}

let searchServiceInstance: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService();
  }
  return searchServiceInstance;
}
