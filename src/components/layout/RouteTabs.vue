<template>
  <!--
    页签导航：已打开页面以标签形式排列在内容区顶部。
    - 点击标签切换页面，× 关闭；首页标签固定且不可关闭；
    - 右键标签弹出「关闭其他 / 关闭左侧 / 关闭右侧 / 全部关闭」；
    - 右侧「标签操作」按钮提供同一组操作，作用于当前激活标签，
      兼顾左键用户与不支持右键的场景（触屏/触控板）。
  -->
  <div ref="tabsRef" class="route-tabs">
    <el-scrollbar class="tabs-scroll">
      <div class="tabs-list">
        <div
          v-for="tab in tabs"
          :key="tab.path"
          class="tab-item"
          :class="{ active: tab.path === route.path }"
          role="tab"
          :aria-selected="tab.path === route.path"
          @click="goTo(tab)"
          @contextmenu.prevent="openMenu($event, tab)"
        >
          <el-icon v-if="tab.fixed" class="tab-icon"><Lock /></el-icon>
          <span class="tab-title">{{ tab.title }}</span>
          <el-icon v-if="!tab.fixed" class="tab-close" @click.stop="closeTab(tab)">
            <Close />
          </el-icon>
        </div>
      </div>
    </el-scrollbar>

    <!-- 常驻操作入口：左键点击展开当前页签可用的关闭操作 -->
    <div class="tabs-actions">
      <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
        <el-button link class="tabs-action-btn" title="标签操作" aria-label="标签操作">
          <el-icon :size="14"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="others" :disabled="!activeCanCloseOthers">
              关闭其他
            </el-dropdown-item>
            <el-dropdown-item command="left" :disabled="!activeCanCloseLeft">
              关闭左侧
            </el-dropdown-item>
            <el-dropdown-item command="right" :disabled="!activeCanCloseRight">
              关闭右侧
            </el-dropdown-item>
            <el-dropdown-item command="all" divided :disabled="!canCloseAll">
              全部关闭
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 右键菜单：挂到 body，避免被内容区 overflow 裁剪 -->
    <Teleport to="body">
      <ul
        v-if="menu.visible"
        class="tab-context-menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @contextmenu.prevent
      >
        <li :class="{ disabled: !menuCanCloseOthers }" @click="handleMenu('others')">关闭其他</li>
        <li :class="{ disabled: !menuCanCloseLeft }" @click="handleMenu('left')">关闭左侧</li>
        <li :class="{ disabled: !menuCanCloseRight }" @click="handleMenu('right')">关闭右侧</li>
        <li :class="{ disabled: !canCloseAll }" @click="handleMenu('all')">全部关闭</li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Close, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { HOME_TAB_PATH, useTabsStore, type TabItem } from '@/stores/useTabsStore'

/**
 * 页签导航组件。
 * 数据规则全部收敛在 useTabsStore，本组件只负责渲染、右键菜单与跳转决策：
 *   - 关闭当前激活标签时，优先激活右邻，其次左邻，最后首页；
 *   - 右键操作关闭了非目标标签时自动切到右键的标签，避免停留在空白页；
 *   - 标签按 sessionStorage 恢复，并对路由/权限做二次校验。
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const tabsStore = useTabsStore()

const tabs = computed(() => tabsStore.tabs)
const tabsRef = ref<HTMLElement | null>(null)

/** 当前路由若为业务页面则登记标签（登录/错误页等 public 路由不登记）。 */
const registerCurrentTab = () => {
  if (!route.meta.title || route.meta.public) return
  tabsStore.open({
    path: route.path,
    fullPath: route.fullPath,
    title: route.meta.title,
  })
}

/** 恢复的标签必须是「仍然存在且有权限」的路由，避免历史残留越权或 404。 */
const pruneInvalidTabs = () => {
  tabsStore.prune((path) => {
    const resolved = router.resolve(path)
    if (!resolved.matched.length || !resolved.meta.title) return false
    if (resolved.meta.roles && !resolved.meta.roles.some((role) => authStore.hasRole(role))) {
      return false
    }
    if (resolved.meta.permission && !authStore.hasPermission(resolved.meta.permission)) {
      return false
    }
    return true
  })
}

const goTo = (tab: TabItem) => {
  if (tab.path === route.path) return
  router.push(tab.fullPath)
}

const activate = (path: string) => {
  const tab = tabsStore.getTab(path)
  if (tab && tab.path !== route.path) router.push(tab.fullPath)
}

const closeTab = (tab: TabItem) => {
  if (tab.fixed) return

  const index = tabs.value.findIndex((item) => item.path === tab.path)
  const willSwitch = tab.path === route.path
  tabsStore.close(tab.path)

  if (!willSwitch) return
  const next = tabs.value[index] ?? tabs.value[index - 1] ?? tabs.value[0]
  if (next) router.push(next.fullPath)
}

// ==================== 关闭操作（右键菜单 + 右上角按钮共用） ====================
type MenuAction = 'others' | 'left' | 'right' | 'all'

const MENU_WIDTH = 132
const MENU_ITEM_HEIGHT = 32
const MENU_PADDING = 8

