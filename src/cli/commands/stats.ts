import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import { getDatabase } from '../../db/index.js';
import { resolve } from 'path';

export async function statsCommand(
  options: {
    project?: string;
    global?: boolean;
  }
): Promise<void> {
  const memoryService = getMemoryService();
  const db = getDatabase();

  if (options.global) {
    // Global stats only
    const memories = memoryService.listGlobalMemories();

    const byType: Record<string, number> = {};
    const byTrust: Record<string, number> = {};
    for (const m of memories) {
      byType[m.memoryType] = (byType[m.memoryType] || 0) + 1;
      byTrust[m.trustStatus || 'confirmed'] = (byTrust[m.trustStatus || 'confirmed'] || 0) + 1;
    }

    console.log('Global Memory Statistics\n');
    console.log(`Total memories: ${memories.length}`);
    console.log('\nBy type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log('\nBy trust status:');
    for (const [status, count] of Object.entries(byTrust)) {
      console.log(`  ${status}: ${count}`);
    }
  } else if (options.project) {
    // Project stats
    const projectPath = resolve(options.project);
    const project = memoryService.getProjectByPath(projectPath);

    if (!project) {
      console.log(`Project not found at ${projectPath}. Run "ai-memory init" first.`);
      return;
    }

    const memories = memoryService.listProjectMemories(project.id);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byTrust: Record<string, number> = {};
    for (const m of memories) {
      byType[m.memoryType] = (byType[m.memoryType] || 0) + 1;
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      byTrust[m.trustStatus || 'confirmed'] = (byTrust[m.trustStatus || 'confirmed'] || 0) + 1;
    }

    console.log(`Project Statistics: ${project.name}\n`);
    console.log(`Total memories: ${memories.length}`);
    console.log('\nBy type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log('\nBy status:');
    for (const [status, count] of Object.entries(byStatus)) {
      const label = status === 'active' ? 'Active' : status === 'resolved' ? 'Resolved' : 'Archived';
      console.log(`  ${label}: ${count}`);
    }
    console.log('\nBy trust status:');
    for (const [status, count] of Object.entries(byTrust)) {
      console.log(`  ${status}: ${count}`);
    }
  } else {
    // Overall stats
    const globalMemories = memoryService.listGlobalMemories();
    const projects = memoryService.listProjects();

    let projectMemoryCount = 0;
    let confirmedProjectMemoryCount = 0;
    for (const project of projects) {
      const memories = memoryService.listProjectMemories(project.id);
      projectMemoryCount += memories.length;
      confirmedProjectMemoryCount += memories.filter((m) => m.trustStatus === 'confirmed').length;
    }
    const confirmedGlobalMemoryCount = globalMemories.filter((m) => m.trustStatus === 'confirmed').length;

    console.log('Overall Statistics\n');
    console.log(`Projects: ${projects.length}`);
    console.log(`Global memories: ${globalMemories.length}`);
    console.log(`Project memories: ${projectMemoryCount}`);
    console.log(`Total: ${globalMemories.length + projectMemoryCount}`);
    console.log(`Confirmed: ${confirmedGlobalMemoryCount + confirmedProjectMemoryCount}`);
    console.log(`Non-confirmed: ${(globalMemories.length + projectMemoryCount) - (confirmedGlobalMemoryCount + confirmedProjectMemoryCount)}`);
  }
}
