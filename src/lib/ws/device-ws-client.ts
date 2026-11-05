import { Client, type IFrame, type IMessage, type StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { normalizeMac } from '@/utils/device'
import type {
  DeviceAlertRecord,
  DeviceCommandResult,
  DeviceSensorRecord,
  DeviceStateMessage,
} from '@/types/ws'

/**
 * ============================================================================
 * 设备实时通道客户端（STOMP 1.2 over SockJS）
 * ============================================================================
 * 严格按后端 WebSocketConfig / WebSocketAuthInterceptor / WebSocketPushService：
 *   - 端点：/ws（SockJS，不是原生 ws://，也绝不能加 /api 前缀）；
 *   - CONNECT 帧必须带 Authorization: Bearer <token>；
 *   - 订阅 destination 区分大小写：
 *       /topic/device/{MAC}/state | sensor | alert | command
 *   - MAC 必须大写、无分隔符；普通用户只能订阅已绑定设备，管理员放行；
 *   - 后端没有 @MessageMapping，前端只订阅不发送；
 *   - 重连后 STOMP 不会恢复订阅，必须在 onConnect 中重新订阅。
 *
 * 企业级处理：
 *   1. 连接前 Token 续期（复用 HTTP 层刷新锁，避免并发刷新把 RefreshToken 用废）；
 *   2. 心跳 10s，防止 Nginx 60s 空闲断开；
 *   3. 指数退避重连（1s → 2s → 5s → 10s → 30s）；
 *   4. 鉴权失败 / 越权订阅不重试，避免无限重连与 ERROR 风暴；
 *   5. 消息 JSON 解析容错，单条坏消息不影响连接。
 * ============================================================================
 */

export type WsConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'disabled'

export interface DeviceWsHandlers {
  onStatusChange?: (status: WsConnectionStatus) => void
  onState?: (deviceId: string, message: DeviceStateMessage) => void
  onSensor?: (deviceId: string, records: DeviceSensorRecord[]) => void
  onAlert?: (deviceId: string, alert: DeviceAlertRecord) => void
  /** /command：控制指令执行结果（type=command_result）。 */
  onCommandResult?: (deviceId: string, result: DeviceCommandResult) => void
  /** 鉴权失败（Token 无效/过期/刷新失败）：调用方应清理登录态并跳登录页。 */
  onAuthFail?: (reason: string) => void
  /** 越权订阅：不要重试，提示用户先绑定设备。 */
  onSubscriptionDenied?: (deviceId: string, reason: string) => void
}

export interface DeviceWsClientOptions extends DeviceWsHandlers {
  url: string
  /** 返回可用 AccessToken；内部应复用 HTTP 刷新锁。 */
  getToken: () => Promise<string> | string
  debug?: boolean
}

/** 指数退避阶梯（毫秒）。 */
const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]

/** 安全解析 JSON，失败返回 null（后端消息异常不应中断订阅）。 */
function safeParse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 拆掉后端统一信封 WebSocketMessageVO：{ type, deviceId, timestamp, data }。
 * 同时兼容老版本/测试环境直接推送业务体的情况，避免升级期间的兼容性事故。
 */
export function unwrapEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  const hasEnvelopeMark = 'type' in payload || 'deviceId' in payload
  if (hasEnvelopeMark && 'data' in payload) return payload['data']
  return payload
}

/** /state：data 是扁平对象 { target, channel, state }。 */
export function parseStatePayload(body: string): DeviceStateMessage | null {
  const raw = unwrapEnvelope(safeParse<unknown>(body))
  if (!isRecord(raw)) return null

  const target = raw['target']
  const state = Number(raw['state'])
  if (typeof target !== 'string' || target.length === 0 || Number.isNaN(state)) return null

  const channelValue = raw['channel']
  return {
    target,
    channel: typeof channelValue === 'number' ? channelValue : null,
    state,
  }
}

/** /sensor：data 是 DeviceSensorRecord 数组。 */
export function parseSensorPayload(body: string): DeviceSensorRecord[] | null {
  const raw = unwrapEnvelope(safeParse<unknown>(body))
  if (!Array.isArray(raw)) return null

  const records = raw.filter(
    (item): item is DeviceSensorRecord =>
      isRecord(item) &&
      typeof item['deviceId'] === 'string' &&
      typeof item['sensorKey'] === 'string' &&
      Number.isFinite(Number(item['sensorValue'])),
  )
  return records.length > 0 ? records : null
}

