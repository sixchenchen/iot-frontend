import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * ============================================================================
 * v-permission 指令（按钮级权限显隐）
 * ============================================================================
 * 用法：
 *   <el-button v-permission="'device:manage'">新增设备</el-button>
 *   <el-button v-permission="['device:manage', 'device:delete']">操作</el-button>
 *
 * 语义：字符串 → 必须拥有该权限码；数组 → 任一命中即可。
 *
 * 实现说明：
 *   - 用 display:none 而不是移除节点，权限在运行时变化（如 /auth/me 校准）
 *     时可以恢复；
 *   - 原始 display 存在 WeakMap，避免污染业务样式。
 *
 *    这只是「不展示」，不是「不能调用」。真正的鉴权必须在后端完成，
 *    前端不能把隐藏按钮当作安全措施。
 * ============================================================================
 */
const originalDisplayMap = new WeakMap<HTMLElement, string>() // key 是 DOM 元素，value 存这个元素**原本的 display 值**

function isAllowed(value: unknown): boolean {
  if (!value) return true
  const auth = useAuthStore()
  const codes = Array.isArray(value) ? value : [value]
  if (codes.length === 0) return true
  return codes.some((code) => typeof code === 'string' && auth.hasPermission(code))
}

function apply(el: HTMLElement, allowed: boolean): void {
  if (!originalDisplayMap.has(el)) {
    originalDisplayMap.set(el, el.style.display)
  }
  el.style.display = allowed ? (originalDisplayMap.get(el) ?? '') : 'none'
}

export const permissionDirective: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    apply(el, isAllowed(binding.value))
  },
  updated(el, binding) {
    apply(el, isAllowed(binding.value))
  },
}
