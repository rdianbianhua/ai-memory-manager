<template>
  <div class="mcp-tools">
    <!-- Info Card -->
    <t-card title="MCP 服务配置" class="info-card">
      <div class="config-section">
        <t-collapse>
          <t-collapse-panel header="Claude Code MCP 配置">
            <template #headerRightContent>
              <t-tag theme="primary" variant="outline" hover="color" style="cursor: pointer" @click.stop="copyMcpConfig">
                <template #icon><t-icon name="copy" /></template>
                复制配置
              </t-tag>
            </template>
            <div class="config-value mono">
              <pre class="config-json">{{ JSON.stringify(mcpConfig, null, 2) }}</pre>
            </div>
          </t-collapse-panel>
        </t-collapse>
        <div class="config-note">
          <t-icon name="info-circle" />
          <span>将上方配置复制到 Claude Code 的 MCP 设置文件（settings.json），然后把 <code>MCP_TOKEN</code> 和 <code>MCP_PROJECT_PATH</code> 替换成实际值。</span>
        </div>
        <div v-if="runtimeStatus && !runtimeStatus.embedder.semanticSearchEnabled" class="config-warning">
          <t-icon name="error-circle" />
          <span>当前未检测到 OpenAI API Key，系统会使用占位向量。搜索可用，但结果不是真正的语义搜索。</span>
        </div>
        <div v-if="runtimeStatus" class="runtime-grid">
          <div>
            <span class="config-label">数据库</span>
            <code>{{ runtimeStatus.databasePath }}</code>
          </div>
          <div>
            <span class="config-label">Embedding</span>
            <code>{{ runtimeStatus.embedder.model }} / {{ runtimeStatus.embedder.dimension }}</code>
          </div>
        </div>
      </div>
    </t-card>

    <!-- Token Actions -->
    <div class="token-actions">
      <div class="action-left">
        <span class="section-title">密钥列表</span>
      </div>
      <t-button theme="primary" @click="showCreateDialog = true">
        <template #icon><t-icon name="add" /></template>
        生成新密钥
      </t-button>
    </div>

    <!-- Token List -->
    <div v-if="tokens.length > 0" class="token-list">
      <t-card v-for="tk in tokens" :key="tk.id" class="token-card">
        <div class="token-header">
          <div class="token-info">
            <span class="token-name">{{ tk.name }}</span>
            <t-tag v-if="tk.projectId" size="small" variant="light" theme="primary">
              {{ tk.projectName || '未知项目' }}
            </t-tag>
            <t-tag v-else size="small" variant="light" theme="warning">
              未绑定项目
            </t-tag>
          </div>
          <div class="token-actions">
            <t-button size="small" variant="outline" @click="openBindDialog(tk)">
              {{ tk.projectId ? '更换项目' : '绑定项目' }}
            </t-button>
            <t-button
              size="small"
              variant="outline"
              theme="primary"
              :disabled="!tk.projectId"
              :loading="selfTestLoadingId === tk.id"
              @click="runSelfTest(tk)"
            >
              自测
            </t-button>
            <t-button
              size="small"
              variant="outline"
              theme="danger"
              :disabled="!!tk.lastUsedAt"
              @click="handleDelete(tk)"
            >
              删除
            </t-button>
          </div>
        </div>

        <div class="token-value">
          <span class="masked">SK****************************</span>
          <t-button size="small" variant="text" @click="copyToken(tk)">
            <template #icon><t-icon name="copy" /></template>
          </t-button>
        </div>

        <div class="token-meta">
          <span v-if="tk.lastUsedAt">最后使用: {{ formatTime(tk.lastUsedAt) }}</span>
          <span v-else class="unused">从未使用</span>
          <span>创建于: {{ formatDate(tk.createdAt) }}</span>
        </div>

        <div v-if="selfTestResult?.token.id === tk.id" class="self-test-panel">
          <div class="self-test-header">
            <strong>{{ selfTestResult.success ? 'MCP 自测通过' : 'MCP 自测未通过' }}</strong>
            <div class="self-test-header-actions">
              <t-button
                v-if="selfTestResult.handoffText"
                size="small"
                variant="outline"
                theme="primary"
                @click="copySelfTestHandoff"
              >
                复制接手上下文
              </t-button>
              <t-tag :theme="selfTestResult.success ? 'success' : 'danger'" variant="light">
                {{ selfTestResult.token.tokenPreview }}
              </t-tag>
            </div>
          </div>
          <div class="self-test-grid">
            <div>
              <span>绑定项目</span>
              <code>{{ selfTestResult.project?.name || tk.projectName || '未知项目' }}</code>
            </div>
            <div>
              <span>可用工具</span>
              <code>{{ selfTestResult.tools.length }} 个</code>
            </div>
            <div>
              <span>隐藏未确认记忆</span>
              <code>{{ hiddenMemoryCount(selfTestResult) }}</code>
            </div>
            <div>
              <span>接手评分</span>
              <code>{{ selfTestResult.quality?.score ?? 0 }}/100</code>
            </div>
          </div>
          <div v-if="selfTestResult.quality" class="self-test-commands">
            <div>
              <span>启动</span>
              <code v-for="command in selfTestResult.quality.runCommands" :key="`run-${command}`">{{ command }}</code>
            </div>
            <div>
              <span>验证</span>
              <code v-for="command in selfTestResult.quality.verificationCommands" :key="`verify-${command}`">{{ command }}</code>
            </div>
          </div>
          <div v-if="selfTestResult.permissionMatrix.length > 0" class="self-test-matrix">
            <div class="matrix-title">权限矩阵</div>
            <div
              v-for="check in selfTestResult.permissionMatrix"
              :key="check.name"
              class="matrix-row"
              :class="{ failed: check.success !== check.expected }"
            >
              <span>{{ getPermissionCheckLabel(check.name) }}</span>
              <t-tag size="small" :theme="check.success === check.expected ? 'success' : 'danger'" variant="light">
                {{ check.success === check.expected ? '符合预期' : '异常' }}
              </t-tag>
              <small>{{ check.detail }}</small>
            </div>
          </div>
          <div v-if="selfTestResult.issues.length > 0 || selfTestResult.error" class="self-test-issues">
            <strong>自测诊断</strong>
            <p v-if="selfTestResult.error">错误：{{ selfTestResult.error }}</p>
            <p v-for="issue in selfTestResult.issues" :key="issue">{{ issue }}</p>
          </div>
          <div v-if="shouldShowSelfTestDiagnostics(selfTestResult)" class="self-test-diagnostics">
            <div>
              <span>启动命令</span>
              <code>{{ selfTestResult.diagnostics.command }} {{ selfTestResult.diagnostics.args.join(' ') }}</code>
            </div>
            <div>
              <span>工作目录</span>
              <code>{{ selfTestResult.diagnostics.cwd }}</code>
            </div>
            <div>
              <span>项目路径</span>
              <code>{{ selfTestResult.diagnostics.projectPath }}</code>
            </div>
            <pre v-if="selfTestResult.diagnostics.stderr.length > 0">{{ selfTestResult.diagnostics.stderr.join('\n') }}</pre>
          </div>
          <div v-if="selfTestResult.quality?.gaps.length" class="self-test-gaps">
            <p v-for="gap in selfTestResult.quality.gaps" :key="gap">{{ gap }}</p>
          </div>
          <pre v-if="selfTestResult.handoffPreview.length > 0" class="self-test-preview">{{ selfTestResult.handoffPreview.join('\n') }}</pre>
        </div>
      </t-card>
    </div>

    <t-card v-else class="empty-card">
      <t-empty description="暂无密钥，点击上方按钮生成第一个密钥">
        <t-button theme="primary" @click="showCreateDialog = true">生成密钥</t-button>
      </t-empty>
    </t-card>

    <!-- Create Dialog -->
    <t-dialog v-model:visible="showCreateDialog" header="生成新密钥" :footer="false" width="480px">
      <t-form @submit="handleCreate">
        <t-form-item label="密钥名称" name="name" :rules="[{ required: true, message: '请输入密钥名称' }]">
          <t-input v-model="createForm.name" placeholder="例如: Claude Code 主密钥" />
        </t-form-item>
        <t-form-item label="绑定项目" name="projectId">
          <t-select v-model="createForm.projectId" clearable placeholder="不绑定则可在任意项目使用">
            <t-option v-for="p in projects" :key="p.id" :value="p.id" :label="p.name" />
          </t-select>
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button type="submit" theme="primary">生成</t-button>
            <t-button @click="showCreateDialog = false">取消</t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- Bind Dialog -->
    <t-dialog v-model:visible="showBindDialog" header="绑定到项目" :footer="false" width="480px">
      <t-form @submit="handleBind">
        <t-form-item label="选择项目" name="projectId">
          <t-select v-model="bindForm.projectId" clearable placeholder="留空则不绑定项目">
            <t-option v-for="p in projects" :key="p.id" :value="p.id" :label="p.name" />
          </t-select>
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button type="submit" theme="primary">确认绑定</t-button>
            <t-button @click="showBindDialog = false">取消</t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- Delete Confirm -->
    <t-dialog v-model:visible="showDeleteDialog" header="删除密钥" width="400px">
      <p>确定要删除密钥 <strong>{{ deleteTarget?.name }}</strong> 吗？此操作不可恢复。</p>
      <template #footer>
        <t-space>
          <t-button theme="danger" @click="confirmDelete">删除</t-button>
          <t-button @click="showDeleteDialog = false">取消</t-button>
        </t-space>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { api, type McpSelfTestResult, type RuntimeStatus } from '../services';
