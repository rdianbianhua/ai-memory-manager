#!/usr/bin/env node

import { Command } from 'commander';
import { initializeDatabase, closeDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  // Initialize database first
  await initializeDatabase();

  // Import commands after DB is ready
  const { addCommand } = await import('./commands/add.js');
  const { searchCommand } = await import('./commands/search.js');
  const { listCommand } = await import('./commands/list.js');
  const { initCommand } = await import('./commands/init.js');
  const { resolveCommand } = await import('./commands/resolve.js');
  const { statsCommand } = await import('./commands/stats.js');
  const { deleteCommand } = await import('./commands/delete.js');

  const program = new Command();

  program
    .name('ai-memory')
    .description('Developer AI Memory System - Long-term memory for AI coding assistants')
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize a project for memory tracking')
    .argument('[project-path]', 'Project path to initialize', process.cwd())
    .option('-n, --name <name>', 'Project name')
    .option('-d, --description <description>', 'Project description')
    .action(initCommand);

  program
    .command('add')
    .description('Add a new memory')
    .argument('<content>', 'Memory content')
    .option('-t, --type <type>', 'Memory type', 'note')
    .option('-p, --project <path>', 'Project path')
    .option('-g, --global', 'Add as global memory')
    .option('--tags <tags...>', 'Tags for the memory')
    .option('-i, --importance <1-5>', 'Importance level', '3')
    .option('-s, --source <source>', 'Source of memory', 'manual')
    .action(addCommand);

  program
    .command('search')
    .description('Search memories using semantic search')
    .argument('<query>', 'Search query')
    .option('-p, --project <path>', 'Project path to search within')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <number>', 'Maximum results', '10')
    .action(searchCommand);

  program
    .command('list')
    .description('List memories')
    .option('-p, --project <path>', 'Project path')
    .option('-g, --global', 'List global memories')
    .option('-t, --type <type>', 'Filter by type')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(listCommand);

  program
    .command('resolve')
    .description('Mark a memory as resolved')
    .argument('<memory-id>', 'Memory ID')
    .option('-p, --project <path>', 'Project path')
    .option('-n, --note <note>', 'Resolution note')
    .action(resolveCommand);

  program
    .command('stats')
    .description('Show memory statistics')
    .option('-p, --project <path>', 'Project path')
    .option('-g, --global', 'Show global stats only')
    .action(statsCommand);

  program
    .command('delete')
    .description('Delete a memory')
    .argument('<memory-id>', 'Memory ID')
    .option('-p, --project <path>', 'Project path')
    .action(deleteCommand);

  program
    .command('projects')
    .description('List all projects')
    .action(async () => {
      const { getMemoryService } = await import('../core/memory.service.js');
      const memoryService = getMemoryService();
      const projects = memoryService.listProjects();

      if (projects.length === 0) {
        console.log('No projects found. Run "ai-memory init" to initialize a project.');
        return;
      }

      console.log(`Found ${projects.length} project(s):\n`);
      for (const project of projects) {
        console.log(`  ${project.name}`);
        console.log(`    Path: ${project.path}`);
        console.log(`    ID: ${project.id}`);
        console.log(`    Last accessed: ${project.lastAccessedAt.toLocaleString()}`);
        console.log();
      }
    });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Cleanup on exit
  process.on('exit', () => {
    closeDatabase();
  });

  program.parse();
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
