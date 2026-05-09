<template>
  <div class="brain-page">
    <div class="brain-header">
      <div>
        <h1>AI 大脑</h1>
        <p>把全局用户画像和项目级记忆压缩成 AI 可快速接手的上下文。</p>
      </div>
      <t-space>
        <t-button variant="outline" :loading="loading" @click="loadOverview">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
        <t-button variant="outline" :loading="savingSnapshot" :disabled="!overview" @click="saveSnapshots">
          <template #icon><t-icon name="save" /></template>
          保存快照
        </t-button>
        <t-button
          variant="outline"
          :loading="profileCandidateLoading"
          :disabled="!overview"
          @click="createProfileCandidates"
        >
          <template #icon><t-icon name="user-add" /></template>
          生成画像候选
        </t-button>
        <t-button theme="primary" :disabled="!overview" @click="copyStartupContext">
          <template #icon><t-icon name="copy" /></template>
          复制启动上下文
        </t-button>
      </t-space>
    </div>

    <t-loading v-if="loading && !overview" text="正在整理 AI 大脑..." />

    <template v-else-if="overview">
      <div class="metric-grid">
        <t-card class="metric-card">
          <span class="metric-label">全局画像</span>
          <strong>{{ globalMemoryCount }}</strong>
          <span class="metric-note">偏好 / 习惯 / 上下文</span>
        </t-card>
        <t-card class="metric-card">
          <span class="metric-label">项目画像</span>
          <strong>{{ overview.projects.length }}</strong>
          <span class="metric-note">最近访问优先</span>
        </t-card>
        <t-card class="metric-card">
          <span class="metric-label">活跃问题</span>
          <strong>{{ overview.activeProblemsTotal }}</strong>
          <span class="metric-note">需要后续收敛</span>
        </t-card>
        <t-card class="metric-card">
          <span class="metric-label">近期决策</span>
          <strong>{{ overview.recentDecisionsTotal }}</strong>
          <span class="metric-note">防止重复讨论</span>
        </t-card>
      </div>

      <div v-if="overview.staleSignals.length > 0" class="signal-list">
        <t-alert
          v-for="signal in overview.staleSignals"
          :key="signal"
          theme="warning"
          :message="signal"
          :close-btn="true"
        />
      </div>

      <t-card title="接手质量" class="handoff-quality-card">
        <div class="quality-summary">
          <div>
            <strong>{{ handoffQualityScore }}</strong>
            <span>AI 接手评分</span>
          </div>
          <div>
            <strong>{{ confirmedMemoryTotal }}</strong>
            <span>已确认记忆</span>
          </div>
          <div>
            <strong>{{ pendingReviewItems.length }}</strong>
            <span>待确认候选</span>
          </div>
        </div>
        <div v-if="qualityGaps.length > 0" class="quality-gaps">
          <span v-for="gap in qualityGaps" :key="gap">{{ gap }}</span>
        </div>
      </t-card>

      <div class="brain-grid">
        <section class="brain-column">
          <t-card title="用户全局画像" class="panel-card">
            <div class="profile-block">
              <h3>偏好</h3>
              <p v-if="overview.userProfile.preferences.length === 0">暂无偏好记忆。</p>
              <ul v-else>
                <li v-for="item in overview.userProfile.preferences" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>
            <div class="profile-block">
              <h3>习惯</h3>
              <p v-if="overview.userProfile.habits.length === 0">暂无习惯记忆。</p>
              <ul v-else>
                <li v-for="item in overview.userProfile.habits" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>
            <div class="profile-block">
              <h3>长期上下文</h3>
              <p v-if="overview.userProfile.contexts.length === 0">暂无上下文记忆。</p>
              <ul v-else>
                <li v-for="item in overview.userProfile.contexts" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>
          </t-card>

          <t-card title="AI 启动上下文" class="panel-card">
            <pre class="startup-context">{{ overview.startupContext }}</pre>
          </t-card>

          <t-card title="历史快照" class="panel-card">
            <div class="snapshot-toolbar">
              <t-select v-model="snapshotTypeFilter" size="small" @change="loadSnapshots">
                <t-option value="all" label="全部类型" />
                <t-option value="user_profile" label="用户画像" />
                <t-option value="project_brief" label="项目画像" />
                <t-option value="ai_startup_context" label="启动上下文" />
              </t-select>
              <t-button size="small" variant="outline" :loading="snapshotLoading" @click="loadSnapshots">刷新</t-button>
            </div>

            <div v-if="snapshots.length === 0" class="snapshot-empty">暂无历史快照。</div>
            <div v-else class="snapshot-list">
              <button
                v-for="snapshot in snapshots"
                :key="snapshot.id"
                class="snapshot-item"
                :class="{ selected: selectedSnapshotIds.includes(snapshot.id) }"
                @click="toggleSnapshot(snapshot.id)"
              >
                <span>{{ getSnapshotTypeLabel(snapshot.snapshotType) }}</span>
                <strong>{{ formatTime(snapshot.generatedAt) }}</strong>
                <small>{{ snapshot.scope === 'global' ? '全局' : '项目' }} / {{ snapshot.sourceMemoryIds.length }} 个来源</small>
              </button>
            </div>

            <t-button
              class="compare-button"
              size="small"
              theme="primary"
              :disabled="selectedSnapshotIds.length !== 2"
              :loading="compareLoading"
              @click="compareSelectedSnapshots"
            >
              对比选中快照
            </t-button>
          </t-card>

        <t-card v-if="snapshotCompare" title="快照对比" class="panel-card">
            <div class="compare-summary">
              <span>新增 {{ snapshotCompare.addedLines.length }}</span>
              <span>移除 {{ snapshotCompare.removedLines.length }}</span>
              <span>不变 {{ snapshotCompare.unchangedLineCount }}</span>
            </div>
            <t-button
              class="review-generate-button"
              theme="primary"
              variant="outline"
              :disabled="snapshotCompare.addedLines.length === 0"
              :loading="reviewGenerateLoading"
              @click="createReviewItemsFromCompare"
            >
              生成待确认记忆
            </t-button>
            <div class="compare-grid">
              <div>
                <h3>新增内容</h3>
                <p v-if="snapshotCompare.addedLines.length === 0">无新增。</p>
                <ul v-else>
                  <li v-for="line in snapshotCompare.addedLines" :key="`add-${line}`">{{ line }}</li>
                </ul>
              </div>
              <div>
                <h3>移除内容</h3>
                <p v-if="snapshotCompare.removedLines.length === 0">无移除。</p>
                <ul v-else>
                  <li v-for="line in snapshotCompare.removedLines" :key="`remove-${line}`">{{ line }}</li>
                </ul>
              </div>
            </div>
          </t-card>

          <t-card title="待确认记忆" class="panel-card">
            <div class="review-toolbar">
              <span>{{ pendingReviewItems.length }} 条待确认</span>
              <t-button size="small" variant="outline" :loading="reviewLoading" @click="loadReviewQueue">刷新</t-button>
            </div>

            <div v-if="pendingReviewItems.length === 0" class="review-empty">
              暂无待确认记忆。快照对比后的新增内容会先进入这里，确认后才写入长期记忆。
            </div>

            <div v-else class="review-list">
              <div v-for="item in pendingReviewItems" :key="item.id" class="review-item">
                <div class="review-item-main">
                  <div class="review-item-meta">
                    <t-tag size="small" variant="light">{{ item.scope === 'global' ? '全局' : '项目' }}</t-tag>
                    <t-tag size="small" theme="warning" variant="light">{{ getConfidenceLabel(item.confidence) }}</t-tag>
                    <span>{{ getReviewActionLabel(item.proposedAction) }} / {{ getMemoryTypeLabel(item.memoryType) }}</span>
                    <span>{{ getReviewSourceLabel(item.source) }}</span>
                  </div>
                  <t-textarea
                    v-model="reviewDrafts[item.id]"
                    class="review-editor"
                    :autosize="{ minRows: 2, maxRows: 5 }"
                  />
                  <div class="review-edit-row">
                    <t-select v-model="reviewConfidenceDrafts[item.id]" size="small">
                      <t-option value="low" label="低置信" />
                      <t-option value="medium" label="中置信" />
                      <t-option value="high" label="高置信" />
                    </t-select>
                    <t-button size="small" variant="outline" :loading="reviewActionId === item.id" @click="saveReviewDraft(item)">
                      保存改写
                    </t-button>
                  </div>
                  <small>证据：{{ item.evidenceRefs.join('，') }}</small>
                </div>
                <div class="review-item-actions">
                  <t-button size="small" theme="success" :loading="reviewActionId === item.id" @click="approveReviewItem(item.id)">
                    确认
                  </t-button>
                  <t-button size="small" variant="outline" :loading="reviewActionId === item.id" @click="rejectReviewItem(item.id)">
                    拒绝
                  </t-button>
                </div>
              </div>
            </div>
          </t-card>
        </section>

        <section class="project-column">
          <t-card v-for="brief in overview.projects" :key="brief.project.id" class="project-brief">
            <template #header>
              <div class="project-header">
                <div>
                  <strong>{{ brief.project.name }}</strong>
                  <span>{{ brief.project.path }}</span>
                </div>
                <t-tag theme="primary" variant="light">{{ brief.stats.total }} 条记忆</t-tag>
              </div>
            </template>

            <div class="brief-stats">
              <span>活跃 {{ brief.stats.byStatus.active }}</span>
              <span>已解决 {{ brief.stats.byStatus.resolved }}</span>
              <span>决策 {{ brief.stats.byType.decision }}</span>
              <span>问题 {{ brief.stats.byType.problem + brief.stats.byType.error }}</span>
            </div>

            <div class="brief-section" v-if="brief.recentDecisions.length > 0">
              <h3>最近决策</h3>
              <ul>
                <li v-for="item in brief.recentDecisions" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>

            <div class="brief-section" v-if="brief.activeProblems.length > 0">
              <h3>当前问题</h3>
              <ul>
                <li v-for="item in brief.activeProblems" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>

            <div class="brief-section" v-if="brief.recentNotes.length > 0">
              <h3>近期笔记</h3>
              <ul>
                <li v-for="item in brief.recentNotes" :key="item.id">{{ item.content }}</li>
              </ul>
            </div>

            <pre class="handoff-text">{{ brief.handoffText }}</pre>
          </t-card>

          <t-empty v-if="overview.projects.length === 0" description="暂无项目画像，先在项目列表中创建项目并记录记忆。" />
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { api } from '../services';
import type { BrainOverview, BrainSnapshot, BrainSnapshotCompare, MemoryConfidence, ReviewQueueAction, ReviewQueueItem } from '../../shared/types';