/** /command：data 是 CommandResultVO；commandId 是唯一匹配键，缺失则丢弃。 */
export function parseCommandResultPayload(body: string): DeviceCommandResult | null {
  const raw = unwrapEnvelope(safeParse<unknown>(body))
  if (!isRecord(raw)) return null

  const commandId = raw['commandId']
  const status = Number(raw['status'])
  if (typeof commandId !== 'string' || commandId.length === 0 || Number.isNaN(status)) {
    return null
  }

  const responsePayload = raw['responsePayload']
  return {
    commandId,
    deviceId: typeof raw['deviceId'] === 'string' ? raw['deviceId'] : undefined,
    action: typeof raw['action'] === 'string' ? raw['action'] : null,
    target: typeof raw['target'] === 'string' ? raw['target'] : null,
    channel: Number.isFinite(Number(raw['channel'])) ? Number(raw['channel']) : null,
    status,
    statusText: typeof raw['statusText'] === 'string' ? raw['statusText'] : null,
    success: typeof raw['success'] === 'boolean' ? raw['success'] : null,
    errorMsg: typeof raw['errorMsg'] === 'string' ? raw['errorMsg'] : null,
    responsePayload: isRecord(responsePayload) ? responsePayload : null,
    ackTime: typeof raw['ackTime'] === 'string' ? raw['ackTime'] : null,
  }
}

/** /alert：data 是单个 DeviceAlertRecord。 */
export function parseAlertPayload(body: string): DeviceAlertRecord | null {
  const raw = unwrapEnvelope(safeParse<unknown>(body))
  if (!isRecord(raw)) return null
  if (typeof raw['deviceId'] !== 'string' || !Number.isFinite(Number(raw['alertLevel']))) {
    return null
  }
  return raw as unknown as DeviceAlertRecord
}

export class DeviceWsClient {
  private readonly url: string
  private readonly handlers: DeviceWsHandlers
  private readonly getToken: () => Promise<string> | string
  private readonly debugEnabled: boolean

  private client: Client | null = null
  /** 已登记需要订阅的设备（MAC 大写无分隔符），重连后据此恢复订阅。 */
  private readonly topics = new Set<string>()
  private readonly subscriptions = new Map<string, StompSubscription[]>()
  /** 主动断开（登出/离开页面）时为 true，用于区分「断线重连」与「主动关闭」。 */
  private manualClose = false
  /** 重连退避索引。 */
  private reconnectIndex = 0
  private status: WsConnectionStatus = 'idle'

  constructor(options: DeviceWsClientOptions) {
    this.url = options.url
    this.getToken = options.getToken
    this.debugEnabled = options.debug ?? false
    this.handlers = options
  }

  getStatus(): WsConnectionStatus {
    return this.status
  }

  /** 建立连接；重复调用无副作用。 */
  connect(): void {
    if (!this.url) {
      this.setStatus('disabled')
      return
    }
    if (this.client?.active) return

    this.manualClose = false
    this.reconnectIndex = 0
    this.setStatus('connecting')

    const client = new Client({
      // SockJS 与 brokerURL 二选一，同时设置会冲突。
      webSocketFactory: () => new SockJS(this.url) as unknown as WebSocket,
      connectHeaders: {},
      reconnectDelay: RECONNECT_DELAYS[0],
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      connectionTimeout: 10_000,
      debug: this.debugEnabled ? (str) => console.log('[STOMP]', str) : () => undefined,

      /**
       * 每次（重）连前刷新 Token。
       * getToken 内部只在「即将过期（默认提前 5 分钟）」时才真正刷新，
       * 且与 HTTP 层共用同一刷新 Promise，不会并发核销 RefreshToken。
       */
      beforeConnect: async () => {
        try {
          const token = await this.getToken()
          client.connectHeaders = { Authorization: `Bearer ${token}` }
        } catch (error) {
          // 刷新失败（如 4012）：停止重连并通知上层清理登录态。
          this.manualClose = true
          this.setStatus('disconnected')
          this.handlers.onAuthFail?.(error instanceof Error ? error.message : '实时连接鉴权失败')
          throw error
        }
      },

      onConnect: () => {
        this.reconnectIndex = 0
        client.reconnectDelay = RECONNECT_DELAYS[0] ?? 1_000
        this.setStatus('connected')
        // 重连后必须重新订阅（STOMP 不会自动恢复）。
        this.subscriptions.clear()
        this.topics.forEach((mac) => this.subscribeTopics(mac))
      },

      onDisconnect: () => {
        if (!this.manualClose) this.setStatus('reconnecting')
      },

      onWebSocketClose: () => {
        this.subscriptions.clear()
        if (this.manualClose) {
          this.setStatus('disconnected')
          return
        }
        // 指数退避：固定间隔在弱网/后端重启时容易造成连接风暴。
        this.reconnectIndex = Math.min(this.reconnectIndex + 1, RECONNECT_DELAYS.length - 1)
        client.reconnectDelay = RECONNECT_DELAYS[this.reconnectIndex] ?? 30_000
        this.setStatus('reconnecting')
      },

      onStompError: (frame: IFrame) => {
        const reason = frame.headers['message'] || frame.body || 'WebSocket 错误'

        if (reason.includes('无权订阅')) {
          // ERROR 帧后连接会被 Spring 关闭，这里移除对应设备，防止重连后再次触发。
          const mac = this.extractDeviceId(frame, reason)
          if (mac) {
            this.topics.delete(mac)
            this.subscriptions.delete(mac)
          }
          this.handlers.onSubscriptionDenied?.(mac ?? '', reason)
          return
        }

        if (
          reason.includes('未认证') ||
          reason.includes('Token') ||
          reason.includes('Authorization')
        ) {
          // 鉴权错误重连也没用，必须停掉自动重连并让上层跳登录。
          this.manualClose = true
          this.setStatus('disconnected')
          this.handlers.onAuthFail?.(reason)
          void this.client?.deactivate()
        }
      },
    })

    this.client = client
    client.activate()
  }

