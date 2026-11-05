/**
 * 实时数据的纯函数工具（无副作用，便于单测）。
 *
 * /state 主题是「增量」而不是设备完整状态，因此前端按 target + channel 维护
 * 最新值列表：同一路控制重复推送时覆盖，不同通道则追加。
 */

export interface RealtimeStateEntry {
  target: string
  channel: number | null
  state: number
  /** 收到消息的本地时间（毫秒），仅用于展示与排序。 */
  updatedAt: number
}

/** 生成状态条目的唯一键：channel 为 null 时归入整体状态。 */
export function stateEntryKey(target: string, channel: number | null): string {
  return `${target}:${channel ?? 'all'}`
}

/** 覆盖式更新：同 target + channel 只保留最新一条。 */
export function upsertStateEntry(
  list: RealtimeStateEntry[],
  next: RealtimeStateEntry,
): RealtimeStateEntry[] {
  const key = stateEntryKey(next.target, next.channel)
  const index = list.findIndex((item) => stateEntryKey(item.target, item.channel) === key)
  if (index === -1) return [...list, next]
  const copy = list.slice()
  copy[index] = next
  return copy
}

/** 追加并按上限裁剪（保留最新 max 条）。 */
export function appendCapped<T>(list: T[], item: T, max: number): T[] {
  return [...list, item].slice(-max)
}
