import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { forceReloadDatabase } from '../db/index.js';
import { getMemoryService } from './memory.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface McpSelfTestResult {
  success: boolean;
  token: {
    id: string;
    name: string;
    projectId: string | null;
    projectName?: string;
    tokenPreview: string;
  };
  tools: string[];
  project?: {
    name: string;
    path: string;
  };
  counts?: Record<string, number>;
  quality?: {
    score: number;
    gaps: string[];
    runCommands: string[];
    verificationCommands: string[];
  };
  permissionMatrix: Array<{
    name: string;
    success: boolean;
    expected: boolean;
    detail: string;
  }>;
  handoffText?: string;
  handoffPreview: string[];
  issues: string[];
  diagnostics: {
    command: string;
    args: string[];
    cwd: string;
    projectPath: string;
    stderr: string[];
  };
  error?: string;
}

export async function runMcpSelfTest(tokenId: string): Promise<McpSelfTestResult> {
  const memoryService = getMemoryService();
  const token = memoryService.getApiTokenFullById(tokenId);
  if (!token) {
    throw new Error('Token not found');
  }
  if (!token.projectId) {
    throw new Error('Token must be bound to a project before self-test');
  }

  const project = memoryService.getProjectById(token.projectId);
  if (!project) {
    throw new Error('Bound project not found');
  }

  const result: McpSelfTestResult = {
    success: false,
    token: {
      id: token.id,
      name: token.name,
      projectId: token.projectId,
      projectName: token.projectName,
      tokenPreview: `${token.token.slice(0, 4)}***${token.token.slice(-4)}`,
    },
    tools: [],
    permissionMatrix: [],
    handoffPreview: [],
    issues: [],
    diagnostics: {
      command: '',
      args: [],
      cwd: resolve(__dirname, '../..'),
      projectPath: project.path,
      stderr: [],
    },
  };

  const launch = resolveMcpLaunch();
  result.diagnostics.command = launch.command;
  result.diagnostics.args = launch.args;
  result.diagnostics.cwd = launch.cwd;

  const client = new Client({ name: 'ai-memory-self-test', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
    stderr: 'pipe',
    env: {
      ...process.env,
      MCP_TOKEN: token.token,
      MCP_PROJECT_PATH: project.path,
    } as Record<string, string>,
  });

  try {
    if (transport.stderr) {
      transport.stderr.on('data', (chunk: Buffer | string) => {
        const text = String(chunk).trim();
        if (text) result.diagnostics.stderr.push(...text.split(/\r?\n/).slice(-8));
        result.diagnostics.stderr = result.diagnostics.stderr.slice(-12);
      });
    }

    await withTimeout(client.connect(transport), 10000, 'MCP connect timed out');
    const tools = await withTimeout(client.listTools(), 8000, 'MCP listTools timed out');
    result.tools = tools.tools.map((tool) => tool.name);

    const projectResponse = await withTimeout(client.callTool({
      name: 'list_projects',
      arguments: { include_stats: true },
    }), 8000, 'MCP list_projects timed out');
    const projectPayload = parseToolJson(firstTextContent(projectResponse));
    if (!projectPayload.success) {
      result.issues.push('list_projects did not return success');
    }

    result.permissionMatrix = await runPermissionMatrix(client, token.id, token.token, project);
    for (const check of result.permissionMatrix) {
      if (check.success !== check.expected) {
        result.issues.push(`Permission matrix failed: ${check.name} - ${check.detail}`);
      }
    }

    const handoffPayload = await loadHandoffPayload(client);
    if (!handoffPayload.success) {
      result.issues.push('get_ai_handoff did not return success');
    }

    result.project = isRecord(handoffPayload.project)
      ? {
          name: String(handoffPayload.project.name || project.name),
          path: String(handoffPayload.project.path || project.path),
        }
      : { name: project.name, path: project.path };
    result.counts = isRecord(handoffPayload.counts)
      ? Object.fromEntries(
          Object.entries(handoffPayload.counts)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        )
      : undefined;
    result.quality = parseQuality(handoffPayload.quality);
    if (typeof handoffPayload.handoff === 'string') {
      result.handoffText = handoffPayload.handoff;
      result.handoffPreview = handoffPayload.handoff.split(/\r?\n/).slice(0, 18);
    }

    for (const requiredTool of ['list_projects', 'get_ai_handoff', 'search_memories', 'add_memory']) {
      if (!result.tools.includes(requiredTool)) {
        result.issues.push(`Missing tool: ${requiredTool}`);
      }
    }
    if (!result.handoffPreview.some((line) => line.includes('## Bound Project'))) {
      result.issues.push('Handoff preview does not include bound project section');
    }
    if (!result.quality) {
      result.issues.push('Handoff quality metadata is missing');
    } else {
      if (result.quality.verificationCommands.length === 0) {
        result.issues.push('Handoff does not expose verification commands');
      }
      if (result.quality.runCommands.length === 0) {
        result.issues.push('Handoff does not expose run commands');
      }
    }

    result.success = result.issues.length === 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.issues.push(...buildDiagnosticIssues(result));
  } finally {
    await client.close().catch(() => undefined);
  }

  return result;
}