const overview = ref<BrainOverview | null>(null);
const loading = ref(false);
const savingSnapshot = ref(false);
const profileCandidateLoading = ref(false);
const snapshotLoading = ref(false);
const compareLoading = ref(false);
const reviewLoading = ref(false);
const reviewGenerateLoading = ref(false);
const reviewActionId = ref<string | null>(null);
const snapshots = ref<BrainSnapshot[]>([]);
const snapshotCompare = ref<BrainSnapshotCompare | null>(null);
const reviewItems = ref<ReviewQueueItem[]>([]);
const reviewDrafts = ref<Record<string, string>>({});
const reviewConfidenceDrafts = ref<Record<string, MemoryConfidence>>({});
const selectedSnapshotIds = ref<string[]>([]);
const snapshotTypeFilter = ref<'all' | BrainSnapshot['snapshotType']>('all');

const globalMemoryCount = computed(() => {
  if (!overview.value) return 0;
  return overview.value.userProfile.preferences.length
    + overview.value.userProfile.habits.length
    + overview.value.userProfile.contexts.length;
});

const confirmedMemoryTotal = computed(() => {
  if (!overview.value) return 0;
  return globalMemoryCount.value + overview.value.projects.reduce((sum, brief) => sum + brief.stats.total, 0);
});

const qualityGaps = computed(() => {
  if (!overview.value) return [];
  const gaps: string[] = [];
  if (globalMemoryCount.value === 0) gaps.push('缺少已确认的全局用户画像');
  if (overview.value.recentDecisionsTotal === 0) gaps.push('缺少已确认的近期决策');
  if (overview.value.activeProblemsTotal > 0) gaps.push('仍有活跃问题需要收敛');
  if (pendingReviewItems.value.length > 0) gaps.push('存在待确认候选记忆');
  return gaps;
});

