<template>
  <div class="project-detail">
    <!-- Back & Header -->
    <div class="detail-header">
      <t-space>
        <t-button variant="text" @click="$router.push('/projects')">
          <template #icon><t-icon name="arrow-left" /></template>
          返回项目列表
        </t-button>
        <t-button variant="text" @click="loadData" :loading="loading">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
      </t-space>
    </div>

    <t-card v-if="project" class="project-info-card">
      <div class="project-info">
        <div class="project-icon" :style="{ background: getIconGradient(project.name) }">
          <t-icon name="folder-open" size="32px" />
        </div>
        <div class="project-details">
          <div class="project-name-row">
            <h2 class="project-name">{{ project.name }}</h2>
            <t-tag v-if="project.globalMemoryPermission" theme="primary" variant="light">
              全局权限
            </t-tag>
          </div>
          <div class="project-path">{{ project.path }}</div>
          <div v-if="project.description" class="project-desc">{{ project.description }}</div>
        </div>
        <div class="permission-toggle">
          <t-switch 
            :value="project.globalMemoryPermission" 
            size="small"
            @change="toggleGlobalPermission"
          />
          <span class="perm-text">全局记忆权限</span>
        </div>
      </div>

      <div class="project-stats" v-if="stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">记忆总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.byType.problem + stats.byType.error }}</div>
          <div class="stat-label">问题/错误</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.byType.solution }}</div>
          <div class="stat-label">解决方案</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.byStatus.resolved }}</div>
          <div class="stat-label">已解决</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.byStatus.active }}</div>
          <div class="stat-label">进行中</div>
        </div>
      </div>
    </t-card>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <t-radio-group v-model="typeFilter" variant="default-filled">
        <t-radio-button value="all">全部</t-radio-button>
        <t-radio-button value="problem">问题</t-radio-button>
        <t-radio-button value="solution">解决方案</t-radio-button>
        <t-radio-button value="error">错误</t-radio-button>
        <t-radio-button value="decision">决策</t-radio-button>
        <t-radio-button value="note">笔记</t-radio-button>
      </t-radio-group>

      <t-radio-group v-model="statusFilter" variant="default-filled">
        <t-radio-button value="all">全部状态</t-radio-button>
        <t-radio-button value="active">活跃</t-radio-button>
        <t-radio-button value="resolved">已解决</t-radio-button>
        <t-radio-button value="archived">已归档</t-radio-button>
      </t-radio-group>

      <t-button theme="primary" @click="showAddDialog = true">
        <template #icon><t-icon name="add" /></template>
        添加记忆
      </t-button>
    </div>

    <!-- Memory List -->
    <div v-if="filteredMemories.length > 0" class="memory-list">
      <div v-for="memory in filteredMemories" :key="memory.id" class="memory-card" @click="viewDetail(memory)">
        <div class="card-top">
          <div class="type-tags">
            <t-tag :type="getTypeColor(memory.memoryType)" size="medium">
              {{ getTypeLabel(memory.memoryType) }}
            </t-tag>
            <t-tag v-if="memory.status !== 'active'" :type="getStatusColor(memory.status)" size="small">
              {{ getStatusLabel(memory.status) }}
            </t-tag>
          </div>
          <span class="memory-time">{{ formatTime(memory.createdAt) }}</span>
        </div>

        <div class="memory-content">{{ memory.content }}</div>

        <div v-if="memory.tags.length > 0" class="memory-tags">
          <t-tag v-for="tag in memory.tags" :key="tag" size="small">{{ tag }}</t-tag>
        </div>

        <div class="card-footer">
          <div class="card-meta">
            <span class="importance">
              <t-icon name="star" />
              {{ memory.importance }}
            </span>
            <span class="source">来源: {{ getSourceLabel(memory.source) }}</span>
          </div>
          <div class="card-actions" @click.stop>
            <t-button v-if="memory.status === 'active' && (memory.memoryType === 'problem' || memory.memoryType === 'error')" size="small" theme="success" @click="handleResolve(memory)">
              标记解决
            </t-button>
            <t-button size="small" variant="text" @click="handleEdit(memory)">
              编辑
            </t-button>
            <t-button size="small" variant="text" theme="danger" @click="handleDelete(memory)">
              删除
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <t-empty v-else description="暂无记忆" class="empty-state">
      <t-button theme="primary" @click="showAddDialog = true">添加第一条记忆</t-button>
    </t-empty>

    <!-- Memory Pagination -->
    <div v-if="totalMemoryPages > 1" class="pagination">
      <t-pagination 
        v-model="currentMemoryPage" 
        :total="memories.length" 
        :page-size="memoryPageSize"
        @change="onMemoryPageChange"
      />
    </div>

    <!-- Add/Edit Dialog -->
    <t-dialog v-model:visible="showAddDialog" :header="editingMemory ? '编辑记忆' : '添加记忆'" width="600px">
      <div class="dialog-form">
        <div class="form-item">
          <label>记忆类型</label>
          <t-select v-model="formData.memoryType">
            <t-option value="problem" label="问题" />
            <t-option value="solution" label="解决方案" />
            <t-option value="error" label="错误" />
            <t-option value="decision" label="决策" />
            <t-option value="note" label="笔记" />
          </t-select>
        </div>
        <div class="form-item">
          <label>内容</label>
          <t-textarea v-model="formData.content" placeholder="请输入记忆内容" :rows="4" />
        </div>
        <div class="form-item">
          <label>标签</label>
          <t-input v-model="tagsInput" placeholder="多个标签用逗号分隔" />
        </div>
        <div class="form-item">
          <label>重要性</label>
          <t-rate v-model="formData.importance" :count="5" />
        </div>
      </div>
      <template #footer>
        <t-space>
          <t-button theme="primary" @click="handleSubmit">{{ editingMemory ? '保存' : '添加' }}</t-button>
          <t-button @click="closeDialog">取消</t-button>
        </t-space>
      </template>
    </t-dialog>

    <!-- Logs Dialog -->
    <t-dialog v-model:visible="showLogsDialog" header="操作日志" width="600px">
      <t-list v-if="memoryLogs.length > 0" :split="false">
        <t-list-item v-for="log in memoryLogs" :key="log.id">
          <div class="log-item">
            <t-tag :type="getLogTypeColor(log.action)" size="small">
              {{ getLogActionText(log.action) }}
            </t-tag>
            <span class="log-time">{{ formatDateTime(log.createdAt) }}</span>
          </div>
        </t-list-item>
      </t-list>
      <t-empty v-else description="暂无操作日志" />
    </t-dialog>

    <!-- Confirm Dialog -->
    <t-dialog v-model:visible="showConfirmDialog" header="确认操作" width="400px">
      <p>{{ confirmMessage }}</p>
      <template #footer>
        <t-space>
          <t-button theme="primary" @click="confirmAction">确定</t-button>
          <t-button @click="showConfirmDialog = false">取消</t-button>
        </t-space>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { api } from '../services';
