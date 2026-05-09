import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { initializeDatabase, getDatabase, getDatabasePath, saveCurrentDatabase, forceReloadDatabase } from '../db/index.js';
import { getMemoryService } from '../core/memory.service.js';
import { getSearchService } from '../core/search.js';
import { runMcpSelfTest } from '../core/mcp.self-test.js';
import { getConfig } from '../utils/config.js';
import { getProjectRoot } from '../utils/paths.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  BrainOverview,
  BrainProjectBrief,
  BrainSnapshot,
  BrainSnapshotCompare,
  GlobalMemory,
  GlobalMemoryType,
  MemoryConfidence,
  MemoryStatus,
  Project,
  ProjectMemory,
  ProjectMemoryType,
  ProjectStats,
  ReviewQueueAction,
  ReviewQueueItem,
  ReviewQueueStatus,
} from '../shared/types.js';

const app = express();
const PORT = Number(process.env.AI_MEMORY_PORT || 3001);
const HOST = process.env.AI_MEMORY_HOST || '127.0.0.1';
const DIST_PATH = path.join(process.cwd(), 'dist-gui');
const MCP_SERVER_PATH = resolveMcpServerPath();

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    try {
      const url = new URL(origin);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
      callback(isLocalhost ? null : new Error('CORS origin denied'), isLocalhost);
    } catch {
      callback(new Error('Invalid CORS origin'), false);
    }
  },
}));
app.use(express.json());
app.get('/favicon.ico', (_, res) => res.status(204).end());
app.use(express.static(DIST_PATH));

// Middleware to reload database on every API request
// Remove caching - always reload database on every API request to ensure fresh data
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    try {
      await forceReloadDatabase();
    } catch (error) {
      console.error('Database reload failed:', error);
    }
  }
  next();
});

// Initialize database
await initializeDatabase();

const memoryService = getMemoryService();
const searchService = getSearchService();
const config = getConfig();

