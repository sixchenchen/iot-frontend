import type { DeviceCommand } from '@/types/command'
import type { DeviceCommandResult } from '@/types/ws'
import { normalizeMac } from '@/utils/device'
import { COMMAND_STATUS_LABELS } from '@/utils/status'

/**
 * ============================================================================
 * 指令执行结果追踪（文档 6.7 / 6.8）
 * ============================================================================
 * 背景：`POST /control` 的返回值只代表「已受理」，设备真正执行结果依赖 ACK。
 * 后端通过 `/topic/device/{mac}/command` 推送 `command_result`。
 *
 * 本模块职责：
 *   1. 按 `commandId` 建立一次性等待（唯一匹配键，避免多指令串台）；
 *   2. 收到 `command_result` 立即结算；
 *   3. 超时（默认 10s）后调用 `GET /user/commands/{commandId}` 轮询兜底；
 *   4. TIMEOUT(4) 仅落库不推送，因此必须依赖第 3 步，不能只等推送。
 *
 * 设计约束：
 *   - 与 Vue / Pinia 解耦，便于独立单测（假定时器即可覆盖）；
 *   - 结算后必须清理定时器与 Map 条目，避免内存泄漏；
 *   - 同一 commandId 只结算一次（推送与轮询竞态时先到先得）。
 * ============================================================================
 */

/** 等待设备回执的兜底超时（文档建议 10 秒）。 */
export const COMMAND_RESULT_TIMEOUT_MS = 10_000

/** 超时后的状态查询函数；返回 null 表示查不到该指令。 */
export type CommandPoller = (commandId: string) => Promise<DeviceCommand | null>

/** 追踪结果来源：实时推送 / 超时后接口兜底 / 彻底超时。 */
export type CommandExecutionSource = 'realtime' | 'poll' | 'timeout'

export interface CommandExecution {
  commandId: string
  source: CommandExecutionSource
  /** 实时推送或轮询归一化后的结果；完全无结果时为 null。 */
  result: DeviceCommandResult | null
  /** 失败原因或超时提示，可直接展示。 */
  errorMsg: string | null
}

export interface TrackCommandOptions {
  /** 可选：限定设备，防止 commandId 碰撞时误结算。 */
  deviceId?: string | null
  /**
   * 覆盖默认轮询实现：
   *   - 不传 → 使用构造函数注入的默认 poll（用户端 `GET /user/commands/{id}`）；
   *   - 传 null → 不做轮询（管理端没有对应查询接口，只能等推送）。
   */
  poll?: CommandPoller | null
}

