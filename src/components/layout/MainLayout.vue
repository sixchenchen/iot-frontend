<template>
  <!--
    主布局：左侧菜单 + 顶部 Header + 右侧内容区。
    菜单由路由表动态生成（src/router/menu.ts），新增页面只需在 routes.ts 中
    配置 meta.title / icon / roles / permission，无需再改本组件。
  -->
  <el-container class="layout-container">
    <!-- 左侧菜单 -->
    <el-aside width="200px" class="aside">
      <div class="logo">IoT 平台</div>
      <el-menu
        :default-active="route.path"
        class="el-menu-vertical"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶部 Header -->
      <el-header class="header">
        <el-tooltip :content="healthTooltip" placement="bottom">
          <el-tag :type="healthTagType" size="small" effect="plain">{{ healthLabel }}</el-tag>
        </el-tooltip>
        <div class="user-info">
          <el-button link type="primary" @click="router.push({ name: 'UserCenter' })">
            个人中心
          </el-button>
          <span>欢迎您，{{ authStore.user?.nickname || authStore.user?.username }}</span>
          <el-button type="danger" link @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <!-- 右侧内容区 -->
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/useAuthStore'
import { commonApi } from '@/features/common/api/commonApi'
import { routes } from '@/router/routes'
import { buildMenus } from '@/router/menu'

/**
 * 布局组件：
 *  - 菜单：buildMenus 根据路由 meta 与当前用户权限过滤，避免硬编码与权限漏判；
 *  - default-active 绑定当前 path，保证刷新后高亮正确；
 *  - 退出登录二次确认，避免误触导致未保存内容丢失。
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const menus = computed(() => buildMenus(routes, authStore))

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
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  background-color: #2b3643;
}
.el-menu-vertical {
  border-right: none;
}
.header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
}
.main {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
