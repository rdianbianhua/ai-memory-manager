import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveCurrentDatabase } from '../db/index.js';
import { getEmbedder, EmbedderService } from './embedder.js';
import { logger } from '../utils/logger.js';
import type {
  Project,
  GlobalMemory,
  ProjectMemory,
  ApiToken,
  GlobalMemoryType,
  ProjectMemoryType,
  MemoryStatus,
  MemoryTrustStatus,
  MemoryConfidence,
  MemorySource,
} from '../types/index.js';

export class MemoryService {
  private embedder: EmbedderService;

  constructor() {
    this.embedder = getEmbedder();
  }

  private get db() {
    return getDatabase();
  }

  // ============ Project Operations ============

  async createProject(name: string, path: string, description?: string): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO projects (id, name, path, description, created_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, path, description || null, now, now]
    );
    saveCurrentDatabase();

    return { id, name, path, description, createdAt: now, lastAccessedAt: now };
  }

  getProjectByPath(path: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
    stmt.bind([path]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.mapProject(row as Record<string, unknown>);
    }
    stmt.free();
    return null;
  }

  getProjectById(id: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.mapProject(row as Record<string, unknown>);
    }
    stmt.free();
    return null;
  }

  getProjectByName(name: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE name = ?');
    stmt.bind([name]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.mapProject(row as Record<string, unknown>);
    }
    stmt.free();
    return null;
  }

  listProjects(): Project[] {
    const results: Project[] = [];
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY last_accessed_at DESC');
    while (stmt.step()) {
      results.push(this.mapProject(stmt.getAsObject() as Record<string, unknown>));
    }
    stmt.free();
    return results;
  }

  updateProjectLastAccessed(projectId: string): void {
    this.db.run('UPDATE projects SET last_accessed_at = ? WHERE id = ?', [new Date().toISOString(), projectId]);
    saveCurrentDatabase();
  }

  updateProject(projectId: string, updates: { globalMemoryPermission?: boolean }): Project | null {
    if (updates.globalMemoryPermission !== undefined) {
      this.db.run('UPDATE projects SET global_memory_permission = ? WHERE id = ?', [updates.globalMemoryPermission ? 1 : 0, projectId]);
    }
    saveCurrentDatabase();
    return this.getProjectById(projectId);
  }

  deleteProject(projectId: string): void {
    const memories = this.listProjectMemories(projectId, { limit: 100000 });
    for (const memory of memories) {
      this.db.run('DELETE FROM embeddings WHERE memory_id = ? AND memory_scope = ?', [memory.id, 'project']);
    }
    this.db.run('UPDATE api_tokens SET project_id = NULL WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM memory_review_queue WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM brain_snapshots WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM project_memories WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM projects WHERE id = ?', [projectId]);
    saveCurrentDatabase();
  }

  // ============ Global Memory Operations ============

  async addGlobalMemory(
    content: string,
    memoryType: GlobalMemoryType,
    source: MemorySource = 'manual',
    importance: number = 3,
    metadata?: Record<string, unknown>
  ): Promise<GlobalMemory> {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO global_memories (id, content, memory_type, source, metadata, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, content, memoryType, source, JSON.stringify(metadata || {}), importance, now, now]
    );

    // Generate and store embedding
    await this.storeGlobalEmbedding(id, content);
    saveCurrentDatabase();

    return {
      id,
      content,
      memoryType,
      trustStatus: 'confirmed',
      confidence: 'medium',
      evidenceRefs: [],
      lastVerifiedAt: now,
      supersedesId: null,
      source,
      metadata,
      importance,
      createdAt: now,
      updatedAt: now,
    };
  }

  getGlobalMemoryById(id: string): GlobalMemory | null {
    const stmt = this.db.prepare('SELECT * FROM global_memories WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.mapGlobalMemory(row as Record<string, unknown>);
    }
    stmt.free();
    return null;
  }

  listGlobalMemories(filters?: { memoryType?: GlobalMemoryType; limit?: number }): GlobalMemory[] {
    let query = 'SELECT * FROM global_memories WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.memoryType) {
      query += ' AND memory_type = ?';
      params.push(filters.memoryType);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const results: GlobalMemory[] = [];
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(this.mapGlobalMemory(stmt.getAsObject() as Record<string, unknown>));
    }
    stmt.free();
    return results;
  }

  updateGlobalMemory(id: string, updates: { content?: string; importance?: number; metadata?: Record<string, unknown> }): GlobalMemory | null {
    const existing = this.getGlobalMemoryById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const content = updates.content ?? existing.content;
    const importance = updates.importance ?? existing.importance;
    const metadata = updates.metadata ?? existing.metadata;

    this.db.run(
      `UPDATE global_memories SET content = ?, importance = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [content, importance, JSON.stringify(metadata), now, id]
    );
    saveCurrentDatabase();

    return this.getGlobalMemoryById(id);
  }

  deleteGlobalMemory(id: string): void {
    this.db.run('DELETE FROM embeddings WHERE memory_id = ? AND memory_scope = ?', [id, 'global']);
    this.db.run('DELETE FROM global_memories WHERE id = ?', [id]);
    saveCurrentDatabase();
  }

  // ============ Project Memory Operations ============

  async addProjectMemory(
    projectId: string,
    content: string,
    memoryType: ProjectMemoryType,
    source: MemorySource = 'manual',
    importance: number = 3,
    tags: string[] = [],
    metadata?: Record<string, unknown>,
    language?: string,
    commitHash?: string
  ): Promise<ProjectMemory> {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO project_memories (id, project_id, content, memory_type, status, source, tags, metadata, importance, commit_hash, language, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, projectId, content, memoryType, source, JSON.stringify(tags), JSON.stringify(metadata || {}), importance, commitHash || null, language || null, now, now]
    );

    // Generate and store embedding
    await this.storeProjectEmbedding(id, content);
    saveCurrentDatabase();

    return {
      id,
      projectId,
      content,
      memoryType,
      status: 'active',
      trustStatus: 'confirmed',
      confidence: 'medium',
      evidenceRefs: [],
      lastVerifiedAt: now,
      supersedesId: null,
      source,
      tags,
      metadata,
      importance,
      commitHash,
      language,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  getProjectMemoryById(id: string): ProjectMemory | null {
    const stmt = this.db.prepare('SELECT * FROM project_memories WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.mapProjectMemory(row as Record<string, unknown>);
    }
    stmt.free();
    return null;
  }

  listProjectMemories(
    projectId: string,
    filters?: { memoryType?: ProjectMemoryType; status?: MemoryStatus; limit?: number }
  ): ProjectMemory[] {
    let query = 'SELECT * FROM project_memories WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (filters?.memoryType) {
      query += ' AND memory_type = ?';
      params.push(filters.memoryType);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const results: ProjectMemory[] = [];
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(this.mapProjectMemory(stmt.getAsObject() as Record<string, unknown>));
    }
    stmt.free();
    return results;
  }

  updateProjectMemory(
    id: string,
    updates: {
      status?: MemoryStatus;
      content?: string;
      addTags?: string[];
      removeTags?: string[];
      resolutionNote?: string;
    }
  ): ProjectMemory | null {
    const existing = this.getProjectMemoryById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    let tags = [...existing.tags];

    if (updates.addTags) {
      tags = [...new Set([...tags, ...updates.addTags])];
    }
    if (updates.removeTags) {
      tags = tags.filter((t) => !updates.removeTags!.includes(t));
    }

    const resolvedAt = updates.status === 'resolved' && existing.status !== 'resolved' ? now : existing.resolvedAt;
    const resolvedBy = updates.status === 'resolved' ? 'user' : existing.resolvedBy;

    this.db.run(
      `UPDATE project_memories SET content = ?, status = ?, tags = ?, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?`,
      [updates.content ?? existing.content, updates.status ?? existing.status, JSON.stringify(tags), resolvedAt || null, resolvedBy || null, now, id]
    );
    saveCurrentDatabase();

    return this.getProjectMemoryById(id);
  }

  incrementViewCount(id: string): void {
    this.db.run('UPDATE project_memories SET view_count = view_count + 1, last_accessed_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    saveCurrentDatabase();
  }

  deleteProjectMemory(id: string): void {
    this.db.run('DELETE FROM embeddings WHERE memory_id = ? AND memory_scope = ?', [id, 'project']);
    this.db.run('DELETE FROM project_memories WHERE id = ?', [id]);
    saveCurrentDatabase();
  }

  // ============ Embedding Storage ============

  private async storeGlobalEmbedding(memoryId: string, content: string): Promise<void> {
    const embedding = await this.embedder.embed(content);
    await this.storeEmbedding(memoryId, 'global', content, embedding);
  }

  private async storeProjectEmbedding(memoryId: string, content: string): Promise<void> {
    const embedding = await this.embedder.embed(content);
    await this.storeEmbedding(memoryId, 'project', content, embedding);
  }

  private async storeEmbedding(memoryId: string, scope: 'global' | 'project', content: string, embedding: { vector: number[]; model: string; dimension: number }): Promise<void> {
    const id = uuidv4();
    const contentHash = await this.hashContent(content);
    const vectorBuffer = Buffer.from(new Float32Array(embedding.vector).buffer);

    // Delete existing embedding if any
    this.db.run('DELETE FROM embeddings WHERE memory_id = ? AND memory_scope = ?', [memoryId, scope]);

    this.db.run(
      `INSERT INTO embeddings (id, memory_id, memory_scope, content_hash, embedding, model, dimension, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, memoryId, scope, contentHash, vectorBuffer, embedding.model, embedding.dimension, new Date().toISOString()]
    );
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ============ API Token Operations ============

  /**
   * Generate a random token: SK + 24 alphanumeric chars
   */
  generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'SK';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create a new API token. If a token with the same name exists, returns null.
   */
  createApiToken(name: string, projectId?: string): ApiToken | null {
    // Check if token name already exists
    const existing = this.db.prepare('SELECT id FROM api_tokens WHERE name = ?');
    existing.bind([name]);
    if (existing.step()) {
      existing.free();
      return null;
    }
    existing.free();

    const id = uuidv4();
    const token = this.generateToken();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO api_tokens (id, token, name, project_id, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, token, name, projectId || null, null, now]
    );
    saveCurrentDatabase();

    return {
      id,
      token,
      name,
      projectId: projectId || null,
      lastUsedAt: null,
      createdAt: now,
    };
  }

  /**
   * List all API tokens (excluding the raw token, only last 8 chars for display)
   */
  listApiTokens(): Omit<ApiToken, 'token'>[] {
    const results: Omit<ApiToken, 'token'>[] = [];
    const stmt = this.db.prepare(`
      SELECT t.id, t.name, t.project_id, t.last_used_at, t.created_at, p.name as project_name
      FROM api_tokens t
      LEFT JOIN projects p ON t.project_id = p.id
      ORDER BY t.created_at DESC
    `);
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push({
        id: row.id as string,
        name: row.name as string,
        projectId: row.project_id as string | null,
        projectName: row.project_name as string | undefined,
        lastUsedAt: row.last_used_at as string | null,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /**
   * Get full token record by token string (for validation)
   */
  getApiTokenByToken(token: string): ApiToken | null {
    const stmt = this.db.prepare(`
      SELECT t.id, t.token, t.name, t.project_id, t.last_used_at, t.created_at, p.name as project_name
      FROM api_tokens t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.token = ?
    `);
    stmt.bind([token]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        id: row.id as string,
        token: row.token as string,
        name: row.name as string,
        projectId: row.project_id as string | null,
        projectName: row.project_name as string | undefined,
        lastUsedAt: row.last_used_at as string | null,
        createdAt: row.created_at as string,
      };
    }
    stmt.free();
    return null;
  }

  /**
   * Get token by ID (with raw token - only for authorized access)
   */
  getApiTokenFullById(id: string): ApiToken | null {
    const stmt = this.db.prepare(`
      SELECT t.id, t.token, t.name, t.project_id, t.last_used_at, t.created_at, p.name as project_name
      FROM api_tokens t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        id: row.id as string,
        token: row.token as string,
        name: row.name as string,
        projectId: row.project_id as string | null,
        projectName: row.project_name as string | undefined,
        lastUsedAt: row.last_used_at as string | null,
        createdAt: row.created_at as string,
      };
    }
    stmt.free();
    return null;
  }

  /**
   * Get token by ID (without raw token)
   */
  getApiTokenById(id: string): Omit<ApiToken, 'token'> | null {
    const stmt = this.db.prepare(`
      SELECT t.id, t.name, t.project_id, t.last_used_at, t.created_at, p.name as project_name
      FROM api_tokens t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        id: row.id as string,
        name: row.name as string,
        projectId: row.project_id as string | null,
        projectName: row.project_name as string | undefined,
        lastUsedAt: row.last_used_at as string | null,
        createdAt: row.created_at as string,
      };
    }
    stmt.free();
    return null;
  }

  /**
   * Bind or unbind a project from a token
   */
  bindTokenToProject(tokenId: string, projectId: string | null): Omit<ApiToken, 'token'> | null {
    this.db.run('UPDATE api_tokens SET project_id = ? WHERE id = ?', [projectId, tokenId]);
    saveCurrentDatabase();
    return this.getApiTokenById(tokenId);
  }

  /**
   * Delete an API token
   */
  deleteApiToken(id: string): boolean {
    this.db.run('DELETE FROM api_tokens WHERE id = ?', [id]);
    saveCurrentDatabase();
    return true;
  }

  /**
   * Touch last_used_at when token is used
   */
  touchTokenUsed(token: string): void {
    this.db.run('UPDATE api_tokens SET last_used_at = ? WHERE token = ?', [new Date().toISOString(), token]);
    saveCurrentDatabase();
  }

  /**
   * Check if a token is valid (exists and project is not deleted)
   */
  validateToken(token: string): { valid: boolean; reason?: string; projectId?: string | null } {
    const apiToken = this.getApiTokenByToken(token);
    if (!apiToken) {
      return { valid: false, reason: 'Token不存在' };
    }
    if (apiToken.projectId) {
      const project = this.getProjectById(apiToken.projectId);
      if (!project) {
        return { valid: false, reason: 'Token绑定的项目已删除，请重新绑定' };
      }
    }
    return { valid: true, projectId: apiToken.projectId };
  }

  /**
   * Auto-bind token to project if unbound (called on first MCP access with project_path)
   * If project doesn't exist, it will be automatically created
   * Returns the project ID if binding succeeded or token already bound
   */
  async autoBindTokenToProject(token: string, projectPath: string): Promise<{ success: boolean; projectId?: string; reason?: string; created?: boolean }> {
    const apiToken = this.getApiTokenByToken(token);
    if (!apiToken) {
      return { success: false, reason: 'Token不存在' };
    }

    // Already bound - verify project exists
    if (apiToken.projectId) {
      const project = this.getProjectById(apiToken.projectId);
      if (!project) {
        return { success: false, reason: 'Token绑定的项目已删除' };
      }
      if (this.normalizePath(project.path) !== this.normalizePath(projectPath)) {
        return {
          success: false,
          reason: `Token已绑定到项目 "${project.name}"，不能用于当前路径: ${projectPath}`,
        };
      }
      return { success: true, projectId: project.id };
    }

    // Bind by path only. Project names are display labels and may collide across folders.
    const projectName = projectPath.split(/[/\\]/).pop() || projectPath;
    let project = this.getProjectByPath(projectPath);
    if (!project) {
      project = await this.createProject(projectName, projectPath);
      logger.info(`Auto-created project: ${projectName} at ${projectPath}`);
    } else {
      logger.info(`Found project by path: ${project.name}`);
    }

    // Bind token to project
    this.db.run('UPDATE api_tokens SET project_id = ? WHERE token = ?', [project.id, token]);
    saveCurrentDatabase();
    return { success: true, projectId: project.id, created: true };
  }

  isProjectPathAllowed(projectId: string, projectPath: string): boolean {
    const project = this.getProjectById(projectId);
    return Boolean(project && this.normalizePath(project.path) === this.normalizePath(projectPath));
  }

  private normalizePath(path: string): string {
    return path.replace(/[\\/]+$/, '').toLowerCase();
  }

  /**
   * Check if a project has global memory write permission
   */
  hasGlobalMemoryPermission(projectId: string): boolean {
    const project = this.getProjectById(projectId);
    return project?.globalMemoryPermission ?? false;
  }

  /**
   * Set global memory permission for a project
   */
  setGlobalMemoryPermission(projectId: string, enabled: boolean): boolean {
    this.db.run('UPDATE projects SET global_memory_permission = ? WHERE id = ?', [enabled ? 1 : 0, projectId]);
    saveCurrentDatabase();
    return true;
  }

  // ============ Mapping Functions ============

  private mapProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      path: row.path as string,
      description: row.description as string | undefined,
      repoUrl: row.repo_url as string | undefined,
      globalMemoryPermission: !!row.global_memory_permission,
      createdAt: row.created_at as string,
      lastAccessedAt: row.last_accessed_at as string,
    };
  }

  private mapGlobalMemory(row: Record<string, unknown>): GlobalMemory {
    return {
      id: row.id as string,
      content: row.content as string,
      memoryType: row.memory_type as GlobalMemoryType,
      trustStatus: (row.trust_status as MemoryTrustStatus | undefined) || 'confirmed',
      confidence: (row.confidence as MemoryConfidence | undefined) || 'medium',
      evidenceRefs: this.parseJsonArray(row.evidence_refs),
      lastVerifiedAt: row.last_verified_at as string | null,
      supersedesId: row.supersedes_id as string | null,
      source: row.source as MemorySource,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      importance: row.importance as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapProjectMemory(row: Record<string, unknown>): ProjectMemory {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      content: row.content as string,
      memoryType: row.memory_type as ProjectMemoryType,
      status: row.status as MemoryStatus,
      trustStatus: (row.trust_status as MemoryTrustStatus | undefined) || 'confirmed',
      confidence: (row.confidence as MemoryConfidence | undefined) || 'medium',
      evidenceRefs: this.parseJsonArray(row.evidence_refs),
      lastVerifiedAt: row.last_verified_at as string | null,
      supersedesId: row.supersedes_id as string | null,
      source: row.source as MemorySource,
      tags: row.tags ? JSON.parse(row.tags as string) : [],
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      importance: row.importance as number,
      commitHash: row.commit_hash as string | undefined,
      language: row.language as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      resolvedBy: row.resolved_by as string | undefined,
      viewCount: row.view_count as number,
      lastAccessedAt: row.last_accessed_at ? row.last_accessed_at as string : undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private parseJsonArray(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}

// Singleton instance
let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}
