import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import { resolve } from 'path';
import { existsSync } from 'fs';

export async function initCommand(
  projectPath: string,
  options: {
    name?: string;
    description?: string;
  }
): Promise<void> {
  const memoryService = getMemoryService();
  const resolvedPath = resolve(projectPath);

  // Check if directory exists
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Directory does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  // Check if already initialized
  const existing = memoryService.getProjectByPath(resolvedPath);
  if (existing) {
    console.log(`Project already initialized: ${existing.name}`);
    console.log(`  Path: ${existing.path}`);
    console.log(`  ID: ${existing.id}`);
    console.log(`  Last accessed: ${existing.lastAccessedAt.toLocaleString()}`);
    return;
  }

  const projectName = options.name || resolvedPath.split(/[/\\]/).pop() || 'unknown';

  const project = await memoryService.createProject(
    projectName,
    resolvedPath,
    options.description
  );

  console.log(`Project initialized successfully!`);
  console.log(`  Name: ${project.name}`);
  console.log(`  Path: ${project.path}`);
  console.log(`  ID: ${project.id}`);
  console.log();
  console.log(`You can now add memories with:`);
  console.log(`  ai-memory add "问题描述" --type problem --project "${resolvedPath}"`);
  console.log(`  ai-memory add "解决方案" --type solution --project "${resolvedPath}"`);
}
