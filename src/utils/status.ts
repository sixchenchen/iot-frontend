/**
 * ============================================================================
 * 业务状态文案与标签色（唯一来源）
 * ============================================================================
 * 与《FRONTEND_API.md》第 7 章枚举保持一致：
 *   - 指令状态 0~6（6 为 ACCEPTED，属于进行中）
 *   - 告警级别 1~3、告警状态 0~2
 *   - 死信状态 0~2、固件状态 0/1
 *
 * 页面禁止再各自定义一套 label，避免同一状态在不同页面文案不一致。
 * 后端字典接口 /common/dictionaries 可作为运行时补充，但前端保留兜底文案，
 * 保证字典接口不可用时页面仍可读。
 * ============================================================================
 */

export type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

/** 指令状态文案。 */
export const COMMAND_STATUS_LABELS: Record<number, string> = {
  0: '待下发',
  1: '已下发',
  2: '成功',
  3: '失败',
  4: '超时',
  5: '已取消',
  6: '设备已受理',
}

/** 指令状态标签色。 */
export const COMMAND_STATUS_TAG_TYPES: Record<number, TagType> = {
  0: 'info',
  1: 'primary',
  2: 'success',
  3: 'danger',
  4: 'warning',
  5: 'info',
  6: 'warning',
}

/** 指令来源文案。 */
export const COMMAND_SOURCE_LABELS: Record<string, string> = {
  WEB: '网页端',
  API: '接口调用',
  SCHEDULE: '定时任务',
  SYSTEM: '系统触发',
}

/** 告警级别文案。 */
export const ALERT_LEVEL_LABELS: Record<number, string> = {
  1: '提示',
  2: '一般',
  3: '严重',
}

/** 告警级别标签色。 */
export const ALERT_LEVEL_TAG_TYPES: Record<number, TagType> = {
  1: 'info',
  2: 'warning',
  3: 'danger',
}

/** 告警状态文案。 */
export const ALERT_STATUS_LABELS: Record<number, string> = {
  0: '未处理',
  1: '已确认',
  2: '已解决',
}

/** 告警状态标签色。 */
export const ALERT_STATUS_TAG_TYPES: Record<number, TagType> = {
  0: 'warning',
  1: 'primary',
  2: 'success',
}

/** 死信状态文案。 */
export const DEAD_LETTER_STATUS_LABELS: Record<number, string> = {
  0: '未处理',
  1: '已重放成功',
  2: '已忽略',
}

/** 死信状态标签色。 */
export const DEAD_LETTER_STATUS_TAG_TYPES: Record<number, TagType> = {
  0: 'warning',
  1: 'success',
  2: 'info',
}

/** 固件状态文案（1 启用 / 0 禁用）。 */
export const FIRMWARE_STATUS_LABELS: Record<number, string> = {
  1: '启用',
  0: '禁用',
}

/** 固件状态标签色。 */
export const FIRMWARE_STATUS_TAG_TYPES: Record<number, TagType> = {
  1: 'success',
  0: 'info',
}

/** 通过状态映射取文案，未知值原样展示，避免出现空白。 */
export function labelOf(labels: Record<number, string>, value?: number | null): string {
  if (value === null || value === undefined) return '-'
  return labels[value] ?? String(value)
}
