import { useAuthStore } from '@/stores/useAuthStore'

/**
 * ============================================================================
 * 权限组合式函数（页面/组件内使用）
 * ============================================================================
 * 与 v-permission 指令的区别：
 *   - 指令用于模板中「元素级显隐」；
 *   - 本函数用于脚本中的条件判断（如按钮是否禁用、请求前预校验）。
 *
 * 语义：多个权限码之间为「任一满足」（any-of），与路由守卫保持一致。
 * ⚠️ 前端权限仅作展示控制，接口鉴权必须由后端完成。
 * ============================================================================
 */
export function usePermission() {
  const auth = useAuthStore()

  /** 未传权限码视为公开能力，直接通过。 */
  const can = (code?: string): boolean => !code || auth.hasPermission(code)

  /** 命中任意一个权限码即通过。 */
  const canAny = (codes?: string[]): boolean =>
    !codes || codes.length === 0 || codes.some((code) => auth.hasPermission(code))

  /** 必须同时拥有全部权限码（空数组按「无限制」处理，Array#every 天然满足）。 */
  const canAll = (codes?: string[]): boolean =>
    !codes || codes.every((code) => auth.hasPermission(code))

  return { can, canAny, canAll }
}
