import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  COLUMN_SETTINGS_STORAGE_PREFIX,
  useColumnSettings,
  type ColumnOption,
} from '@/composables/useColumnSettings'

/** 列配置单元测试：默认全显、持久化、固定列保护、新增列兼容。 */
const COLUMNS: ColumnOption[] = [
  { key: 'id', label: 'ID' },
  { key: 'username', label: '用户名' },
  { key: 'actions', label: '操作', fixed: true },
]

const storageKey = 'test-table'
const storagePath = COLUMN_SETTINGS_STORAGE_PREFIX + storageKey

describe('useColumnSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认全部显示', () => {
    const { hidden, isHidden } = useColumnSettings(storageKey, COLUMNS)

    expect(hidden.value).toEqual([])
    expect(isHidden('username')).toBe(false)
  })

  it('隐藏列写入 localStorage 并可恢复', async () => {
    const first = useColumnSettings(storageKey, COLUMNS)
    first.hidden.value = ['username']
    await nextTick()

    expect(JSON.parse(localStorage.getItem(storagePath) ?? '[]')).toEqual(['username'])

    const second = useColumnSettings(storageKey, COLUMNS)
    expect(second.isHidden('username')).toBe(true)
    expect(second.isHidden('id')).toBe(false)
  })

  it('固定列与历史脏数据不会被隐藏', () => {
    localStorage.setItem(storagePath, JSON.stringify(['actions', 'removedColumn', 123]))

    const { isHidden } = useColumnSettings(storageKey, COLUMNS)

    expect(isHidden('actions')).toBe(false)
    expect(isHidden('removedColumn')).toBe(false)
  })

  it('存储损坏时回退为全部显示', () => {
    localStorage.setItem(storagePath, '{not json')

    const { hidden } = useColumnSettings(storageKey, COLUMNS)

    expect(hidden.value).toEqual([])
  })

  it('新增列默认可见（隐藏集合只记录显式隐藏项）', async () => {
    const first = useColumnSettings(storageKey, COLUMNS)
    first.hidden.value = ['username']
    await nextTick()

    const extended: ColumnOption[] = [...COLUMNS, { key: 'email', label: '邮箱' }]
    const second = useColumnSettings(storageKey, extended)

    expect(second.isHidden('email')).toBe(false)
    expect(second.isHidden('username')).toBe(true)
  })

  it('全部显示与恢复默认都会清空隐藏项与存储', async () => {
    const { hidden, showAll, reset } = useColumnSettings(storageKey, COLUMNS)
    hidden.value = ['username']
    await nextTick()

    showAll()
    await nextTick()
    expect(hidden.value).toEqual([])
    expect(localStorage.getItem(storagePath)).toBeNull()

    hidden.value = ['id']
    await nextTick()
    reset()
    await nextTick()
    expect(hidden.value).toEqual([])
    expect(localStorage.getItem(storagePath)).toBeNull()
  })
})
