import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * ============================================================================
 * 全局路由前置守卫（访问控制的第一道「展示层」关卡）
 * ============================================================================
 * 校验顺序：写入页面标题 → 公开路由放行 → 登录态/过期校验 → 角色校验 → 权限校验。
 *
 * ⚠️ 安全说明：
 *   这里的角色/权限来自 Pinia（最初从 localStorage 恢复），而 localStorage 可被
 *   任意修改，所以本守卫只能防止「误操作」，不能防止「恶意越权」。
 *   真正的访问控制必须由后端在每次接口请求时校验 token 权限。
 * ============================================================================
 */

const DEFAULT_APP_TITLE = 'IoT 设备管理平台'

/** 写入浏览器标签页标题；所有路由（含 404）都复用同一逻辑。 */
function applyDocumentTitle(title?: string): void {
  const suffix = import.meta.env.VITE_APP_TITLE || DEFAULT_APP_TITLE
  document.title = title ? `${title} - ${suffix}` : suffix
}

export function setupGuards(router: Router) {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    applyDocumentTitle(to.meta.title)

    // 1. 公开页面（登录页、403/404/500）直接放行。
    //    已登录用户访问登录页时回到默认首页，避免重复登录。
    if (to.meta.public) {
      if (to.name === 'Login' && auth.isSessionValid()) {
        return { name: 'MyDevices' }
      }
      return true
    }

    // 2. 登录态校验：不仅判断是否有 token，还要判断是否已过期。
    //    过期时清理本地凭证（保留「记住我」的用户名），再跳登录页并记录回跳地址。
    if (!auth.isSessionValid()) {
      if (auth.token) auth.reset()
      return { name: 'Login', query: { redirect: to.fullPath } }
    }

    // 3. 角色校验：meta.roles 中任一角色命中即通过。
    const roles = to.meta.roles
    if (roles && !roles.some((role) => auth.hasRole(role))) {
      return { name: 'Forbidden' }
    }

    // 4. 权限码校验：用于比角色更细的控制（如 device:manage）。
    //    按钮级控制请配合 v-permission 指令使用。
    const permission = to.meta.permission
    if (permission && !auth.hasPermission(permission)) {
      return { name: 'Forbidden' }
    }
    return true
  })
}
