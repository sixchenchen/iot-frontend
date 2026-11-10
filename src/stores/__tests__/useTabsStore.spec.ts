import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { HOME_TAB_PATH, useTabsStore } from '@/stores/useTabsStore'

/** 构建一批业务标签，便于复用。 */
function openSampleTabs() {
  const store = useTabsStore()
  store.open({ path: '/device/mine', title: '我的设备' })
  store.open({ path: '/admin/dashboard', title: '数据概览' })
  store.open({ path: '/admin/alerts', title: '告警管理' })
  store.open({ path: '/ota/firmware', title: '固件管理' })
  return store
}

describe('页签 Store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('初始化即包含固定首页标签', () => {
    const store = useTabsStore()

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({ path: HOME_TAB_PATH, fixed: true })
    expect(store.closableTabs).toHaveLength(0)
  })

  it('同一路径重复打开只更新而不新增标签', () => {
    const store = openSampleTabs()
    store.open({ path: '/admin/alerts', fullPath: '/admin/alerts?status=1', title: '告警管理' })

    expect(store.tabs.filter((tab) => tab.path === '/admin/alerts')).toHaveLength(1)
    expect(store.getTab('/admin/alerts')?.fullPath).toBe('/admin/alerts?status=1')
    expect(store.tabs).toHaveLength(4)
  })

  it('首页标签不可关闭', () => {
    const store = openSampleTabs()
    store.close(HOME_TAB_PATH)

    expect(store.getTab(HOME_TAB_PATH)).toBeTruthy()
  })

  it('关闭其他：保留固定首页与目标标签', () => {
    const store = openSampleTabs()
    store.closeOthers('/admin/alerts')

    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH, '/admin/alerts'])
  })

  it('关闭左侧只移除目标左侧的可关闭标签', () => {
    const store = openSampleTabs()
    store.closeLeft('/ota/firmware')

    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH, '/ota/firmware'])
  })

  it('关闭右侧只移除目标右侧标签', () => {
    const store = openSampleTabs()
    store.closeRight('/device/mine')

    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH])
  })

  it('全部关闭仅保留固定首页', () => {
    const store = openSampleTabs()
    store.closeAll()

    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH])
    expect(store.tabs[0]?.fixed).toBe(true)
  })

  it('标签写入 sessionStorage 并可恢复', () => {
    openSampleTabs()

    setActivePinia(createPinia())
    const restored = useTabsStore()

    expect(restored.tabs.map((tab) => tab.title)).toEqual([
      '我的设备',
      '数据概览',
      '告警管理',
      '固件管理',
    ])
    expect(restored.tabs[0]?.fixed).toBe(true)
  })

  it('存储脏数据时回退为仅首页标签', () => {
    sessionStorage.setItem('iot:tabs', '{bad json')
    const store = useTabsStore()

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]?.path).toBe(HOME_TAB_PATH)
  })

  it('prune 剔除无权限或已下线页面，但保留固定首页', () => {
    const store = openSampleTabs()
    const changed = store.prune((path) => path === '/admin/alerts')

    expect(changed).toBe(true)
    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH, '/admin/alerts'])
  })

  it('reset 恢复到初始状态并清理会话存储', () => {
    const store = openSampleTabs()
    store.reset()

    expect(store.tabs.map((tab) => tab.path)).toEqual([HOME_TAB_PATH])
    expect(sessionStorage.getItem('iot:tabs')).toBeNull()
  })
})