interface PendingEntry {
  commandId: string
  deviceId: string | null
  poll: CommandPoller | null
  timer: ReturnType<typeof setTimeout>
  resolvers: Array<(execution: CommandExecution) => void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `DeviceCommand.responsePayload` 是后端序列化的 JSON 字符串，这里安全解析。 */
function parseResponsePayload(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 根据状态码推导 success（与 CommandResultVO 的语义保持一致）。 */
function deriveSuccess(status: number): boolean | null {
  if (status === 2) return true
  if (status === 3 || status === 4 || status === 5) return false
  return null
}

/** 把轮询拿到的 `DeviceCommand` 归一化成与推送一致的 `CommandResultVO`。 */
export function toCommandResult(command: DeviceCommand): DeviceCommandResult {
  const status = Number(command.status)
  return {
    commandId: command.commandId,
    deviceId: command.deviceId,
    action: command.action ?? null,
    target: command.target ?? null,
    channel: command.channel ?? null,
    status,
    statusText: COMMAND_STATUS_LABELS[status] ?? String(status),
    success: deriveSuccess(status),
    errorMsg: command.errorMsg ?? null,
    responsePayload: parseResponsePayload(command.responsePayload),
    ackTime: command.ackTime ?? null,
  }
}

export class CommandTracker {
  private readonly timeoutMs: number
  private readonly defaultPoll: CommandPoller | null
  private readonly pending = new Map<string, PendingEntry>()

  constructor(options: { timeoutMs?: number; poll?: CommandPoller | null } = {}) {
    this.timeoutMs = options.timeoutMs ?? COMMAND_RESULT_TIMEOUT_MS
    this.defaultPoll = options.poll ?? null
  }

  /**
   * 等待一条指令的最终结果。
   * 调用方应在 `POST /control` **之前** 完成设备订阅，避免极快 ACK 丢失。
   */
  track(commandId: string, options: TrackCommandOptions = {}): Promise<CommandExecution> {
    const id = commandId.trim()
    if (!id) {
      return Promise.resolve({
        commandId: '',
        source: 'timeout',
        result: null,
        errorMsg: '缺少 commandId，无法追踪执行结果',
      })
    }

    // 同一指令重复追踪：沿用第一次的等待，避免多个定时器竞争。
    const existing = this.pending.get(id)
    if (existing) {
      return new Promise((resolve) => existing.resolvers.push(resolve))
    }

    // undefined → 使用默认轮询；显式 null → 关闭轮询（管理端无按 ID 查询接口）。
    const poll = options.poll === undefined ? this.defaultPoll : options.poll
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        void this.settleByPolling(id, poll)
      }, this.timeoutMs)

      this.pending.set(id, {
        commandId: id,
        deviceId: options.deviceId ? normalizeMac(options.deviceId) : null,
        poll,
        timer,
        resolvers: [resolve],
      })
    })
  }

  /**
   * 处理 `command_result` 推送。
   * @returns true=命中并已结算；false=无等待者/设备不匹配。
   */
  handleResult(result: DeviceCommandResult): boolean {
    const commandId = typeof result.commandId === 'string' ? result.commandId.trim() : ''
    if (!commandId) return false

    const entry = this.pending.get(commandId)
    if (!entry) return false

    if (entry.deviceId && result.deviceId) {
      const mac = normalizeMac(result.deviceId)
      if (mac && mac !== entry.deviceId) return false
    }

    this.settle(entry, {
      commandId,
      source: 'realtime',
      result,
      errorMsg: result.errorMsg ?? null,
    })
    return true
  }

  /** 清空全部等待（登出/切换账号时调用），未完成的按超时结算。 */
  clear(reason = '追踪已取消'): void {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer)
      entry.resolvers.forEach((resolve) =>
        resolve({
          commandId: entry.commandId,
          source: 'timeout',
          result: null,
          errorMsg: reason,
        }),
      )
    })
    this.pending.clear()
  }

  /** 当前等待数量（调试/测试用）。 */
  get size(): number {
    return this.pending.size
  }

  /** 超时兜底：查询接口状态；TIMEOUT(4) 不会推送，只能靠这里拿到终态。 */
  private async settleByPolling(commandId: string, poll: CommandPoller | null): Promise<void> {
    const entry = this.pending.get(commandId)
    if (!entry) return

    if (!poll) {
      this.settle(entry, {
        commandId,
        source: 'timeout',
        result: null,
        errorMsg: '等待设备回执超时，请稍后在指令记录中确认执行结果',
      })
      return
    }

    try {
      const command = await poll(commandId)
      this.settle(entry, {
        commandId,
        source: 'poll',
        result: command ? toCommandResult(command) : null,
        errorMsg: command?.errorMsg ?? null,
      })
    } catch {
      this.settle(entry, {
        commandId,
        source: 'timeout',
        result: null,
        errorMsg: '等待设备回执超时，且指令状态查询失败',
      })
    }
  }

  /** 单次结算：先移除再 resolve，防止推送与轮询重复回调。 */
  private settle(entry: PendingEntry, execution: CommandExecution): void {
    if (!this.pending.has(entry.commandId)) return
    this.pending.delete(entry.commandId)
    clearTimeout(entry.timer)
    entry.resolvers.forEach((resolve) => resolve(execution))
  }
}