import type { Project, ApiToken } from '../../shared/types';

const mcpConfig = computed(() => ({
  mcpServers: {
    'ai-memory': {
      command: 'node',
      args: [runtimeStatus.value?.mcp.serverPath || 'dist/mcp/index.js'],
      cwd: runtimeStatus.value?.mcp.serverPath
        ? runtimeStatus.value.mcp.serverPath.replace(/[\\/]dist[\\/]mcp[\\/]index\.js$/, '')
        : undefined,
      env: {
        MCP_TOKEN: '你的Token',
        MCP_PROJECT_PATH: '你的项目路径'
      }
    }
  }
}));

interface TokenItem {
  id: string;
  name: string;
  projectId: string | null;
  projectName?: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const tokens = ref<TokenItem[]>([]);
const projects = ref<Project[]>([]);
const runtimeStatus = ref<RuntimeStatus | null>(null);
const selfTestLoadingId = ref<string | null>(null);
const selfTestResult = ref<McpSelfTestResult | null>(null);

const showCreateDialog = ref(false);
const showBindDialog = ref(false);
const showDeleteDialog = ref(false);
const deleteTarget = ref<Omit<ApiToken, 'token'> | null>(null);

const createForm = reactive({
  name: '',
  projectId: '' as string | undefined,
});

const bindForm = reactive({
  id: '',
  projectId: '' as string | null,
});

async function loadData() {
  try {
    const [tokenList, projectList, status] = await Promise.all([
      api.token.list(),
      api.project.list(),
      api.runtime.status(),
    ]);
    tokens.value = tokenList;
    projects.value = projectList;
    runtimeStatus.value = status;
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

async function handleCreate() {
  try {
    const result = await api.token.create(createForm.name, createForm.projectId);
    showCreateDialog.value = false;
    createForm.name = '';
    createForm.projectId = undefined;
    await navigator.clipboard.writeText(result.token);
    await loadData();
    MessagePlugin.success('密钥已生成并复制到剪贴板');
  } catch (error) {
    console.error('Failed to create token:', error);
    MessagePlugin.error('生成失败');
  }
}

function openBindDialog(tk: Omit<ApiToken, 'token'>) {
  bindForm.id = tk.id;
  bindForm.projectId = tk.projectId;
  showBindDialog.value = true;
}

async function handleBind() {
  try {
    await api.token.bind(bindForm.id, bindForm.projectId || null);
    showBindDialog.value = false;
    await loadData();
    MessagePlugin.success('项目绑定已更新');
  } catch (error) {
    console.error('Failed to bind token:', error);
    MessagePlugin.error('绑定失败');
  }
}

function handleDelete(tk: Omit<ApiToken, 'token'>) {
  deleteTarget.value = tk;
  showDeleteDialog.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await api.token.delete(deleteTarget.value.id);
    showDeleteDialog.value = false;
    deleteTarget.value = null;
    await loadData();
    MessagePlugin.success('密钥已删除');
  } catch (error) {
    console.error('Failed to delete token:', error);
    MessagePlugin.error('删除失败');
  }
}

async function copyToken(tk: Omit<ApiToken, 'token'>) {
  try {
    const full = await api.token.reveal(tk.id);
    await navigator.clipboard.writeText(full.token);
    MessagePlugin.success('Token 已复制到剪贴板');
  } catch (error) {
    console.error('Failed to copy token:', error);
    MessagePlugin.error('复制失败');
  }
}

async function runSelfTest(tk: Omit<ApiToken, 'token'>) {
  selfTestLoadingId.value = tk.id;
  try {
    selfTestResult.value = await api.runtime.mcpSelfTest(tk.id);
    if (selfTestResult.value.success) {
      MessagePlugin.success('MCP 自测通过');
    } else {
      MessagePlugin.warning('MCP 自测完成，但发现问题');
    }
  } catch (error) {
    console.error('Failed to run MCP self-test:', error);
    MessagePlugin.error('MCP 自测失败');
  } finally {
    selfTestLoadingId.value = null;
  }
}

function hiddenMemoryCount(result: McpSelfTestResult): number {
  return (result.counts?.hiddenNonConfirmedGlobal || 0) + (result.counts?.hiddenNonConfirmedProject || 0);
}

function getPermissionCheckLabel(name: string): string {
  const labels: Record<string, string> = {
    project_write: '项目写入',
    project_read_after_write: '项目读取',
    cross_project_read_denied: '跨项目拦截',
    global_write_denied_when_permission_off: '关闭权限拒写全局',
    global_write_allowed_when_permission_on: '开启权限写全局',
    global_read_after_write: '全局读取',
    permission_matrix_exception: '矩阵异常',
  };
  return labels[name] || name;
}

function shouldShowSelfTestDiagnostics(result: McpSelfTestResult): boolean {
  return !result.success || result.diagnostics.stderr.length > 0;
}

async function copySelfTestHandoff() {
  if (!selfTestResult.value?.handoffText) return;
  try {
    await navigator.clipboard.writeText(selfTestResult.value.handoffText);
    MessagePlugin.success('接手上下文已复制');
  } catch (error) {
    console.error('Failed to copy handoff:', error);
    MessagePlugin.error('复制失败');
  }
}

async function copyMcpConfig() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(mcpConfig.value, null, 2));
    MessagePlugin.success('MCP 配置已复制到剪贴板');
  } catch (error) {
    console.error('Failed to copy config:', error);
    MessagePlugin.error('复制失败');
  }
}

