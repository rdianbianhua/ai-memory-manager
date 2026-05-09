import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import { resolve } from 'path';
import { existsSync } from 'fs';

export async function addCommand(
  content: string,
  options: {
    type?: string;
    project?: string;
    global?: boolean;
    tags?: string[];
    importance?: string;
    source?: string;
  }
): Promise<void> {
  const memoryService = getMemoryService();

  if (options.global) {
    // Add global memory
    const memory = await memoryService.addGlobalMemory(
      content,
      options.type as 'preference' | 'habit' | 'context',
      options.source as 'manual',
      parseInt(options.importance || '3')
    );
    console.log(`Global memory added: ${memory.id}`);
    console.log(`  Type: ${memory.memoryType}`);
    console.log(`  Content: ${memory.content}`);
  } else {
    // Add project memory
    if (!options.project) {
      console.error('Error: Project path required for project memories. Use -p or --project');
      process.exit(1);
    }

    const projectPath = resolve(options.project);

    // Check if project exists, if not initialize it
    let project = memoryService.getProjectByPath(projectPath);
    if (!project) {
      console.log(`Project not found at ${projectPath}. Initializing...`);
      project = await memoryService.createProject(
        projectPath.split(/[/\\]/).pop() || 'unknown',
        projectPath
      );
    }

    const memory = await memoryService.addProjectMemory(
      project.id,
      content,
      options.type as 'problem' | 'solution' | 'error' | 'decision' | 'note',
      options.source as 'manual',
      parseInt(options.importance || '3'),
      options.tags || []
    );

    console.log(`Memory added: ${memory.id}`);
    console.log(`  Project: ${project.name}`);
    console.log(`  Type: ${memory.memoryType}`);
    console.log(`  Status: ${memory.status}`);
    console.log(`  Content: ${memory.content}`);
    if (memory.tags.length > 0) {
      console.log(`  Tags: ${memory.tags.join(', ')}`);
    }
  }
}
