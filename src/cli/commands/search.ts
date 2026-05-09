import { Command } from 'commander';
import { getSearchService } from '../../core/search.js';
import { getContextService } from '../../core/context.js';
import { getMemoryService } from '../../core/memory.service.js';
import { resolve } from 'path';

export async function searchCommand(
  query: string,
  options: {
    project?: string;
    type?: string;
    status?: string;
    limit?: string;
  }
): Promise<void> {
  const searchService = getSearchService();
  const memoryService = getMemoryService();

  const searchOptions = {
    projectPath: options.project ? resolve(options.project) : undefined,
    memoryType: options.type as 'problem' | 'solution' | 'error' | 'decision' | 'note' | undefined,
    status: options.status as 'active' | 'resolved' | 'archived' | undefined,
    limit: parseInt(options.limit || '10'),
  };

  console.log(`Searching for: "${query}"`);
  if (searchOptions.projectPath) {
    console.log(`  Project: ${searchOptions.projectPath}`);
  }
  if (searchOptions.memoryType) {
    console.log(`  Type: ${searchOptions.memoryType}`);
  }
  console.log();

  try {
    if (searchOptions.projectPath) {
      // Search in project
      const project = memoryService.getProjectByPath(searchOptions.projectPath);
      if (!project) {
        console.log(`Project not found at ${searchOptions.projectPath}`);
        return;
      }

      const results = await searchService.searchInProject(query, project.id, searchOptions);

      if (results.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log(`Found ${results.length} result(s):\n`);
      for (const result of results) {
        const memory = result.item;
        const typeLabel = getTypeLabel(memory.memoryType);
        const statusLabel = memory.status === 'resolved' ? ' [RESOLVED]' : '';
        console.log(`[${typeLabel}${statusLabel}] (score: ${(result.score * 100).toFixed(1)}%)`);
        console.log(`  ${memory.content}`);
        if ('tags' in memory && memory.tags.length > 0) {
          console.log(`  Tags: ${memory.tags.join(', ')}`);
        }
        console.log(`  ID: ${memory.id}`);
        console.log();
      }
    } else {
      // Search global
      const results = await searchService.searchGlobal(query, searchOptions);

      if (results.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log(`Found ${results.length} global memory result(s):\n`);
      for (const result of results) {
        const memory = result.item;
        console.log(`[${memory.memoryType}] (score: ${(result.score * 100).toFixed(1)}%)`);
        console.log(`  ${memory.content}`);
        console.log(`  ID: ${memory.id}`);
        console.log();
      }
    }
  } catch (error) {
    console.error('Search failed:', error);
    process.exit(1);
  }
}

function getTypeLabel(type: string): string {
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
