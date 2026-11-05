import { describe, expect, it } from 'vitest'
import {
  ALERT_LEVEL_LABELS,
  ALERT_STATUS_LABELS,
  COMMAND_SOURCE_LABELS,
  COMMAND_STATUS_LABELS,
  COMMAND_STATUS_TAG_TYPES,
  DEAD_LETTER_STATUS_LABELS,
  FIRMWARE_STATUS_LABELS,
  labelOf,
} from '@/utils/status'

describe('业务状态映射', () => {
  it('指令状态 0~6 全部有文案，且标签色覆盖一致', () => {
    expect(Object.keys(COMMAND_STATUS_LABELS)).toHaveLength(7)
    expect(Object.keys(COMMAND_STATUS_LABELS)).toEqual(Object.keys(COMMAND_STATUS_TAG_TYPES))
    expect(COMMAND_STATUS_LABELS[3]).toBe('失败')
    expect(COMMAND_STATUS_LABELS[6]).toBe('设备已受理')
  })

  it('告警级别与状态文案符合文档第 7 章', () => {
    expect(ALERT_LEVEL_LABELS[3]).toBe('严重')
    expect(ALERT_STATUS_LABELS[0]).toBe('未处理')
    expect(ALERT_STATUS_LABELS[2]).toBe('已解决')
  })

  it('死信与固件状态文案', () => {
    expect(DEAD_LETTER_STATUS_LABELS[1]).toBe('已重放成功')
    expect(FIRMWARE_STATUS_LABELS[1]).toBe('启用')
    expect(FIRMWARE_STATUS_LABELS[0]).toBe('禁用')
  })

  it('指令来源未知值原样返回，缺失值展示占位符', () => {
    expect(COMMAND_SOURCE_LABELS.SCHEDULE).toBe('定时任务')
    expect(labelOf({} as Record<number, string>, 99)).toBe('99')
    expect(labelOf(COMMAND_STATUS_LABELS, null)).toBe('-')
    expect(labelOf(COMMAND_STATUS_LABELS, undefined)).toBe('-')
    expect(labelOf(COMMAND_STATUS_LABELS, 2)).toBe('成功')
  })
})
