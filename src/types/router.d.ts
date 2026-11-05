import 'vue-router'

/**
 * ============================================================================
 * Vue Router 元信息类型扩展
 * ============================================================================
 * 作用：让 meta 字段在编译期受约束，拼写错误（如 met.permisson）会直接报 TS 错误，
 *      路由守卫与菜单生成也不需要再写 `as string[]` 之类的断言。
 *
 * 字段约定：
 *   - public     公开路由，守卫直接放行（登录页、403/404/500）
 *   - title      页面标题，同时用于 document.title 与侧边菜单文案
 *   - roles      角色白名单，命中任一即可访问（粗粒度）
 *   - permission 权限码，需与后端返回的 permissions 完全一致（细粒度）
 *   - icon       菜单图标组件（Element Plus 图标）
 *   - hidden     不在侧边菜单中展示（如详情页）
 * ============================================================================
 */
declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    title?: string
    roles?: string[]
    permission?: string
    icon?: import('vue').Component
    hidden?: boolean
  }
}
