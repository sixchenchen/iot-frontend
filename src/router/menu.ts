import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/**
 * ============================================================================
 * 侧边菜单生成器（路由即菜单）
 * ============================================================================
 * 设计目标：菜单只从路由表派生，禁止在布局组件里再维护一份硬编码菜单。
 * 过滤规则与路由守卫保持一致：
 *   - meta.hidden          不展示；
 *   - meta.roles           「任一命中」才展示；
 *   - meta.permission      必须拥有该权限码才展示。
 *
 * ⚠️ 前端菜单过滤仅是体验层控制，后端必须对接口做鉴权。
 * ============================================================================
 */
export interface MenuItem {
  path: string
  title: string
  icon?: Component
}

export interface MenuAccessChecker {
  hasRole: (role: string) => boolean
  hasPermission: (code: string) => boolean
}

/** 将父路径与子路径拼接为标准绝对路径。 */
function resolvePath(parent: string, child: string): string {
  if (child.startsWith('/')) return child
  return `${parent.replace(/\/$/, '')}/${child}`
}

/**
 * 根据路由表生成当前用户可见菜单。
 * @param routes 完整的静态路由表
 * @param access 角色/权限判断器（通常传入 authStore）
 */
export function buildMenus(routes: RouteRecordRaw[], access: MenuAccessChecker): MenuItem[] {
  const layoutRoute = routes.find((route) => route.path === '/' && route.children?.length)
  if (!layoutRoute?.children) return []

  return layoutRoute.children
    .filter((child) => child.meta?.title && !child.meta.hidden)
    .filter((child) => {
      const roles = child.meta?.roles
      if (roles && !roles.some((role) => access.hasRole(role))) return false

      const permission = child.meta?.permission
      if (permission && !access.hasPermission(permission)) return false

      return true
    })
    .map((child) => ({
      path: resolvePath(layoutRoute.path, child.path),
      title: child.meta?.title ?? '',
      icon: child.meta?.icon,
    }))
}
