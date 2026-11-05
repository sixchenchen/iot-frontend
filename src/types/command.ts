import type { PageQuery } from '@/types/api'

/**
 * ============================================================================
 * 指令领域类型（文档 7.2 / 8.3 / 8.9）
 * ============================================================================
 * 指令状态：0 待下发、1 已下发、2 成功、3 失败、4 超时、5 已取消、6 设备已受理。
 * 注意 ACCEPTED(6) 属于「进行中」，不是终态。
 * ============================================================================
 */

/** 指令状态码。 */
export type CommandStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** 指令对象（DeviceCommand），用户端与管理端字段一致。 */
export interface DeviceCommand {
  id: number
  commandId: string
  deviceId: string
  action: string
  target: string
  channel: number | null
  params: Record<string, unknown> | null
  status: number
  retryCount: number
  maxRetry: number
  errorMsg: string | null
  responsePayload: string | null
  operator: string | null
  /** 指令来源：WEB / API / SCHEDULE / SYSTEM */
  source: string | null
  expireTime: string | null
  sendTime: string | null
  ackTime: string | null
  createTime: string | null
  updateTime: string | null
}

/** 指令列表查询参数（用户端 deviceId 可选，不传表示全部已绑定设备）。 */
export interface CommandQuery extends PageQuery {
  deviceId?: string
  status?: number
  from?: string
  to?: string
}

/** 各状态指令数量。 */
export interface CommandStatsVO {
  pending: number
  sent: number
  success: number
  failed: number
  timeout: number
  cancelled: number
  total: number
}

/** 批量控制中的单条指令。 */
export interface BatchCommandItem {
  action: string
  target: string
  channel?: number
  params: Record<string, unknown>
}

/** POST /user/devices/{deviceId}/commands/batch 的请求体。 */
export interface BatchCommandRequest {
  items: BatchCommandItem[]
}
