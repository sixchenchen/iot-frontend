import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type {
  OtaCheckResponse,
  OtaProgressVO,
  OtaRecordQuery,
  OtaRecordVO,
} from '@/types/ota'

/**
 * ============================================================================
 * 用户端 OTA 接口
 * ============================================================================
 * 检查更新 → 发起升级 → 进度/历史查询 → 失败重试。
 * 进度也可通过 WebSocket /topic/device/{deviceId}/ota 的 ota_progress 推送获得，
 * 本模块的 progress 接口用于首屏与轮询兜底。
 * ============================================================================
 */
export const otaApi = {
  /**
   * GET /user/ota/check/{deviceId}
   * 错误码：4200 设备不存在、4210 未绑定、4104 固件缺失、4302 版本不兼容。
   */
  check: (deviceId: string) =>
    request<OtaCheckResponse>({
      url: `/user/ota/check/${encodeURIComponent(deviceId)}`,
      method: 'get',
    }),

  /**
   * POST /user/ota/start/{deviceId}（无请求体）
   * 错误码：4201 离线、4300 触发失败、4301 升级中、4302 不兼容、4303 已最新。
   */
  start: (deviceId: string) =>
    request<void>({
      url: `/user/ota/start/${encodeURIComponent(deviceId)}`,
      method: 'post',
    }),

  /** GET /user/ota/progress/{deviceId} */
  progress: (deviceId: string) =>
    request<OtaProgressVO>({
      url: `/user/ota/progress/${encodeURIComponent(deviceId)}`,
      method: 'get',
    }),

  /** GET /user/ota/records?deviceId=&pageNum=&pageSize= —— deviceId 必填。 */
  records: (params: OtaRecordQuery) =>
    request<PageResult<OtaRecordVO>>({
      url: '/user/ota/records',
      method: 'get',
      params,
    }),

  /** POST /user/ota/retry/{deviceId} —— 仅失败/超时/取消的最近一条 OTA 指令可重试。 */
  retry: (deviceId: string) =>
    request<void>({
      url: `/user/ota/retry/${encodeURIComponent(deviceId)}`,
      method: 'post',
    }),
}