const handoffQualityScore = computed(() => Math.max(0, 100 - qualityGaps.value.length * 15));

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await api.brain.overview(8);
    await loadSnapshots();
    await loadReviewQueue();
  } catch (error) {
    console.error('Failed to load AI brain:', error);
    MessagePlugin.error('加载 AI 大脑失败');
  } finally {
    loading.value = false;
  }
}

async function saveSnapshots() {
  savingSnapshot.value = true;
  try {
    const result = await api.brain.saveSnapshots(8);
    await loadOverview();
    MessagePlugin.success(`已保存 ${result.snapshots.length} 个快照`);
  } catch (error) {
    console.error('Failed to save brain snapshots:', error);
    MessagePlugin.error('保存快照失败');
  } finally {
    savingSnapshot.value = false;
  }
}

async function loadSnapshots() {
  snapshotLoading.value = true;
  try {
    snapshots.value = await api.brain.listSnapshots({
      limit: 20,
      snapshotType: snapshotTypeFilter.value === 'all' ? undefined : snapshotTypeFilter.value,
    });
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((id) => snapshots.value.some((snapshot) => snapshot.id === id));
  } catch (error) {
    console.error('Failed to load brain snapshots:', error);
  } finally {
    snapshotLoading.value = false;
  }
}

async function loadReviewQueue() {
  reviewLoading.value = true;
  try {
    reviewItems.value = await api.brain.listReviewQueue({ status: 'pending', limit: 50 });
    syncReviewDrafts();
  } catch (error) {
    console.error('Failed to load review queue:', error);
  } finally {
    reviewLoading.value = false;
  }
}

