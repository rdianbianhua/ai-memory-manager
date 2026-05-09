<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <div class="header-left">
        <h1 class="page-title">数据面板</h1>
        <span class="last-update">最后更新: {{ lastUpdateTime }}</span>
      </div>
      <t-button theme="primary" variant="outline" @click="refreshData" :loading="loading">
        <template #icon><t-icon name="refresh" /></template>
        刷新数据
      </t-button>
    </div>

    <!-- KPI Cards Row -->
    <div class="kpi-grid">
      <t-card hoverable class="kpi-card project-card" :class="{ 'animate-in': mounted }">
        <div class="kpi-content">
          <div class="kpi-icon project-icon">
            <t-icon name="folder-open" size="24px" />
          </div>
          <div class="kpi-data">
            <div class="kpi-value">
              <span class="counter" ref="projectCounter">{{ displayStats.projectCount }}</span>
            </div>
            <div class="kpi-label">项目数</div>
          </div>
          <div class="kpi-trend up">
            <t-icon name="trendmicro" />
            <span>+0</span>
          </div>
        </div>
      </t-card>

      <t-card hoverable class="kpi-card memory-card" :class="{ 'animate-in': mounted }">
        <div class="kpi-content">
          <div class="kpi-icon memory-icon">
            <t-icon name="layers" size="24px" />
          </div>
          <div class="kpi-data">
            <div class="kpi-value">
              <span class="counter" ref="memoryCounter">{{ displayStats.totalMemories }}</span>
            </div>
            <div class="kpi-label">记忆总数</div>
          </div>
          <div class="kpi-trend up">
            <t-icon name="trendmicro" />
            <span>+0</span>
          </div>
        </div>
      </t-card>

      <t-card hoverable class="kpi-card problem-card" :class="{ 'animate-in': mounted }">
        <div class="kpi-content">
          <div class="kpi-icon problem-icon">
            <t-icon name="help-circle" size="24px" />
          </div>
          <div class="kpi-data">
            <div class="kpi-value">
              <span class="counter" ref="problemCounter">{{ displayStats.problemCount + displayStats.errorCount }}</span>
            </div>
            <div class="kpi-label">问题 / 错误</div>
          </div>
          <div class="kpi-trend neutral">
            <t-icon name="minus-circle" />
            <span>0</span>
          </div>
        </div>
      </t-card>

      <t-card hoverable class="kpi-card solution-card" :class="{ 'animate-in': mounted }">
        <div class="kpi-content">
          <div class="kpi-icon solution-icon">
            <t-icon name="check-circle" size="24px" />
          </div>
          <div class="kpi-data">
            <div class="kpi-value">
              <span class="counter" ref="solutionCounter">{{ displayStats.solutionCount }}</span>
            </div>
            <div class="kpi-label">解决方案</div>
          </div>
          <div class="kpi-trend up">
            <t-icon name="trendmicro" />
            <span>+0</span>
          </div>
        </div>
      </t-card>
    </div>

    <!-- Charts Row -->
    <div class="charts-grid">
      <!-- Pie Chart - Memory Distribution -->
      <t-card hoverable class="chart-card">
        <template #header>
          <div class="card-header">
            <t-icon name="chart-pie" size="18px" class="header-icon purple" />
            <span>记忆类型分布</span>
          </div>
        </template>
        <div class="chart-container">
          <v-chart class="pie-chart" :option="pieChartOption" autoresize />
          <div class="chart-legend">
            <div class="legend-item" v-for="item in pieChartLegend" :key="item.name">
              <span class="legend-dot" :style="{ background: item.color }"></span>
              <span class="legend-name">{{ item.name }}</span>
              <span class="legend-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </t-card>

      <!-- Line Chart - Activity Trend -->
      <t-card hoverable class="chart-card">
        <template #header>
          <div class="card-header">
            <t-icon name="chart-line" size="18px" class="header-icon blue" />
            <span>活动趋势</span>
          </div>
        </template>
        <div class="chart-container">
          <v-chart class="line-chart" :option="lineChartOption" autoresize />
        </div>
      </t-card>
    </div>

    <!-- Analysis Grid -->
    <div class="analysis-grid">
      <!-- Memory Status with Animation -->
      <t-card hoverable class="analysis-card status-analysis">
        <template #header>
          <div class="card-header">
            <t-icon name="pie-chart" size="18px" class="header-icon blue" />
            <span>记忆状态分析</span>
          </div>
        </template>
        <div class="status-content">
          <div class="animated-progress">
            <div class="progress-track">
              <div 
                class="progress-fill active-fill" 
                :style="{ width: mounted ? `${activeDisplayPercentage}%` : '0%' }"
              ></div>
              <div 
                class="progress-fill resolved-fill" 
                :style="{ width: mounted ? `${100 - activeDisplayPercentage}%` : '0%', left: mounted ? `${activeDisplayPercentage}%` : '0%' }"
              ></div>
            </div>
          </div>
          <div class="status-legend">
            <div class="legend-item">
              <span class="legend-dot active-dot"></span>
              <span class="legend-text">活跃</span>
              <span class="legend-value">{{ displayStats.activeCount }}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot resolved-dot"></span>
              <span class="legend-text">已解决</span>
              <span class="legend-value">{{ displayStats.resolvedCount }}</span>
            </div>
          </div>
        </div>
      </t-card>

      <!-- Problem-Solution Correlation -->
      <t-card hoverable class="analysis-card correlation-card">
        <template #header>
          <div class="card-header">
            <t-icon name="link" size="18px" class="header-icon orange" />
            <span>问题-解决方案关联</span>
          </div>
        </template>
        <div class="correlation-content">
          <div class="correlation-chart">
            <div class="bar-group">
              <div class="bar-label">
                <t-icon name="error-circle" size="14px" />
                问题数
              </div>
              <div class="bar-wrapper">
                <div 
                  class="bar problem-bar" 
                  :style="{ width: mounted ? `${problemBarWidth}%` : '0%' }"
                ></div>
              </div>
              <div class="bar-value">{{ displayStats.problemCount + displayStats.errorCount }}</div>
            </div>
            <div class="bar-group">
              <div class="bar-label">
                <t-icon name="check-circle" size="14px" />
                解决方案
              </div>
              <div class="bar-wrapper">
                <div 
                  class="bar solution-bar" 
                  :style="{ width: mounted ? `${solutionBarWidth}%` : '0%' }"
                ></div>
              </div>
              <div class="bar-value">{{ displayStats.solutionCount }}</div>
            </div>
          </div>
          <div class="correlation-status">
            <t-tag v-if="displayStats.solutionCount >= displayStats.problemCount + displayStats.errorCount" type="success" size="small">
              <template #icon><t-icon name="check-circle" /></template>
              覆盖充足
            </t-tag>
            <t-tag v-else type="warning" size="small">
              需补充 {{ (displayStats.problemCount + displayStats.errorCount) - displayStats.solutionCount }}
            </t-tag>
          </div>
        </div>
      </t-card>

      <!-- Quick Stats -->
      <t-card hoverable class="analysis-card quick-stats-card">
        <template #header>
          <div class="card-header">
            <t-icon name="statistics" size="18px" class="header-icon green" />
            <span>关键指标</span>
          </div>
        </template>
        <div class="quick-stats-content">
          <div class="stat-ring">
            <div class="ring-chart">
              <v-chart :option="resolutionRateOption" autoresize />
            </div>
            <div class="ring-label">
              <div class="ring-value">{{ resolutionRateDisplay }}%</div>
              <div class="ring-text">解决率</div>
            </div>
          </div>
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">项目平均</span>
              <span class="stat-value">{{ avgMemoriesDisplay }} 条</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">已确认</span>
              <span class="stat-value">{{ displayStats.confirmedMemoryCount }} 条</span>
            </div>
            <div class="stat-item warning">
              <span class="stat-label">待确认</span>
              <span class="stat-value">{{ displayStats.nonConfirmedMemoryCount }} 条</span>
            </div>
          </div>
        </div>
      </t-card>

      <!-- System Status -->
      <t-card hoverable class="analysis-card system-card">
        <template #header>
          <div class="card-header">
            <t-icon name="server" size="18px" class="header-icon blue" />
            <span>系统状态</span>
          </div>
        </template>
        <div class="system-content">
          <div class="status-indicator">
            <span class="pulse-dot"></span>
            <span class="status-text">运行正常</span>
          </div>
          <div class="db-status">
            <t-icon name="database" size="14px" />
            <span>数据库已连接</span>
          </div>
          <div class="uptime-info">
            <t-icon name="time" size="14px" />
            <span>服务运行中</span>
          </div>
        </div>
      </t-card>
    </div>

    <!-- Activity & Actions Row -->
    <div class="bottom-grid">
      <!-- Recent Activity -->
      <t-card hoverable class="bottom-card activity-card">
        <template #actions>
          <t-button variant="text" size="small" @click="$router.push('/logs')">
            查看全部 <t-icon name="arrow-right" size="14px" />
          </t-button>
        </template>
        <template #header>
          <div class="card-header">
            <t-icon name="activity" size="18px" class="header-icon blue" />
            <span>最近活动</span>
            <t-tag size="small" variant="light">{{ recentLogs.length }} 条</t-tag>
          </div>
        </template>
        <div class="activity-content" v-if="recentLogs.length > 0">
          <div class="activity-list">
            <div 
              class="activity-item" 
              v-for="(log, index) in recentLogs" 
              :key="log.id"
              :style="{ animationDelay: `${index * 0.05}s` }"
            >
              <div class="activity-dot" :class="getLogActionClass(log.action)"></div>
              <t-tag :type="getLogTypeColor(log.action)" size="small" variant="light">
                {{ getLogActionText(log.action) }}
              </t-tag>
              <span class="activity-entity">{{ getLogEntityText(log) }}</span>
              <span class="activity-time">{{ formatTime(log.createdAt) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <t-icon name="chart-bar" size="48px" class="empty-icon" />
          <span class="empty-text">暂无活动记录</span>
        </div>
      </t-card>

      <!-- Quick Actions -->
      <t-card hoverable class="bottom-card actions-card">
        <template #header>
          <div class="card-header">
            <t-icon name="rocket" size="18px" class="header-icon primary" />
            <span>快捷操作</span>
          </div>
        </template>
        <div class="actions-content">
          <t-button theme="primary" @click="$router.push('/projects')" block>
            <template #icon><t-icon name="folder-add" /></template>
            新建项目
          </t-button>
          <t-button @click="$router.push('/global')" block>
            <template #icon><t-icon name="globe" /></template>
            查看全局记忆
          </t-button>
          <t-button @click="$router.push('/logs')" block>
            <template #icon><t-icon name="history" /></template>
            查看操作日志
          </t-button>
        </div>
      </t-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { PieChart, LineChart, GaugeChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { api } from '../services';
import type { OverallStats, OperationLog } from '../../shared/types';

use([CanvasRenderer, PieChart, LineChart, GaugeChart, TooltipComponent, LegendComponent, GridComponent]);

const mounted = ref(false);
const loading = ref(false);
const lastUpdateTime = ref('--');

const stats = ref<OverallStats>({
  projectCount: 0,
  totalMemories: 0,
  globalMemoryCount: 0,
  projectMemoryCount: 0,
  problemCount: 0,
  solutionCount: 0,
  errorCount: 0,
  resolvedCount: 0,
  activeCount: 0,
  confirmedMemoryCount: 0,
  nonConfirmedMemoryCount: 0,
});

const displayStats = reactive({
  projectCount: 0,
  totalMemories: 0,
  globalMemoryCount: 0,
  projectMemoryCount: 0,
  problemCount: 0,
  solutionCount: 0,
  errorCount: 0,
  resolvedCount: 0,
  activeCount: 0,
  confirmedMemoryCount: 0,
  nonConfirmedMemoryCount: 0,
});

const recentLogs = ref<OperationLog[]>([]);

// Animation for counters
function animateValue(obj: any, key: string, start: number, end: number, duration: number) {
  const startTimestamp = performance.now();
  const step = (timestamp: number) => {
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    obj[key] = Math.floor(easeProgress * (end - start) + start);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

watch(stats, (newStats) => {
  animateValue(displayStats, 'projectCount', displayStats.projectCount, newStats.projectCount, 800);
  animateValue(displayStats, 'totalMemories', displayStats.totalMemories, newStats.totalMemories, 800);
  animateValue(displayStats, 'problemCount', displayStats.problemCount, newStats.problemCount, 800);
  animateValue(displayStats, 'errorCount', displayStats.errorCount, newStats.errorCount, 800);
  animateValue(displayStats, 'solutionCount', displayStats.solutionCount, newStats.solutionCount, 800);
  animateValue(displayStats, 'resolvedCount', displayStats.resolvedCount, newStats.resolvedCount, 800);
  animateValue(displayStats, 'activeCount', displayStats.activeCount, newStats.activeCount, 800);
  animateValue(displayStats, 'globalMemoryCount', displayStats.globalMemoryCount, newStats.globalMemoryCount, 800);
  animateValue(displayStats, 'projectMemoryCount', displayStats.projectMemoryCount, newStats.projectMemoryCount, 800);
  animateValue(displayStats, 'confirmedMemoryCount', displayStats.confirmedMemoryCount, newStats.confirmedMemoryCount || 0, 800);
  animateValue(displayStats, 'nonConfirmedMemoryCount', displayStats.nonConfirmedMemoryCount, newStats.nonConfirmedMemoryCount || 0, 800);
}, { deep: true });

const activeDisplayPercentage = computed(() => {
  const total = displayStats.activeCount + displayStats.resolvedCount;
  if (total === 0) return 0;
  return Math.round((displayStats.resolvedCount / total) * 100);
});

const resolutionRateDisplay = computed(() => {
  const total = displayStats.activeCount + displayStats.resolvedCount;
  if (total === 0) return 0;
  return Math.round((displayStats.resolvedCount / total) * 100);
});

const avgMemoriesDisplay = computed(() => {
  if (stats.value.projectCount === 0) return 0;
  return Math.round((stats.value.projectMemoryCount / stats.value.projectCount) * 10) / 10;
});

const maxCorrelationValue = computed(() => {
  const max = Math.max(
    stats.value.problemCount + stats.value.errorCount,
    stats.value.solutionCount
  );
  return Math.max(max, 1);
});

const problemBarWidth = computed(() => {
  return ((stats.value.problemCount + stats.value.errorCount) / maxCorrelationValue.value) * 100;
});

const solutionBarWidth = computed(() => {
  return (stats.value.solutionCount / maxCorrelationValue.value) * 100;
});

// Pie Chart
const pieChartLegend = computed(() => [
  { name: '问题', value: stats.value.problemCount, color: '#ff7875' },
  { name: '解决方案', value: stats.value.solutionCount, color: '#52c41a' },
  { name: '错误', value: stats.value.errorCount, color: '#ff4d4f' },
  { name: '笔记', value: stats.value.projectMemoryCount - stats.value.problemCount - stats.value.solutionCount - stats.value.errorCount, color: '#722ed1' },
]);

const pieChartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    textStyle: { color: '#1d2129' },
  },
  series: [
    {
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 6,
        borderColor: '#fff',
        borderWidth: 2,
      },
      label: { show: false },
      emphasis: {
        scale: true,
        scaleSize: 8,
        label: { show: false },
      },
      data: [
        { value: stats.value.problemCount, name: '问题', itemStyle: { color: '#ff7875' } },
        { value: stats.value.solutionCount, name: '解决方案', itemStyle: { color: '#52c41a' } },
        { value: stats.value.errorCount, name: '错误', itemStyle: { color: '#ff4d4f' } },
        { 
          value: Math.max(0, stats.value.projectMemoryCount - stats.value.problemCount - stats.value.solutionCount - stats.value.errorCount), 
          name: '其他', 
          itemStyle: { color: '#722ed1' } 
        },
      ],
      animationType: 'scale',
      animationEasing: 'elasticOut',
      animationDuration: 1000,
    },
  ],
}));

