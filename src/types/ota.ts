import type { PageQuery } from '@/types/api'

/**
 * OTA 相关类型（与《FRONTEND_API.md》5.9 / 5.15 / 8.5 / 8.8 对齐）。
 * 固件与任务接口均使用 pageNum/pageSize；旧 `/firmware/list` 仅保留兼容。
 */

/** GET /user/ota/check/{deviceId} 的响应。 */
export interface OtaCheckResponse {
  hasNewVersion: boolean
  firmwareId: number | null
  latestVersion: string | null
  releaseNotes: string | null
  size: number | null
}

/**
 * GET /user/ota/progress/{deviceId} 的进度（文档 8.5 / 6.8）。
 * 同时作为 WebSocket `ota_progress` 推送归一化后的前端模型。
 */
export interface OtaProgressVO {
  deviceId: string
  /** accepted / downloading / verifying / flashing / rebooting / success / failed */
  otaState: string | null
  otaStateText: string | null
  otaProgress: number | null
  otaVersion: string | null
  commandId: string | null
  /** 0~6，与指令状态一致。 */
  commandStatus: number | null
  commandStatusText: string | null
  errorMsg: string | null
  otaUpdateTime: string | null
  /** OTA 任务是否进行中（后端派生字段）。 */
  running: boolean
  /** 是否进入终态（success / failed）。 */
  finished: boolean
  serverTime: string | null
}

/** GET /user/ota/records 的分页元素。 */
export interface OtaRecordVO {
  id: number
  commandId: string
  deviceId: string
  version: string | null
  /** 指令状态码（0~6） */
  status: number
  statusText: string | null
  otaState: string | null
  progress: number | null
  errorMsg: string | null
  createTime: string | null
  sendTime: string | null
  ackTime: string | null
}

/** GET /user/ota/records 的查询参数：deviceId 必填。 */
export interface OtaRecordQuery extends PageQuery {
  deviceId: string
}

/** GET /admin/ota/firmware/list 的元素（旧接口，不分页）。 */
export interface FirmwareVO {
  id: number
  version: string
  product: string
  releaseNotes: string | null
  url: string | null
  md5: string | null
  sha256: string | null
  size: number | null
  sizeText: string | null
  uploadedBy: string | null
  uploadTime: string | null
  status: number // 1-启用, 0-禁用
}

/** GET /admin/ota/firmware 的分页查询参数。 */
export interface FirmwareQuery extends PageQuery {
  product?: string
  status?: number
  keyword?: string
}

/** PUT /admin/ota/firmware/{id}/status 的请求体。 */
export interface FirmwareStatusUpdateRequest {
  status: 0 | 1
}

/** POST /admin/ota/firmware/upload 的响应（字段以后端实际返回为准，全部按可选处理）。 */
export interface FirmwareUploadResponse {
  id?: number
  version?: string
  product?: string
  url?: string
  md5?: string
  sha256?: string
  size?: number
  sizeText?: string
  uploadTime?: string
}

/** 固件上传表单（multipart/form-data）。 */
export interface FirmwareUploadPayload {
  file: File
  version: string
  product: string
  releaseNotes?: string
  operator?: string
}

/** 批量下发参数（后端使用 query 参数）。 */
export interface BatchDispatchQuery {
  firmwareId: number
  targetProduct?: string
  operator?: string
}

/** GET /admin/ota/tasks 的分页元素。 */
export interface OtaTaskVO {
  id: number
  firmwareId: number
  targetVersion: string | null
  totalCount: number
  successCount: number
  failedCount: number
  pendingCount: number
  /** 任务状态由后端定义，前端仅直出数值/文案。 */
  status: number
  operator: string | null
  createTime: string | null
  updateTime: string | null
}

/** 任务详情中的单设备进度。 */
export interface OtaTaskDeviceVO {
  deviceId: string
  deviceName: string | null
  firmware: string | null
  otaState: string | null
  otaProgress: number | null
  commandStatus: number
  commandStatusText: string | null
  errorMsg: string | null
  updateTime: string | null
}

/** GET /admin/ota/tasks/{id} 的详情。 */
export interface OtaTaskDetailVO extends OtaTaskVO {
  devices: OtaTaskDeviceVO[]
}

/** GET /admin/ota/tasks 的查询参数。 */
export interface OtaTaskQuery extends PageQuery {
  status?: number
}
