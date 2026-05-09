import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import { resolve } from 'path';

export async function resolveCommand(
  memoryId: string,
  options: {
    project?: string;
    note?: string;
  }
): Promise<void> {
  const memoryService = getMemoryService();

  // Try to find the memory
  let memory = memoryService.getProjectMemoryById(memoryId);

  if (!memory && options.project) {
    // Maybe it's a global memory with same ID prefix
    console.warn(`Memory not found in project. Checking if it's a global memory...`);
    memory = null;
  }

  if (!memory) {
    // Try global
    const globalMemory = memoryService.getGlobalMemoryById(memoryId);
    if (globalMemory) {
      console.error('Cannot resolve global memories. They are not tied to projects.');
      process.exit(1);
    }
  }

  if (!memory) {
    console.error(`Memory not found: ${memoryId}`);
    process.exit(1);
  }

  const updated = memoryService.updateProjectMemory(memoryId, {
    status: 'resolved',
    resolutionNote: options.note,
  });

  if (updated) {
    console.log(`Memory marked as resolved:`);
    console.log(`  ID: ${updated.id}`);
    console.log(`  Content: ${updated.content}`);
    console.log(`  Resolved at: ${new Date().toLocaleString()}`);
    if (options.note) {
      console.log(`  Note: ${options.note}`);
    }
  } else {
    console.error('Failed to update memory');
    process.exit(1);
  }
}
