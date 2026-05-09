import { getMemoryService, MemoryService } from './memory.service.js';
import { getSearchService, SearchService } from './search.js';
import type { ProjectContext, ProjectMemory, GlobalMemory } from '../types/index.js';

export class ContextService {
  private memoryService: MemoryService;
  private searchService: SearchService;

  constructor() {
    this.memoryService = getMemoryService();
    this.searchService = getSearchService();
  }

  async generateProjectContext(projectPath: string, options: { includeResolved?: boolean; maxMemories?: number } = {}): Promise<ProjectContext | null> {
    const maxMemories = options.maxMemories || 10;
    const project = this.memoryService.getProjectByPath(projectPath);

    if (!project) {
      return null;
    }

    // Update last accessed
    this.memoryService.updateProjectLastAccessed(project.id);

    // Get memories
    const recentMemories = this.memoryService
      .listProjectMemories(project.id, { limit: maxMemories * 3 })
      .filter((memory) => memory.trustStatus === 'confirmed')
      .slice(0, maxMemories);
    const activeProblems = this.memoryService.listProjectMemories(project.id, {
      memoryType: 'problem',
      status: 'active',
      limit: 15,
    }).filter((memory) => memory.trustStatus === 'confirmed').slice(0, 5);
    const recentDecisions = this.memoryService.listProjectMemories(project.id, {
      memoryType: 'decision',
      limit: 9,
    }).filter((memory) => memory.trustStatus === 'confirmed').slice(0, 3);

    // Get global preferences
    const userPreferences = this.memoryService
      .listGlobalMemories({ limit: 30 })
      .filter((memory) => memory.trustStatus === 'confirmed')
      .slice(0, 10);

    // Generate summary
    const summary = this.generateSummary(project.name, recentMemories, activeProblems);

    return {
      project,
      memoryCount: recentMemories.length,
      recentMemories: options.includeResolved ? recentMemories : recentMemories.filter((m) => m.status !== 'archived'),
      activeProblems,
      recentDecisions,
      userPreferences,
      summary,
    };
  }

  async generateContextSnippet(memory: ProjectMemory | GlobalMemory): Promise<string> {
    if ('projectId' in memory) {
      // Project memory
      const typeLabel = this.getTypeLabel(memory.memoryType);
      const statusLabel = memory.status === 'resolved' ? ' (已解决)' : memory.status === 'archived' ? ' (已归档)' : '';
      return `[${typeLabel}]${statusLabel}: ${memory.content}`;
    } else {
      // Global memory
      return `[${memory.memoryType}]: ${memory.content}`;
    }
  }

  generateMemorySummary(memories: (ProjectMemory | GlobalMemory)[]): string {
    if (memories.length === 0) {
      return '暂无相关记忆。';
    }

    const snippets = memories.map((m) => this.generateContextSnippet(m));
    return snippets.join('\n');
  }

  private generateSummary(projectName: string, memories: ProjectMemory[], activeProblems: ProjectMemory[]): string {
    const parts: string[] = [];

    parts.push(`项目: ${projectName}`);

    if (memories.length > 0) {
      parts.push(`共有 ${memories.length} 条相关记忆`);
    }

    if (activeProblems.length > 0) {
      parts.push(`当前有 ${activeProblems.length} 个未解决的问题`);
      const problemSummary = activeProblems
        .slice(0, 3)
        .map((p) => `- ${p.content.substring(0, 50)}${p.content.length > 50 ? '...' : ''}`)
        .join('\n');
      parts.push(`待解决问题:\n${problemSummary}`);
    }

    const resolvedCount = memories.filter((m) => m.status === 'resolved').length;
    if (resolvedCount > 0) {
      parts.push(`已解决 ${resolvedCount} 个问题`);
    }

    return parts.join('\n');
  }

  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      problem: '问题',
      solution: '解决方案',
      error: '错误',
      decision: '决策',
      note: '笔记',
      preference: '偏好',
      habit: '习惯',
      context: '上下文',
    };
    return labels[type] || type;
  }
}

// Singleton instance
let contextServiceInstance: ContextService | null = null;

export function getContextService(): ContextService {
  if (!contextServiceInstance) {
    contextServiceInstance = new ContextService();
  }
  return contextServiceInstance;
}