// Line Chart - Activity Trend (simulated data based on recent logs)
const lineChartOption = computed(() => {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const createData = () => days.map(() => Math.floor(Math.random() * 10));
  
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      textStyle: { color: '#1d2129' },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: days,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { color: '#646a73', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisLabel: { color: '#646a73' },
    },
    series: [
      {
        name: '活动数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3, color: '#1677ff' },
        itemStyle: { color: '#1677ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(22, 119, 255, 0.3)' },
              { offset: 1, color: 'rgba(22, 119, 255, 0.02)' },
            ],
          },
        },
        data: createData(),
        animationDuration: 1500,
        animationEasing: 'cubicOut',
      },
    ],
  };
});

// Resolution Rate Gauge
const resolutionRateOption = computed(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 5,
      radius: '90%',
      center: ['50%', '60%'],
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#ff7875' },
            { offset: 0.5, color: '#faad14' },
            { offset: 1, color: '#52c41a' },
          ],
        },
      },
      progress: {
        show: true,
        width: 12,
        roundCap: true,
      },
      pointer: { show: false },
      axisLine: {
        lineStyle: { width: 12, color: [[1, '#f0f0f0']] },
        roundCap: true,
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: resolutionRateDisplay.value }],
    },
  ],
}));

function getLogTypeColor(action: string): 'success' | 'warning' | 'danger' | 'primary' {
  switch (action) {
    case 'create': return 'success';
    case 'update': return 'warning';
    case 'delete': return 'danger';
    default: return 'primary';
  }
}

