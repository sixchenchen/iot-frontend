import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { buildMenus, type MenuAccessChecker } from '@/router/menu'
import { routes } from '@/router/routes'

/**
 * 菜单分组单元测试：
 *   - 分组顺序、组内顺序稳定；
 *   - 角色/权限/hidden 过滤与路由守卫口径一致；
 *   - 漏标 group 时进入兜底分组而不是静默丢失。
 */
const allowAll: MenuAccessChecker = { hasRole: () => true, hasPermission: () => true }
const normalUser: MenuAccessChecker = {
  hasRole: (role) => role === 'USER',
  hasPermission: () => false,
}

describe('buildMenus', () => {
  it('ADMIN 菜单按业务域分组并按 order 排序', () => {
    const groups = buildMenus(routes, allowAll)

    expect(groups.map((group) => group.key)).toEqual([
      'overview',
      'device',
      'control',
      'monitor',
      'ota',
      'system',
    ])
    expect(groups.map((group) => group.title)).toEqual([
      '运营总览',
      '设备资产',
      '指令控制',
      '监控告警',
      '固件升级',
      '系统管理',
    ])
  })

  it('组内条目按 meta.order 排序', () => {
    const groups = buildMenus(routes, allowAll)
    const control = groups.find((group) => group.key === 'control')

    expect(control?.children.map((item) => item.title)).toEqual(['我的指令', '全局指令', '指令审计'])
    expect(control?.children.map((item) => item.path)).toEqual([
      '/commands',
      '/admin/commands',
      '/admin/audit-logs',
    ])
  })

  it('普通用户只看到无角色限制的自助页面', () => {
    const groups = buildMenus(routes, normalUser)
    const titles = groups.flatMap((group) => group.children.map((item) => item.title))

    expect(titles).toEqual(['我的设备', '我的指令', '我的告警', '升级记录', '个人中心'])
    expect(titles).not.toContain('设备管理')
  })

  it('hidden 路由（详情页）不进入菜单', () => {
    const groups = buildMenus(routes, allowAll)
    const paths = groups.flatMap((group) => group.children.map((item) => item.path))

    expect(paths).not.toContain('/device/:deviceId')
    expect(paths).not.toContain('/admin/devices/:id')
  })

  it('缺少 group 的路由落入兜底分组而不是丢失', () => {
    const custom: RouteRecordRaw[] = [
      {
        path: '/',
        component: { template: '<div />' },
        children: [
          { path: 'legacy', component: { template: '<div />' }, meta: { title: '遗留页面' } },
        ],
      },
    ]

    const groups = buildMenus(custom, allowAll)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: 'other', title: '其他' })
    expect(groups[0]?.children[0]?.path).toBe('/legacy')
  })

  it('菜单路由必须显式声明分组（配置完整性约束）', () => {
    const layout = routes.find((route) => route.path === '/')
    const menuRoutes = (layout?.children ?? []).filter(
      (child) => child.meta?.title && !child.meta.hidden,
    )

    expect(menuRoutes.length).toBeGreaterThan(0)
    menuRoutes.forEach((child) => {
      expect(child.meta?.group, `${String(child.name)} 缺少 meta.group`).toBeTruthy()
    })
  })
})
