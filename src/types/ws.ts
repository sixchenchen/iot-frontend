/**
 * WebSocket 推送消息类型（与后端 WebSocketPushService 实际输出对齐）。
 *
 * ⚠️ 后端所有主题统一包了一层 WebSocketMessageVO 信封：
 *   { type, deviceId, timestamp, data }
 * 真正的业务数据在 `data` 字段，且三个主题的 data 结构完全不同：
 *   - /state  data = 扁平对象
 *   - /sensor data = 数组
 *   - /alert  data = 单个对象
 * 因此解析时必须先拆信封，再按主题分别校验，并对未知字段容错。
 */
export interface DeviceWsEnvelope<T> {
  /** state / sensor / alert / ota_progress / command_result */
  type?: string
  deviceId?: string
  timestamp?: string | null
  data: T
}

export interface DeviceStateMessage {
  target: string
  /** null 表示整体（非分通道）状态。 */
  channel?: number | null
  state: number
}

export interface DeviceSensorRecord {
  id?: number
  deviceId: string
  source?: string | null
  slaveAddress?: number | null
  sensorId?: number | null
  channel?: number | null
  sensorKey: string
  sensorType?: string | null
  sensorValue: number
  unit?: string | null
  extra?: Record<string, unknown> | null
  sensorData?: string | null
  timestamp?: string | null
  createTime?: string | null
}

/**
 * `/topic/device/{deviceId}/command` 的 `command_result` 业务体
 * （后端 CommandResultVO，文档 6.8）。
 *
 * 语义提醒：
 *   - `success === true`  执行成功；
 *   - `success === false` 失败 / 超时 / 取消；
 *   - `success === null`  仍在执行（如 OTA 已受理，等待后续状态）。
 */
export interface DeviceCommandResult {
  /** 与 `POST /control` 返回值一致，用于匹配本次下发。 */
  commandId: string
  deviceId?: string
  action?: string | null
  target?: string | null
  /** 0 表示全部通道。 */
  channel?: number | null
  /** 0 待下发 / 1 已下发 / 2 成功 / 3 失败 / 4 超时 / 5 取消 / 6 已接收。 */
  status: number
  /** 后端直接给出的状态文案，优先展示。 */
  statusText?: string | null
  success?: boolean | null
  errorMsg?: string | null
  /** 设备 ACK 的 data，结构由固件决定，前端只做容错展示。 */
  responsePayload?: Record<string, unknown> | null
  ackTime?: string | null
}

export interface DeviceAlertRecord {
  id?: number
  deviceId: string
  sensorKey?: string | null
  alertLevel: number
  alertType?: string | null
  message?: string | null
  value?: number | null
  threshold?: number | null
  status?: number
  handledBy?: string | null
  handledTime?: string | null
  timestamp?: string | null
  createTime?: string | null
}
