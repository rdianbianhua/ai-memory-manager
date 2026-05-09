<template>
  <div class="global-memories">
    <!-- Filter Bar -->
    <div class="filter-bar">
      <t-radio-group v-model="typeFilter" variant="default-filled">
        <t-radio-button value="all">全部</t-radio-button>
        <t-radio-button value="preference">偏好</t-radio-button>
        <t-radio-button value="habit">习惯</t-radio-button>
        <t-radio-button value="context">上下文</t-radio-button>
      </t-radio-group>

      <t-space>
        <t-button @click="loadData" :loading="loading">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
        <t-button theme="primary" @click="showAddDialog = true">
          <template #icon><t-icon name="add" /></template>
          添加全局记忆
        </t-button>
      </t-space>
    </div>

    <!-- Stats Summary -->
    <div class="stats-row">
      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon preference-icon">
            <t-icon name="star" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ globalStats.byType?.preference || 0 }}</div>
            <div class="stat-label">偏好</div>
          </div>
        </div>
      </t-card>
      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon habit-icon">
            <t-icon name="reload" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ globalStats.byType?.habit || 0 }}</div>
            <div class="stat-label">习惯</div>
          </div>
        </div>
      </t-card>
      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon context-icon">
            <t-icon name="file-text" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ globalStats.byType?.context || 0 }}</div>
            <div class="stat-label">上下文</div>
          </div>
        </div>
      </t-card>
      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon total-icon">
            <t-icon name="layers" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ globalStats.total || 0 }}</div>
            <div class="stat-label">总计</div>
          </div>
        </div>
      </t-card>
    </div>

    <!-- Memory List -->
    <div v-if="filteredMemories.length > 0" class="memory-list">
      <div v-for="memory in filteredMemories" :key="memory.id" class="memory-card" @click="viewDetail(memory)">
        <div class="card-top">
          <t-tag :type="getTypeColor(memory.memoryType)" size="medium">
            {{ getTypeLabel(memory.memoryType) }}
          </t-tag>
          <span class="memory-time">{{ formatTime(memory.createdAt) }}</span>
        </div>

        <div class="memory-content">{{ memory.content }}</div>

        <div class="card-footer">
          <div class="card-meta">
            <t-rate :value="memory.importance" :count="5" disabled />
            <span class="source">来源: {{ getSourceLabel(memory.source) }}</span>
          </div>
          <div class="card-actions" @click.stop>
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
    <t-empty v-if="filteredMemories.length === 0" description="暂无全局记忆" class="empty-state">
      <t-button theme="primary" @click="showAddDialog = true">添加第一条全局记忆</t-button>
    </t-empty>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <t-pagination 
        v-model="currentPage" 
        :total="totalCount" 
        :page-size="pageSize"
        @change="onPageChange"
      />
    </div>

    <!-- Add/Edit Dialog -->
    <t-dialog v-model:visible="showAddDialog" :header="editingMemory ? '编辑全局记忆' : '添加全局记忆'" width="600px">
      <div class="dialog-form">
        <div class="form-item">
          <label>记忆类型</label>
          <t-select v-model="formData.memoryType">
            <t-option value="preference" label="偏好" />
            <t-option value="habit" label="习惯" />
            <t-option value="context" label="上下文" />
          </t-select>
        </div>
        <div class="form-item">
          <label>内容</label>
          <t-textarea v-model="formData.content" placeholder="请输入记忆内容" :rows="4" />
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

    <!-- Confirm Dialog -->
    <t-dialog v-model:visible="showConfirmDialog" header="确认删除" width="400px">
      <p>确定要删除此全局记忆吗？此操作不可恢复。</p>
      <template #footer>
        <t-space>
          <t-button theme="primary" @click="confirmDelete">确定</t-button>
          <t-button @click="showConfirmDialog = false">取消</t-button>
        </t-space>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services';
import type { GlobalMemory, GlobalStats } from '../../shared/types';

const router = useRouter();

const memories = ref<GlobalMemory[]>([]);
const globalStats = ref<GlobalStats>({ total: 0, byType: { preference: 0, habit: 0, context: 0 } });
const typeFilter = ref('all');
const showAddDialog = ref(false);
const showConfirmDialog = ref(false);
const loading = ref(false);
const editingMemory = ref<GlobalMemory | null>(null);
const currentPage = ref(1);
const pageSize = ref(10);
const totalCount = ref(0);
const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value));

const formData = reactive({
  memoryType: 'preference' as 'preference' | 'habit' | 'context',
  content: '',
  importance: 3,
});

const filteredMemories = computed(() => {
  let filtered = memories.value;
  if (typeFilter.value !== 'all') {
    filtered = memories.value.filter((m) => m.memoryType === typeFilter.value);
  }
  totalCount.value = filtered.length;
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.slice(start, start + pageSize.value);
});

function onPageChange(pageInfo: { current: number }) {
  currentPage.value = pageInfo.current;
}

function getTypeColor(type: string): 'warning' | 'primary' | 'default' {
  switch (type) {
    case 'preference': return 'warning';
    case 'habit': return 'primary';
    case 'context': return 'default';
    default: return 'default';
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    preference: '偏好',
    habit: '习惯',
    context: '上下文',
  };
  return labels[type] || type;
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

async function loadData() {
  loading.value = true;
  try {
    memories.value = await api.memory.listGlobal() as GlobalMemory[];
    globalStats.value = await api.stats.getGlobal() as GlobalStats;
    currentPage.value = 1;
  } catch (error) {
    console.error('Failed to load data:', error);
  } finally {
    loading.value = false;
  }
}

function handleEdit(memory: GlobalMemory) {
  editingMemory.value = memory;
  formData.memoryType = memory.memoryType;
  formData.content = memory.content;
  formData.importance = memory.importance;
  showAddDialog.value = true;
}

function handleDelete(memory: GlobalMemory) {
  editingMemory.value = memory;
  showConfirmDialog.value = true;
}

function viewDetail(memory: GlobalMemory) {
  router.push({ name: 'global-memory-detail', params: { id: memory.id } });
}

async function confirmDelete() {
  if (!editingMemory.value) return;
  try {
    await api.memory.deleteGlobal(editingMemory.value.id);
    showConfirmDialog.value = false;
    await loadData();
  } catch (error) {
    console.error('Delete failed:', error);
  }
}

async function handleSubmit() {
  try {
    if (editingMemory.value) {
      await api.memory.updateGlobal(editingMemory.value.id, {
        content: formData.content,
        importance: formData.importance,
      });
    } else {
      await api.memory.addGlobal({
        content: formData.content,
        memoryType: formData.memoryType,
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
  formData.memoryType = 'preference';
  formData.content = '';
  formData.importance = 3;
}

onMounted(loadData);
</script>

<style scoped>
.global-memories {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.filter-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  flex-shrink: 0;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.preference-icon {
  color: #faad14;
  background: #fffbe6;
}

.habit-icon {
  color: #722ed1;
  background: #f3e8ff;
}

.context-icon {
  color: #0052d9;
  background: #e6f0ff;
}

.total-icon {
  color: #52c41a;
  background: #f6ffed;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #1d2129;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: #86909c;
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
  align-items: center;
  gap: 12px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.memory-time {
  font-size: 12px;
  color: #a8adb5;
  white-space: nowrap;
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

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
  flex-shrink: 0;
}

.source {
  font-size: 12px;
  color: #a8adb5;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
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
