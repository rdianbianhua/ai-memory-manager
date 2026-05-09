<template>
  <div class="project-list">
    <!-- Header -->
    <div class="list-header">
      <div class="header-left">
        <t-input v-model="searchText" placeholder="搜索项目..." clearable style="width: 300px">
          <template #prefix-icon>
            <t-icon name="search" />
          </template>
        </t-input>
      </div>
      <div class="header-right">
        <t-button @click="loadProjects" :loading="loading">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
        <t-button theme="primary" @click="showCreateDialog = true">
          <template #icon><t-icon name="add" /></template>
          新建项目
        </t-button>
      </div>
    </div>

    <!-- Project Cards -->
    <div v-if="projects.length > 0" class="projects-grid">
      <div v-for="project in filteredProjects" :key="project.id" class="project-card" @click="goToDetail(project.id)">
        <div class="card-header">
          <div class="project-icon" :style="{ background: getIconGradient(project.name) }">
            <t-icon name="folder-open" size="28px" />
          </div>
          <div class="project-info">
            <div class="project-name">{{ project.name }}</div>
            <div class="project-path">{{ project.path }}</div>
          </div>
          <div class="card-badges">
            <t-tag v-if="project.globalMemoryPermission" theme="primary" variant="light" size="small">
              全局权限
            </t-tag>
          </div>
        </div>

        <div class="card-stats" v-if="projectStats[project.id]">
          <div class="stat-item">
            <div class="stat-value">{{ projectStats[project.id].total }}</div>
            <div class="stat-label">总记忆</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-value error">{{ projectStats[project.id].byType.problem + projectStats[project.id].byType.error }}</div>
            <div class="stat-label">问题</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-value success">{{ projectStats[project.id].byType.solution }}</div>
            <div class="stat-label">方案</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-value warning">{{ projectStats[project.id].byStatus.resolved }}</div>
            <div class="stat-label">已解决</div>
          </div>
        </div>

        <div class="card-footer">
          <span class="meta-item">
            <t-icon name="time" />
            {{ formatTime(project.lastAccessedAt) }}
          </span>
          <div class="card-actions" @click.stop>
            <t-popup content="开启后可写入全局记忆" placement="top">
              <t-switch 
                :value="project.globalMemoryPermission" 
                size="small" 
                @change="(val: unknown) => toggleGlobalPermission(project, val as boolean)" 
              />
            </t-popup>
            <t-button size="small" variant="text" @click="handleClearMemories(project)">
              清空
            </t-button>
            <t-button size="small" variant="text" theme="danger" @click="handleDelete(project)">
              删除
            </t-button>
          </div>
        </div>

        <div class="card-hover-indicator">
          <t-icon name="chevron-right" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredProjects.length === 0" class="empty-state">
      <t-empty v-if="projects.length === 0" description="暂无项目">
        <t-button theme="primary" @click="showCreateDialog = true">创建第一个项目</t-button>
      </t-empty>
      <t-empty v-else description="没有找到匹配的项目" />
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <t-pagination 
        v-model="currentPage" 
        :total="totalCount" 
        :page-size="pageSize"
        @change="onPageChange"
      />
    </div>

    <!-- Create Dialog -->
    <t-dialog v-model:visible="showCreateDialog" header="新建项目" :footer="false" width="500px">
      <t-form :model="createForm" @submit="handleCreate">
        <t-form-item label="项目名称" name="name" :rules="[{ required: true, message: '请输入项目名称' }]">
          <t-input v-model="createForm.name" placeholder="请输入项目名称" />
        </t-form-item>
        <t-form-item label="项目路径" name="path" :rules="[{ required: true, message: '请输入项目路径' }]">
          <t-input v-model="createForm.path" placeholder="请输入项目路径" />
        </t-form-item>
        <t-form-item label="项目描述" name="description">
          <t-textarea v-model="createForm.description" placeholder="请输入项目描述（可选）" />
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button type="submit" theme="primary">创建</t-button>
            <t-button @click="showCreateDialog = false">取消</t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- Confirm Dialog -->
    <t-dialog v-model:visible="showConfirmDialog" :header="confirmConfig.title" width="400px">
      <p>{{ confirmConfig.message }}</p>
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
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { api } from '../services';
import type { Project, ProjectStats } from '../../shared/types';

const router = useRouter();

const projects = ref<Project[]>([]);
const projectStats = ref<Record<string, ProjectStats>>({});
const searchText = ref('');
const showCreateDialog = ref(false);
const showConfirmDialog = ref(false);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(12);
const totalCount = ref(0);
const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value));

