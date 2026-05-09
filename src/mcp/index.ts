import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initializeDatabase, closeDatabase, forceReloadDatabase } from '../db/index.js';
import { getMemoryService } from '../core/memory.service.js';
import { getSearchService } from '../core/search.js';
import { getContextService } from '../core/context.js';
import { buildHandoffQuality } from '../core/handoff.profile.js';
import { logger } from '../utils/logger.js';

// Token and project config from environment - 必须同时提供
const MCP_TOKEN = process.env.MCP_TOKEN;
const MCP_PROJECT_PATH = process.env.MCP_PROJECT_PATH;

function getBoundProjectId(): string | null {
  if (!MCP_TOKEN) return null;
  const memoryService = getMemoryService();
  const result = memoryService.validateToken(MCP_TOKEN);
  return result.valid ? (result.projectId ?? null) : null;
}

function getBoundProjectPath(): string | null {
  const projectId = getBoundProjectId();
  if (!projectId) return null;
  const project = getMemoryService().getProjectById(projectId);
  return project?.path || null;
}

function getBoundProject() {
  const projectId = getBoundProjectId();
  if (!projectId) return null;
  return getMemoryService().getProjectById(projectId);
}

function assertRequestedProjectAllowed(requestedProjectPath?: string): { allowed: true; projectPath: string; projectId: string } | { allowed: false; error: string } {
  const project = getBoundProject();
  if (!project) {
    return { allowed: false, error: 'Token未绑定项目，无法访问项目记忆。' };
  }

  if (requestedProjectPath && !getMemoryService().isProjectPathAllowed(project.id, requestedProjectPath)) {
    return {
      allowed: false,
      error: `当前 Token 仅允许访问项目 "${project.name}" (${project.path})，拒绝访问: ${requestedProjectPath}`,
    };
  }

  return { allowed: true, projectPath: project.path, projectId: project.id };
}

async function reloadDatabase(): Promise<void> {
  try {
    await forceReloadDatabase();
  } catch (error) {
    logger.error('Failed to reload database:', error);
  }
}

function validateToken(): { valid: boolean; reason?: string; projectId?: string | null } {
  if (!MCP_TOKEN) {
    return { valid: false, reason: 'MCP_TOKEN 环境变量未设置，请检查 MCP 配置。' };
  }
  const memoryService = getMemoryService();
  const result = memoryService.validateToken(MCP_TOKEN);
  if (!result.valid) {
    return { valid: false, reason: result.reason };
  }
  memoryService.touchTokenUsed(MCP_TOKEN);
  return { valid: true, projectId: result.projectId };
}

async function initializeAndBindProject(): Promise<{ success: boolean; reason?: string; created?: boolean }> {
  if (!MCP_TOKEN) {
    return { success: false, reason: 'MCP_TOKEN 环境变量未设置，请检查 MCP 配置。' };
  }
  
  if (!MCP_PROJECT_PATH) {
    return { success: false, reason: 'MCP_PROJECT_PATH 环境变量未设置，连接时必须指定项目路径。' };
  }

  const memoryService = getMemoryService();
  
  const tokenResult = memoryService.validateToken(MCP_TOKEN);
  if (!tokenResult.valid) {
    return { success: false, reason: `Token无效: ${tokenResult.reason}` };
  }
  
  const bindResult = await memoryService.autoBindTokenToProject(MCP_TOKEN, MCP_PROJECT_PATH);
  if (bindResult.success) {
    logger.info(`Token bound to project: ${MCP_PROJECT_PATH}${bindResult.created ? ' (auto-created)' : ''}`);
  }
  return bindResult;
}