onMounted(loadData);
</script>

<style scoped>
.mcp-tools {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.info-card {
  flex-shrink: 0;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-label {
  font-size: 12px;
  color: #86909c;
}

.config-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.config-value {
  font-size: 13px;
}

.mono code {
  font-family: 'SF Mono', Consolas, monospace;
  background: #f2f3f5;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #1d2129;
}

.config-json {
  background: #f2f3f5;
  padding: 12px;
  border-radius: 6px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  color: #1d2129;
  overflow-x: auto;
  margin: 8px 0;
  white-space: pre;
}

.config-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #646a73;
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 6px;
  margin-top: 4px;
}

.config-note .t-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #0052d9;
}

.config-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #ad5b00;
  background: #fff7e6;
  padding: 10px 12px;
  border-radius: 6px;
}

.config-warning .t-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #ed7b2f;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.runtime-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.runtime-grid code {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  color: #1d2129;
  background: #f2f3f5;
  padding: 6px 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: nowrap;
}

.token-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}

.token-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.token-card {
  flex-shrink: 0;
}

.token-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.token-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-name {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}

.token-actions {
  display: flex;
  gap: 8px;
}

.token-value {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f5f7fa;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.masked {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 14px;
  color: #1d2129;
  letter-spacing: 0.5px;
}

.token-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #a8adb5;
}