const createForm = reactive({
  name: '',
  path: '',
  description: '',
});

const confirmConfig = reactive({
  title: '',
  message: '',
  action: '' as 'delete' | 'clear' | '',
  project: null as Project | null,
});

const filteredProjects = computed(() => {
  let filtered = projects.value;
  if (searchText.value) {
    const search = searchText.value.toLowerCase();
    filtered = projects.value.filter(
      (p) => p.name.toLowerCase().includes(search) || p.path.toLowerCase().includes(search)
    );
  }
  totalCount.value = filtered.length;
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.slice(start, start + pageSize.value);
});

function onPageChange(pageInfo: { current: number }) {
  currentPage.value = pageInfo.current;
}

function resetPagination() {
  currentPage.value = 1;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function goToDetail(projectId: string) {
  router.push(`/projects/${projectId}`);
}

async function loadProjects() {
  loading.value = true;
  try {
    projects.value = await api.project.list() as Project[];
    totalCount.value = projects.value.length;
    resetPagination();
    // Load stats for each project
    for (const project of projects.value) {
      projectStats.value[project.id] = await api.project.getStats(project.id) as ProjectStats;
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  try {
    await api.project.create(createForm.name, createForm.path, createForm.description);
    showCreateDialog.value = false;
    createForm.name = '';
    createForm.path = '';
    createForm.description = '';
    await loadProjects();
  } catch (error) {
    console.error('Failed to create project:', error);
  }
}

function handleDelete(project: Project) {
  confirmConfig.title = '删除项目';
  confirmConfig.message = `确定要删除项目 "${project.name}" 吗？这将同时删除该项目的所有记忆。`;
  confirmConfig.action = 'delete';
  confirmConfig.project = project;
  showConfirmDialog.value = true;
}

function handleClearMemories(project: Project) {
  confirmConfig.title = '清空记忆';
  confirmConfig.message = `确定要清空项目 "${project.name}" 的所有记忆吗？此操作不可恢复。`;
  confirmConfig.action = 'clear';
  confirmConfig.project = project;
  showConfirmDialog.value = true;
}

async function toggleGlobalPermission(project: Project, enabled: boolean) {
  try {
    await api.project.update(project.id, { globalMemoryPermission: enabled });
    project.globalMemoryPermission = enabled;
    MessagePlugin.success(enabled ? '已开启全局记忆写入权限' : '已关闭全局记忆写入权限');
  } catch (error) {
    console.error('Failed to update permission:', error);
    MessagePlugin.error('更新权限失败');
  }
}

async function confirmAction() {
  if (!confirmConfig.project) return;

  try {
    if (confirmConfig.action === 'delete') {
      await api.project.delete(confirmConfig.project.id);
    } else if (confirmConfig.action === 'clear') {
      await api.memory.deleteAllInProject(confirmConfig.project.id);
    }
    showConfirmDialog.value = false;
    await loadProjects();
  } catch (error) {
    console.error('Action failed:', error);
  }
}

onMounted(loadProjects);
</script>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.list-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.projects-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-content: start;
  padding: 4px;
}

.project-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #e7e7e7;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 180px;
  max-height: 220px;
  overflow: hidden;
}

.project-card:hover {
  border-color: #0052d9;
  box-shadow: 0 4px 16px rgba(0, 82, 217, 0.12);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.project-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.project-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1d2129;
  line-height: 1.3;
}

.project-path {
  font-size: 12px;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.card-badges {
  flex-shrink: 0;
}

.card-stats {
  display: flex;
  align-items: center;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 12px 8px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #1d2129;
}

.stat-value.error {
  color: #e34d59;
}

.stat-value.success {
  color: #00a870;
}

.stat-value.warning {
  color: #ff9c00;
}

.stat-label {
  font-size: 11px;
  color: #86909c;
}

.stat-divider {
  width: 1px;
  height: 28px;
  background: #e7e7e7;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #86909c;
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.perm-label {
  font-size: 12px;
  color: #86909c;
  cursor: default;
}

.perm-label:has(+ .t-switch .t-is-checked) {
  color: #0052d9;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.project-card:hover .card-actions {
  opacity: 1;
}

.card-hover-indicator {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  color: #0052d9;
  transition: all 0.2s;
}

.project-card:hover .card-hover-indicator {
  opacity: 1;
  transform: translateY(-50%) translateX(4px);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 80px 0;
}

.pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 16px 0;
  background: #ffffff;
  border-radius: 8px;
  margin-top: 8px;
}
</style>
