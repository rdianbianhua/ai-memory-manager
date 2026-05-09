<template>
  <div class="memory-detail">
    <div class="detail-container" v-if="memory">
      <div class="detail-header">
        <t-button variant="text" @click="goBack">
          <template #icon><t-icon name="arrow-left" /></template>
          返回
        </t-button>
      </div>

      <div class="detail-content">
        <template v-if="!isEditing">
          <div class="article-meta">
            <t-tag :type="getTypeColor(memory.memoryType)" size="large">
              {{ getTypeLabel(memory.memoryType) }}
            </t-tag>
            <t-tag v-if="(memory as ProjectMemory).status" :type="getStatusColor((memory as ProjectMemory).status)" size="medium">
              {{ getStatusLabel((memory as ProjectMemory).status) }}
            </t-tag>
            <span class="meta-item">
              <t-icon name="time" />
              {{ formatDateTime(memory.createdAt) }}
            </span>
          </div>

          <div class="article-actions">
            <t-button size="small" theme="primary" @click="toggleEdit">
              <template #icon><t-icon name="edit" /></template>
              {{ isEditing ? '取消' : '编辑' }}
            </t-button>
            <t-button size="small" theme="danger" variant="outline" @click="handleDelete">
              <template #icon><t-icon name="delete" /></template>
              删除
            </t-button>
          </div>

          <h1 class="article-title">
            {{ getTitle(memory) }}
          </h1>

          <div class="article-tags" v-if="memoryTags.length > 0">
            <t-tag v-for="tag in memoryTags" :key="tag" size="large">{{ tag }}</t-tag>
          </div>

          <div class="article-importance">
            <span class="label">重要性：</span>
            <t-rate :value="memory.importance" :count="5" disabled />
          </div>

          <div class="article-source">
            <span class="label">来源：</span>
            <span>{{ getSourceLabel(memory.source) }}</span>
          </div>

          <div class="article-divider"></div>

          <div class="article-body">{{ memory.content }}</div>
        </template>

        <template v-else>
          <div class="edit-header">
            <h3>编辑记忆</h3>
            <t-button size="small" variant="outline" @click="toggleEdit">取消</t-button>
          </div>
          <div class="edit-form">
            <div class="form-item">
              <label>记忆类型</label>
              <t-select v-model="formData.memoryType" v-if="isGlobal">
                <t-option value="preference" label="偏好" />
                <t-option value="habit" label="习惯" />
                <t-option value="context" label="上下文" />
              </t-select>
              <t-select v-model="formData.memoryType" v-else>
                <t-option value="problem" label="问题" />
                <t-option value="solution" label="解决方案" />
                <t-option value="error" label="错误" />
                <t-option value="decision" label="决策" />
                <t-option value="note" label="笔记" />
              </t-select>
            </div>

            <div class="form-item">
              <label>内容</label>
              <t-textarea v-model="formData.content" placeholder="请输入记忆内容" :rows="10" />
            </div>

            <div class="form-item">
              <label>标签</label>
              <t-input v-model="formData.tagsInput" placeholder="多个标签用逗号分隔" />
            </div>

            <div class="form-item">
              <label>重要性</label>
              <t-rate v-model="formData.importance" :count="5" />
            </div>

            <div class="form-actions">
              <t-button theme="primary" :loading="saving" @click="handleSave">
                保存
              </t-button>
              <t-button variant="outline" @click="toggleEdit">取消</t-button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="loading" v-else>
      <t-loading text="加载中..." />
    </div>

    <t-dialog v-model:visible="showConfirmDialog" header="确认删除" width="400px" :footer="false">
      <div class="confirm-content">
        <p>确定要删除这条记忆吗？此操作不可恢复。</p>
        <div class="confirm-actions">
          <t-button variant="outline" @click="showConfirmDialog = false">取消</t-button>
          <t-button theme="danger" :loading="deleting" @click="confirmDelete">确认删除</t-button>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '../services';
import type { GlobalMemory, ProjectMemory } from '../../shared/types';

const router = useRouter();
const route = useRoute();

const memory = ref<ProjectMemory | GlobalMemory | null>(null);
const isGlobal = ref(false);
const isEditing = ref(false);
const saving = ref(false);
const deleting = ref(false);
const showConfirmDialog = ref(false);

const formData = ref({
  memoryType: '',
  title: '',
  content: '',
  tagsInput: '',
  importance: 3,
  status: 'active' as ProjectMemory['status'],
});

function isProjectMemory(m: ProjectMemory | GlobalMemory): m is ProjectMemory {
  return 'projectId' in m;
}

const memoryTags = computed(() => {
  return memory.value && isProjectMemory(memory.value) ? memory.value.tags : [];
});