function syncReviewDrafts() {
  const nextDrafts: Record<string, string> = {};
  const nextConfidenceDrafts: Record<string, MemoryConfidence> = {};
  for (const item of reviewItems.value) {
    nextDrafts[item.id] = reviewDrafts.value[item.id] ?? item.content;
    nextConfidenceDrafts[item.id] = reviewConfidenceDrafts.value[item.id] ?? item.confidence;
  }
  reviewDrafts.value = nextDrafts;
  reviewConfidenceDrafts.value = nextConfidenceDrafts;
}

function toggleSnapshot(id: string) {
  snapshotCompare.value = null;
  if (selectedSnapshotIds.value.includes(id)) {
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((item) => item !== id);
    return;
  }
  selectedSnapshotIds.value = [...selectedSnapshotIds.value.slice(-1), id];
}

async function compareSelectedSnapshots() {
  if (selectedSnapshotIds.value.length !== 2) return;
  compareLoading.value = true;
  try {
    const [first, second] = selectedSnapshotIds.value;
    snapshotCompare.value = await api.brain.compareSnapshots(first, second);
  } catch (error) {
    console.error('Failed to compare brain snapshots:', error);
    MessagePlugin.error('快照对比失败');
  } finally {
    compareLoading.value = false;
  }
}

async function createReviewItemsFromCompare() {
  if (selectedSnapshotIds.value.length !== 2 || !snapshotCompare.value) return;
  reviewGenerateLoading.value = true;
  try {
    const [fromId, toId] = selectedSnapshotIds.value;
    const result = await api.brain.createReviewItemsFromSnapshotCompare(fromId, toId);
    await loadReviewQueue();
    MessagePlugin.success(`已生成 ${result.items.length} 条待确认记忆`);
  } catch (error) {
    console.error('Failed to create review items:', error);
    MessagePlugin.error('生成待确认记忆失败');
  } finally {
    reviewGenerateLoading.value = false;
  }
}

