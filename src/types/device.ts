import type { PageQuery } from '@/types/api'

/**
 * 设备领域模型（字段与后端 /api/admin/devices、/api/user/devices/my 对齐）。
 *
 * 说明：
 *   - 用户端 `/user/devices/my` 返回 DeviceInfoVO，已包含 OTA 四个字段（本轮补齐）；
 *   - 管理端 `/admin/devices` 返回 AdminDeviceVO，`online` 为 boolean，用户端为 1/0，
 *     因此统一声明为 `number | boolean`，展示时必须走 isDeviceOnline 归一化；
 *   - capabilities / currentState 为后端下发的 JSON，结构随产品而定，前端只做展示或
 *     按「已知能力键」做基础白名单，不做强类型假设。
 */
export interface Device {
  id: number
  deviceId: string
  deviceName: string | null
  product: string | null
  firmware: string | null
  location: string | null
  /** 用户端为 1/0，管理端为 boolean。 */
  online: number | boolean
  lastOnlineTime?: string | null
  lastOfflineTime?: string | null
  lastHeartbeatTime: string | null
  offlineReason?: string | null
  uptime: number | null
  capabilities?: Record<string, unknown> | null
  currentState?: Record<string, unknown> | null

  // 管理端 / 详情接口额外返回
  pubkey?: string | null
  bindCode?: string | null
  groupId?: number | null
  configVersion?: number | null
  otaState?: string | null
  otaProgress?: number | null
  otaVersion?: string | null
  otaUpdateTime?: string | null
  lastPayload?: string | null
  bindTime?: string | null
  createTime?: string | null
  updateTime?: string | null
}

/** GET /user/devices/{deviceId} 的设备详情。 */
export interface DeviceDetailVO extends Device {
  bindTime: string | null
}

/** GET /user/devices/{deviceId}/online 的轻量在线状态。 */
export interface DeviceOnlineVO {
  deviceId: string
  online: boolean
  lastHeartbeatTime: string | null
  offlineReason: string | null
}

/** GET /admin/devices/{id}/bindings 的绑定记录。 */
export interface DeviceBindingVO {
  bindingId: number
  userId: number
  username: string
  nickname: string | null
  bindTime: string | null
  /** 1-有效（接口已过滤，前端仅展示） */
  bindStatus: number
}

/** GET /admin/devices/online-stats 的在线统计。 */
export interface DeviceOnlineStatsVO {
  total: number
  online: number
  offline: number
  /** 标记在线但心跳超时的设备数。 */
  abnormal: number
}

/** 管理端分页查询参数（keyword 仅管理端支持）。 */
export interface DeviceQuery extends PageQuery {
  keyword?: string
}

/** 管理端导出参数。 */
export interface DeviceExportQuery {
  keyword?: string
}

/** 绑定设备：deviceId 为 12 位十六进制 MAC，bindCode 为机身二维码 6 位绑定码。 */
export interface DeviceBindRequest {
  deviceId: string
  bindCode: string
}

/** 解绑设备：只需要 deviceId。 */
export interface DeviceUnbindRequest {
  deviceId: string
}

/** 控制设备请求体（DeviceControlRequest）。 */
export interface DeviceControlRequest {
  deviceId: string
  action: string
  target: string
  channel?: number
  params: Record<string, unknown>
}

/** 管理端下发指令：deviceId 由路径指定，请求体不再重复携带。 */
export interface AdminDeviceCommandRequest {
  action: string
  target: string
  channel?: number
  params: Record<string, unknown>
}

/** 管理端新增设备。 */
export interface DeviceCreateRequest {
  deviceId: string
  deviceName?: string
  product?: string
  location?: string
}

/** 管理端编辑设备（PUT /admin/devices/{id}）。 */
export interface AdminDeviceUpdateRequest {
  deviceName?: string
  product?: string
  location?: string
}

/** 用户端编辑设备（PUT /user/devices/{deviceId}）。 */
export interface UserDeviceUpdateRequest {
  deviceName?: string
  location?: string
}

/** POST /admin/devices/{id}/unbind 的请求体。 */
export interface DeviceBindingUnbindRequest {
  userId: number
}
