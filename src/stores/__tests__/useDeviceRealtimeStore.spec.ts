import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DeviceWsClientOptions } from '@/lib/ws/device-ws-client'
import { AUTH_STORAGE_KEYS } from '@/lib/auth-storage'

/**
 * 用假的 DeviceWsClient 替代真实 SockJS 连接：
 * - 只验证 Store 对推送消息的聚合与状态流转（连接由后端联调保证）；
 * - 避免单测里发起真实网络请求。
 */
const hoisted = vi.hoisted(() => ({
  options: null as DeviceWsClientOptions | null,
}))

vi.mock('@/lib/ws/device-ws-client', () => ({
  DeviceWsClient: class {
    constructor(options: DeviceWsClientOptions) {
      hoisted.options = options
    }
    connect() {
      hoisted.options?.onStatusChange?.('connected')
    }
    syncDevices() {
      /* no-op */
    }
    subscribeDevice() {
      /* no-op */
    }
    disconnect() {
      /* no-op */
    }
  },
}))

import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'

const MAC = 'B4BFE90CDBA1'

describe('设备实时状态 Store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    hoisted.options = null
    vi.stubEnv('VITE_WS_URL', '/ws')
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'mock-token')
  })

  it('未配置 WS 地址时优雅降级为 disabled', () => {
    vi.stubEnv('VITE_WS_URL', '')
    const store = useDeviceRealtimeStore()

    store.connect()

    expect(hoisted.options).toBeNull()
    expect(store.connectionStatus).toBe('disabled')
  })

  it('连接后 state 消息按 target + channel 覆盖', () => {
    const store = useDeviceRealtimeStore()
    store.connect()
    expect(store.connectionStatus).toBe('connected')

    hoisted.options?.onState?.(MAC, { target: 'led', channel: 1, state: 1 })
    hoisted.options?.onState?.(MAC, { target: 'led', channel: 1, state: 0 })
    hoisted.options?.onState?.(MAC, { target: 'mos', channel: 2, state: 1 })

    const states = store.getStates('B4:BF:E9:0C:DB:A1')
    expect(states).toHaveLength(2)
    expect(states[0]).toMatchObject({ target: 'led', channel: 1, state: 0 })
    expect(states[1]).toMatchObject({ target: 'mos', channel: 2, state: 1 })
    expect(store.lastMessageAt).not.toBeNull()
  })

  it('sensor 数组按设备保留最新值', () => {
    const store = useDeviceRealtimeStore()
    store.connect()

    hoisted.options?.onSensor?.(MAC, [
      { deviceId: MAC, sensorKey: 'temperature', sensorValue: 25.5, unit: '℃' },
    ])

    expect(store.getSensors(MAC)).toHaveLength(1)
    expect(store.getLatestSensor(MAC)).toMatchObject({ sensorKey: 'temperature', sensorValue: 25.5 })
  })

  it('alert 推送会记录并触发页面提示时间戳', () => {
    const store = useDeviceRealtimeStore()
    store.connect()

    hoisted.options?.onAlert?.(MAC, { deviceId: MAC, alertLevel: 2, message: '温度过高' })

    expect(store.getAlerts(MAC)).toHaveLength(1)
    expect(store.lastAlert?.message).toBe('温度过高')
    expect(store.lastAlertAt).toBeGreaterThan(0)
  })

  it('command_result 按 commandId 结算等待中的指令', async () => {
    const store = useDeviceRealtimeStore()
    store.connect()

    const pending = store.waitForCommandResult('cmd-1', { deviceId: MAC })
    hoisted.options?.onCommandResult?.(MAC, {
      commandId: 'cmd-1',
      deviceId: MAC,
      status: 2,
      statusText: '成功',
      success: true,
      responsePayload: { state: 1 },
    })

    const outcome = await pending
    expect(outcome.source).toBe('realtime')
    expect(outcome.result?.success).toBe(true)
    expect(store.lastCommandResult?.commandId).toBe('cmd-1')
    expect(store.lastCommandResultAt).toBeGreaterThan(0)
  })

  it('未匹配 commandId 的推送只更新最近结果，不影响其它等待', async () => {
    const store = useDeviceRealtimeStore()
    store.connect()

    const pending = store.waitForCommandResult('cmd-2', { deviceId: MAC })
    hoisted.options?.onCommandResult?.(MAC, {
      commandId: 'cmd-1',
      deviceId: MAC,
      status: 3,
      statusText: '失败',
      success: false,
    })

    expect(store.lastCommandResult?.commandId).toBe('cmd-1')

    hoisted.options?.onCommandResult?.(MAC, {
      commandId: 'cmd-2',
      deviceId: MAC,
      status: 2,
      statusText: '成功',
      success: true,
    })
    await expect(pending).resolves.toMatchObject({ source: 'realtime' })
  })

  it('未登录时不建立连接', () => {
    localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken)
    const store = useDeviceRealtimeStore()

    store.connect()

    expect(hoisted.options).toBeNull()
    expect(store.connectionStatus).toBe('idle')
  })
})
