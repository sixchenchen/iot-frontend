import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { DeviceWsClient, type WsConnectionStatus } from '@/lib/ws/device-ws-client'
import { appendCapped, upsertStateEntry, type RealtimeStateEntry } from '@/lib/ws/realtime-state'
import {
  CommandTracker,
  type CommandExecution,
  type TrackCommandOptions,
} from '@/lib/ws/command-tracker'
import { getFreshAccessToken } from '@/lib/request'
import { clearAuthStorage, getAccessToken } from '@/lib/auth-storage'
import { commandApi } from '@/features/command/api/commandApi'
import { OTA_STATE_LABELS, isOtaTerminalState, normalizeMac } from '@/utils/device'
import type { OtaProgressVO } from '@/types/ota'
import type {
  DeviceAlertRecord,
  DeviceCommandResult,
  DeviceOtaProgressPush,
  DeviceSensorRecord,
  DeviceStateMessage,
} from '@/types/ws'

/**
 * ============================================================================
 * 设备实时状态 Store（Pinia 单例）
 * ============================================================================
 * 职责：
 *   1. 管理唯一一条 STOMP over SockJS 连接（全应用共用一个实例）；
 *   2. 按设备维护 state / sensor / alert 三份实时数据；
 *   3. 页面只负责订阅设备列表与渲染，连接/重连/鉴权细节全部内聚在这里；
 *   4. 追踪控制指令执行结果（command_result + 10s 轮询兜底，文档 6.7/6.8）；
 *   5. 维护 OTA 实时进度（ota_progress，文档 6.8 / 8.5）。
 *
 * 数据策略：
 *   - state 为增量消息，按 target+channel 覆盖，最多保留 32 条目标；
 *   - sensor 为数组消息，按设备保留最近 30 条；
 *   - alert 保留最近 10 条，并通过 lastAlertAt 通知页面弹提示。
 *
 * 注意：后端不推送 online/offline，在线状态仍由心跳与 /my 接口决定，
 * 这里只保证「设备状态、传感器、告警、指令结果」的实时性。
 * ============================================================================
 */

export interface DeviceRealtimeData {
  states: RealtimeStateEntry[]
  sensors: DeviceSensorRecord[]
  alerts: DeviceAlertRecord[]
}

const MAX_STATES = 32
const MAX_SENSORS = 30
const MAX_ALERTS = 10

const EMPTY_STATES: RealtimeStateEntry[] = []
const EMPTY_SENSORS: DeviceSensorRecord[] = []
const EMPTY_ALERTS: DeviceAlertRecord[] = []

