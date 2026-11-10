import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type {
  DeviceEventRecord,
  DeviceStateRecord,
  EventQuery,
  SensorLatestVO,
  SensorQuery,
  StateQuery,
} from '@/types/sensor'
import type { DeviceSensorRecord } from '@/types/ws'

/**
 * ============================================================================
 * 传感器 / 事件 / 状态接口
 * ============================================================================
 * 全部为用户侧接口，后端会校验「设备当前确实绑定在当前登录用户名下」。
 * 传感器历史与 WebSocket /sensor 推送共用 DeviceSensorRecord 结构。
 * ============================================================================
 */
export const sensorApi = {
  /** GET /user/devices/{deviceId}/sensors?sensorKey=&type=&from=&to=&pageNum=&pageSize= */
  listSensors: (deviceId: string, params: SensorQuery) =>
    request<PageResult<DeviceSensorRecord>>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/sensors`,
      method: 'get',
      params,
    }),

  /** GET /user/devices/{deviceId}/sensors/latest —— 各传感器最新值。 */
  latest: (deviceId: string) =>
    request<SensorLatestVO[]>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/sensors/latest`,
      method: 'get',
    }),

  /** GET /user/devices/{deviceId}/events?type=&from=&to=&pageNum=&pageSize= */
  listEvents: (deviceId: string, params: EventQuery) =>
    request<PageResult<DeviceEventRecord>>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/events`,
      method: 'get',
      params,
    }),

  /** GET /user/devices/{deviceId}/states?from=&to=&pageNum=&pageSize= */
  listStates: (deviceId: string, params: StateQuery) =>
    request<PageResult<DeviceStateRecord>>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/states`,
      method: 'get',
      params,
    }),
}