  /** 订阅一台设备的全部主题（未连接时仅登记，连上后自动补订阅）。 */
  subscribeDevice(deviceId: string): void {
    const mac = normalizeMac(deviceId)
    if (!mac) return
    this.topics.add(mac)
    if (this.client?.connected) this.subscribeTopics(mac)
  }

  /** 取消订阅并移出登记表。 */
  unsubscribeDevice(deviceId: string): void {
    const mac = normalizeMac(deviceId)
    this.topics.delete(mac)
    const subs = this.subscriptions.get(mac) ?? []
    subs.forEach((item) => item.unsubscribe())
    this.subscriptions.delete(mac)
  }

  /**
   * 以「设备列表」为准做增量同步：
   * 新增设备订阅、移除设备退订，避免翻页/搜索后残留旧订阅。
   */
  syncDevices(deviceIds: string[]): void {
    const next = new Set(
      deviceIds.map((id) => normalizeMac(id)).filter((id): id is string => id.length > 0),
    )

    this.topics.forEach((mac) => {
      if (!next.has(mac)) {
        const subs = this.subscriptions.get(mac) ?? []
        subs.forEach((item) => item.unsubscribe())
        this.subscriptions.delete(mac)
        this.topics.delete(mac)
      }
    })

    next.forEach((mac) => this.subscribeDevice(mac))
  }

  /** 主动断开（登出 / 离开设备页），不再自动重连。 */
  disconnect(): void {
    this.manualClose = true
    this.topics.clear()
    this.subscriptions.clear()
    const client = this.client
    this.client = null
    this.setStatus('idle')
    void client?.deactivate()
  }

  /** 订阅 state/sensor/alert/command；任何一条坏消息都不影响其它主题。 */
  private subscribeTopics(mac: string): void {
    if (!this.client?.connected || this.subscriptions.has(mac)) return

    const base = `/topic/device/${mac}`
    const subs: StompSubscription[] = [
      this.client.subscribe(`${base}/state`, (message) => {
        const data = parseStatePayload(message.body)
        if (!data) return
        this.handlers.onState?.(mac, data)
      }),
      this.client.subscribe(`${base}/sensor`, (message) => {
        const data = parseSensorPayload(message.body)
        if (!data) return
        this.handlers.onSensor?.(mac, data)
      }),
      this.client.subscribe(`${base}/alert`, (message) => {
        const data = parseAlertPayload(message.body)
        if (!data) return
        this.handlers.onAlert?.(mac, data)
      }),
      this.client.subscribe(`${base}/command`, (message) => {
        const data = parseCommandResultPayload(message.body)
        if (!data) return
        this.handlers.onCommandResult?.(mac, data)
      }),
    ]

    this.subscriptions.set(mac, subs)
    if (this.debugEnabled) console.info('[WS] 已订阅设备', mac)
  }

  /** 从 ERROR 帧 headers 或 message 中尽量提取设备 MAC。 */
  private extractDeviceId(frame: IFrame, reason: string): string | null {
    const destination =
      frame.headers['destination'] || frame.headers['subscription'] || frame.headers['receipt-id']
    const fromDestination = destination?.match(/([0-9A-Fa-f]{12})/)?.[1]
    if (fromDestination) return normalizeMac(fromDestination)

    const fromMessage = reason.match(/([0-9A-Fa-f]{12})/)?.[1]
    return fromMessage ? normalizeMac(fromMessage) : null
  }

  private setStatus(status: WsConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    this.handlers.onStatusChange?.(status)
  }
}

/** 供调试使用：把 IMessage 的 body 转成对象。 */
export function parseStompBody<T>(message: IMessage): T | null {
  return safeParse<T>(message.body)
}