export const useDeviceRealtimeStore = defineStore('device-realtime', () => {
  /** 连接状态：idle/connecting/connected/reconnecting/disconnected/disabled。 */
  const connectionStatus = ref<WsConnectionStatus>('idle')
  /** 最近一次收到任意推送的时间（毫秒），用于展示「实时通道活跃」。 */
  const lastMessageAt = ref<number | null>(null)
  /** 最近一条告警，页面通过 lastAlertAt 变化弹提示。 */
  const lastAlert = shallowRef<DeviceAlertRecord | null>(null)
  const lastAlertAt = ref(0)
  /** 最近一条指令执行结果（command_result），供页面按需展示。 */
  const lastCommandResult = shallowRef<DeviceCommandResult | null>(null)
  const lastCommandResultAt = ref(0)
  /** 按设备维护 OTA 实时进度（mac 大写）。 */
  const otaProgressByDevice = ref<Record<string, OtaProgressVO>>({})
  const lastOtaProgressAt = ref(0)

  /**
   * 指令结果追踪器：实时推送优先，10s 超时后走 `GET /user/commands/{id}` 兜底。
   * 管理端没有对应的按 ID 查询接口，调用方需显式传 `poll: null`。
   */
  const commandTracker = new CommandTracker({
    poll: (commandId) => commandApi.detail(commandId),
  })

  /** 设备实时数据（key 为规范化后的 MAC）。 */
  const dataByDevice = ref<Record<string, DeviceRealtimeData>>({})

  /** 用 shallowRef 保存类实例：避免 Vue 深度代理破坏私有字段与 Map/Set。 */
  const clientRef = shallowRef<DeviceWsClient | null>(null)

  const updateDevice = (mac: string, updater: (prev: DeviceRealtimeData) => DeviceRealtimeData) => {
    const prev = dataByDevice.value[mac] ?? {
      states: EMPTY_STATES,
      sensors: EMPTY_SENSORS,
      alerts: EMPTY_ALERTS,
    }
    dataByDevice.value = { ...dataByDevice.value, [mac]: updater(prev) }
  }

  const handleState = (mac: string, message: DeviceStateMessage) => {
    const numericState = Number(message.state)
    if (!message.target || Number.isNaN(numericState)) return

    const entry: RealtimeStateEntry = {
      target: message.target,
      channel: message.channel ?? null,
      state: numericState,
      updatedAt: Date.now(),
    }

    updateDevice(mac, (prev) => ({
      ...prev,
      states: upsertStateEntry(prev.states, entry).slice(-MAX_STATES),
    }))
    lastMessageAt.value = Date.now()
  }

  const handleSensor = (mac: string, records: DeviceSensorRecord[]) => {
    if (records.length === 0) return
    updateDevice(mac, (prev) => {
      let sensors = prev.sensors
      records.forEach((record) => {
        sensors = appendCapped(sensors, record, MAX_SENSORS)
      })
      return { ...prev, sensors }
    })
    lastMessageAt.value = Date.now()
  }

  const handleAlert = (mac: string, alert: DeviceAlertRecord) => {
    updateDevice(mac, (prev) => ({
      ...prev,
      alerts: appendCapped(prev.alerts, alert, MAX_ALERTS),
    }))
    lastAlert.value = alert
    lastAlertAt.value = Date.now()
    lastMessageAt.value = Date.now()
  }

  /**
   * OTA 进度合并规则（文档 6.8）：
   *   - 同一 commandId 内 progress 单调递增，避免错序消息导致进度回退；
   *   - 终态（success/failed）不可逆：同 commandId 的后续旧消息直接丢弃；
   *   - 新 commandId 视为新一轮升级，重置进度与终态。
   */
  const handleOtaProgress = (_mac: string, payload: DeviceOtaProgressPush) => {
    const mac = normalizeMac(_mac)
    const prev = otaProgressByDevice.value[mac]
    const sameCommand = !payload.commandId || !prev?.commandId || payload.commandId === prev.commandId

    if (prev && sameCommand && isOtaTerminalState(prev.otaState)) return

    const progress = prev && sameCommand
      ? Math.max(prev.otaProgress ?? 0, payload.progress)
      : payload.progress
    const terminal = isOtaTerminalState(payload.otaState)

    const next: OtaProgressVO = {
      deviceId: mac,
      otaState: payload.otaState,
      otaStateText: payload.otaStateText || OTA_STATE_LABELS[payload.otaState] || payload.otaState,
      otaProgress: terminal ? Math.max(progress, 100) : progress,
      otaVersion: payload.version ?? prev?.otaVersion ?? null,
      commandId: payload.commandId ?? prev?.commandId ?? null,
      commandStatus: prev?.commandStatus ?? null,
      commandStatusText: prev?.commandStatusText ?? null,
      errorMsg: payload.error ?? null,
      otaUpdateTime: payload.reportTime ?? new Date().toISOString(),
      running: !terminal,
      finished: terminal,
      serverTime: new Date().toISOString(),
    }

    otaProgressByDevice.value = { ...otaProgressByDevice.value, [mac]: next }
    lastOtaProgressAt.value = Date.now()
    lastMessageAt.value = Date.now()
  }

  /** 读取某设备的实时 OTA 进度；无推送时返回 null，页面回退到 REST 快照。 */
  const getOtaProgress = (deviceId: string): OtaProgressVO | null => {
    if (!deviceId) return null
    return otaProgressByDevice.value[normalizeMac(deviceId)] ?? null
  }

  const handleCommandResult = (_mac: string, result: DeviceCommandResult) => {
    lastCommandResult.value = result
    lastCommandResultAt.value = Date.now()
    lastMessageAt.value = Date.now()
    // 仅当存在匹配 commandId 的等待时才结算；未匹配的推送不报错、不误报。
    commandTracker.handleResult(result)
  }

  /** 鉴权失败：停止连接、清理登录态并回到登录页。 */
  const handleAuthFail = async (reason: string) => {
    connectionStatus.value = 'disconnected'
    commandTracker.clear('登录状态失效，未完成的指令追踪已取消')
    clientRef.value?.disconnect()
    clientRef.value = null
    ElMessage.error(`实时通道鉴权失败：${reason}，请重新登录`)

    try {
      const { useAuthStore } = await import('@/stores/useAuthStore')
      useAuthStore().reset()
      const { default: router } = await import('@/router')
      if (router.currentRoute.value.name !== 'Login') {
        await router.replace({ name: 'Login' })
      }
    } catch {
      clearAuthStorage()
      window.location.assign('/login')
    }
  }

  const handleSubscriptionDenied = (deviceId: string, reason: string) => {
    ElMessage.warning(
      deviceId
        ? `无权订阅设备 ${deviceId} 的实时数据，请先绑定该设备`
        : `存在无权订阅的设备，已跳过该设备：${reason}`,
    )
  }

  /**
   * 建立连接。
   * - 未登录：不连接；
   * - 未配置 VITE_WS_URL：标记为 disabled（功能优雅降级，不影响页面其它能力）；
   * - 已存在连接：幂等返回。
   */
  const connect = () => {
    if (clientRef.value) return

    if (!getAccessToken()) {
      connectionStatus.value = 'idle'
      return
    }

    const wsUrl = (import.meta.env.VITE_WS_URL || '').trim()
    if (!wsUrl) {
      connectionStatus.value = 'disabled'
      return
    }

    const instance = new DeviceWsClient({
      url: wsUrl,
      getToken: () => getFreshAccessToken(),
      onStatusChange: (status) => {
        // 只在当前实例仍是有效实例时更新，避免旧连接销毁时覆盖新连接状态。
        if (clientRef.value === instance) connectionStatus.value = status
      },
      onState: handleState,
      onSensor: handleSensor,
      onAlert: handleAlert,
      onCommandResult: handleCommandResult,
      onOtaProgress: handleOtaProgress,
      onAuthFail: handleAuthFail,
      onSubscriptionDenied: handleSubscriptionDenied,
    })

    clientRef.value = instance
    instance.connect()
  }

  /** 按当前页设备列表增量订阅（翻页/搜索后自动退订已移除设备）。 */
  const syncDevices = (deviceIds: string[]) => {
    clientRef.value?.syncDevices(deviceIds)
  }

  /**
   * 确保目标设备在订阅集合中（下发控制指令前调用）。
   * 未连接时仅登记，连接成功后自动补订阅——因此不会丢失极快的 ACK。
   */
  const subscribeDevice = (deviceId: string) => {
    clientRef.value?.subscribeDevice(deviceId)
  }

  /**
   * 等待指令执行结果：
   *   - 优先匹配 `/command` 的 `command_result`；
   *   - 10s 未收到则轮询 `GET /user/commands/{commandId}`（管理端传 `poll: null` 关闭）。
   */
  const waitForCommandResult = (
    commandId: string,
    options?: TrackCommandOptions,
  ): Promise<CommandExecution> => commandTracker.track(commandId, options)

  /** 离开设备页/登出时断开，保留已收到的数据以便再次进入时快速展示。 */
  const disconnect = () => {
    const instance = clientRef.value
    clientRef.value = null
    connectionStatus.value = 'idle'
    instance?.disconnect()
  }

  const getStates = (deviceId: string): RealtimeStateEntry[] => {
    const mac = normalizeMac(deviceId)
    return dataByDevice.value[mac]?.states ?? EMPTY_STATES
  }

  const getSensors = (deviceId: string): DeviceSensorRecord[] => {
    const mac = normalizeMac(deviceId)
    return dataByDevice.value[mac]?.sensors ?? EMPTY_SENSORS
  }

  const getAlerts = (deviceId: string): DeviceAlertRecord[] => {
    const mac = normalizeMac(deviceId)
    return dataByDevice.value[mac]?.alerts ?? EMPTY_ALERTS
  }

  const getLatestSensor = (deviceId: string): DeviceSensorRecord | null => {
    const sensors = getSensors(deviceId)
    return sensors.length > 0 ? (sensors[sensors.length - 1] ?? null) : null
  }

  return {
    connectionStatus,
    lastMessageAt,
    lastAlert,
    lastAlertAt,
    lastCommandResult,
    lastCommandResultAt,
    lastOtaProgressAt,
    dataByDevice,
    connect,
    disconnect,
    syncDevices,
    subscribeDevice,
    waitForCommandResult,
    getOtaProgress,
    getStates,
    getSensors,
    getAlerts,
    getLatestSensor,
  }
})