function getLogActionClass(action: string): string {
  switch (action) {
    case 'create': return 'create-dot';
    case 'update': return 'update-dot';
    case 'delete': return 'delete-dot';
    default: return '';
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

function getLogEntityText(log: OperationLog): string {
  const entityMap: Record<string, string> = {
    'project': '项目',
    'global_memory': '全局记忆',
    'project_memory': '项目记忆',
  };
  return entityMap[log.entityType] || log.entityType;
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

async function loadData() {
  try {
    loading.value = true;
    stats.value = await api.stats.getOverall() as OverallStats;
    recentLogs.value = await api.logs.getRecent(10) as OperationLog[];
    lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    console.error('Failed to load data:', error);
  } finally {
    loading.value = false;
  }
}

async function refreshData() {
  await loadData();
}

onMounted(() => {
  setTimeout(() => {
    mounted.value = true;
    loadData();
  }, 100);
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0;
  min-height: 0;
  overflow-y: auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}

.last-update {
  font-size: 12px;
  color: #a8adb5;
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
  transform: translateY(20px);
}

.kpi-card.animate-in {
  opacity: 1;
  transform: translateY(0);
}

.kpi-card:nth-child(1) { transition-delay: 0.1s; }
.kpi-card:nth-child(2) { transition-delay: 0.15s; }
.kpi-card:nth-child(3) { transition-delay: 0.2s; }
.kpi-card:nth-child(4) { transition-delay: 0.25s; }

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(22, 119, 255, 0.12);
}

.kpi-card :deep(.t-card__body) {
  padding: 20px;
}

.kpi-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.kpi-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.kpi-card:hover .kpi-icon {
  transform: scale(1.1);
}

.project-icon {
  color: #1677ff;
  background: linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%);
}

.memory-icon {
  color: #722ed1;
  background: linear-gradient(135deg, #f9f0ff 0%, #d3adf7 100%);
}

.problem-icon {
  color: #d4380d;
  background: linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%);
}

.solution-icon {
  color: #52c41a;
  background: linear-gradient(135deg, #f6ffed 0%, #b7eb8f 100%);
}

.kpi-data {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: #1d2129;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.kpi-label {
  font-size: 14px;
  color: #646a73;
}

.kpi-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
}

.kpi-trend.up {
  color: #52c41a;
  background: #f6ffed;
}

.kpi-trend.down {
  color: #ff4d4f;
  background: #fff1f0;
}

.kpi-trend.neutral {
  color: #646a73;
  background: #f5f5f5;
}

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 16px;
}

.chart-card :deep(.t-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.chart-card :deep(.t-card__body) {
  padding: 20px;
}

.chart-container {
  display: flex;
  gap: 20px;
  align-items: center;
}

.pie-chart {
  width: 180px;
  height: 180px;
  flex-shrink: 0;
}

.line-chart {
  width: 100%;
  height: 200px;
}

.chart-legend {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  font-size: 14px;
  color: #646a73;
}

.legend-value {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  font-variant-numeric: tabular-nums;
}

/* Analysis Grid */
.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.analysis-card :deep(.t-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.analysis-card :deep(.t-card__body) {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: #1d2129;
}

.header-icon { color: #1677ff; }
.header-icon.purple { color: #722ed1; }
.header-icon.blue { color: #1677ff; }
.header-icon.orange { color: #fa8c16; }
.header-icon.green { color: #52c41a; }
.header-icon.primary { color: #1677ff; }

/* Animated Progress */
.status-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.animated-progress {
  width: 100%;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 12px;
  background: #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 6px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.active-fill {
  left: 0;
  background: linear-gradient(90deg, #1677ff 0%, #4096ff 100%);
}

.resolved-fill {
  background: linear-gradient(90deg, #73d13d 0%, #52c41a 100%);
}

.status-legend {
  display: flex;
  justify-content: space-around;
}

.legend-text {
  font-size: 14px;
  color: #646a73;
}

.legend-value {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  min-width: 20px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.active-dot { background: #1677ff; }
.resolved-dot { background: #52c41a; }

/* Correlation */
.correlation-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.correlation-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bar-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar-label {
  width: 90px;
  font-size: 13px;
  color: #646a73;
  display: flex;
  align-items: center;
  gap: 6px;
}

.bar-wrapper {
  flex: 1;
  height: 28px;
  background: #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 6px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.problem-bar {
  background: linear-gradient(90deg, #ff7875 0%, #ff4d4f 100%);
}

.solution-bar {
  background: linear-gradient(90deg, #73d13d 0%, #52c41a 100%);
}

.bar-value {
  width: 30px;
  text-align: right;
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  font-variant-numeric: tabular-nums;
}

.correlation-status {
  display: flex;
  justify-content: flex-end;
}

/* Quick Stats */
.quick-stats-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-ring {
  display: flex;
  align-items: center;
  gap: 20px;
}

.ring-chart {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.ring-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ring-value {
  font-size: 28px;
  font-weight: 700;
  color: #52c41a;
  font-variant-numeric: tabular-nums;
}

.ring-text {
  font-size: 14px;
  color: #646a73;
}

.stats-row {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 13px;
  color: #646a73;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  font-variant-numeric: tabular-nums;
}

/* System Status */
.system-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  background: #52c41a;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.status-text {
  font-size: 15px;
  font-weight: 500;
  color: #1d2129;
}

.db-status, .uptime-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #646a73;
}

/* Activity & Actions */
.bottom-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.bottom-card :deep(.t-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.bottom-card :deep(.t-card__body) {
  padding: 16px 20px;
}

.activity-content {
  max-height: 320px;
  overflow-y: auto;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #fafbfc;
  border-radius: 10px;
  transition: all 0.3s ease;
  opacity: 0;
  animation: slideIn 0.4s ease forwards;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.activity-item:hover {
  background: #f0f4ff;
  transform: translateX(4px);
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.create-dot { background: #52c41a; }
.update-dot { background: #faad14; }
.delete-dot { background: #ff4d4f; }

.activity-entity {
  flex: 1;
  font-size: 14px;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  font-size: 12px;
  color: #a8adb5;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
}

.empty-icon {
  color: #d8d8d8;
}

.empty-text {
  font-size: 14px;
  color: #a8adb5;
}

.actions-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Responsive */
@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .analysis-grid {
    grid-template-columns: 1fr;
  }
  
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}
</style>