async function loadHandoffPayload(client: Client): Promise<Record<string, unknown>> {
  const handoffResponse = await withTimeout(client.callTool({
    name: 'get_ai_handoff',
    arguments: { max_items: 5 },
  }), 8000, 'MCP get_ai_handoff timed out');
  return parseToolJson(firstTextContent(handoffResponse));
}

async function runPermissionMatrix(
  client: Client,
  tokenId: string,
  rawToken: string,
  project: { id: string; name: string; path: string; globalMemoryPermission?: boolean },
): Promise<McpSelfTestResult['permissionMatrix']> {
  const memoryService = getMemoryService();
  const checks: McpSelfTestResult['permissionMatrix'] = [];
  const marker = `MCP_SELF_TEST_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const originalPermission = Boolean(project.globalMemoryPermission);
  const createdProjectMemoryIds: string[] = [];
  const createdGlobalMemoryIds: string[] = [];

  try {
    cleanupSelfTestMemories(memoryService);
    const projectWrite = await callToolJson(client, 'add_memory', {
      content: `${marker} project scoped write check`,
      memory_type: 'note',
      tags: ['mcp-self-test'],
      source: 'conversation',
      importance: 1,
    });
    const projectMemoryId = typeof projectWrite.memoryId === 'string' ? projectWrite.memoryId : '';
    if (projectMemoryId) createdProjectMemoryIds.push(projectMemoryId);
    checks.push({
      name: 'project_write',
      success: projectWrite.success === true && Boolean(projectMemoryId),
      expected: true,
      detail: projectWrite.error ? String(projectWrite.error) : projectMemoryId || 'no memoryId returned',
    });

    const projectRead = await callToolJson(client, 'search_memories', {
      query: marker,
      limit: 5,
    });
    checks.push({
      name: 'project_read_after_write',
      success: projectRead.success === true && containsMemoryMarker(projectRead.memories, marker),
      expected: true,
      detail: projectRead.error ? String(projectRead.error) : `${countArray(projectRead.memories)} result(s)`,
    });

    const otherProject = memoryService
      .listProjects()
      .find((candidate) => candidate.id !== project.id && candidate.path);
    if (otherProject) {
      const crossProjectRead = await callToolJson(client, 'search_memories', {
        query: marker,
        project_path: otherProject.path,
        limit: 5,
      });
      checks.push({
        name: 'cross_project_read_denied',
        success: crossProjectRead.success === true,
        expected: false,
        detail: crossProjectRead.error ? String(crossProjectRead.error) : 'cross project request unexpectedly succeeded',
      });
    }

    memoryService.updateProject(project.id, { globalMemoryPermission: false });
    await forceReloadDatabase();
    const deniedGlobalWrite = await callToolJson(client, 'add_memory', {
      content: `${marker} global write should be denied`,
      memory_type: 'preference',
      is_global: true,
      source: 'conversation',
      importance: 1,
    });
    checks.push({
      name: 'global_write_denied_when_permission_off',
      success: deniedGlobalWrite.success === true,
      expected: false,
      detail: deniedGlobalWrite.error ? String(deniedGlobalWrite.error) : 'global write unexpectedly succeeded',
    });

    memoryService.updateProject(project.id, { globalMemoryPermission: true });
    await forceReloadDatabase();
    const allowedGlobalWrite = await callToolJson(client, 'add_memory', {
      content: `${marker} global scoped write check`,
      memory_type: 'preference',
      is_global: true,
      source: 'conversation',
      importance: 1,
    });
    const globalMemoryId = typeof allowedGlobalWrite.memoryId === 'string' ? allowedGlobalWrite.memoryId : '';
    if (globalMemoryId) createdGlobalMemoryIds.push(globalMemoryId);
    checks.push({
      name: 'global_write_allowed_when_permission_on',
      success: allowedGlobalWrite.success === true && Boolean(globalMemoryId),
      expected: true,
      detail: allowedGlobalWrite.error ? String(allowedGlobalWrite.error) : globalMemoryId || 'no memoryId returned',
    });

    const preferences = await callToolJson(client, 'get_user_preferences', {
      preference_types: ['preference'],
    });
    checks.push({
      name: 'global_read_after_write',
      success: preferences.success === true && containsMemoryMarker(preferences.preferences, marker),
      expected: true,
      detail: preferences.error ? String(preferences.error) : `${countArray(preferences.preferences)} preference(s)`,
    });
  } catch (error) {
    checks.push({
      name: 'permission_matrix_exception',
      success: false,
      expected: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await forceReloadDatabase();
    for (const id of createdProjectMemoryIds) {
      memoryService.deleteProjectMemory(id);
    }
    for (const id of createdGlobalMemoryIds) {
      memoryService.deleteGlobalMemory(id);
    }
    cleanupSelfTestMemories(memoryService);
    memoryService.updateProject(project.id, { globalMemoryPermission: originalPermission });
    memoryService.touchTokenUsed(rawToken);
  }

  return checks;
}

function cleanupSelfTestMemories(memoryService: ReturnType<typeof getMemoryService>): void {
  for (const project of memoryService.listProjects()) {
    for (const memory of memoryService.listProjectMemories(project.id, { limit: 500 })) {
      if (memory.content.startsWith('MCP_SELF_TEST_')) {
        memoryService.deleteProjectMemory(memory.id);
      }
    }
  }
  for (const memory of memoryService.listGlobalMemories({ limit: 500 })) {
    if (memory.content.startsWith('MCP_SELF_TEST_')) {
      memoryService.deleteGlobalMemory(memory.id);
    }
  }
}

async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await withTimeout(client.callTool({ name, arguments: args }), 8000, `MCP ${name} timed out`);
  return parseToolJson(firstTextContent(response));
}

function containsMemoryMarker(value: unknown, marker: string): boolean {
  return Array.isArray(value)
    && value.some((item) => isRecord(item) && typeof item.content === 'string' && item.content.includes(marker));
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function resolveMcpLaunch(): { command: string; args: string[]; cwd: string } {
  const repoRoot = resolve(__dirname, '../..');
  const distEntry = resolve(repoRoot, 'dist/mcp/index.js');
  if (existsSync(distEntry)) {
    return { command: process.execPath, args: [distEntry], cwd: repoRoot };
  }

  const sourceEntry = resolve(repoRoot, 'src/mcp/index.ts');
  const tsxCommand = resolve(repoRoot, 'node_modules/.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (existsSync(sourceEntry) && existsSync(tsxCommand)) {
    return { command: tsxCommand, args: [sourceEntry], cwd: repoRoot };
  }

  return { command: process.execPath, args: [distEntry], cwd: repoRoot };
}

function buildDiagnosticIssues(result: McpSelfTestResult): string[] {
  const issues: string[] = [];
  const stderrText = result.diagnostics.stderr.join('\n');

  if (result.error?.includes('Connection closed')) {
    issues.push('MCP 子进程已退出，请先查看启动命令、项目绑定和 stderr 诊断。');
  }
  if (stderrText.includes('Cannot find module') || stderrText.includes('ERR_MODULE_NOT_FOUND')) {
    issues.push('MCP 入口文件或依赖未找到。请先运行 npm run build:backend，或确认开发态已安装 tsx。');
  }
  if (stderrText.includes('MCP_TOKEN') || stderrText.includes('Token')) {
    issues.push('Token 校验失败。请确认当前密钥仍存在，并且绑定到了正确项目。');
  }
  if (stderrText.includes('MCP_PROJECT_PATH') || stderrText.includes('项目路径')) {
    issues.push('项目路径校验失败。请确认密钥绑定项目路径与 MCP_PROJECT_PATH 一致。');
  }
  if (issues.length === 0 && result.error) {
    issues.push('自测未完成。请根据下方诊断命令在终端复现 MCP 启动。');
  }

  return [...new Set(issues)];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseToolJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstTextContent(response: unknown): string | undefined {
  if (!isRecord(response) || !Array.isArray(response.content)) return undefined;
  const first = response.content[0];
  return isRecord(first) && typeof first.text === 'string' ? first.text : undefined;
}

function parseQuality(value: unknown): McpSelfTestResult['quality'] | undefined {
  if (!isRecord(value)) return undefined;
  const score = typeof value.score === 'number' ? value.score : 0;
  const gaps = parseStringArray(value.gaps);
  const runCommands = parseStringArray(value.runCommands);
  const verificationCommands = parseStringArray(value.verificationCommands);
  return { score, gaps, runCommands, verificationCommands };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