// Tool definitions
const MEMORY_USAGE_GUIDE = [
  '# AI Memory Usage Guide',
  '',
  '## Core Workflow',
  '1. At the start of a coding or debugging session, call get_ai_handoff first. It gives the bound project, confirmed user preferences, active risks, recent decisions, and verification commands.',
  '2. If the task is broad, ambiguous, or touches existing behavior, call get_project_context after get_ai_handoff to load recent confirmed project memories and global preferences.',
  '3. Before repeating an investigation, fixing an error, changing architecture, editing security-sensitive code, or answering "how was this done before", call search_memories with a concrete query.',
  '4. During work, treat returned memories as hints, not proof. Verify drift-prone facts in the current repository before acting.',
  '5. After a meaningful decision, bug fix, recurring user preference, command discovery, or project-specific lesson, call add_memory. Store concise, evidence-backed memories only.',
  '6. When a stored problem is solved or obsolete, call update_memory instead of creating a duplicate.',
  '',
  '## Which Tool To Use',
  '- get_memory_usage_guide: Read this when you are unsure how to use the memory system or before first use in a session.',
  '- get_ai_handoff: First call for most coding sessions. Best compact startup package.',
  '- get_project_context: Use after handoff when you need a fuller project snapshot.',
  '- search_memories: Use for targeted recall, prior fixes, previous decisions, known errors, and user preference lookup related to the current task.',
  '- get_user_preferences: Use when the task mainly depends on cross-project user habits or preferences.',
  '- add_memory: Use to save durable, specific learning. Use project memory by default. Use global memory only for stable user-level preferences, habits, or context.',
  '- update_memory: Use to resolve, archive, correct, or tag existing memories.',
  '- extract_and_store: Use for raw commit messages, error logs, conversation summaries, or documents that should become project memories.',
  '- list_projects: Use only to confirm the current token-bound project. It will not enumerate unrelated projects.',
  '',
  '## Scope And Permission Rules',
  '- The MCP token is bound to exactly one project path. Never request or infer memories from another project.',
  '- project_path is optional. If supplied, it must equal the bound project path. If omitted, tools use the bound project.',
  '- Global memory writes require the bound project to have global-memory permission enabled in the UI.',
  '- If global write permission is denied, save the information as project memory unless it is clearly a user-level preference that should wait for permission.',
  '',
  '## What To Save',
  '- Save project memories for architecture decisions, commands that worked, bugs and fixes, integration constraints, local setup facts, and review findings.',
  '- Save global memories only for stable user preferences, repeated working habits, long-term context, or cross-project rules.',
  '- Do not save secrets, tokens, private credentials, noisy logs, temporary guesses, or facts you have not verified.',
  '- Prefer short memories with enough context to be useful later: what happened, where it applies, and how it was verified.',
  '',
  '## Memory Types',
  '- problem: unresolved issue, risk, failing behavior, or investigation target.',
  '- solution: verified fix or repeatable remediation.',
  '- error: concrete error message, failure mode, or stack trace summary.',
  '- decision: architectural, product, workflow, or implementation decision.',
  '- note: useful project fact, command, setup detail, or handoff detail.',
  '- preference: user wants or dislikes something.',
  '- habit: repeated user workflow or default operating rule.',
  '- context: stable user or cross-project background.',
].join('\n');