onMounted(async () => {
  const id = route.params.id as string;
  const path = route.path;
  isGlobal.value = path.includes('/global/');

  try {
    if (isGlobal.value) {
      const data = await api.memory.getGlobal(id);
      memory.value = data as GlobalMemory;
    } else {
      const projectId = route.params.projectId as string;
      const data = await api.memory.getProject(projectId, id);
      memory.value = data as ProjectMemory;
    }
    initForm();
  } catch (error) {
    console.error('Failed to load memory:', error);
  }
});

function initForm() {
  if (!memory.value) return;
  formData.value = {
    memoryType: memory.value.memoryType,
    title: getTitle(memory.value),
    content: memory.value.content,
    tagsInput: isProjectMemory(memory.value) ? memory.value.tags.join(', ') : '',
    importance: memory.value.importance,
    status: isProjectMemory(memory.value) ? memory.value.status : 'active',
  };
}

function getTitle(m: ProjectMemory | GlobalMemory): string {
  const typeLabel = getTypeLabel(m.memoryType);
  const preview = m.content.substring(0, 30);
  return `${typeLabel}: ${preview}${m.content.length > 30 ? '...' : ''}`;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    problem: '问题',
    solution: '解决方案',
    error: '错误',
    decision: '决策',
    note: '笔记',
    preference: '偏好',
    habit: '习惯',
    context: '上下文',
  };
  return labels[type] || type;
}

function getTypeColor(type: string): 'warning' | 'primary' | 'danger' | 'default' | 'success' {
  const colors: Record<string, 'warning' | 'primary' | 'danger' | 'default' | 'success'> = {
    problem: 'warning',
    solution: 'success',
    error: 'danger',
    decision: 'primary',
    note: 'default',
    preference: 'warning',
    habit: 'primary',
    context: 'default',
  };
  return colors[type] || 'default';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '活跃',
    resolved: '已解决',
    archived: '已归档',
  };
  return labels[status] || status;
}

function getStatusColor(status: string): 'success' | 'default' | 'warning' {
  const colors: Record<string, 'success' | 'default' | 'warning'> = {
    active: 'default',
    resolved: 'success',
    archived: 'warning',
  };
  return colors[status] || 'default';
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

function formatDateTime(timeStr: string): string {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function goBack() {
  router.back();
}

function toggleEdit() {
  if (isEditing.value) {
    initForm();
  }
  isEditing.value = !isEditing.value;
}

async function handleSave() {
  if (!memory.value) return;
  saving.value = true;
  try {
    const tags = formData.value.tagsInput.split(',').map(t => t.trim()).filter(t => t);
    const updateData: Record<string, unknown> = {
      content: formData.value.content,
      importance: formData.value.importance,
    };

    if (isGlobal.value) {
      await api.memory.updateGlobal(memory.value.id, updateData);
    } else {
      const currentTags = (memory.value as ProjectMemory).tags || [];
      await api.memory.updateProject(memory.value.id, {
        content: formData.value.content,
        status: formData.value.status,
        addTags: tags.filter((tag) => !currentTags.includes(tag)),
        removeTags: currentTags.filter((tag) => !tags.includes(tag)),
      });
    }

    isEditing.value = false;
    const id = route.params.id as string;
    const type = route.query.type as string;
    if (isGlobal.value) {
      memory.value = await api.memory.getGlobal(id);
    } else {
      const projectId = route.params.projectId as string;
      memory.value = await api.memory.getProject(projectId, id);
    }
  } catch (error) {
    console.error('Save failed:', error);
  } finally {
    saving.value = false;
  }
}

function handleDelete() {
  showConfirmDialog.value = true;
}

async function confirmDelete() {
  if (!memory.value) return;
  deleting.value = true;
  try {
    if (isGlobal.value) {
      await api.memory.deleteGlobal(memory.value.id);
    } else {
      await api.memory.deleteProject(memory.value.id);
    }
    router.back();
  } catch (error) {
    console.error('Delete failed:', error);
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.memory-detail {
  min-height: 100vh;
  background: #f5f6f8;
}

.detail-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px 60px;
}

.detail-header {
  position: sticky;
  top: 0;
  background: #f5f6f8;
  padding: 16px 0;
  z-index: 100;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.detail-content {
  background: #ffffff;
  border-radius: 12px;
  padding: 40px 50px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.article-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.article-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #666;
}

.article-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 20px;
  line-height: 1.4;
}

.article-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.article-importance,
.article-source {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #666;
}

.article-importance .label,
.article-source .label {
  font-weight: 500;
  color: #333;
}

.article-divider {
  height: 1px;
  background: #e5e5e5;
  margin: 24px 0;
}

.article-body {
  font-size: 16px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}

.article-footer {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px dashed #e5e5e5;
}

.resolved-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #00a870;
  font-size: 14px;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.confirm-content p {
  margin: 0 0 24px;
  color: #666;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.t-form-item {
  margin-bottom: 20px;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.edit-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.edit-form .form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-form .form-item label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.edit-form .t-select,
.edit-form .t-textarea,
.edit-form .t-input {
  width: 100%;
}
</style>
