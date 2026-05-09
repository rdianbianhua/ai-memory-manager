<template>
  <div class="app-layout">
    <!-- Sider -->
    <aside class="app-sider">
      <div class="logo-area">
        <t-icon name="brain" size="28px" />
        <span class="logo-text">AI Memory</span>
      </div>
      <t-menu theme="light" :value="currentPath" @change="handleMenuChange">
        <t-menu-item value="/" name="dashboard">
          <template #icon><t-icon name="dashboard" /></template>
          数据面板
        </t-menu-item>
        <t-menu-item value="/brain" name="brain">
          <template #icon><t-icon name="brain" /></template>
          AI 大脑
        </t-menu-item>
        <t-menu-item value="/projects" name="projects">
          <template #icon><t-icon name="folder-open" /></template>
          项目列表
        </t-menu-item>
        <t-menu-item value="/global" name="global">
          <template #icon><t-icon name=" globe" /></template>
          公共记忆库
        </t-menu-item>
        <t-menu-item value="/logs" name="logs">
          <template #icon><t-icon name="history" /></template>
          操作日志
        </t-menu-item>
        <t-menu-item value="/mcp" name="mcp">
          <template #icon><t-icon name="setting" /></template>
          MCP 密钥
        </t-menu-item>
      </t-menu>
    </aside>

    <!-- Main -->
    <div class="app-main">
      <header class="app-header">
        <span class="header-title">{{ pageTitle }}</span>
        <div class="header-actions">
          <t-button size="small" @click="handleRefresh">
            <template #icon><t-icon name="refresh" /></template>
          </t-button>
        </div>
      </header>

      <div class="content-wrapper">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const currentPath = computed(() => route.path);

const pageTitleMap: Record<string, string> = {
  '/': '数据面板',
  '/brain': 'AI 大脑',
  '/projects': '项目列表',
  '/global': '公共记忆库',
  '/logs': '操作日志',
  '/mcp': 'MCP 密钥',
};

const pageTitle = computed(() => {
  if (route.path.startsWith('/projects/') && route.path !== '/projects') {
    return '项目详情';
  }
  return pageTitleMap[route.path] || 'AI Memory Manager';
});

function handleMenuChange(value: string) {
  router.push(value);
}

function handleRefresh() {
  window.location.reload();
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#app {
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* ── Layout Shell ── */
.app-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* ── Sider ── */
.app-sider {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e7e7e7;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  border-bottom: 1px solid #e7e7e7;
  flex-shrink: 0;
}

.logo-text {
  font-size: 17px;
  font-weight: 600;
  color: #0052d9;
}

.app-sider .t-menu {
  flex: 1;
  overflow-y: auto;
}

/* ── Main Area ── */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Header ── */
.app-header {
  height: 65px;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e7e7e7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Content ── */
.content-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  background: #f5f7fa;
}
</style>
