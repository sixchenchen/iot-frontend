import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type { CommandQuery, DeviceCommand } from '@/types/command'

/**
 * ============================================================================
 * 指令中心接口
 * ============================================================================
 * 用户端：
 *   GET  /user/commands（deviceId 可选，不传返回全部已绑定设备的指令）
 *   GET  /user/commands/{commandId}
 *   POST /user/commands/{commandId}/cancel（仅 PENDING 可取消）
 * 管理端：
 *   GET  /admin/commands（全局指令，权限 device:list）
 * ============================================================================
 */
export const commandApi = {
  /** GET /user/commands?deviceId=&status=&pageNum=&pageSize= */
  listMine: (params: CommandQuery) =>
    request<PageResult<DeviceCommand>>({
      url: '/user/commands',
      method: 'get',
      params,
    }),

  /** GET /user/commands/{commandId} */
  detail: (commandId: string) =>
    request<DeviceCommand>({
      url: `/user/commands/${encodeURIComponent(commandId)}`,
      method: 'get',
    }),

  /** POST /user/commands/{commandId}/cancel —— 返回 false 表示已不可取消。 */
  cancel: (commandId: string) =>
    request<boolean>({
      url: `/user/commands/${encodeURIComponent(commandId)}/cancel`,
      method: 'post',
    }),

  /** GET /admin/commands?pageNum=&pageSize=&deviceId=&status=&from=&to= */
  listAdmin: (params: CommandQuery) =>
    request<PageResult<DeviceCommand>>({
      url: '/admin/commands',
      method: 'get',
      params,
    }),
}