const menu = reactive({ visible: false, x: 0, y: 0, path: '' })

/** 判断某个标签位置上的操作是否可用：固定标签与边界情况返回 false。 */
const canCloseOthersAt = (path: string) =>
  tabs.value.some((tab) => !tab.fixed && tab.path !== path)
const canCloseLeftAt = (path: string) => {
  const index = tabs.value.findIndex((tab) => tab.path === path)
  return index > 0 && tabs.value.slice(0, index).some((tab) => !tab.fixed)
}
const canCloseRightAt = (path: string) => {
  const index = tabs.value.findIndex((tab) => tab.path === path)
  return index >= 0 && tabs.value.slice(index + 1).some((tab) => !tab.fixed)
}
const canCloseAll = computed(() => tabs.value.some((tab) => !tab.fixed))

// 右键菜单：以被右键的标签为目标
const menuCanCloseOthers = computed(() => canCloseOthersAt(menu.path))
const menuCanCloseLeft = computed(() => canCloseLeftAt(menu.path))
const menuCanCloseRight = computed(() => canCloseRightAt(menu.path))

// 右上角按钮：以当前激活标签为目标
const activeCanCloseOthers = computed(() => canCloseOthersAt(route.path))
const activeCanCloseLeft = computed(() => canCloseLeftAt(route.path))
const activeCanCloseRight = computed(() => canCloseRightAt(route.path))

const openMenu = (event: MouseEvent, tab: TabItem) => {
  const menuHeight = MENU_ITEM_HEIGHT * 4 + MENU_PADDING
  menu.path = tab.path
  menu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8))
  menu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  menu.visible = true
}

const closeMenu = () => {
  menu.visible = false
}

/**
 * 执行关闭操作。
 * @param action 操作类型
 * @param path 目标标签（右键菜单传被右键的标签，右上角按钮传当前激活标签）
 */
const executeAction = (action: MenuAction, path: string) => {
  if (!path) return

  // 当前激活标签不在保留范围内时，切到目标标签，避免停留在已关闭页面。
  const needSwitch = route.path !== path

  if (action === 'others') {
    if (!canCloseOthersAt(path)) return
    tabsStore.closeOthers(path)
    if (needSwitch) activate(path)
  } else if (action === 'left') {
    if (!canCloseLeftAt(path)) return
    tabsStore.closeLeft(path)
    if (needSwitch) activate(path)
  } else if (action === 'right') {
    if (!canCloseRightAt(path)) return
    tabsStore.closeRight(path)
    if (needSwitch) activate(path)
  } else {
    if (!canCloseAll.value) return
    tabsStore.closeAll()
    if (route.path !== HOME_TAB_PATH) router.push(HOME_TAB_PATH)
  }
}

const handleMenu = (action: MenuAction) => {
  executeAction(action, menu.path)
  closeMenu()
}

/** 右上角下拉菜单命令。 */
const handleCommand = (command: string) => {
  if (command === 'others' || command === 'left' || command === 'right' || command === 'all') {
    executeAction(command, route.path)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeMenu()
}

onMounted(() => {
  pruneInvalidTabs()
  registerCurrentTab()

  document.addEventListener('click', closeMenu)
  document.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
  document.removeEventListener('keydown', handleKeydown)
})

watch(
  () => route.fullPath,
  () => {
    registerCurrentTab()
    void nextTick(() => {
      const active = tabsRef.value?.querySelector('.tab-item.active')
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  },
  { immediate: true },
)
</script>

<style scoped>
.route-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e4e7ed;
  background-color: #fff;
}
.tabs-scroll {
  flex: 1;
  min-width: 0;
  height: 40px;
}
.tabs-actions {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  margin-left: 4px;
  border-left: 1px solid #e4e7ed;
}
.tabs-action-btn {
  padding: 0 4px;
  color: #909399;
}
.tabs-action-btn:hover {
  color: #409eff;
}
.tabs-list {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 40px;
  white-space: nowrap;
}
.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px 0 10px;
  font-size: 12px;
  color: #606266;
  background-color: #f4f4f5;
  border: 1px solid #e9e9eb;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
.tab-item:hover {
  color: #409eff;
  border-color: #c6e2ff;
}
.tab-item.active {
  color: #fff;
  background-color: #409eff;
  border-color: #409eff;
}
.tab-icon {
  font-size: 12px;
}
.tab-title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-close {
  font-size: 12px;
  border-radius: 50%;
  padding: 1px;
}
.tab-close:hover {
  background-color: rgba(0, 0, 0, 0.15);
  color: #fff;
}
.tab-context-menu {
  position: fixed;
  z-index: 3000;
  width: 132px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background-color: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: #606266;
}
.tab-context-menu li {
  height: 32px;
  line-height: 32px;
  padding: 0 16px;
  cursor: pointer;
}
.tab-context-menu li:hover {
  background-color: #ecf5ff;
  color: #409eff;
}
.tab-context-menu li.disabled {
  color: #c0c4cc;
  cursor: not-allowed;
  background-color: transparent;
}
</style>
