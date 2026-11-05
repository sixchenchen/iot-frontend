import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type { AlertQuery } from '@/types/sensor'
import type { DeviceAlertRecord } from '@/types/ws'

/**
 * ============================================================================
 * 告警接口（文档 8.4 / 8.9）
 * ============================================================================
 * 用户端：
 *   GET  /user/alerts（仅返回已绑定设备的告警）
 *   POST /user/alerts/{id}/ack（status→1，status=2 时幂等成功）
 * 管理端：
 *   GET  /admin/alerts（权限 alert:list）
 *   PUT  /admin/alerts/{id}/status（权限 alert:handle，status 仅允许 1/2）
 * ============================================================================
 */
export const alertApi = {
  /** GET /user/alerts?deviceId=&status=&level=&from=&to=&pageNum=&pageSize= */
  listMine: (params: AlertQuery) =>
    request<PageResult<DeviceAlertRecord>>({
      url: '/user/alerts',
      method: 'get',
      params,
    }),

  /** POST /user/alerts/{id}/ack */
  ack: (id: number) =>
    request<void>({
      url: `/user/alerts/${id}/ack`,
      method: 'post',
    }),

  /** GET /admin/alerts?pageNum=&pageSize=&deviceId=&status=&level=&from=&to= */
  listAdmin: (params: AlertQuery) =>
    request<PageResult<DeviceAlertRecord>>({
      url: '/admin/alerts',
      method: 'get',
      params,
    }),

  /** PUT /admin/alerts/{id}/status —— 1 已确认 / 2 已解决。 */
  updateStatus: (id: number, status: 1 | 2) =>
    request<void>({
      url: `/admin/alerts/${id}/status`,
      method: 'put',
      data: { status },
    }),
}