const tools = [
  {
    name: 'get_memory_usage_guide',
    description: 'Read the operating rules for this memory MCP. Call this when first using the MCP, when unsure which memory tool to use, or when deciding whether to read, write, update, or search memories.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_memories',
    description: 'Targeted recall. Use before repeating an investigation, fixing a familiar error, changing architecture, answering "how was this handled before", or looking for task-specific prior decisions/preferences. Returned memories are hints and must be verified against the current repository when drift is possible.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query. Be descriptive - e.g., "how did we fix the CORS error before?"',
        },
        project_path: {
          type: 'string',
          description: 'Optional bound project path. If provided, it must match the project bound to MCP_TOKEN.',
        },
        memory_type: {
          type: 'string',
          enum: ['problem', 'solution', 'error', 'decision', 'note', 'preference', 'habit', 'context'],
          description: 'Filter by memory type',
        },
        status: {
          type: 'string',
          enum: ['active', 'resolved', 'archived'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          default: 5,
          description: 'Maximum number of results to return',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_memory',
    description: 'Store durable learning after verification. Use project memory by default for project facts, commands, bugs, fixes, and decisions. Use global memory only for stable user preferences/habits/context and only when global-memory permission is enabled. Do not store secrets, guesses, or noisy logs.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content to store. Be specific and descriptive.',
        },
        memory_type: {
          type: 'string',
          enum: ['problem', 'solution', 'error', 'decision', 'note', 'preference', 'habit', 'context'],
          description: 'Type of memory. Use "problem" for issues, "solution" for fixes, "decision" for choices made.',
        },
        is_global: {
          type: 'boolean',
          description: 'If true, this is a global memory (preference/habit/context) shared across all projects.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization, e.g., ["api", "authentication"]',
        },
        source: {
          type: 'string',
          enum: ['manual', 'conversation', 'commit', 'error_log'],
          default: 'conversation',
          description: 'Source of this memory',
        },
        importance: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'Importance level 1-5. Higher = more important to remember.',
        },
      },
      required: ['content', 'memory_type'],
    },
  },
  {
    name: 'update_memory',
    description: 'Correct lifecycle state of an existing memory. Use this when a problem is resolved, a memory is obsolete, tags need adjustment, or content should be corrected. Prefer update_memory over add_memory when the new fact supersedes an existing memory.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to update',
        },
        status: {
          type: 'string',
          enum: ['active', 'resolved', 'archived'],
          description: 'New status',
        },
        content: {
          type: 'string',
          description: 'Updated content',
        },
        add_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add',
        },
        remove_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to remove',
        },
        resolution_note: {
          type: 'string',
          description: 'Note about how the problem was resolved',
        },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'get_project_context',
    description: 'Fuller startup context for the bound project. Call after get_ai_handoff when the task is broad, ambiguous, architectural, debugging-heavy, or likely affected by recent project history.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Optional bound project path. If provided, it must match the project bound to MCP_TOKEN.',
        },
        include_resolved: {
          type: 'boolean',
          default: false,
          description: 'Include resolved problems in context',
        },
        max_memories: {
          type: 'number',
          default: 10,
          description: 'Maximum number of recent memories to include',
        },
      },
    },
  },
  {
    name: 'get_ai_handoff',
    description: 'Primary first call for most coding sessions. Loads compact confirmed context for the token-bound project: user preferences, active risks, recent decisions, notes, verification commands, and operating rules.',
    inputSchema: {
      type: 'object',
      properties: {
        max_items: {
          type: 'number',
          default: 5,
          description: 'Maximum items per section',
        },
      },
    },
  },
  {
    name: 'get_user_preferences',
    description: 'Global user profile lookup. Use when the task depends mainly on cross-project user preferences, habits, or long-term context, or when get_ai_handoff lacks enough user-level guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        preference_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['preference', 'habit', 'context'],
          },
          description: 'Types of preferences to retrieve',
        },
      },
    },
  },
  {
    name: 'list_projects',
    description: 'Confirm the current token-bound project only. Use when you need to verify which project this MCP connection is scoped to. It intentionally cannot enumerate unrelated projects.',
    inputSchema: {
      type: 'object',
      properties: {
        include_stats: {
          type: 'boolean',
          default: false,
          description: 'Include memory counts per project',
        },
      },
    },
  },
  {
    name: 'extract_and_store',
    description: 'Turn raw project evidence into memory. Use for commit messages, error logs, conversation summaries, or documents that contain durable project lessons. It stores project-scoped memories under the bound project.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Raw text to extract from (commit message, error output, etc.)',
        },
        source_type: {
          type: 'string',
          enum: ['commit', 'error_log', 'conversation', 'document'],
          description: 'Type of source text',
        },
      },
      required: ['text', 'source_type'],
    },
  },
];

// Tool handlers
async function handleSearchMemories(args: {
  query: string;
  project_path?: string;
  memory_type?: string;
  status?: string;
  limit?: number;
}) {
  const searchService = getSearchService();

  try {
    await forceReloadDatabase();
    const scope = assertRequestedProjectAllowed(args.project_path);
    if (!scope.allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: scope.error }) }],
        isError: true,
      };
    }

    const results = await searchService.semanticSearch(args.query, {
      projectPath: scope.projectPath,
      memoryType: args.memory_type as 'problem' | 'solution' | 'error' | 'decision' | 'note' | 'preference' | 'habit' | 'context' | undefined,
      status: args.status as 'active' | 'resolved' | 'archived' | undefined,
      limit: args.limit || 5,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            memories: results.map((r) => ({
              ...r.item,
              relevance_score: r.score,
            })),
            total_count: results.length,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Search failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleGetMemoryUsageGuide() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          guide: MEMORY_USAGE_GUIDE,
          recommended_first_calls: ['get_ai_handoff', 'get_project_context', 'search_memories'],
        }, null, 2),
      },
    ],
  };
}

