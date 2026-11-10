import { request } from '@/lib/request'
import type {
  AvatarUploadResponse,
  Dictionaries,
  HealthStatus,
} from '@/types/common'

/**
 * ============================================================================
 * 通用能力接口（features/common/api）
 * ============================================================================
 *   - POST /common/upload/avatar（multipart/form-data，字段名 file）
 *   - GET  /common/dictionaries（角色、状态、枚举、产品型号）
 *   - GET  /actuator/health（免认证，不在 /api 前缀下）
 * ============================================================================
 */
export const commonApi = {
  /**
   * POST /common/upload/avatar
   * 限制：≤2MB，仅 image/jpeg、image/png、image/webp。
   * 不要手动设置 Content-Type，交由浏览器补 multipart boundary。
   */
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return request<AvatarUploadResponse>({
      url: '/common/upload/avatar',
      method: 'post',
      data: formData,
      timeout: 60_000,
    })
  },

  /** GET /common/dictionaries —— 后端可能缺少部分 key，调用方需按空数组兜底。 */
  dictionaries: () =>
    request<Partial<Dictionaries>>({
      url: '/common/dictionaries',
      method: 'get',
    }),

  /**
   * GET /actuator/health
   * Spring Boot 健康检查不在 /api 前缀下，因此显式覆盖 baseURL。
   * 开发环境由 vite.config.ts 的 /actuator 代理转发到后端，避免跨域。
   */
  health: () =>
    request<HealthStatus>({
      url: '/actuator/health',
      method: 'get',
      baseURL: '',
      timeout: 10_000,
    }),
}