import type { Project, ProjectMemory, ProjectStats, OperationLog } from '../../shared/types';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.id as string);

const project = ref<Project | null>(null);
const memories = ref<ProjectMemory[]>([]);
const stats = ref<ProjectStats | null>(null);
const typeFilter = ref('all');
const statusFilter = ref('all');
const showAddDialog = ref(false);
const showLogsDialog = ref(false);
const showConfirmDialog = ref(false);
const editingMemory = ref<ProjectMemory | null>(null);
const loading = ref(false);
const confirmMessage = ref('');
const confirmActionType = ref<'delete' | 'resolve' | ''>('');
const memoryLogs = ref<OperationLog[]>([]);
const currentMemoryPage = ref(1);
const memoryPageSize = ref(10);
const totalMemoryPages = computed(() => Math.ceil(memories.value.length / memoryPageSize.value));

const formData = reactive({
  memoryType: 'problem' as 'problem' | 'solution' | 'error' | 'decision' | 'note',
  content: '',
  importance: 3,
});

const tagsInput = ref('');

const filteredMemories = computed(() => {
  const filtered = memories.value.filter((m) => {
    if (typeFilter.value !== 'all' && m.memoryType !== typeFilter.value) return false;
    if (statusFilter.value !== 'all' && m.status !== statusFilter.value) return false;
    return true;
  });
  const start = (currentMemoryPage.value - 1) * memoryPageSize.value;
  return filtered.slice(start, start + memoryPageSize.value);
});

function getTypeColor(type: string): 'warning' | 'success' | 'danger' | 'primary' | 'default' {
  switch (type) {
    case 'problem': return 'warning';
    case 'solution': return 'success';
    case 'error': return 'danger';
    case 'decision': return 'primary';
    case 'note': return 'default';
    default: return 'default';
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    problem: '问题',
    solution: '解决方案',
    error: '错误',
    decision: '决策',
    note: '笔记',
  };
  return labels[type] || type;
}

function getStatusColor(status: string): 'success' | 'default' | 'warning' {
  switch (status) {
    case 'resolved': return 'success';
    case 'archived': return 'warning';
    default: return 'default';
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    resolved: '已解决',
    archived: '已归档',
    active: '活跃',
  };
  return labels[status] || status;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    manual: '手动',
    conversation: '对话',
    commit: '提交',
    error_log: '错误日志',
    extracted: '提取',
  };
  return labels[source] || source;
}

function getLogTypeColor(action: string): 'success' | 'warning' | 'danger' | 'primary' {
  switch (action) {
    case 'create': return 'success';
    case 'update': return 'warning';
    case 'delete': return 'danger';
    default: return 'primary';
  }
}

function getLogActionText(action: string): string {
  switch (action) {
    case 'create': return '创建';
    case 'update': return '更新';
    case 'delete': return '删除';
    default: return action;
  }
}

function onMemoryPageChange(pageInfo: { current: number }) {
  currentMemoryPage.value = pageInfo.current;
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(timeStr: string): string {
  return new Date(timeStr).toLocaleString('zh-CN');
}

const gradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
  'linear-gradient(135deg, #cd9cf2 0%, #f6f3ff 100%)',
  'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
];