async function createProfileCandidates() {
  profileCandidateLoading.value = true;
  try {
    const result = await api.brain.createProfileCandidates(20);
    await Promise.all([loadReviewQueue(), loadOverview()]);
    if (result.items.length === 0) {
      MessagePlugin.info('没有发现新的全局画像候选');
    } else {
      MessagePlugin.success(`已生成 ${result.items.length} 条全局画像候选`);
    }
  } catch (error) {
    console.error('Failed to create profile candidates:', error);
    MessagePlugin.error('生成画像候选失败');
  } finally {
    profileCandidateLoading.value = false;
  }
}

async function approveReviewItem(id: string) {
  reviewActionId.value = id;
  try {
    await saveReviewDraftById(id, false);
    await api.brain.approveReviewItem(id);
    await Promise.all([loadReviewQueue(), loadOverview()]);
    MessagePlugin.success('已确认并写入长期记忆');
  } catch (error) {
    console.error('Failed to approve review item:', error);
    MessagePlugin.error('确认失败');
  } finally {
    reviewActionId.value = null;
  }
}

async function saveReviewDraft(item: ReviewQueueItem) {
  reviewActionId.value = item.id;
  try {
    await saveReviewDraftById(item.id, true);
  } catch (error) {
    console.error('Failed to save review draft:', error);
    MessagePlugin.error('保存改写失败');
  } finally {
    reviewActionId.value = null;
  }
}

async function saveReviewDraftById(id: string, showMessage: boolean) {
  const item = reviewItems.value.find((candidate) => candidate.id === id);
  if (!item) return;
  const content = (reviewDrafts.value[id] || '').trim();
  const confidence = reviewConfidenceDrafts.value[id] || item.confidence;
  if (!content) throw new Error('候选记忆不能为空');
  if (content === item.content && confidence === item.confidence) return;
  await api.brain.updateReviewItem(id, { content, confidence });
  await loadReviewQueue();
  if (showMessage) MessagePlugin.success('已保存改写');
}

async function rejectReviewItem(id: string) {
  reviewActionId.value = id;
  try {
    await api.brain.rejectReviewItem(id);
    await loadReviewQueue();
    MessagePlugin.success('已拒绝候选记忆');
  } catch (error) {
    console.error('Failed to reject review item:', error);
    MessagePlugin.error('拒绝失败');
  } finally {
    reviewActionId.value = null;
  }
}

const pendingReviewItems = computed(() => reviewItems.value.filter((item) => item.status === 'pending'));

async function copyStartupContext() {
  if (!overview.value) return;
  try {
    await navigator.clipboard.writeText(overview.value.startupContext);
    MessagePlugin.success('启动上下文已复制');
  } catch (error) {
    console.error('Failed to copy startup context:', error);
    MessagePlugin.error('复制失败');
  }
}

function getConfidenceLabel(confidence: MemoryConfidence): string {
  const labels: Record<MemoryConfidence, string> = {
    low: '低置信',
    medium: '中置信',
    high: '高置信',
  };
  return labels[confidence];
}

function getReviewActionLabel(action: ReviewQueueAction): string {
  const labels: Record<ReviewQueueAction, string> = {
    create: '新增',
    update: '更新',
    supersede: '替换',
  };
  return labels[action];
}

function getMemoryTypeLabel(type: ReviewQueueItem['memoryType']): string {
  const labels: Record<ReviewQueueItem['memoryType'], string> = {
    preference: '偏好',
    habit: '习惯',
    context: '上下文',
    problem: '问题',
    solution: '方案',
    error: '错误',
    decision: '决策',
    note: '笔记',
  };
  return labels[type];
}

function getReviewSourceLabel(source: ReviewQueueItem['source']): string {
  const labels: Record<ReviewQueueItem['source'], string> = {
    manual: '手动候选',
    snapshot_compare: '快照提取',
    profile_promotion: '项目提升',
  };
  return labels[source];
}

function getSnapshotTypeLabel(type: BrainSnapshot['snapshotType']): string {
  const labels: Record<BrainSnapshot['snapshotType'], string> = {
    user_profile: '用户画像',
    project_brief: '项目画像',
    ai_startup_context: '启动上下文',
  };
  return labels[type];
}

