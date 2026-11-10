import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * ============================================================================
 * 页签导航 Store（多标签 / 路由标签）
 * ============================================================================
 * 职责：维护「已打开页面」的标签集合，持久化到 sessionStorage，供布局组件渲染。
 *
 * 设计约定：
 *   1. 标签唯一键为 `route.path`（不含 query），避免同一页面因参数差异开成多个标签；
 *      跳转使用 `fullPath`，保证 query（如筛选条件）不丢失；
 *   2. 首页标签固定（fixed=true）不可关闭，关闭其他/左侧/右侧/全部都不会移除它；
 *   3. Store 只做数据与规则，不做路由跳转——由组件根据关闭结果决定跳哪个标签，
 *      这样规则可单测、跳转行为可随交互调整；
 *   4. 持久化仅保存必要字段，恢复时由布局侧做路由/权限校验（prune），
 *      避免历史标签越权或指向已下线页面。
 * ============================================================================
 */
export interface TabItem {
  /** 唯一键：route.path */
  path: string
  /** 实际跳转地址：route.fullPath（含 query） */
  fullPath: string
  title: string
  /** 固定标签不可关闭 */
  fixed: boolean
}

export const HOME_TAB_PATH = '/device/mine'
const HOME_TAB_TITLE = '我的设备'
/** sessionStorage：关闭浏览器即失效，符合「本次会话的页签」语义。 */
const STORAGE_KEY = 'iot:tabs'

function createHomeTab(): TabItem {
  return {
    path: HOME_TAB_PATH,
    fullPath: HOME_TAB_PATH,
    title: HOME_TAB_TITLE,
    fixed: true,
  }
}

/** 从会话存储恢复；脏数据一律丢弃，保证 store 初始化不会抛错。 */
function restoreTabs(): TabItem[] {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return [createHomeTab()]

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [createHomeTab()]

    const restored = parsed.filter((item): item is TabItem => {
      if (!item || typeof item !== 'object') return false
      const tab = item as Partial<TabItem>
      return typeof tab.path === 'string' && typeof tab.title === 'string'
    })

    const home = restored.find((tab) => tab.path === HOME_TAB_PATH)
    const others = restored.filter((tab) => tab.path !== HOME_TAB_PATH)
    return [{ ...createHomeTab(), title: home?.title || HOME_TAB_TITLE }, ...others]
  } catch {
    return [createHomeTab()]
  }
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>(restoreTabs())

  /** 可关闭标签（排除固定标签）。 */
  const closableTabs = computed(() => tabs.value.filter((tab) => !tab.fixed))

  const persist = () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.value))
  }

  const indexOf = (path: string) => tabs.value.findIndex((tab) => tab.path === path)

  /**
   * 打开（或复用）标签。
   * 同一 path 已存在时只更新标题与 fullPath，不新增标签。
   */
  const open = (input: { path: string; fullPath?: string; title: string }) => {
    if (!input.path || !input.title) return

    const target = tabs.value[indexOf(input.path)]
    if (target) {
      const fullPath = input.fullPath || input.path
      if (target.title !== input.title || target.fullPath !== fullPath) {
        target.title = input.title
        target.fullPath = fullPath
        persist()
      }
      return
    }

    tabs.value.push({
      path: input.path,
      fullPath: input.fullPath || input.path,
      title: input.title,
      fixed: false,
    })
    persist()
  }

  /** 关闭单个标签；固定标签忽略。 */
  const close = (path: string) => {
    const index = indexOf(path)
    if (index < 0) return
    const target = tabs.value[index]
    if (!target || target.fixed) return

    tabs.value.splice(index, 1)
    persist()
  }

  /** 关闭除指定标签外的所有可关闭标签（固定标签保留）。 */
  const closeOthers = (path: string) => {
    tabs.value = tabs.value.filter((tab) => tab.fixed || tab.path === path)
    persist()
  }

  const closeLeft = (path: string) => {
    const index = indexOf(path)
    if (index <= 0) return
    tabs.value = tabs.value.filter((tab, i) => tab.fixed || i >= index)
    persist()
  }

  const closeRight = (path: string) => {
    const index = indexOf(path)
    if (index < 0) return
    tabs.value = tabs.value.filter((tab, i) => tab.fixed || i <= index)
    persist()
  }

  /** 全部关闭，仅保留固定首页标签。 */
  const closeAll = () => {
    tabs.value = tabs.value.filter((tab) => tab.fixed)
    persist()
  }

  /**
   * 按外部校验规则剔除无效标签（路由已下线、无权限、已登出后残留等）。
   * @returns 是否发生了变更
   */
  const prune = (isValid: (path: string) => boolean): boolean => {
    const next = tabs.value.filter((tab) => tab.fixed || isValid(tab.path))
    if (next.length === tabs.value.length) return false

    tabs.value = next
    persist()
    return true
  }

  /** 退出登录时重置为初始状态。 */
  const reset = () => {
    tabs.value = [createHomeTab()]
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const getTab = (path: string) => tabs.value.find((tab) => tab.path === path)

  return {
    tabs,
    closableTabs,
    open,
    close,
    closeOthers,
    closeLeft,
    closeRight,
    closeAll,
    prune,
    reset,
    getTab,
  }
})
