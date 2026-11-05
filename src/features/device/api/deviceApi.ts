import { request } from '@/lib/request'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  AdminDeviceCommandRequest,
  AdminDeviceUpdateRequest,
  Device,
  DeviceBindingUnbindRequest,
  DeviceBindingVO,
  DeviceControlRequest,
  DeviceCreateRequest,
  DeviceDetailVO,
  DeviceExportQuery,
  DeviceOnlineStatsVO,
  DeviceOnlineVO,
  DeviceQuery,
  UserDeviceUpdateRequest,
} from '@/types/device'
import type {
  BatchCommandRequest,
  CommandQuery,
  CommandStatsVO,
  DeviceCommand,
} from '@/types/command'

/**
 * ============================================================================
 * 设备接口（features/device/api）
 * ============================================================================
 * 管理端 /admin/devices：
 *   分页、详情、新增、编辑、删除、绑定用户、解绑、在线统计、下发指令、CSV 导出。
 * 用户端 /user/devices：
 *   我的设备、详情、在线状态、编辑、绑定、解绑、控制、指令历史/统计/批量控制。
 *
 * 后端约定：
 *   - 分页参数 pageNum/pageSize，响应取 records/total；
 *   - 业务异常返回 HTTP 200 + code!=200，由 request.ts 统一转 reject；
 *   - 控制指令为异步下发，接口返回 commandId（可能为 null），执行结果需 WebSocket
 *     或指令详情接口确认。
 * ============================================================================
 */
export const deviceApi = {
  // ================= 管理端接口 =================

  /** GET /admin/devices?pageNum=&pageSize=&keyword= */
  listManage: (params: DeviceQuery) =>
    request<PageResult<Device>>({
      url: '/admin/devices',
      method: 'get',
      params,
    }),

  /** GET /admin/devices/{id} —— 管理端设备详情（AdminDeviceVO）。 */
  detailManage: (id: number) =>
    request<Device>({
      url: `/admin/devices/${id}`,
      method: 'get',
    }),

  /** POST /admin/devices —— 错误码 4204（MAC 格式）/4212（MAC 已存在）。 */
  addDevice: (data: DeviceCreateRequest) =>
    request<void>({
      url: '/admin/devices',
      method: 'post',
      data,
    }),

  /** PUT /admin/devices/{id} —— 编辑设备名/产品/位置。 */
  updateDevice: (id: number, data: AdminDeviceUpdateRequest) =>
    request<void>({
      url: `/admin/devices/${id}`,
      method: 'put',
      data,
    }),

  /** DELETE /admin/devices/{id} —— 注意传数据库主键 id，不是 MAC。 */
  deleteDevice: (id: number) =>
    request<void>({
      url: `/admin/devices/${id}`,
      method: 'delete',
    }),

  /** GET /admin/devices/{id}/bindings?pageNum=&pageSize= */
  listBindings: (id: number, params: PageQuery) =>
    request<PageResult<DeviceBindingVO>>({
      url: `/admin/devices/${id}/bindings`,
      method: 'get',
      params,
    }),

  /** POST /admin/devices/{id}/unbind —— 解绑指定用户。 */
  unbindUser: (id: number, data: DeviceBindingUnbindRequest) =>
    request<void>({
      url: `/admin/devices/${id}/unbind`,
      method: 'post',
      data,
    }),

  /** GET /admin/devices/online-stats */
  onlineStats: () =>
    request<DeviceOnlineStatsVO>({
      url: '/admin/devices/online-stats',
      method: 'get',
    }),

  /** POST /admin/devices/{id}/command —— 返回 commandId。 */
  sendCommand: (id: number, data: AdminDeviceCommandRequest) =>
    request<string | null>({
      url: `/admin/devices/${id}/command`,
      method: 'post',
      data,
    }),

  /**
   * GET /admin/devices/export?keyword=
   * 后端直接返回 text/csv（带 UTF-8 BOM），因此必须用 responseType: 'blob'，
   * 否则 axios 会尝试 JSON.parse 导致乱码或解析失败。
   */
  exportCsv: (params: DeviceExportQuery) =>
    request<Blob>({
      url: '/admin/devices/export',
      method: 'get',
      params,
      responseType: 'blob',
      timeout: 60_000,
    }),

  // ================= 用户端接口 =================

  /** GET /user/devices/my?pageNum=&pageSize= */
  listMine: (params: PageQuery) =>
    request<PageResult<Device>>({
      url: '/user/devices/my',
      method: 'get',
      params: {
        pageNum: params.pageNum,
        pageSize: params.pageSize,
      },
    }),

  /** GET /user/devices/{deviceId} —— 设备详情（含绑定时间）。 */
  detailMine: (deviceId: string) =>
    request<DeviceDetailVO>({
      url: `/user/devices/${encodeURIComponent(deviceId)}`,
      method: 'get',
    }),

  /** GET /user/devices/{deviceId}/online —— 轻量在线查询。 */
  onlineMine: (deviceId: string) =>
    request<DeviceOnlineVO>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/online`,
      method: 'get',
    }),

  /** PUT /user/devices/{deviceId} —— 修改设备名/位置。 */
  updateMine: (deviceId: string, data: UserDeviceUpdateRequest) =>
    request<void>({
      url: `/user/devices/${encodeURIComponent(deviceId)}`,
      method: 'put',
      data,
    }),

  /** GET /user/devices/{deviceId}/commands?status=&pageNum=&pageSize= */
  listCommands: (deviceId: string, params: CommandQuery) =>
    request<PageResult<DeviceCommand>>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/commands`,
      method: 'get',
      params,
    }),

  /** GET /user/devices/{deviceId}/commands/stats */
  commandStats: (deviceId: string) =>
    request<CommandStatsVO>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/commands/stats`,
      method: 'get',
    }),

  /** POST /user/devices/{deviceId}/commands/batch —— 返回按提交顺序的 commandId 列表。 */
  batchControl: (deviceId: string, data: BatchCommandRequest) =>
    request<string[]>({
      url: `/user/devices/${encodeURIComponent(deviceId)}/commands/batch`,
      method: 'post',
      data,
    }),

  /** POST /user/devices/bind —— 4205 绑定码错误 / 4206 已绑定 / 4207 他人已绑定。 */
  bindDevice: (data: { deviceId: string; bindCode: string }) =>
    request<void>({
      url: '/user/devices/bind',
      method: 'post',
      data,
    }),

  /** POST /user/devices/unbind —— 4209 未绑定或已解绑。 */
  unbindDevice: (data: { deviceId: string }) =>
    request<void>({
      url: '/user/devices/unbind',
      method: 'post',
      data,
    }),

  /** POST /user/devices/control —— 返回 commandId，可能为 null。 */
  controlDevice: (data: DeviceControlRequest) =>
    request<string | null>({
      url: '/user/devices/control',
      method: 'post',
      data,
    }),
}