// ==================== Runtime ====================
app.get('/api/runtime/status', async (_, res) => {
  try {
    const hasApiKey = Boolean(process.env[config.embedder.apiKeyEnv]);
    res.json({
      databasePath: maskLocalPath(getDatabasePath()),
      embedder: {
        model: config.embedder.model,
        dimension: config.embedder.dimension,
        hasApiKey,
        semanticSearchEnabled: hasApiKey,
      },
      mcp: {
        serverPath: MCP_SERVER_PATH,
        requiredEnv: ['MCP_TOKEN', 'MCP_PROJECT_PATH'],
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/runtime/mcp-self-test', async (req, res) => {
  try {
    const tokenId = String(req.body?.tokenId || '');
    if (!tokenId) return res.status(400).json({ error: 'tokenId is required' });
    const result = await runMcpSelfTest(tokenId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== AI Brain ====================
app.get('/api/brain/overview', async (req, res) => {
  try {
    const projectLimit = parseInt(req.query.projectLimit as string) || 6;
    const overview = await getBrainOverview(projectLimit);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/brain/snapshots', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const snapshotType = req.query.snapshotType as BrainSnapshot['snapshotType'] | undefined;
    const snapshots = listBrainSnapshots(limit, snapshotType);
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/snapshots', async (req, res) => {
  try {
    const projectLimit = parseInt(req.body?.projectLimit) || 8;
    const overview = await getBrainOverview(projectLimit);
    const snapshots = saveOverviewSnapshots(overview);
    res.json({ success: true, snapshots });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/brain/snapshots/compare', async (req, res) => {
  try {
    const fromId = req.query.fromId as string;
    const toId = req.query.toId as string;
    if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId are required' });
    const comparison = compareBrainSnapshots(fromId, toId);
    if (!comparison) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(comparison);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/snapshots/compare/review', async (req, res) => {
  try {
    const { fromId, toId } = req.body || {};
    if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId are required' });
    const items = createReviewItemsFromSnapshotCompare(String(fromId), String(toId));
    if (!items) return res.status(404).json({ error: 'Snapshot not found' });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/profile-candidates', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit) || 20;
    const items = createGlobalProfileCandidates(limit);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/brain/review-queue', async (req, res) => {
  try {
    const status = req.query.status as ReviewQueueStatus | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const items = listReviewQueueItems({ status, limit });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/review-queue', async (req, res) => {
  try {
    const item = createReviewQueueItem({
      scope: req.body?.scope,
      projectId: req.body?.projectId || null,
      content: req.body?.content,
      memoryType: req.body?.memoryType,
      proposedAction: req.body?.proposedAction,
      confidence: req.body?.confidence,
      evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs : undefined,
      supersedesId: req.body?.supersedesId || null,
      metadata: req.body?.metadata,
      source: 'manual',
    });
    if (!item) return res.status(400).json({ error: 'Invalid review item' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/review-queue/:id/approve', async (req, res) => {
  try {
    const item = await approveReviewQueueItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Review item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/brain/review-queue/:id', async (req, res) => {
  try {
    const item = updateReviewQueueItem(req.params.id, {
      content: req.body?.content,
      memoryType: req.body?.memoryType,
      confidence: req.body?.confidence,
      evidenceRefs: req.body?.evidenceRefs,
      proposedAction: req.body?.proposedAction,
      supersedesId: req.body?.supersedesId,
      metadata: req.body?.metadata,
    });
    if (!item) return res.status(404).json({ error: 'Review item not found or not editable' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/brain/review-queue/:id/reject', async (req, res) => {
  try {
    const item = rejectReviewQueueItem(req.params.id, req.body?.reason);
    if (!item) return res.status(404).json({ error: 'Review item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Projects ====================
app.get('/api/projects', async (_, res) => {
  try {
    const projects = memoryService.listProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = memoryService.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name, path, description } = req.body;
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (typeof path !== 'string' || !path.trim()) return res.status(400).json({ error: 'path is required' });
    const project = await memoryService.createProject(name, path, description);
    logOperation('project', project.id, 'create', { name, path });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const project = memoryService.getProjectById(req.params.id);
    memoryService.deleteProject(req.params.id);
    logOperation('project', req.params.id, 'delete', { name: project?.name });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const { globalMemoryPermission } = req.body;
    const project = memoryService.updateProject(req.params.id, { globalMemoryPermission });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/projects/:id/stats', async (req, res) => {
  try {
    const stats = await getProjectStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Global Memories ====================
app.get('/api/memories/global', async (req, res) => {
  try {
    const { memoryType, limit } = req.query;
    const memories = memoryService.listGlobalMemories({
      memoryType: memoryType as GlobalMemoryType | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/memories/global', async (req, res) => {
  try {
    const { content, memoryType, source, importance } = req.body;
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content is required' });
    if (!isGlobalMemoryType(memoryType)) return res.status(400).json({ error: 'invalid memoryType' });
    const memory = await memoryService.addGlobalMemory(
      content, memoryType, source || 'manual', importance || 3
    );
    logOperation('global_memory', memory.id, 'create', { memoryType });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/memories/global/:id', async (req, res) => {
  try {
    const { content, importance } = req.body;
    const memory = memoryService.updateGlobalMemory(req.params.id, { content, importance });
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    logOperation('global_memory', req.params.id, 'update', { content });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/memories/global/:id', async (req, res) => {
  try {
    memoryService.deleteGlobalMemory(req.params.id);
    logOperation('global_memory', req.params.id, 'delete', {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/memories/global/:id', async (req, res) => {
  try {
    const memory = memoryService.getGlobalMemoryById(req.params.id);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
 });

// ==================== Project Memories ====================
app.get('/api/memories/project/:projectId', async (req, res) => {
  try {
    const { memoryType, status, limit } = req.query;
    const memories = memoryService.listProjectMemories(req.params.projectId, {
      memoryType: memoryType as ProjectMemoryType | undefined,
      status: status as MemoryStatus | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/memories/project', async (req, res) => {
  try {
    const { projectId, content, memoryType, tags, importance } = req.body;
    if (typeof projectId !== 'string' || !memoryService.getProjectById(projectId)) return res.status(400).json({ error: 'valid projectId is required' });
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content is required' });
    if (!isProjectMemoryType(memoryType)) return res.status(400).json({ error: 'invalid memoryType' });
    const memory = await memoryService.addProjectMemory(
      projectId, content, memoryType, 'manual', importance || 3, tags || []
    );
    logOperation('project_memory', memory.id, 'create', { projectId, memoryType });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/memories/project/:projectId/:memoryId', async (req, res) => {
  try {
    const memory = memoryService.getProjectMemoryById(req.params.memoryId);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    if (memory.projectId !== req.params.projectId) return res.status(404).json({ error: 'Memory not found in project' });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
 });

app.put('/api/memories/project/:id', async (req, res) => {
  try {
    const { status, content, addTags, removeTags } = req.body;
    const memory = memoryService.updateProjectMemory(req.params.id, { status, content, addTags, removeTags });
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    logOperation('project_memory', req.params.id, 'update', { status, content });
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/memories/project/:id', async (req, res) => {
  try {
    memoryService.deleteProjectMemory(req.params.id);
    logOperation('project_memory', req.params.id, 'delete', {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/memories/project-all/:projectId', async (req, res) => {
  try {
    const memories = memoryService.listProjectMemories(req.params.projectId);
    for (const m of memories) {
      memoryService.deleteProjectMemory(m.id);
      logOperation('project_memory', m.id, 'delete', { reason: 'bulk-delete' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Search ====================
app.get('/api/search', async (req, res) => {
  try {
    const { q, projectPath, limit } = req.query;
    const results = await searchService.semanticSearch(q as string, {
      projectPath: projectPath as string | undefined,
      limit: limit ? parseInt(limit as string) : 10,
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Stats ====================
app.get('/api/stats/overall', async (_, res) => {
  try {
    const stats = await getOverallStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/stats/global', async (_, res) => {
  try {
    const memories = memoryService.listGlobalMemories();
    const byType: Record<string, number> = { preference: 0, habit: 0, context: 0 };
    const byTrustStatus: Record<string, number> = { proposed: 0, confirmed: 0, rejected: 0, stale: 0, superseded: 0 };
    for (const m of memories) {
      byType[m.memoryType] = (byType[m.memoryType] || 0) + 1;
      byTrustStatus[m.trustStatus || 'confirmed']++;
    }
    res.json({ total: memories.length, byType, byTrustStatus });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/stats/project/:id', async (req, res) => {
  try {
    const stats = await getProjectStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Logs ====================
app.get('/api/logs/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = getRecentLogs(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/logs/entity/:type/:id', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = getLogsByEntity(req.params.type, req.params.id, limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==================== Helpers ====================
async function getProjectStats(projectId: string) {
  const allMemories = memoryService.listProjectMemories(projectId);
  const memories = allMemories.filter((memory) => memory.trustStatus === 'confirmed');
  const byType: Record<string, number> = { problem: 0, solution: 0, error: 0, decision: 0, note: 0 };
  const byStatus: Record<string, number> = { active: 0, resolved: 0, archived: 0 };
  const byTrustStatus: Record<string, number> = { proposed: 0, confirmed: 0, rejected: 0, stale: 0, superseded: 0 };
  for (const m of allMemories) {
    byTrustStatus[m.trustStatus || 'confirmed']++;
  }
  for (const m of memories) {
    byType[m.memoryType]++;
    byStatus[m.status]++;
  }
  return { projectId, total: memories.length, byType, byStatus, byTrustStatus };
}

async function getBrainOverview(projectLimit: number): Promise<BrainOverview> {
  const generatedAt = new Date().toISOString();
  const preferences = getConfirmedGlobalMemories('preference', 20);
  const habits = getConfirmedGlobalMemories('habit', 20);
  const contexts = getConfirmedGlobalMemories('context', 20);
  const projects = memoryService.listProjects().slice(0, projectLimit);
  const projectBriefs = await Promise.all(projects.map((project) => buildProjectBrief(project)));
  const latestSnapshots = getLatestBrainSnapshots(6);
  const profileText = buildUserProfileText(preferences, habits, contexts);
  const startupContext = buildStartupContext(profileText, projectBriefs);

  return {
    generatedAt,
    userProfile: {
      preferences,
      habits,
      contexts,
      profileText,
    },
    projects: projectBriefs,
    activeProblemsTotal: projectBriefs.reduce((sum, brief) => sum + brief.activeProblems.length, 0),
    recentDecisionsTotal: projectBriefs.reduce((sum, brief) => sum + brief.recentDecisions.length, 0),
    staleSignals: buildStaleSignals(preferences, habits, contexts, projectBriefs),
    startupContext,
    latestSnapshots,
  };
}

async function buildProjectBrief(project: Project): Promise<BrainProjectBrief> {
  const stats = await getProjectStats(project.id) as ProjectStats;
  const activeProblems = [
    ...getConfirmedProjectMemories(project.id, { memoryType: 'problem', status: 'active', limit: 10 }),
    ...getConfirmedProjectMemories(project.id, { memoryType: 'error', status: 'active', limit: 10 }),
  ].sort(sortMemoryByImportanceAndTime).slice(0, 6);
  const recentDecisions = getConfirmedProjectMemories(project.id, { memoryType: 'decision', limit: 10 })
    .sort(sortMemoryByImportanceAndTime);
  const recentNotes = getConfirmedProjectMemories(project.id, { memoryType: 'note', limit: 10 })
    .sort(sortMemoryByImportanceAndTime);
  const risks = activeProblems.filter((memory) => memory.importance >= 4 || memory.memoryType === 'error').slice(0, 4);
  const handoffText = buildProjectHandoffText(project, stats, activeProblems, recentDecisions, risks);

  return {
    project,
    stats,
    activeProblems,
    recentDecisions,
    recentNotes,
    risks,
    handoffText,
  };
}

function getConfirmedGlobalMemories(memoryType: GlobalMemoryType, limit: number): GlobalMemory[] {
  return memoryService
    .listGlobalMemories({ memoryType, limit: limit * 3 })
    .filter((memory) => memory.trustStatus === 'confirmed')
    .slice(0, limit);
}

function getConfirmedProjectMemories(
  projectId: string,
  filters?: { memoryType?: ProjectMemoryType; status?: MemoryStatus; limit?: number }
): ProjectMemory[] {
  const limit = filters?.limit;
  return memoryService
    .listProjectMemories(projectId, { ...filters, limit: limit ? limit * 3 : undefined })
    .filter((memory) => memory.trustStatus === 'confirmed')
    .slice(0, limit);
}

function buildUserProfileText(preferences: GlobalMemory[], habits: GlobalMemory[], contexts: GlobalMemory[]): string {
  const parts = [
    formatMemorySection('用户偏好', preferences),
    formatMemorySection('工作习惯', habits),
    formatMemorySection('长期上下文', contexts),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('\n\n') : '暂无全局用户画像。建议先记录用户偏好、沟通习惯和长期原则。';
}

function buildProjectHandoffText(
  project: Project,
  stats: ProjectStats,
  activeProblems: ProjectMemory[],
  recentDecisions: ProjectMemory[],
  risks: ProjectMemory[]
): string {
  const lines = [
    `项目: ${project.name}`,
    `路径: ${project.path}`,
    `记忆: ${stats.total} 条，当前问题 ${activeProblems.length} 条，已解决 ${stats.byStatus.resolved} 条`,
  ];

  if (recentDecisions.length > 0) {
    lines.push('最近决策:');
    lines.push(...recentDecisions.slice(0, 3).map((memory) => `- ${trimText(memory.content, 90)}`));
  }

  if (activeProblems.length > 0) {
    lines.push('当前问题:');
    lines.push(...activeProblems.slice(0, 3).map((memory) => `- ${trimText(memory.content, 90)}`));
  }

  if (risks.length > 0) {
    lines.push('高风险信号:');
    lines.push(...risks.slice(0, 2).map((memory) => `- ${trimText(memory.content, 90)}`));
  }

  return lines.join('\n');
}

function buildStartupContext(userProfileText: string, projectBriefs: BrainProjectBrief[]): string {
  const lines = [
    '# AI 启动上下文',
    '',
    '## 用户画像',
    userProfileText,
    '',
    '## 项目开工摘要',
  ];

  if (projectBriefs.length === 0) {
    lines.push('暂无项目记忆。');
  } else {
    for (const brief of projectBriefs.slice(0, 4)) {
      lines.push('');
      lines.push(`### ${brief.project.name}`);
      lines.push(brief.handoffText);
    }
  }

  return lines.join('\n');
}

function buildStaleSignals(
  preferences: GlobalMemory[],
  habits: GlobalMemory[],
  contexts: GlobalMemory[],
  projectBriefs: BrainProjectBrief[]
): string[] {
  const signals: string[] = [];
  const globalCount = preferences.length + habits.length + contexts.length;
  if (globalCount === 0) {
    signals.push('还没有全局用户画像，AI 无法稳定学习用户偏好。');
  }
  if (projectBriefs.length === 0) {
    signals.push('还没有项目画像，建议先初始化项目并沉淀关键决策。');
  }
  const projectsWithoutDecisions = projectBriefs.filter((brief) => brief.recentDecisions.length === 0);
  if (projectsWithoutDecisions.length > 0) {
    signals.push(`${projectsWithoutDecisions.length} 个项目缺少决策记忆，后续 AI 接手时容易重复讨论。`);
  }
  const activeRiskCount = projectBriefs.reduce((sum, brief) => sum + brief.risks.length, 0);
  if (activeRiskCount > 0) {
    signals.push(`存在 ${activeRiskCount} 条高风险活跃问题，建议优先补充解决方案或标记状态。`);
  }
  return signals;
}

function getLatestBrainSnapshots(limit: number): BrainSnapshot[] {
  return listBrainSnapshots(limit);
}

function listBrainSnapshots(limit: number, snapshotType?: BrainSnapshot['snapshotType']): BrainSnapshot[] {
  const db = getDatabase();
  const snapshots: BrainSnapshot[] = [];
  let query = 'SELECT * FROM brain_snapshots WHERE 1=1';
  const params: unknown[] = [];
  if (snapshotType) {
    query += ' AND snapshot_type = ?';
    params.push(snapshotType);
  }
  query += ' ORDER BY generated_at DESC LIMIT ?';
  params.push(limit);
  const stmt = db.prepare(query);
  stmt.bind(params);
  while (stmt.step()) {
    snapshots.push(mapBrainSnapshot(stmt.getAsObject() as Record<string, unknown>));
  }
  stmt.free();
  return snapshots;
}

function getBrainSnapshotById(id: string): BrainSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM brain_snapshots WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const snapshot = mapBrainSnapshot(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    return snapshot;
  }
  stmt.free();
  return null;
}

function saveOverviewSnapshots(overview: BrainOverview): BrainSnapshot[] {
  const saved: BrainSnapshot[] = [];
  saved.push(createBrainSnapshot({
    scope: 'global',
    projectId: null,
    snapshotType: 'user_profile',
    content: overview.userProfile.profileText,
    sourceMemoryIds: [
      ...overview.userProfile.preferences.map((m) => m.id),
      ...overview.userProfile.habits.map((m) => m.id),
      ...overview.userProfile.contexts.map((m) => m.id),
    ],
  }));
  saved.push(createBrainSnapshot({
    scope: 'global',
    projectId: null,
    snapshotType: 'ai_startup_context',
    content: overview.startupContext,
    sourceMemoryIds: collectOverviewMemoryIds(overview),
  }));

  for (const brief of overview.projects) {
    saved.push(createBrainSnapshot({
      scope: 'project',
      projectId: brief.project.id,
      snapshotType: 'project_brief',
      content: brief.handoffText,
      sourceMemoryIds: [
        ...brief.activeProblems.map((m) => m.id),
        ...brief.recentDecisions.map((m) => m.id),
        ...brief.recentNotes.map((m) => m.id),
      ],
    }));
  }

  saveCurrentDatabase();
  return saved;
}

function createBrainSnapshot(input: {
  scope: 'global' | 'project';
  projectId: string | null;
  snapshotType: BrainSnapshot['snapshotType'];
  content: string;
  sourceMemoryIds: string[];
}): BrainSnapshot {
  const db = getDatabase();
  const snapshot: BrainSnapshot = {
    id: uuidv4(),
    scope: input.scope,
    projectId: input.projectId,
    snapshotType: input.snapshotType,
    content: input.content,
    sourceMemoryIds: [...new Set(input.sourceMemoryIds)],
    generatedAt: new Date().toISOString(),
  };

  db.run(
    `INSERT INTO brain_snapshots (id, scope, project_id, snapshot_type, content, source_memory_ids, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.id,
      snapshot.scope,
      snapshot.projectId || null,
      snapshot.snapshotType,
      snapshot.content,
      JSON.stringify(snapshot.sourceMemoryIds),
      snapshot.generatedAt,
    ]
  );

  return snapshot;
}

function compareBrainSnapshots(fromId: string, toId: string): BrainSnapshotCompare | null {
  const from = getBrainSnapshotById(fromId);
  const to = getBrainSnapshotById(toId);
  if (!from || !to) return null;

  const fromLines = normalizeSnapshotLines(from.content);
  const toLines = normalizeSnapshotLines(to.content);
  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);

  return {
    from,
    to,
    addedLines: toLines.filter((line) => !fromSet.has(line)),
    removedLines: fromLines.filter((line) => !toSet.has(line)),
    unchangedLineCount: toLines.filter((line) => fromSet.has(line)).length,
  };
}

function createReviewItemsFromSnapshotCompare(fromId: string, toId: string): ReviewQueueItem[] | null {
  const comparison = compareBrainSnapshots(fromId, toId);
  if (!comparison) return null;

  const items: ReviewQueueItem[] = [];
  comparison.addedLines.forEach((line, lineIndex) => {
    const existing = getReviewQueueItemBySnapshotLine(fromId, toId, lineIndex, line);
    if (existing) {
      items.push(existing);
      return;
    }

    const item = createReviewQueueItem({
      scope: comparison.to.scope,
      projectId: comparison.to.projectId || null,
      content: line,
      memoryType: comparison.to.scope === 'global' ? 'context' : 'note',
      proposedAction: 'create',
      confidence: 'low',
      evidenceRefs: [
        `snapshot:${comparison.from.id}`,
        `snapshot:${comparison.to.id}`,
        `snapshot_type:${comparison.to.snapshotType}`,
      ],
      metadata: {
        fromSnapshotType: comparison.from.snapshotType,
        toSnapshotType: comparison.to.snapshotType,
        unchangedLineCount: comparison.unchangedLineCount,
      },
      source: 'snapshot_compare',
      fromSnapshotId: fromId,
      toSnapshotId: toId,
      lineIndex,
    });
    if (item) items.push(item);
  });

  saveCurrentDatabase();
  return items;
}

function createGlobalProfileCandidates(limit: number): ReviewQueueItem[] {
  const projects = memoryService.listProjects();
  const candidates: ReviewQueueItem[] = [];
  const seen = new Set<string>();

  for (const project of projects) {
    const memories = memoryService
      .listProjectMemories(project.id, { limit: 200 })
      .filter((memory) => memory.trustStatus === 'confirmed')
      .sort(sortMemoryByImportanceAndTime);

    for (const memory of memories) {
      if (candidates.length >= limit) break;
      if (shouldIgnoreProfileCandidateSource(memory)) continue;
      const profileType = inferGlobalProfileType(memory);
      if (!profileType) continue;

      const content = normalizeProfileCandidateContent(memory.content, project.name);
      const dedupeKey = `${profileType}:${content}`;
      if (seen.has(dedupeKey)
        || hasSimilarProfileCandidate([...candidates.map((item) => item.content)], content)
        || hasSimilarGlobalProfileMemory(profileType, content)
        || hasPendingGlobalProfileCandidate(profileType, content)) {
        continue;
      }

      const item = createReviewQueueItem({
        scope: 'global',
        content,
        memoryType: profileType,
        proposedAction: 'create',
        confidence: inferProfileCandidateConfidence(memory),
        evidenceRefs: [
          `project:${project.id}`,
          `project_memory:${memory.id}`,
          `project_name:${project.name}`,
        ],
        metadata: {
          promotedFromProjectId: project.id,
          promotedFromProjectName: project.name,
          promotedFromMemoryId: memory.id,
          promotedFromMemoryType: memory.memoryType,
        },
        source: 'profile_promotion',
      });
      if (item) {
        candidates.push(item);
        seen.add(dedupeKey);
      }
    }
    if (candidates.length >= limit) break;
  }

  saveCurrentDatabase();
  return candidates;
}

function listReviewQueueItems(filters?: { status?: ReviewQueueStatus; limit?: number }): ReviewQueueItem[] {
  const db = getDatabase();
  const items: ReviewQueueItem[] = [];
  const params: unknown[] = [];
  let query = 'SELECT * FROM memory_review_queue WHERE 1=1';

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(filters?.limit || 50);

  const stmt = db.prepare(query);
  stmt.bind(params);
  while (stmt.step()) {
    items.push(mapReviewQueueItem(stmt.getAsObject() as Record<string, unknown>));
  }
  stmt.free();
  return items;
}

function createReviewQueueItem(input: {
  scope: unknown;
  projectId?: unknown;
  content: unknown;
  memoryType: unknown;
  proposedAction?: unknown;
  confidence?: unknown;
  evidenceRefs?: unknown;
  supersedesId?: unknown;
  metadata?: unknown;
  source?: 'manual' | 'snapshot_compare' | 'profile_promotion';
  fromSnapshotId?: string;
  toSnapshotId?: string;
  lineIndex?: number;
}): ReviewQueueItem | null {
  const scope = input.scope === 'global' || input.scope === 'project' ? input.scope : null;
  if (!scope || typeof input.content !== 'string' || !input.content.trim()) return null;

  const memoryType = normalizeReviewMemoryType(scope, input.memoryType);
  if (!memoryType) return null;

  const proposedAction = normalizeProposedAction(input.proposedAction);
  const confidence = normalizeMemoryConfidence(input.confidence);
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? input.evidenceRefs.filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
    : [];
  if (evidenceRefs.length === 0) return null;

  const now = new Date().toISOString();
  const item: ReviewQueueItem = {
    id: uuidv4(),
    scope,
    projectId: typeof input.projectId === 'string' ? input.projectId : null,
    content: input.content.trim(),
    memoryType,
    proposedAction,
    status: 'pending',
    confidence,
    evidenceRefs,
    supersedesId: typeof input.supersedesId === 'string' ? input.supersedesId : null,
    source: input.source || 'manual',
    fromSnapshotId: input.fromSnapshotId || null,
    toSnapshotId: input.toSnapshotId || null,
    lineIndex: input.lineIndex ?? null,
    approvedMemoryId: null,
    rejectionReason: null,
    metadata: isRecord(input.metadata) ? input.metadata : {},
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
  };

  if (item.scope === 'project' && !item.projectId) return null;

  const db = getDatabase();
  db.run(
    `INSERT INTO memory_review_queue (
      id, scope, project_id, content, memory_type, proposed_action, status, confidence,
      evidence_refs, supersedes_id, source, from_snapshot_id, to_snapshot_id, line_index,
      approved_memory_id, rejection_reason, metadata, created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.scope,
      item.projectId || null,
      item.content,
      item.memoryType,
      item.proposedAction,
      item.status,
      item.confidence,
      JSON.stringify(item.evidenceRefs),
      item.supersedesId || null,
      item.source,
      item.fromSnapshotId || null,
      item.toSnapshotId || null,
      item.lineIndex ?? null,
      item.approvedMemoryId || null,
      item.rejectionReason || null,
      JSON.stringify(item.metadata || {}),
      item.createdAt,
      item.updatedAt,
      item.reviewedAt || null,
    ]
  );
  saveCurrentDatabase();
  return item;
}

function updateReviewQueueItem(id: string, updates: {
  content?: unknown;
  memoryType?: unknown;
  proposedAction?: unknown;
  confidence?: unknown;
  evidenceRefs?: unknown;
  supersedesId?: unknown;
  metadata?: unknown;
}): ReviewQueueItem | null {
  const existing = getReviewQueueItemById(id);
  if (!existing || existing.status !== 'pending') return null;

  const content = typeof updates.content === 'string' && updates.content.trim()
    ? updates.content.trim()
    : existing.content;
  const memoryType = updates.memoryType === undefined
    ? existing.memoryType
    : normalizeReviewMemoryType(existing.scope, updates.memoryType);
  if (!memoryType) return null;

  const proposedAction = updates.proposedAction === undefined
    ? existing.proposedAction
    : normalizeProposedAction(updates.proposedAction);
  const confidence = updates.confidence === undefined
    ? existing.confidence
    : normalizeMemoryConfidence(updates.confidence);
  const evidenceRefs = Array.isArray(updates.evidenceRefs)
    ? updates.evidenceRefs.filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()))
    : existing.evidenceRefs;
  if (evidenceRefs.length === 0) return null;

  const metadata = isRecord(updates.metadata)
    ? { ...(existing.metadata || {}), ...updates.metadata }
    : existing.metadata || {};
  const now = new Date().toISOString();
  const db = getDatabase();
  db.run(
    `UPDATE memory_review_queue
     SET content = ?, memory_type = ?, proposed_action = ?, confidence = ?, evidence_refs = ?,
         supersedes_id = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
    [
      content,
      memoryType,
      proposedAction,
      confidence,
      JSON.stringify(evidenceRefs),
      typeof updates.supersedesId === 'string' ? updates.supersedesId : existing.supersedesId || null,
      JSON.stringify(metadata),
      now,
      id,
    ],
  );
  saveCurrentDatabase();
  return getReviewQueueItemById(id);
}

async function approveReviewQueueItem(id: string): Promise<ReviewQueueItem | null> {
  const existing = getReviewQueueItemById(id);
  if (!existing) return null;
  if (existing.status !== 'pending') return existing;

  const memoryId = existing.scope === 'global'
    ? (await memoryService.addGlobalMemory(
      existing.content,
      existing.memoryType as GlobalMemoryType,
      'extracted',
      3,
      { reviewQueueItemId: existing.id, ...(existing.metadata || {}) },
    )).id
    : (await memoryService.addProjectMemory(
      existing.projectId as string,
      existing.content,
      existing.memoryType as ProjectMemoryType,
      'extracted',
      3,
      ['reviewed'],
      { reviewQueueItemId: existing.id, ...(existing.metadata || {}) },
    )).id;

  updateApprovedMemoryMetadata(existing, memoryId);
  const now = new Date().toISOString();
  const db = getDatabase();
  db.run(
    `UPDATE memory_review_queue
     SET status = 'approved', approved_memory_id = ?, updated_at = ?, reviewed_at = ?
     WHERE id = ?`,
    [memoryId, now, now, id]
  );
  saveCurrentDatabase();

  logOperation(
    existing.scope === 'global' ? 'global_memory' : 'project_memory',
    memoryId,
    'create',
    { reviewQueueItemId: existing.id, source: existing.source },
  );

  return getReviewQueueItemById(id);
}

function rejectReviewQueueItem(id: string, reason?: unknown): ReviewQueueItem | null {
  const existing = getReviewQueueItemById(id);
  if (!existing) return null;
  if (existing.status !== 'pending') return existing;

  const now = new Date().toISOString();
  const db = getDatabase();
  db.run(
    `UPDATE memory_review_queue
     SET status = 'rejected', rejection_reason = ?, updated_at = ?, reviewed_at = ?
     WHERE id = ?`,
    [typeof reason === 'string' ? reason : null, now, now, id]
  );
  saveCurrentDatabase();
  return getReviewQueueItemById(id);
}

function updateApprovedMemoryMetadata(item: ReviewQueueItem, memoryId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const table = item.scope === 'global' ? 'global_memories' : 'project_memories';
  db.run(
    `UPDATE ${table}
     SET trust_status = 'confirmed', confidence = ?, evidence_refs = ?, last_verified_at = ?, supersedes_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      item.confidence,
      JSON.stringify(item.evidenceRefs),
      now,
      item.supersedesId || null,
      now,
      memoryId,
    ]
  );

  if (item.supersedesId) {
    db.run(`UPDATE ${table} SET trust_status = 'superseded', updated_at = ? WHERE id = ?`, [now, item.supersedesId]);
  }
}

function getReviewQueueItemById(id: string): ReviewQueueItem | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM memory_review_queue WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const item = mapReviewQueueItem(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    return item;
  }
  stmt.free();
  return null;
}

function getReviewQueueItemBySnapshotLine(fromSnapshotId: string, toSnapshotId: string, lineIndex: number, content: string): ReviewQueueItem | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM memory_review_queue
    WHERE from_snapshot_id = ? AND to_snapshot_id = ? AND line_index = ? AND content = ?
    LIMIT 1
  `);
  stmt.bind([fromSnapshotId, toSnapshotId, lineIndex, content]);
  if (stmt.step()) {
    const item = mapReviewQueueItem(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    return item;
  }
  stmt.free();
  return null;
}

function mapReviewQueueItem(row: Record<string, unknown>): ReviewQueueItem {
  return {
    id: row.id as string,
    scope: row.scope as 'global' | 'project',
    projectId: row.project_id as string | null,
    content: row.content as string,
    memoryType: row.memory_type as GlobalMemoryType | ProjectMemoryType,
    proposedAction: row.proposed_action as ReviewQueueAction,
    status: row.status as ReviewQueueStatus,
    confidence: row.confidence as MemoryConfidence,
    evidenceRefs: parseJsonArray(row.evidence_refs),
    supersedesId: row.supersedes_id as string | null,
    source: row.source as 'manual' | 'snapshot_compare' | 'profile_promotion',
    fromSnapshotId: row.from_snapshot_id as string | null,
    toSnapshotId: row.to_snapshot_id as string | null,
    lineIndex: row.line_index as number | null,
    approvedMemoryId: row.approved_memory_id as string | null,
    rejectionReason: row.rejection_reason as string | null,
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    reviewedAt: row.reviewed_at as string | null,
  };
}

function normalizeReviewMemoryType(scope: 'global' | 'project', memoryType: unknown): GlobalMemoryType | ProjectMemoryType | null {
  if (scope === 'global') {
    return memoryType === 'preference' || memoryType === 'habit' || memoryType === 'context' ? memoryType : null;
  }
  return memoryType === 'problem' || memoryType === 'solution' || memoryType === 'error' || memoryType === 'decision' || memoryType === 'note'
    ? memoryType
    : null;
}

function normalizeMemoryConfidence(confidence: unknown): MemoryConfidence {
  return confidence === 'low' || confidence === 'medium' || confidence === 'high' ? confidence : 'medium';
}

function normalizeProposedAction(action: unknown): ReviewQueueAction {
  return action === 'update' || action === 'supersede' ? action : 'create';
}

function inferGlobalProfileType(memory: ProjectMemory): GlobalMemoryType | null {
  const text = memory.content.toLowerCase();
  const tags = memory.tags.map((tag) => tag.toLowerCase());
  const combined = `${text} ${tags.join(' ')}`;

  if (/(用户|user).{0,24}(偏好|喜欢|希望|要求|倾向|prefer|preference)|偏好|习惯使用|不喜欢|不要/.test(combined)) {
    return 'preference';
  }
  if (/(工作习惯|习惯|每次|默认|优先|先.{0,20}再|流程|handoff|交接|读取.*utf8|utf8.*读取|mcp.*使用|使用.*mcp)/.test(combined)) {
    return 'habit';
  }
  if (/(用户|user|跨项目|所有项目|全局偏好|长期原则|长期目标|个人背景|工作背景|越用越懂用户)/.test(combined)
    && /(长期|全局|背景|上下文|原则|目标|可持续|ai 大脑|ai brain|越用越懂|跨项目|所有项目)/.test(combined)) {
    return 'context';
  }
  if (memory.memoryType === 'decision' && /(用户|全局偏好|长期原则|跨项目|所有项目|个人背景)/.test(combined)) {
    return 'context';
  }
  return null;
}

function shouldIgnoreProfileCandidateSource(memory: ProjectMemory): boolean {
  const text = memory.content.toLowerCase();
  if (memory.status !== 'active' && memory.status !== 'resolved') return true;
  if (/(测试记忆|示例数据|用于测试|验证.*功能是否正常|hello world|sample data|test memory)/.test(text)) {
    return true;
  }
  if (text.length < 10) return true;
  return false;
}

function inferProfileCandidateConfidence(memory: ProjectMemory): MemoryConfidence {
  if (memory.importance >= 4 || memory.memoryType === 'decision') return 'medium';
  return 'low';
}

function normalizeProfileCandidateContent(content: string, projectName: string): string {
  const trimmed = trimText(content.replace(/\s+/g, ' ').trim(), 220);
  return trimmed.includes(projectName) ? trimmed : `${trimmed}（来源项目：${projectName}）`;
}

function hasSimilarGlobalProfileMemory(memoryType: GlobalMemoryType, content: string): boolean {
  return memoryService
    .listGlobalMemories({ memoryType, limit: 200 })
    .some((memory) => isSimilarProfileText(memory.content, content));
}

function hasPendingGlobalProfileCandidate(memoryType: GlobalMemoryType, content: string): boolean {
  return listReviewQueueItems({ status: 'pending', limit: 200 })
    .some((item) => item.scope === 'global'
      && item.memoryType === memoryType
      && isSimilarProfileText(item.content, content));
}

function hasSimilarProfileCandidate(existingContents: string[], content: string): boolean {
  return existingContents.some((existing) => isSimilarProfileText(existing, content));
}

function isSimilarProfileText(left: string, right: string): boolean {
  const a = normalizeForSimilarity(left);
  const b = normalizeForSimilarity(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 18 && b.length > 18 && (a.includes(b) || b.includes(a))) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < 12) return false;
  return longestCommonSubstringLength(short, long) / short.length >= 0.72;
}

function normalizeForSimilarity(content: string): string {
  return content
    .toLowerCase()
    .replace(/（来源项目：[^）]+）/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。,.；;:："'`【】\[\]()（）]/g, '');
}

function longestCommonSubstringLength(left: string, right: string): number {
  let previous = new Array(right.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= left.length; i++) {
    const current = new Array(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j++) {
      if (left[i - 1] === right[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectOverviewMemoryIds(overview: BrainOverview): string[] {
  const ids = [
    ...overview.userProfile.preferences.map((m) => m.id),
    ...overview.userProfile.habits.map((m) => m.id),
    ...overview.userProfile.contexts.map((m) => m.id),
  ];
  for (const brief of overview.projects) {
    ids.push(
      ...brief.activeProblems.map((m) => m.id),
      ...brief.recentDecisions.map((m) => m.id),
      ...brief.recentNotes.map((m) => m.id),
    );
  }
  return [...new Set(ids)];
}

function normalizeSnapshotLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function mapBrainSnapshot(row: Record<string, unknown>): BrainSnapshot {
  return {
    id: row.id as string,
    scope: row.scope as 'global' | 'project',
    projectId: row.project_id as string | null,
    snapshotType: row.snapshot_type as BrainSnapshot['snapshotType'],
    content: row.content as string,
    sourceMemoryIds: row.source_memory_ids ? JSON.parse(row.source_memory_ids as string) : [],
    generatedAt: row.generated_at as string,
  };
}

function formatMemorySection(title: string, memories: GlobalMemory[]): string {
  if (memories.length === 0) return '';
  const lines = [`### ${title}`];
  lines.push(...memories.sort(sortMemoryByImportanceAndTime).slice(0, 8).map((memory) => `- ${trimText(memory.content, 120)}`));
  return lines.join('\n');
}

function sortMemoryByImportanceAndTime(a: { importance: number; createdAt: string }, b: { importance: number; createdAt: string }): number {
  if (b.importance !== a.importance) return b.importance - a.importance;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function trimText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function getOverallStats() {
  const projects = memoryService.listProjects();
  const globalMemories = memoryService.listGlobalMemories();
  const confirmedGlobalMemories = globalMemories.filter((memory) => memory.trustStatus === 'confirmed');
  let projectMemoryCount = 0;
  let confirmedProjectMemoryCount = 0;
  let problemCount = 0, solutionCount = 0, errorCount = 0, resolvedCount = 0, activeCount = 0;

  for (const project of projects) {
    const memories = memoryService.listProjectMemories(project.id);
    projectMemoryCount += memories.length;
    const confirmedMemories = memories.filter((memory) => memory.trustStatus === 'confirmed');
    confirmedProjectMemoryCount += confirmedMemories.length;
    for (const m of confirmedMemories) {
      if (m.memoryType === 'problem') problemCount++;
      if (m.memoryType === 'solution') solutionCount++;
      if (m.memoryType === 'error') errorCount++;
      if (m.status === 'resolved') resolvedCount++;
      if (m.status === 'active') activeCount++;
    }
  }

  return {
    projectCount: projects.length,
    totalMemories: confirmedGlobalMemories.length + confirmedProjectMemoryCount,
    globalMemoryCount: confirmedGlobalMemories.length,
    projectMemoryCount: confirmedProjectMemoryCount,
    confirmedMemoryCount: confirmedGlobalMemories.length + confirmedProjectMemoryCount,
    nonConfirmedMemoryCount: (globalMemories.length + projectMemoryCount) - (confirmedGlobalMemories.length + confirmedProjectMemoryCount),
    problemCount,
    solutionCount,
    errorCount,
    resolvedCount,
    activeCount,
  };
}

function logOperation(entityType: string, entityId: string, action: string, changes: Record<string, unknown>) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO operation_logs (id, entity_type, entity_id, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run([uuidv4(), entityType, entityId, action, JSON.stringify(changes), new Date().toISOString()]);
    saveCurrentDatabase();
  } catch (e) {
    console.error('Failed to log operation:', e);
  }
}

function getRecentLogs(limit: number) {
  const db = getDatabase();
  const results: unknown[] = [];
  const stmt = db.prepare('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?');
  stmt.bind([limit]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getLogsByEntity(entityType: string, entityId: string, limit: number) {
  const db = getDatabase();
  const results: unknown[] = [];
  const stmt = db.prepare(`
    SELECT * FROM operation_logs
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC LIMIT ?
  `);
  stmt.bind([entityType, entityId, limit]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ==================== API Tokens ====================
app.get('/api/tokens', async (_, res) => {
  try {
    const tokens = memoryService.listApiTokens();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/tokens', async (req, res) => {
  try {
    const { name, projectId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (projectId && !memoryService.getProjectById(projectId)) return res.status(400).json({ error: 'valid projectId is required' });
    const token = memoryService.createApiToken(name, projectId);
    if (!token) return res.status(409).json({ error: 'Token name already exists' });
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/tokens/:id/reveal', async (req, res) => {
  try {
    const token = memoryService.getApiTokenFullById(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/tokens/:id/bind', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (projectId && !memoryService.getProjectById(projectId)) return res.status(400).json({ error: 'valid projectId is required' });
    const token = memoryService.bindTokenToProject(req.params.id, projectId || null);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/tokens/:id', async (req, res) => {
  try {
    memoryService.deleteApiToken(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/tokens/validate', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    const result = memoryService.validateToken(token);
    if (result.valid) {
      memoryService.touchTokenUsed(token);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

function maskLocalPath(value: string): string {
  const normalizedHome = process.env.USERPROFILE || process.env.HOME;
  if (!normalizedHome) return value;
  return value.toLowerCase().startsWith(normalizedHome.toLowerCase())
    ? value.replace(normalizedHome, '~')
    : value;
}

function resolveMcpServerPath(): string {
  return path.join(getProjectRoot(), 'dist', 'mcp', 'index.js');
}

function isGlobalMemoryType(value: unknown): value is GlobalMemoryType {
  return value === 'preference' || value === 'habit' || value === 'context';
}

function isProjectMemoryType(value: unknown): value is ProjectMemoryType {
  return value === 'problem' || value === 'solution' || value === 'error' || value === 'decision' || value === 'note';
}

// SPA fallback - serve index.html for non-API routes
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`API Server running at http://${HOST}:${PORT}`);
  console.log(`Frontend served from http://${HOST}:${PORT}`);
});
