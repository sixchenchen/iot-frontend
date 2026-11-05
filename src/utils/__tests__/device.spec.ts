import { describe, expect, it } from 'vitest'
import {
  OTA_STATE_LABELS,
  availableControlTargets,
  channelCountOf,
  defaultControlParams,
  formatBytes,
  formatDateTime,
  formatUptime,
  isDeviceOnline,
  isValidBindCode,
  isValidMac,
  normalizeMac,
  prettyJSON,
} from '@/utils/device'

describe('设备工具函数', () => {
  it('normalizeMac 去除分隔符并转大写', () => {
    expect(normalizeMac('b4:bf:e9:0c:db:a1')).toBe('B4BFE90CDBA1')
    expect(normalizeMac('B4-BF-E9-0C-DB-A1')).toBe('B4BFE90CDBA1')
  })

  it('isValidMac 仅接受 12 位十六进制', () => {
    expect(isValidMac('B4BFE90CDBA1')).toBe(true)
    expect(isValidMac('B4:BF:E9:0C:DB:A1')).toBe(true)
    expect(isValidMac('B4BFE90CDB')).toBe(false)
    expect(isValidMac('ZZZZZZZZZZZZ')).toBe(false)
  })

  it('isValidBindCode 只接受 6 位字母或数字', () => {
    expect(isValidBindCode('ABC123')).toBe(true)
    expect(isValidBindCode('123456')).toBe(true)
    expect(isValidBindCode('12345')).toBe(false)
    expect(isValidBindCode('ABC12!')).toBe(false)
  })

  it('formatBytes 输出人类可读大小', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(null)).toBe('-')
  })

  it('formatDateTime 兼容 ISO 时间', () => {
    expect(formatDateTime('2026-11-04T10:30:00')).toBe('2026-11-04 10:30:00')
    expect(formatDateTime('2026-11-04T10:30:00.123Z')).toBe('2026-11-04 10:30:00')
    expect(formatDateTime(null)).toBe('-')
  })

  it('availableControlTargets 按 capabilities 过滤，未知结构回退全量', () => {
    expect(availableControlTargets({ capabilities: { mos: true, led: false } })).toEqual(['mos'])
    expect(availableControlTargets({ capabilities: null })).toContain('servo')
    expect(availableControlTargets({ capabilities: { foo: true } })).toContain('led')
  })

  it('channelCountOf 读取 capabilities 通道数并提供保守默认值', () => {
    const row = { capabilities: { led: 3, mos: 8, relay: 1, servo: 2 } }
    expect(channelCountOf(row, 'led')).toBe(3)
    expect(channelCountOf(row, 'servo')).toBe(2)
    expect(channelCountOf({ capabilities: { mos: true } }, 'mos')).toBe(1)
    expect(channelCountOf({ capabilities: null }, 'mos')).toBe(8)
    expect(channelCountOf({ capabilities: null }, 'led')).toBe(1)
  })

  it('defaultControlParams 按目标生成默认参数', () => {
    expect(defaultControlParams('servo')).toEqual({ angle: 90 })
    expect(defaultControlParams('mos')).toEqual({ state: 1 })
    expect(defaultControlParams('config')).toEqual({})
  })

  it('isDeviceOnline 同时兼容 1/0 与 boolean（两端接口格式不同）', () => {
    expect(isDeviceOnline(1)).toBe(true)
    expect(isDeviceOnline(true)).toBe(true)
    expect(isDeviceOnline(0)).toBe(false)
    expect(isDeviceOnline(false)).toBe(false)
    expect(isDeviceOnline(null)).toBe(false)
    expect(isDeviceOnline(undefined)).toBe(false)
  })

  it('formatUptime 按天数/小时/分钟拆分，异常值回退占位符', () => {
    expect(formatUptime(30)).toBe('30 秒')
    expect(formatUptime(90)).toBe('1 分')
    expect(formatUptime(3600)).toBe('1 小时')
    expect(formatUptime(86_400 + 3600 + 60)).toBe('1 天 1 小时 1 分')
    expect(formatUptime(-1)).toBe('-')
    expect(formatUptime(null)).toBe('-')
    expect(formatUptime(Number.NaN)).toBe('-')
  })

  it('prettyJSON 美化输出并容忍空值', () => {
    expect(prettyJSON({ state: 1 })).toBe('{\n  "state": 1\n}')
    expect(prettyJSON(null)).toBe('暂无')
    expect(prettyJSON(undefined)).toBe('暂无')
  })

  it('OTA_STATE_LABELS 覆盖全部已知阶段', () => {
    expect(Object.keys(OTA_STATE_LABELS)).toEqual([
      'accepted',
      'downloading',
      'verifying',
      'flashing',
      'rebooting',
      'success',
      'failed',
    ])
    expect(OTA_STATE_LABELS.success).toBe('成功')
  })
})
