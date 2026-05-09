import { Command } from 'commander';
import { getMemoryService } from '../../core/memory.service.js';
import type { ProjectMemory, GlobalMemory } from '../../types/index.js';

export async function deleteCommand(
  memoryId: string,
  options: Record<string, unknown>
): Promise<void> {
  const memoryService = getMemoryService();

  // Try project memory first
  const projectMemory = memoryService.getProjectMemoryById(memoryId);

  if (projectMemory) {
    memoryService.deleteProjectMemory(memoryId);
    console.log(`Deleted project memory: ${memoryId}`);
    console.log(`  Content: ${projectMemory.content}`);
    return;
  }

  // Try global memory
  const globalMemory = memoryService.getGlobalMemoryById(memoryId);

  if (globalMemory) {
    memoryService.deleteGlobalMemory(memoryId);
    console.log(`Deleted global memory: ${memoryId}`);
    console.log(`  Content: ${globalMemory.content}`);
    return;
  }

  console.error(`Memory not found: ${memoryId}`);
  process.exit(1);
}