function formatTime(timeStr: string): string {
  return new Date(timeStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(loadOverview);
</script>

<style scoped>
.brain-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.brain-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.brain-header h1 {
  font-size: 22px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 6px;
}

.brain-header p {
  font-size: 13px;
  color: #646a73;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card :deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-label,
.metric-note {
  font-size: 12px;
  color: #86909c;
}

.metric-card strong {
  font-size: 28px;
  color: #1d2129;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.handoff-quality-card {
  border-radius: 6px;
}

.quality-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.quality-summary > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px;
}

.quality-summary strong {
  font-size: 24px;
  color: #1d2129;
}

.quality-summary span,
.quality-gaps span {
  font-size: 12px;
  color: #86909c;
}

.quality-gaps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.quality-gaps span {
  color: #ad5b00;
  background: #fff7e6;
  border-radius: 4px;
  padding: 4px 8px;
}

.brain-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.4fr);
  gap: 16px;
  align-items: start;
}

.brain-column,
.project-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card,
.project-brief {
  border-radius: 6px;
}

.profile-block + .profile-block {
  margin-top: 18px;
}

.profile-block h3,
.brief-section h3 {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
}

.profile-block p {
  font-size: 13px;
  color: #86909c;
}

ul {
  padding-left: 18px;
  margin: 0;
}

li {
  font-size: 13px;
  color: #3d3d3d;
  line-height: 1.7;
  margin-bottom: 6px;
}

.startup-context,
.handoff-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #1d2129;
  background: #f5f7fa;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 12px;
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.project-header div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.project-header strong {
  font-size: 15px;
  color: #1d2129;
}

.project-header span {
  font-size: 12px;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brief-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.brief-stats span {
  font-size: 12px;
  color: #4e5969;
  background: #f2f3f5;
  padding: 4px 8px;
  border-radius: 4px;
}

.brief-section {
  margin-bottom: 14px;
}

.snapshot-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.snapshot-toolbar .t-select {
  flex: 1;
}

.snapshot-empty {
  font-size: 13px;
  color: #86909c;
  padding: 8px 0;
}

.snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.snapshot-item {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 4px 10px;
  text-align: left;
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 6px;
  padding: 9px 10px;
  cursor: pointer;
}

.snapshot-item:hover,
.snapshot-item.selected {
  border-color: #0052d9;
  background: #f2f6ff;
}

.snapshot-item span {
  font-size: 12px;
  color: #0052d9;
  grid-row: span 2;
}

.snapshot-item strong {
  font-size: 13px;
  color: #1d2129;
}

.snapshot-item small {
  font-size: 12px;
  color: #86909c;
}

.compare-button {
  width: 100%;
  margin-top: 12px;
}

.review-generate-button {
  width: 100%;
  margin-bottom: 12px;
}

.compare-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.compare-summary span {
  font-size: 12px;
  color: #4e5969;
  background: #f2f3f5;
  padding: 4px 8px;
  border-radius: 4px;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.compare-grid h3 {
  font-size: 13px;
  color: #1d2129;
  margin-bottom: 8px;
}

.compare-grid p {
  font-size: 13px;
  color: #86909c;
}

.review-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.review-toolbar span,
.review-empty {
  font-size: 13px;
  color: #86909c;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 10px;
  background: #fff;
}

.review-item-main {
  min-width: 0;
}

.review-item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.review-item-meta span {
  font-size: 12px;
  color: #86909c;
}

.review-editor {
  margin-bottom: 8px;
}

.review-edit-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.review-edit-row .t-select {
  width: 112px;
}

.review-item small {
  display: block;
  font-size: 12px;
  color: #86909c;
  word-break: break-word;
}

.review-item-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quality-summary {
    grid-template-columns: 1fr;
  }

  .brain-grid {
    grid-template-columns: 1fr;
  }

  .compare-grid {
    grid-template-columns: 1fr;
  }

  .review-item {
    flex-direction: column;
  }
}
</style>
