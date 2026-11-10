import { ref, watch } from 'vue'

/**
 * ============================================================================
 * 表格列显隐（列配置）
 * ============================================================================
 * 设计要点：
 *   1. 持久化「隐藏列」而非「显示列」——后续版本新增列时默认可见，不会被旧配置吞掉；
 *   2. 固定列（操作列）即使被历史脏数据写入也会被强制显示，避免表格失去操作入口；
 *   3. 存储键按「页面 + 表格」维度隔离，同一页面多张表互不影响；
 *   4. 读取失败（隐私模式/脏数据）静默回退为全部显示，不影响页面渲染。
 * ============================================================================
 */
export interface ColumnOption {
  /** 与 el-table-column 一一对应的稳定标识 */
  key: string
  label: string
  /** 固定列：不可隐藏（如操作列） */
  fixed?: boolean
}

const STORAGE_PREFIX = 'iot:columns:'

function readHidden(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * @param storageKey 页面内唯一的表格标识，如 `admin-users`
 * @param columns 该表格全部可选列（含固定列）
 */
export function useColumnSettings(storageKey: string, columns: ColumnOption[]) {
  const selectableKeys = new Set(
    columns.filter((column) => !column.fixed).map((column) => column.key),
  )

  // 只保留「当前表格存在且可隐藏」的键，历史脏数据与固定列一律忽略。
  const hidden = ref<string[]>(readHidden(storageKey).filter((key) => selectableKeys.has(key)))

  watch(
    hidden,
    (value) => {
      try {
        const selectable = value.filter((key) => selectableKeys.has(key))
        if (selectable.length === 0) localStorage.removeItem(STORAGE_PREFIX + storageKey)
        else localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(selectable))
      } catch {
        // 存储不可用（隐私模式/配额满）时退化为仅当前会话生效
      }
    },
    { deep: true },
  )

  const isHidden = (key: string) => hidden.value.includes(key)

  /** 全部显示：仅清空隐藏集合，不影响其他表格的配置。 */
  const showAll = () => {
    hidden.value = []
  }

  /** 恢复默认：清空隐藏集合并移除本地存储键。 */
  const reset = () => {
    hidden.value = []
    try {
      localStorage.removeItem(STORAGE_PREFIX + storageKey)
    } catch {
      // 忽略存储异常
    }
  }

  return { hidden, isHidden, showAll, reset }
}

/** 测试与调试用：导出存储前缀，避免魔法字符串散落。 */
export const COLUMN_SETTINGS_STORAGE_PREFIX = STORAGE_PREFIX
