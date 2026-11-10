import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import {
  Bell,
  Grid,
  Key,
  Monitor,
  Odometer,
  Setting,
  Tickets,
  UploadFilled,
} from '@element-plus/icons-vue'

/**
 * ============================================================================
 * 侧边菜单生成器（路由即菜单 + 领域分组）
 * ============================================================================
 * 设计目标：
 *   1. 菜单只从路由表派生，禁止在布局组件里再维护一份硬编码菜单；
 *   2. 按业务领域分组（与后端数据库表族一一对应），后续新增页面只需在
 *      routes.ts 标注 meta.group / meta.order，无需改动布局组件。
 *
 * 分组划分依据（smart_device 库）：
 *   - 设备资产：device_info / device_group / device_binding / device_whitelist /
 *               device_mqtt_auth / device_slave_data
 *   - 指令控制：device_command / device_event_record
 *   - 监控告警：device_alert_record / device_sensor / device_sensor_record /
 *               device_sensor_threshold / device_heartbeat_record / device_state_record
 *   - 固件升级：device_firmware / device_ota_task
 *   - 权限中心：sys_user / sys_role / sys_permission（RBAC 三角）
 *   - 系统管理：sys_login_log / sys_dead_letter / sys_refresh_token
 *
 * 过滤规则与路由守卫保持一致：
 *   - meta.hidden          不展示；
 *   - meta.roles           「任一命中」才展示；
 *   - meta.permission      必须拥有该权限码才展示。
 *
 * 前端菜单过滤仅是体验层控制，后端必须对接口做鉴权。
 * ============================================================================
 */
export type MenuGroupKey =
  | 'overview'
  | 'device'
  | 'control'
  | 'monitor'
  | 'ota'
  | 'access'
  | 'system'

export interface MenuGroupMeta {
  key: MenuGroupKey
  title: string
  icon: Component
  /** 越小越靠前，留出 10 的步长便于插入新分组。 */
  order: number
}

/** 领域分组注册表：新增领域时在此登记，再在路由 meta.group 引用即可。 */
export const MENU_GROUPS: Record<MenuGroupKey, MenuGroupMeta> = {
  overview: { key: 'overview', title: '运营总览', icon: Odometer, order: 10 },
  device: { key: 'device', title: '设备资产', icon: Monitor, order: 20 },
  control: { key: 'control', title: '指令控制', icon: Tickets, order: 30 },
  monitor: { key: 'monitor', title: '监控告警', icon: Bell, order: 40 },
  ota: { key: 'ota', title: '固件升级', icon: UploadFilled, order: 50 },
  access: { key: 'access', title: '权限中心', icon: Key, order: 80 },
  system: { key: 'system', title: '系统管理', icon: Setting, order: 90 },
}

/**
 * 兜底分组：路由漏标 meta.group 时仍会展示，避免「新增页面但菜单不出现」的隐蔽缺陷。
 * 这不属于正常路径，出现即说明路由配置需要补齐分组。
 */
const FALLBACK_GROUP = { key: 'other', title: '其他', icon: Grid, order: 999 } as const

export interface MenuItem {
  path: string
  title: string
  icon?: Component
  order: number
}

export interface MenuGroupNode {
  key: string
  title: string
  icon: Component
  children: MenuItem[]
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

/** 路由是否对当前用户可见（与路由守卫同源规则）。 */
function canAccess(
  meta: RouteRecordRaw['meta'],
  access: MenuAccessChecker,
): boolean {
  const roles = meta?.roles
  if (roles && !roles.some((role) => access.hasRole(role))) return false

  const permission = meta?.permission
  if (permission && !access.hasPermission(permission)) return false

  return true
}

interface GroupBucket {
  key: string
  title: string
  icon: Component
  order: number
  children: MenuItem[]
}

/**
 * 根据路由表生成当前用户可见的分组菜单。
 * @param routes 完整的静态路由表
 * @param access 角色/权限判断器（通常传入 authStore）
 */
export function buildMenus(
  routes: RouteRecordRaw[],
  access: MenuAccessChecker,
): MenuGroupNode[] {
  const layoutRoute = routes.find((route) => route.path === '/' && route.children?.length)
  if (!layoutRoute?.children) return []

  const buckets = new Map<string, GroupBucket>()

  layoutRoute.children
    .filter((child) => child.meta?.title && !child.meta.hidden)
    .filter((child) => canAccess(child.meta, access))
    .forEach((child) => {
      const groupKey = child.meta?.group
      const known =
        groupKey && groupKey in MENU_GROUPS
          ? MENU_GROUPS[groupKey as MenuGroupKey]
          : FALLBACK_GROUP

      let bucket = buckets.get(known.key)
      if (!bucket) {
        bucket = { key: known.key, title: known.title, icon: known.icon, order: known.order, children: [] }
        buckets.set(known.key, bucket)
      }

      bucket.children.push({
        path: resolvePath(layoutRoute.path, child.path),
        title: child.meta?.title ?? '',
        icon: child.meta?.icon,
        order: child.meta?.order ?? 0,
      })
    })

  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({
      key: bucket.key,
      title: bucket.title,
      icon: bucket.icon,
      children: bucket.children.sort((a, b) => a.order - b.order),
    }))
}