async function handleAddMemory(args: {
  content: string;
  memory_type: string;
  is_global?: boolean;
  tags?: string[];
  source?: string;
  importance?: number;
}) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    
    if (args.is_global) {
      // Writing global memory requires token to be bound to a project with global permission
      const bindResult = memoryService.validateToken(MCP_TOKEN!);
      if (!bindResult.valid) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: bindResult.reason }) }],
          isError: true,
        };
      }

      if (!bindResult.projectId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Token未绑定项目，无法写入全局记忆。请先在管理界面绑定项目。' }) }],
          isError: true,
        };
      }

      // Check global memory permission
      if (!memoryService.hasGlobalMemoryPermission(bindResult.projectId)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: '当前项目没有全局记忆写入权限。请在项目设置中开启权限。你需要写入项目记忆。' }) }],
          isError: true,
        };
      }

      const memory = await memoryService.addGlobalMemory(
        args.content,
        args.memory_type as 'preference' | 'habit' | 'context',
        args.source as 'manual' || 'conversation',
        args.importance || 3
      );

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, memoryId: memory.id, type: 'global_memory' }) }],
      };
    } else {
      // Use the already-bound project from startup
      const projectId = getBoundProjectId();
      if (!projectId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: '项目未绑定，无法添加项目记忆。' }) }],
          isError: true,
        };
      }

      const memory = await memoryService.addProjectMemory(
        projectId,
        args.content,
        args.memory_type as 'problem' | 'solution' | 'error' | 'decision' | 'note',
        args.source as 'manual' || 'conversation',
        args.importance || 3,
        args.tags || []
      );

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, memoryId: memory.id, type: 'project_memory', projectId }) }],
      };
    }
  } catch (error) {
    logger.error('Add memory failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleUpdateMemory(args: {
  memory_id: string;
  status?: string;
  content?: string;
  add_tags?: string[];
  remove_tags?: string[];
  resolution_note?: string;
}) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    
    let memory = memoryService.getProjectMemoryById(args.memory_id);
    if (!memory) {
      memory = memoryService.getGlobalMemoryById(args.memory_id) as typeof memory;
    }

    if (!memory) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Memory not found: ${args.memory_id}` }) }],
        isError: true,
      };
    }

    if ('projectId' in memory) {
      const scope = assertRequestedProjectAllowed();
      if (!scope.allowed || memory.projectId !== scope.projectId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: scope.allowed ? '当前 Token 无权更新该项目记忆。' : scope.error }) }],
          isError: true,
        };
      }
      const updated = memoryService.updateProjectMemory(args.memory_id, {
        status: args.status as 'active' | 'resolved' | 'archived' | undefined,
        content: args.content,
        addTags: args.add_tags,
        removeTags: args.remove_tags,
        resolutionNote: args.resolution_note,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, memoryId: updated?.id, type: 'project_memory' }) }],
      };
    } else {
      // Updating global memory requires project bound + global permission
      const boundProjectId = getBoundProjectId();
      if (!boundProjectId || !memoryService.hasGlobalMemoryPermission(boundProjectId)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: '没有全局记忆写入权限。请在项目设置中开启权限。' }) }],
          isError: true,
        };
      }
      const updated = memoryService.updateGlobalMemory(args.memory_id, {
        content: args.content,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, memoryId: updated?.id, type: 'global_memory' }) }],
      };
    }
  } catch (error) {
    logger.error('Update memory failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleGetProjectContext(args: {
  project_path?: string;
  include_resolved?: boolean;
  max_memories?: number;
}) {
  const contextService = getContextService();

  try {
    await forceReloadDatabase();
    
    const scope = assertRequestedProjectAllowed(args.project_path);
    if (!scope.allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: scope.error }) }],
        isError: true,
      };
    }

    const context = await contextService.generateProjectContext(scope.projectPath, {
      includeResolved: args.include_resolved,
      maxMemories: args.max_memories,
    });

    if (!context) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Project not found: ${scope.projectPath}` }) }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, ...context }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Get project context failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleGetUserPreferences(args: {
  preference_types?: string[];
}) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    
    const types = Array.isArray(args.preference_types)
      ? args.preference_types.filter((type): type is 'preference' | 'habit' | 'context' =>
        type === 'preference' || type === 'habit' || type === 'context')
      : undefined;
    const selectedTypes = types && types.length > 0 ? types : ['preference', 'habit', 'context'] as const;
    const memories = selectedTypes
      .flatMap((memoryType) => memoryService.listGlobalMemories({ memoryType, limit: 50 }))
      .filter((memory) => memory.trustStatus === 'confirmed');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, preferences: memories }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Get user preferences failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleGetAiHandoff(args: { max_items?: number }) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    const scope = assertRequestedProjectAllowed();
    if (!scope.allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: scope.error }) }],
        isError: true,
      };
    }

    const project = memoryService.getProjectById(scope.projectId);
    if (!project) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Bound project not found' }) }],
        isError: true,
      };
    }

    const maxItems = args.max_items || 5;
    const allPreferences = memoryService.listGlobalMemories({ limit: maxItems * 4 });
    const preferences = allPreferences.filter((item) => item.trustStatus === 'confirmed').slice(0, maxItems);
    const activeProblems = [
      ...memoryService.listProjectMemories(project.id, { memoryType: 'problem', status: 'active', limit: maxItems }),
      ...memoryService.listProjectMemories(project.id, { memoryType: 'error', status: 'active', limit: maxItems }),
    ].filter((item) => item.trustStatus === 'confirmed').slice(0, maxItems);
    const decisions = memoryService
      .listProjectMemories(project.id, { memoryType: 'decision', limit: maxItems * 4 })
      .filter((item) => item.trustStatus === 'confirmed')
      .slice(0, maxItems);
    const notes = memoryService
      .listProjectMemories(project.id, { memoryType: 'note', limit: maxItems * 4 })
      .filter((item) => item.trustStatus === 'confirmed')
      .slice(0, maxItems);
    const projectPending = memoryService
      .listProjectMemories(project.id, { limit: 200 })
      .filter((item) => item.trustStatus && item.trustStatus !== 'confirmed');
    const globalPending = allPreferences.filter((item) => item.trustStatus && item.trustStatus !== 'confirmed');
    const quality = buildHandoffQuality({
      preferenceCount: preferences.length,
      activeProblemCount: activeProblems.length,
      decisionCount: decisions.length,
      noteCount: notes.length,
      hiddenNonConfirmedCount: projectPending.length + globalPending.length,
    });

    const handoff = [
      '# AI Handoff',
      '',
      '## Bound Project',
      `- Name: ${project.name}`,
      `- Path: ${project.path}`,
      '',
      '## User Preferences',
      ...formatHandoffItems(preferences.map((item) => item.content)),
      '',
      '## Active Problems And Risks',
      ...formatHandoffItems(activeProblems.map((item) => item.content)),
      '',
      '## Recent Decisions',
      ...formatHandoffItems(decisions.map((item) => item.content)),
      '',
      '## Recent Notes',
      ...formatHandoffItems(notes.map((item) => item.content)),
      '',
      '## Run Commands',
      ...formatHandoffItems(quality.runCommands),
      '',
      '## Verification Commands',
      ...formatHandoffItems(quality.verificationCommands),
      '',
      '## Handoff Quality',
      `- Score: ${quality.score}/100`,
      ...formatHandoffItems(quality.gaps),
      '',
      '## Memory Review Warnings',
      `- Non-confirmed global memories hidden from default handoff: ${globalPending.length}`,
      `- Non-confirmed project memories hidden from default handoff: ${projectPending.length}`,
      '',
      '## Operating Rules',
      '- Start with get_ai_handoff at the beginning of most coding sessions.',
      '- Use get_project_context when the task is broad, ambiguous, architectural, or debugging-heavy.',
      '- Use search_memories before repeating an investigation, changing architecture, fixing a familiar error, or relying on prior project decisions.',
      '- Treat this handoff as a starting point, not as proof. Verify drift-prone facts in the current workspace.',
      '- Do not access or modify memories from projects outside this token-bound project.',
      '- Default sections include only confirmed memories; proposed, stale, rejected, and superseded memories are intentionally hidden.',
      '- Prefer evidence-backed memories over inferred or stale notes.',
      '- Record new learning with add_memory only when it is durable, useful, specific, verified, and scoped correctly.',
      '- Use update_memory when an existing memory is resolved, corrected, archived, or superseded.',
      '',
      '## Memory Tool Guide',
      MEMORY_USAGE_GUIDE,
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            project,
            handoff,
            counts: {
              preferences: preferences.length,
              activeProblems: activeProblems.length,
              decisions: decisions.length,
              notes: notes.length,
              hiddenNonConfirmedGlobal: globalPending.length,
              hiddenNonConfirmedProject: projectPending.length,
            },
            quality,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Get AI handoff failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

function formatHandoffItems(items: string[]): string[] {
  if (items.length === 0) return ['- None recorded.'];
  return items.map((item) => `- ${item}`);
}

async function handleListProjects(args: { include_stats?: boolean }) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    
    const boundProject = getBoundProject();
    if (!boundProject) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Token未绑定项目，无法列出项目。' }) }],
        isError: true,
      };
    }
    const projects = [boundProject];

    if (args.include_stats) {
      const projectsWithStats = projects.map((p) => {
        const memories = memoryService.listProjectMemories(p.id);
        return {
          ...p,
          memory_count: memories.length,
          active_count: memories.filter((m) => m.status === 'active').length,
          resolved_count: memories.filter((m) => m.status === 'resolved').length,
        };
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, projects: projectsWithStats }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, projects }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('List projects failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

async function handleExtractAndStore(args: {
  text: string;
  source_type: string;
}) {
  const memoryService = getMemoryService();

  try {
    await forceReloadDatabase();
    
    const projectId = getBoundProjectId();
    if (!projectId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: '项目未绑定，无法提取和存储记忆。' }) }],
        isError: true,
      };
    }

    const memoryType = args.source_type === 'error_log' ? 'error' : args.source_type === 'commit' ? 'decision' : 'note';

    const memory = await memoryService.addProjectMemory(
      projectId,
      args.text,
      memoryType as 'problem' | 'solution' | 'error' | 'decision' | 'note',
      args.source_type as 'commit' | 'error_log' | 'conversation' | 'document',
      3,
      [args.source_type]
    );

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, memoryId: memory.id, type: 'project_memory', projectId }) }],
    };
  } catch (error) {
    logger.error('Extract and store failed:', error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
}

// Create and start server
const server = new Server(
  {
    name: 'ai-memory',
    version: '0.1.0',
  },
  {
    instructions: MEMORY_USAGE_GUIDE,
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  await reloadDatabase();

  // Validate token on every call
  const tokenResult = validateToken();
  if (!tokenResult.valid) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: tokenResult.reason }) }],
      isError: true,
    };
  }

  // For operations that need project context, verify project is bound
  if (name !== 'search_memories' && name !== 'get_user_preferences' && name !== 'list_projects' && name !== 'get_project_context' && name !== 'get_ai_handoff') {
    const boundId = getBoundProjectId();
    if (!boundId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: '项目未绑定，请重新连接 MCP 并提供 MCP_PROJECT_PATH。' }) }],
        isError: true,
      };
    }
  }

  switch (name) {
    case 'get_memory_usage_guide':
      return handleGetMemoryUsageGuide();
    case 'search_memories':
      return handleSearchMemories(args as Parameters<typeof handleSearchMemories>[0]);
    case 'add_memory':
      return handleAddMemory(args as Parameters<typeof handleAddMemory>[0]);
    case 'update_memory':
      return handleUpdateMemory(args as Parameters<typeof handleUpdateMemory>[0]);
    case 'get_project_context':
      return handleGetProjectContext(args as Parameters<typeof handleGetProjectContext>[0]);
    case 'get_ai_handoff':
      return handleGetAiHandoff(args as Parameters<typeof handleGetAiHandoff>[0]);
    case 'get_user_preferences':
      return handleGetUserPreferences(args as Parameters<typeof handleGetUserPreferences>[0]);
    case 'list_projects':
      return handleListProjects(args as Parameters<typeof handleListProjects>[0]);
    case 'extract_and_store':
      return handleExtractAndStore(args as Parameters<typeof handleExtractAndStore>[0]);
    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// Start the server
async function main() {
  // Initialize database first
  await initializeDatabase();

  // 必须同时提供 token 和 project_path 才能启动
  if (!MCP_TOKEN || !MCP_PROJECT_PATH) {
    const missing = [];
    if (!MCP_TOKEN) missing.push('MCP_TOKEN');
    if (!MCP_PROJECT_PATH) missing.push('MCP_PROJECT_PATH');
    logger.error(`MCP Server 启动失败: 缺少必需的环境变量 ${missing.join(', ')}`);
    logger.error('请在 MCP 配置中同时提供 MCP_TOKEN 和 MCP_PROJECT_PATH');
    process.exit(1);
  }

  // 验证 token 并绑定项目
  const bindResult = await initializeAndBindProject();
  if (!bindResult.success) {
    logger.error(`MCP Server 启动失败: ${bindResult.reason}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('AI Memory MCP Server 已启动');
}

// Cleanup on exit
process.on('exit', () => {
  closeDatabase();
});

main().catch((error) => {
  logger.error('MCP Server error:', error);
  process.exit(1);
});