function getIconGradient(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

async function toggleGlobalPermission(enabled: boolean) {
  if (!project.value) return;
  try {
    await api.project.update(project.value.id, { globalMemoryPermission: enabled });
    project.value.globalMemoryPermission = enabled;
    MessagePlugin.success(enabled ? '已开启全局记忆写入权限' : '已关闭全局记忆写入权限');
  } catch (error) {
    console.error('Failed to update permission:', error);
    MessagePlugin.error('更新权限失败');
  }
}

async function loadData() {
  loading.value = true;
  try {
    project.value = await api.project.get(projectId.value) as Project;
    memories.value = await api.memory.listByProject(projectId.value) as ProjectMemory[];
    stats.value = await api.stats.getProjectStats(projectId.value) as ProjectStats;
  } catch (error) {
    console.error('Failed to load data:', error);
  } finally {
    loading.value = false;
  }
}

function viewDetail(memory: ProjectMemory) {
  router.push({ name: 'project-memory-detail', params: { projectId: projectId.value, id: memory.id } });
}

function handleEdit(memory: ProjectMemory) {
  editingMemory.value = memory;
  formData.memoryType = memory.memoryType;
  formData.content = memory.content;
  formData.importance = memory.importance;
  tagsInput.value = memory.tags.join(', ');
  showAddDialog.value = true;
}

function handleResolve(memory: ProjectMemory) {
  confirmMessage.value = `确定要将此问题标记为已解决？`;
  confirmActionType.value = 'resolve';
  editingMemory.value = memory;
  showConfirmDialog.value = true;
}

function handleDelete(memory: ProjectMemory) {
  confirmMessage.value = `确定要删除此记忆吗？此操作不可恢复。`;
  confirmActionType.value = 'delete';
  editingMemory.value = memory;
  showConfirmDialog.value = true;
}

async function showLogs(memory: ProjectMemory) {
  try {
    memoryLogs.value = await api.logs.getByEntity('project_memory', memory.id) as OperationLog[];
    showLogsDialog.value = true;
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

async function confirmAction() {
  if (!editingMemory.value) return;

  try {
    if (confirmActionType.value === 'delete') {
      await api.memory.deleteProject(editingMemory.value.id);
    } else if (confirmActionType.value === 'resolve') {
      await api.memory.updateProject(editingMemory.value.id, { status: 'resolved' });
    }
    showConfirmDialog.value = false;
    await loadData();
  } catch (error) {
    console.error('Action failed:', error);
  }
}

async function handleSubmit() {
  try {
    const tags = tagsInput.value.split(',').map((t) => t.trim()).filter((t) => t);

    if (editingMemory.value) {
      await api.memory.updateProject(editingMemory.value.id, {
        content: formData.content,
        addTags: tags,
      });
    } else {
      await api.memory.addProject({
        projectId: projectId.value,
        content: formData.content,
        memoryType: formData.memoryType,
        tags,
        importance: formData.importance,
      });
    }
    closeDialog();
    await loadData();
  } catch (error) {
    console.error('Submit failed:', error);
  }
}

function closeDialog() {
  showAddDialog.value = false;
  editingMemory.value = null;
  formData.memoryType = 'problem';
  formData.content = '';
  formData.importance = 3;
  tagsInput.value = '';
}

onMounted(loadData);
</script>

<style scoped>
.project-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.detail-header {
  flex-shrink: 0;
}

.project-info-card {
  flex-shrink: 0;
  background: linear-gradient(135deg, #e6f0ff 0%, #f5f7fa 100%);
}

.project-info {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.project-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.project-details {
  flex: 1;
  min-width: 0;
}

.project-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.project-name {
  font-size: 20px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1d2129;
  margin: 0;
}

.project-path {
  font-size: 13px;
  color: #86909c;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-desc {
  font-size: 13px;
  color: #a8adb5;
  margin-bottom: 8px;
}

.permission-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #ffffff;
  border-radius: 6px;
  border: 1px solid #e7e7e7;
  flex-shrink: 0;
}

.perm-text {
  font-size: 12px;
  color: #505050;
  white-space: nowrap;
}

.project-stats {
  display: flex;
  gap: 24px;
  padding-top: 14px;
  border-top: 1px solid rgba(0, 82, 217, 0.1);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0052d9;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: #86909c;
  margin-top: 2px;
}

.filter-bar {
  flex-shrink: 0;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.memory-list {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  align-content: start;
  padding: 4px;
}

.memory-card {
  background: #ffffff;
  border: 1px solid #e7e7e7;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: 260px;
  overflow: hidden;
}

.memory-card:hover {
  border-color: #0052d9;
  box-shadow: 0 4px 16px rgba(0, 82, 217, 0.15);
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.type-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.memory-time {
  font-size: 12px;
  color: #a8adb5;
  white-space: nowrap;
  flex-shrink: 0;
}

.memory-content {
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  flex: 1;
}

.memory-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
  flex-shrink: 0;
}

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #a8adb5;
  align-items: center;
}

.importance {
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.log-time {
  margin-left: auto;
  font-size: 12px;
  color: #a8adb5;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 80px 0;
}

.pagination {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  background: #ffffff;
  border-radius: 8px;
  margin-top: 8px;
}
</style>
