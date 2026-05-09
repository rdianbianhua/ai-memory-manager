import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import { resolve } from 'path';

export async function listCommand(
  options: {
    project?: string;
    global?: boolean;
    type?: string;
    status?: string;
    limit?: string;
  }
): Promise<void> {
  const memoryService = getMemoryService();

  if (options.global) {
    // List global memories
    const memories = memoryService.listGlobalMemories({
      memoryType: options.type as 'preference' | 'habit' | 'context' | undefined,
      limit: parseInt(options.limit || '20'),
    });

    if (memories.length === 0) {
      console.log('No global memories found.');
      return;
    }

    console.log(`Global Memories (${memories.length}):\n`);
    for (const memory of memories) {
      console.log(`[${memory.memoryType}]`);
      console.log(`  ${memory.content}`);
      console.log(`  Trust: ${memory.trustStatus || 'confirmed'} / Confidence: ${memory.confidence || 'medium'}`);
      console.log(`  Importance: ${'★'.repeat(memory.importance)}${'☆'.repeat(5 - memory.importance)}`);
      console.log(`  ID: ${memory.id}`);
      console.log(`  Created: ${memory.createdAt.toLocaleString()}`);
      console.log();
    }
  } else if (options.project) {
    // List project memories
    const projectPath = resolve(options.project);
    const project = memoryService.getProjectByPath(projectPath);

    if (!project) {
      console.log(`Project not found at ${projectPath}. Run "ai-memory init" first.`);
      return;
    }

    const memories = memoryService.listProjectMemories(project.id, {
      memoryType: options.type as 'problem' | 'solution' | 'error' | 'decision' | 'note' | undefined,
      status: options.status as 'active' | 'resolved' | 'archived' | undefined,
      limit: parseInt(options.limit || '20'),
    });

    if (memories.length === 0) {
      console.log(`No memories found for project "${project.name}".`);
      return;
    }

    console.log(`Project: ${project.name}\n`);
    console.log(`Memories (${memories.length}):\n`);

    for (const memory of memories) {
      const typeLabel = getTypeLabel(memory.memoryType);
      const statusLabel = memory.status === 'resolved' ? ' ✓' : memory.status === 'archived' ? ' (archived)' : '';
      console.log(`[${typeLabel}${statusLabel}]`);
      console.log(`  ${memory.content}`);
      console.log(`  Trust: ${memory.trustStatus || 'confirmed'} / Confidence: ${memory.confidence || 'medium'}`);
      if (memory.tags.length > 0) {
        console.log(`  Tags: ${memory.tags.join(', ')}`);
      }
      console.log(`  Importance: ${'★'.repeat(memory.importance)}${'☆'.repeat(5 - memory.importance)}`);
      console.log(`  ID: ${memory.id}`);
      if (memory.resolvedAt) {
        console.log(`  Resolved: ${memory.resolvedAt.toLocaleString()}`);
      }
      console.log();
    }
  } else {
    console.log('Error: Specify either --global or --project <path>');
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