.self-test-panel {
  margin-top: 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 10px;
  background: #fff;
}

.self-test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.self-test-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.self-test-header strong {
  font-size: 13px;
  color: #1d2129;
}

.self-test-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.self-test-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.self-test-grid span {
  font-size: 12px;
  color: #86909c;
}

.self-test-grid code {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-test-commands {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.self-test-commands > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.self-test-commands span {
  font-size: 12px;
  color: #86909c;
}

.self-test-commands code {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  color: #1d2129;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 4px 6px;
  overflow-x: auto;
  white-space: nowrap;
}

.self-test-matrix {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.matrix-title {
  font-size: 12px;
  color: #86909c;
}

.matrix-row {
  display: grid;
  grid-template-columns: 120px 82px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 6px 8px;
}

.matrix-row.failed {
  background: #fff2f0;
}

.matrix-row span,
.matrix-row small {
  font-size: 12px;
}

.matrix-row span {
  color: #1d2129;
}

.matrix-row small {
  color: #646a73;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-test-issues,
.self-test-gaps,
.self-test-diagnostics {
  margin-bottom: 10px;
  background: #fff2f0;
  border-radius: 4px;
  padding: 8px;
}

.self-test-gaps {
  background: #fff7e6;
}

.self-test-diagnostics {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #f5f7fa;
}

.self-test-diagnostics > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.self-test-diagnostics span,
.self-test-issues strong {
  font-size: 12px;
  color: #646a73;
}

.self-test-diagnostics code,
.self-test-diagnostics pre {
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #1d2129;
}

.self-test-diagnostics pre {
  max-height: 160px;
  padding-top: 6px;
  border-top: 1px solid #e5e6eb;
}

.self-test-issues p,
.self-test-gaps p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.self-test-issues p {
  color: #c9353f;
}

.self-test-gaps p {
  color: #ad5b00;
}

.self-test-preview {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #1d2129;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 8px;
}

.unused {
  color: #faad14;
}

.empty-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 900px) {
  .self-test-grid {
    grid-template-columns: 1fr;
  }

  .self-test-commands {
    grid-template-columns: 1fr;
  }
}
</style>
