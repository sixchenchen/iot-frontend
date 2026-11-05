import { describe, expect, it } from 'vitest'
import {
  parseAlertPayload,
  parseCommandResultPayload,
  parseSensorPayload,
  parseStatePayload,
  unwrapEnvelope,
} from '@/lib/ws/device-ws-client'

/**
 * 后端真实推送使用 WebSocketMessageVO 信封：
 * { type, deviceId, timestamp, data }
 * 这些用例锁定「先拆信封、再按主题校验」的行为，防止文档与实现漂移再次引入回归。
 */
describe('device ws payload parsing', () => {
  it('拆掉后端信封，取出 data', () => {
    const envelope = {
      type: 'state',
      deviceId: 'B4BFE90CDBA1',
      timestamp: '2026-11-05T10:30:00',
      data: { target: 'led', channel: 1, state: 1 },
    }
    expect(unwrapEnvelope(envelope)).toEqual(envelope.data)
  })

  it('兼容直接推送业务体（无信封）', () => {
    const flat = { target: 'led', channel: null, state: 0 }
    expect(unwrapEnvelope(flat)).toEqual(flat)
  })

  it('解析 /state 信封消息', () => {
    const body = JSON.stringify({
      type: 'state',
      deviceId: 'B4BFE90CDBA1',
      timestamp: '2026-11-05T10:30:00',
      data: { target: 'relay', channel: null, state: 1 },
    })
    expect(parseStatePayload(body)).toEqual({ target: 'relay', channel: null, state: 1 })
  })

  it('缺少 target 或 state 非法的 /state 消息被丢弃', () => {
    expect(parseStatePayload(JSON.stringify({ data: { state: 1 } }))).toBeNull()
    expect(parseStatePayload(JSON.stringify({ data: { target: 'led', state: 'x' } }))).toBeNull()
    expect(parseStatePayload('not-json')).toBeNull()
  })

  it('解析 /sensor 信封消息并过滤脏数据', () => {
    const body = JSON.stringify({
      type: 'sensor',
      deviceId: 'B4BFE90CDBA1',
      timestamp: '2026-11-05T10:30:00',
      data: [
        { deviceId: 'B4BFE90CDBA1', sensorKey: 'temperature', sensorValue: 25.3, unit: '℃' },
        { deviceId: 'B4BFE90CDBA1', sensorKey: 'humidity', sensorValue: 'bad' },
      ],
    })
    const records = parseSensorPayload(body)
    expect(records).toHaveLength(1)
    expect(records?.[0]?.sensorKey).toBe('temperature')
  })

  it('空数组 / 非数组的 /sensor 消息被丢弃', () => {
    expect(parseSensorPayload(JSON.stringify({ type: 'sensor', data: [] }))).toBeNull()
    expect(parseSensorPayload(JSON.stringify({ type: 'sensor', data: {} }))).toBeNull()
  })

  it('解析 /alert 信封消息', () => {
    const body = JSON.stringify({
      type: 'alert',
      deviceId: 'B4BFE90CDBA1',
      timestamp: '2026-11-05T10:30:00',
      data: {
        deviceId: 'B4BFE90CDBA1',
        sensorKey: 'temp',
        alertLevel: 3,
        message: '数值 35.5 超过上限 30.0',
        value: 35.5,
        threshold: 30,
      },
    })
    const alert = parseAlertPayload(body)
    expect(alert?.sensorKey).toBe('temp')
    expect(alert?.alertLevel).toBe(3)
  })

  it('非法 /alert 消息被丢弃', () => {
    expect(parseAlertPayload(JSON.stringify({ data: { sensorKey: 'temp' } }))).toBeNull()
  })

  it('解析 /command 成功回执信封', () => {
    const body = JSON.stringify({
      type: 'command_result',
      deviceId: 'B4BFE90CDBA1',
      timestamp: '2026-11-05T13:47:34',
      data: {
        commandId: 'cmd-1',
        deviceId: 'B4BFE90CDBA1',
        action: 'set',
        target: 'mos',
        channel: 0,
        status: 2,
        statusText: '成功',
        success: true,
        errorMsg: null,
        responsePayload: { state: 1 },
        ackTime: '2026-11-05T13:47:34',
      },
    })

    const result = parseCommandResultPayload(body)
    expect(result).toMatchObject({
      commandId: 'cmd-1',
      status: 2,
      success: true,
      responsePayload: { state: 1 },
    })
  })

  it('解析 /command 失败回执（缺失设备字段时仍保留终态）', () => {
    const body = JSON.stringify({
      type: 'command_result',
      deviceId: 'B4BFE90CDBA1',
      data: { commandId: 'cmd-2', status: 3, statusText: '失败', success: false, errorMsg: '通道无响应' },
    })

    const result = parseCommandResultPayload(body)
    expect(result?.success).toBe(false)
    expect(result?.errorMsg).toBe('通道无响应')
    expect(result?.deviceId).toBeUndefined()
  })

  it('缺少 commandId 或 status 非法的 /command 消息被丢弃', () => {
    expect(parseCommandResultPayload(JSON.stringify({ data: { status: 2 } }))).toBeNull()
    expect(parseCommandResultPayload(JSON.stringify({ data: { commandId: 'c', status: 'x' } }))).toBeNull()
    expect(parseCommandResultPayload('not-json')).toBeNull()
  })
})
