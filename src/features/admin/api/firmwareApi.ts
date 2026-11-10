import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type {
  BatchDispatchQuery,
  FirmwareQuery,
  FirmwareStatusUpdateRequest,
  FirmwareUploadPayload,
  FirmwareUploadResponse,
  FirmwareVO,
  OtaTaskDetailVO,
  OtaTaskQuery,
  OtaTaskVO,
} from '@/types/ota'

/**
 * ============================================================================
 * 管理端固件与 OTA 任务接口
 * ============================================================================
 * 上传使用 multipart/form-data，文件必须是 .bin；
 * 固件列表使用分页接口 `/admin/ota/firmware`，旧 `/firmware/list` 保留兼容；
 * 批量下发同步执行，并生成 OTA 任务（可在任务列表页查看进度）。
 * ============================================================================
 */
export const firmwareApi = {
  /**
   * POST /admin/ota/firmware/upload
   * 错误码：4000 文件为空、4001/4103 超限、4100 版本重复、4105 版本为空、4106 非 .bin。
   * 注意：不要手动设置 Content-Type，浏览器/axios 会自动补 multipart boundary。
   */
  upload: (payload: FirmwareUploadPayload) => {
    const formData = new FormData()
    formData.append('file', payload.file)
    formData.append('version', payload.version)
    formData.append('product', payload.product)
    if (payload.releaseNotes) formData.append('releaseNotes', payload.releaseNotes)
    if (payload.operator) formData.append('operator', payload.operator)

    return request<FirmwareUploadResponse>({
      url: '/admin/ota/firmware/upload',
      method: 'post',
      data: formData,
      // 固件体积较大，上传单独放宽超时（后端 multipart 默认 16MB/20MB）。
      timeout: 60_000,
    })
  },

  /** GET /admin/ota/firmware?pageNum=&pageSize=&product=&status=&keyword= */
  page: (params: FirmwareQuery) =>
    request<PageResult<FirmwareVO>>({
      url: '/admin/ota/firmware',
      method: 'get',
      params,
    }),

  /** GET /admin/ota/firmware/{id} */
  detail: (id: number) =>
    request<FirmwareVO>({
      url: `/admin/ota/firmware/${id}`,
      method: 'get',
    }),

  /** PUT /admin/ota/firmware/{id}/status —— 启用/禁用。 */
  updateStatus: (id: number, data: FirmwareStatusUpdateRequest) =>
    request<void>({
      url: `/admin/ota/firmware/${id}/status`,
      method: 'put',
      data,
    }),

  /** GET /admin/ota/firmware/list —— 返回全部启用固件，不分页（兼容接口）。 */
  list: () =>
    request<FirmwareVO[]>({
      url: '/admin/ota/firmware/list',
      method: 'get',
    }),

  /** DELETE /admin/ota/firmware/{id} —— 4101 不存在、4104 文件缺失。 */
  remove: (id: number) =>
    request<void>({
      url: `/admin/ota/firmware/${id}`,
      method: 'delete',
    }),

  /** POST /admin/ota/batch-dispatch?firmwareId=&targetProduct=&operator= —— 返回成功下发台数。 */
  batchDispatch: (query: BatchDispatchQuery) =>
    request<number>({
      url: '/admin/ota/batch-dispatch',
      method: 'post',
      params: query,
      // 同步执行，设备量大时耗时较长。
      timeout: 60_000,
    }),

  /** GET /admin/ota/tasks?pageNum=&pageSize=&status= */
  tasks: (params: OtaTaskQuery) =>
    request<PageResult<OtaTaskVO>>({
      url: '/admin/ota/tasks',
      method: 'get',
      params,
    }),

  /** GET /admin/ota/tasks/{id} —— 含设备级进度。 */
  taskDetail: (id: number) =>
    request<OtaTaskDetailVO>({
      url: `/admin/ota/tasks/${id}`,
      method: 'get',
    }),

  /** POST /admin/ota/tasks/{id}/cancel —— 返回取消条数。 */
  cancelTask: (id: number) =>
    request<number>({
      url: `/admin/ota/tasks/${id}/cancel`,
      method: 'post',
    }),
}
