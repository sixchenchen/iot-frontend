import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMAND_RESULT_TIMEOUT_MS,
  CommandTracker,
  toCommandResult,
  type CommandPoller,
} from '@/lib/ws/command-tracker'
import type { DeviceCommand } from '@/types/command'

const MAC = 'B4BFE90CDBA1'

function createCommand(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    id: 1,
    commandId: 'cmd-1',
    deviceId: MAC,
    action: 'set',
    target: 'mos',
    channel: 0,
    params: null,
    status: 2,
    retryCount: 0,
    maxRetry: 3,
    errorMsg: null,
    responsePayload: '{"state":1}',
    operator: 'user',
    source: 'WEB',
    expireTime: null,
    sendTime: null,
    ackTime: null,
    createTime: null,
    updateTime: null,
    ...overrides,
  }
}

describe('指令执行结果追踪', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('收到 command_result 立即结算，并清理等待', async () => {
    const tracker = new CommandTracker()
    const pending = tracker.track('cmd-1', { deviceId: MAC })

    const handled = tracker.handleResult({
      commandId: 'cmd-1',
      deviceId: MAC,
      status: 2,
      statusText: '成功',
      success: true,
      responsePayload: { state: 1 },
    })

    expect(handled).toBe(true)
    await expect(pending).resolves.toMatchObject({
      source: 'realtime',
      result: { status: 2, success: true },
    })
    expect(tracker.size).toBe(0)
  })

  it('commandId 不匹配或设备不匹配时不结算', async () => {
    const tracker = new CommandTracker()
    const pending = tracker.track('cmd-1', { deviceId: MAC })

    expect(tracker.handleResult({ commandId: 'other', deviceId: MAC, status: 2 })).toBe(false)
    expect(
      tracker.handleResult({ commandId: 'cmd-1', deviceId: 'AAAAAAAAAAAA', status: 2 }),
    ).toBe(false)

    tracker.handleResult({ commandId: 'cmd-1', deviceId: MAC, status: 2, success: true })
    await expect(pending).resolves.toMatchObject({ source: 'realtime' })
  })

  it('超时后走接口轮询兜底（TIMEOUT 仅落库不推送）', async () => {
    const tracker = new CommandTracker({
      poll: () =>
        Promise.resolve(
          createCommand({ commandId: 'cmd-1', status: 4, errorMsg: '设备未响应' }),
        ),
    })
    const pending = tracker.track('cmd-1', { deviceId: MAC })

    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_TIMEOUT_MS)
    const outcome = await pending

    expect(outcome?.source).toBe('poll')
    expect(outcome?.result?.status).toBe(4)
    expect(outcome?.result?.success).toBe(false)
    expect(outcome?.errorMsg).toBe('设备未响应')
  })

  it('未显式传 poll 时使用构造注入的默认轮询', async () => {
    const poll = vi.fn<CommandPoller>(() => Promise.resolve(createCommand({ commandId: 'cmd-1' })))
    const tracker = new CommandTracker({ poll })
    const pending = tracker.track('cmd-1', { deviceId: MAC })

    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_TIMEOUT_MS)
    await expect(pending).resolves.toMatchObject({ source: 'poll' })
    expect(poll).toHaveBeenCalledWith('cmd-1')
  })

  it('无轮询能力时超时返回可展示的提示', async () => {
    const tracker = new CommandTracker({ poll: null })
    const pending = tracker.track('cmd-1')

    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_TIMEOUT_MS)
    await expect(pending).resolves.toMatchObject({ source: 'timeout', result: null })
  })

  it('轮询失败按超时处理，不向调用方抛异常', async () => {
    const tracker = new CommandTracker({
      poll: () => Promise.reject(new Error('network')),
    })
    const pending = tracker.track('cmd-1')

    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_TIMEOUT_MS)
    await expect(pending).resolves.toMatchObject({ source: 'timeout', result: null })
  })

  it('clear 立即结算未完成的等待', async () => {
    const tracker = new CommandTracker()
    const pending = tracker.track('cmd-1')

    tracker.clear('已登出')
    await expect(pending).resolves.toMatchObject({ source: 'timeout', errorMsg: '已登出' })
    expect(tracker.size).toBe(0)
  })

  it('toCommandResult 归一化轮询结果并安全解析 responsePayload', () => {
    const result = toCommandResult(
      createCommand({ status: 3, errorMsg: '通道无响应', responsePayload: 'not-json' }),
    )
    expect(result.statusText).toBe('失败')
    expect(result.success).toBe(false)
    expect(result.responsePayload).toBeNull()
    expect(result.errorMsg).toBe('通道无响应')
  })
})
