<template>
  <!--
    主布局：左侧分组菜单 + 顶部 Header + 右侧内容区。
    菜单由路由表动态生成（src/router/menu.ts），按 meta.group 归入物联网业务域，
    新增页面只需在 routes.ts 配置 meta.title / icon / roles / permission / group / order，
    无需再改本组件；侧边栏支持折叠为图标模式（状态持久化到 localStorage）。
  -->
  <el-container class="layout-container">
    <!-- 左侧菜单 -->
    <el-aside :width="asideWidth" class="aside">
      <div class="logo" :class="{ 'logo-collapsed': collapsed }">
        {{ collapsed ? 'IoT' : 'IoT 平台' }}
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="route.path"
          :default-openeds="openedGroups"
          :collapse="collapsed"
          :collapse-transition="false"
          unique-opened
          class="el-menu-vertical"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <template v-for="node in menuNodes" :key="node.key">
            <!-- 分组内只有一项时直接展示为一级菜单，避免无意义的二级折叠 -->
            <el-menu-item v-if="node.path" :index="node.path">
              <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
              <template #title>{{ node.title }}</template>
            </el-menu-item>
            <el-sub-menu v-else :index="node.key">
              <template #title>
                <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
                <span>{{ node.title }}</span>
              </template>
              <el-menu-item
                v-for="item in node.children ?? []"
                :key="item.path"
                :index="item.path"
              >
                <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
                <template #title>{{ item.title }}</template>
              </el-menu-item>
            </el-sub-menu>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <!-- 顶部 Header -->
      <el-header class="header">
        <div class="header-left">
          <el-button
            link
            class="collapse-btn"
            :title="collapsed ? '展开菜单' : '收起菜单'"
            @click="toggleSidebar"
          >
            <el-icon :size="18">
              <Expand v-if="collapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
          <el-tooltip :content="healthTooltip" placement="bottom">
            <el-tag :type="healthTagType" size="small" effect="plain">{{ healthLabel }}</el-tag>
          </el-tooltip>
        </div>
        <div class="user-info">
          <el-avatar :size="30" :src="authStore.user?.avatar || undefined" class="header-avatar">
            <el-icon :size="16"><UserFilled /></el-icon>
          </el-avatar>
          <el-button link type="primary" @click="router.push({ name: 'UserCenter' })">
            个人中心
          </el-button>
          <span>欢迎您，{{ authStore.user?.nickname || authStore.user?.username }}</span>
          <el-button type="danger" link @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <!-- 页签导航：多标签切换与关闭 -->
      <RouteTabs />

      <!-- 右侧内容区 -->
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Expand, Fold, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { commonApi } from '@/features/common/api/commonApi'
import { routes } from '@/router/routes'
import { buildMenus, type MenuItem } from '@/router/menu'
import { useTabsStore } from '@/stores/useTabsStore'
import RouteTabs from '@/components/layout/RouteTabs.vue'

/**
 * 布局组件：
 *  - 菜单：buildMenus 根据路由 meta（group/order/roles/permission）分组并过滤；
 *  - 分组内仅一项时降级为一级菜单，避免「只有一项还要点开」的冗余交互；
 *  - 折叠：侧边栏可收起为图标模式，状态写入 localStorage 保持一致体验；
 *  - 页签：内容区顶部展示已打开页面标签（RouteTabs），退出登录时清空；
 *  - default-active 绑定当前 path，保证刷新后高亮正确；
 *  - 退出登录二次确认，避免误触导致未保存内容丢失。
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const tabsStore = useTabsStore()

const menus = computed(() => buildMenus(routes, authStore))

/** 渲染节点：path 存在表示一级菜单，children 存在表示可折叠分组。 */
interface MenuNode {
  key: string
  title: string
  icon?: Component
  path?: string
  children?: MenuItem[]
}

const menuNodes = computed<MenuNode[]>(() =>
  menus.value.map((group) => {
    const first = group.children[0]
    if (group.children.length === 1 && first) {
      return {
        key: group.key,
        title: first.title,
        icon: first.icon ?? group.icon,
        path: first.path,
      }
    }
    return { key: group.key, title: group.title, icon: group.icon, children: group.children }
  }),
)

/** 默认展开当前页面所在分组，刷新后不会丢失位置。 */
const openedGroups = computed(() =>
  menus.value
    .filter((group) => group.children.some((child) => child.path === route.path))
    .map((group) => group.key),
)

// ==================== 侧边栏折叠 ====================
const SIDEBAR_STORAGE_KEY = 'iot:layout:aside-collapsed'
const collapsed = ref(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1')
const asideWidth = computed(() => (collapsed.value ? '64px' : '220px'))

const toggleSidebar = () => {
  collapsed.value = !collapsed.value
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed.value ? '1' : '0')
}

// ==================== 后端健康状态（GET /actuator/health） ====================
type HealthLevel = 'unknown' | 'up' | 'down'

const health = ref<HealthLevel>('unknown')
const healthLabel = computed(() => {
  if (health.value === 'up') return '服务正常'
  if (health.value === 'down') return '服务异常'
  return '检测中'
})
const healthTagType = computed(() => {
  if (health.value === 'up') return 'success'
  if (health.value === 'down') return 'danger'
  return 'info'
})
const healthTooltip = computed(() => {
  if (health.value === 'up') return '后端 /actuator/health 返回 UP'
  if (health.value === 'down') return '后端健康检查失败，请确认服务是否启动'
  return '正在检测后端服务状态'
})

let healthTimer: number | undefined

const checkHealth = async () => {
  try {
    const res = await commonApi.health()
    health.value = res.status === 'UP' ? 'up' : 'down'
  } catch {
    health.value = 'down'
  }
}

onMounted(() => {
  checkHealth()
  // 60 秒轮询一次，足够发现服务重启；健康检查本身不涉及业务数据。
  healthTimer = window.setInterval(checkHealth, 60_000)
})

onUnmounted(() => {
  if (healthTimer !== undefined) window.clearInterval(healthTimer)
})

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      center: true,
    })
  } catch {
    return // 用户取消
  }

  await authStore.logout()
  // 清空页签，避免下一个登录账号看到上个账号的页面标签。
  tabsStore.reset()
  ElMessage.success('已安全退出')
  await router.push('/login')
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.aside {
  background-color: #304156;
  color: white;
  transition: width 0.2s ease;
  overflow: hidden;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  background-color: #2b3643;
  white-space: nowrap;
  overflow: hidden;
}
.logo-collapsed {
  font-size: 16px;
}
.menu-scroll {
  height: calc(100vh - 60px);
}
.el-menu-vertical {
  border-right: none;
}
.el-menu-vertical:not(.el-menu--collapse) {
  width: 100%;
}
.header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.collapse-btn {
  padding: 4px;
  color: #606266;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
}
.header-avatar {
  flex-shrink: 0;
  background-color: #f0f2f5;
}
.main {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
