import type { PageQuery } from '@/types/api'

/**
 * ============================================================================
 * 传感器 / 事件 / 状态 / 告警类型（文档 7.8 / 8.4）
 * ============================================================================
 * 传感器历史与 WebSocket 推送共用 DeviceSensorRecord（见 types/ws.ts）；
 * 告警对象共用 DeviceAlertRecord（见 types/ws.ts），避免两套字段漂移。
 * ============================================================================
 */

/** 各传感器最新值。 */
export interface SensorLatestVO {
  sensorKey: string
  sensorType: string | null
  sensorName: string | null
  unit: string | null
  value: number | null
  timestamp: string | null
}

/** 设备事件记录。 */
export interface DeviceEventRecord {
  id: number
  deviceId: string
  type: string | null
  event: string | null
  code: string | null
  message: string | null
  context: Record<string, unknown> | null
  target: string | null
  channel: number | null
  triggerSource: string | null
  payload: string | null
  timestamp: string | null
  createTime: string | null
}

/** 设备状态变更历史。 */
export interface DeviceStateRecord {
  id: number
  deviceId: string
  target: string
  channel: number | null
  params: Record<string, unknown> | null
  timestamp: string | null
  createTime: string | null
}

/** 传感器历史筛选参数：sensorKey 精确匹配，type 匹配 sensor_type。 */
export interface SensorQuery extends PageQuery {
  sensorKey?: string
  type?: string
  from?: string
  to?: string
}

/** 设备事件筛选参数。 */
export interface EventQuery extends PageQuery {
  type?: string
  from?: string
  to?: string
}

/** 状态历史筛选参数。 */
export interface StateQuery extends PageQuery {
  from?: string
  to?: string
}

/** 告警筛选参数（用户端与管理端一致）。 */
export interface AlertQuery extends PageQuery {
  deviceId?: string
  status?: number
  level?: number
  from?: string
  to?: string
}
