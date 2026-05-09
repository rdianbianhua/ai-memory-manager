<template>
  <div class="operation-logs">
    <!-- Filter Bar -->
    <div class="filter-bar">
      <t-radio-group v-model="entityFilter" variant="default-filled">
        <t-radio-button value="all">全部</t-radio-button>
        <t-radio-button value="project">项目</t-radio-button>
        <t-radio-button value="global_memory">全局记忆</t-radio-button>
        <t-radio-button value="project_memory">项目记忆</t-radio-button>
      </t-radio-group>

      <t-button variant="outline" @click="loadLogs">
        <template #icon><t-icon name="refresh" /></template>
        刷新
      </t-button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon create-icon">
            <t-icon name="add-circle" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ actionStats.create || 0 }}</div>
            <div class="stat-label">创建</div>
          </div>
        </div>
      </t-card>

      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon update-icon">
            <t-icon name="edit" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ actionStats.update || 0 }}</div>
            <div class="stat-label">更新</div>
          </div>
        </div>
      </t-card>

      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon delete-icon">
            <t-icon name="remove-circle" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ actionStats.delete || 0 }}</div>
            <div class="stat-label">删除</div>
          </div>
        </div>
      </t-card>

      <t-card hoverable>
        <div class="stat-card">
          <div class="stat-icon total-icon">
            <t-icon name="layers" size="20px" />
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ logs.length }}</div>
            <div class="stat-label">当前显示</div>
          </div>
        </div>
      </t-card>
    </div>

    <!-- Logs List -->
    <t-card v-if="filteredLogs.length > 0" class="table-card">
      <t-table :data="filteredLogs" :columns="columns" row-key="id" hover stripe :pagination="pagination">
        <template #action="{ row }">
          <t-tag :type="getActionColor(row.action)" size="small">
            {{ getActionLabel(row.action) }}
          </t-tag>
        </template>
        <template #entityType="{ row }">
          {{ getEntityLabel(row.entityType) }}
        </template>
        <template #time="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </t-table>
    </t-card>

    <!-- Empty State -->
    <t-empty v-else description="暂无操作日志" class="empty-state">
      <t-button @click="loadLogs">刷新</t-button>
    </t-empty>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { api } from '../services';
import type { OperationLog } from '../../shared/types';

const logs = ref<OperationLog[]>([]);
const entityFilter = ref('all');

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
});

const columns = [
  { colKey: 'action', title: '操作', width: '100px' },
  { colKey: 'entityType', title: '类型', width: '120px' },
  { colKey: 'time', title: '时间', width: '180px' },
  { colKey: 'entityId', title: '实体ID', ellipsis: true },
];

const actionStats = computed(() => {
  const stats: Record<string, number> = {};
  for (const log of logs.value) {
    stats[log.action] = (stats[log.action] || 0) + 1;
  }
  return stats;
});

const filteredLogs = computed(() => {
  if (entityFilter.value === 'all') return logs.value;
  return logs.value.filter((l) => l.entityType === entityFilter.value);
});

function getActionColor(action: string): 'success' | 'warning' | 'danger' {
  switch (action) {
    case 'create': return 'success';
    case 'update': return 'warning';
    case 'delete': return 'danger';
    default: return 'warning';
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'create': return '创建';
    case 'update': return '更新';
    case 'delete': return '删除';
    default: return action;
  }
}

function getEntityLabel(entityType: string): string {
  switch (entityType) {
    case 'project': return '项目';
    case 'global_memory': return '全局记忆';
    case 'project_memory': return '项目记忆';
    default: return entityType;
  }
}

function formatDateTime(timeStr: string): string {
  return new Date(timeStr).toLocaleString('zh-CN');
}

async function loadLogs() {
  try {
    logs.value = await api.logs.getRecent(100) as OperationLog[];
    pagination.total = filteredLogs.value.length;
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

onMounted(loadLogs);
</script>

<style scoped>
.operation-logs {
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

.create-icon {
  color: #52c41a;
  background: #f6ffed;
}

.update-icon {
  color: #faad14;
  background: #fffbe6;
}

.delete-icon {
  color: #f5222d;
  background: #fff1f0;
}

.total-icon {
  color: #0052d9;
  background: #e6f0ff;
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

.table-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.table-card :deep(.t-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.table-card :deep(.t-table) {
  flex: 1;
  overflow: auto;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 80px 0;
}
</style>
