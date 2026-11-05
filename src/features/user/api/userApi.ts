import { request } from '@/lib/request'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  LoginLogVO,
  PasswordChangeRequest,
  UserProfileUpdateRequest,
  UserProfileVO,
} from '@/types/user'

/**
 * ============================================================================
 * 用户中心接口（features/user/api）
 * ============================================================================
 * 覆盖文档 8.1 的 4 个用户自助接口：
 *   GET/PUT /user/profile、PUT /user/password、GET /user/login-logs。
 *
 * 注意：
 *   - 修改密码成功后后端会撤销全部 RefreshToken，调用方必须清理本地登录态；
 *   - 头像字段当前恒为 null，上传接口的 URL 由前端自行保存。
 * ============================================================================
 */
export const userApi = {
  /** GET /user/profile */
  getProfile: () =>
    request<UserProfileVO>({
      url: '/user/profile',
      method: 'get',
    }),

  /** PUT /user/profile —— 返回修改后的最新资料。 */
  updateProfile: (data: UserProfileUpdateRequest) =>
    request<UserProfileVO>({
      url: '/user/profile',
      method: 'put',
      data,
    }),

  /** PUT /user/password —— 成功后强制下线。 */
  changePassword: (data: PasswordChangeRequest) =>
    request<void>({
      url: '/user/password',
      method: 'put',
      data,
    }),

  /** GET /user/login-logs?pageNum=&pageSize= */
  loginLogs: (params: PageQuery) =>
    request<PageResult<LoginLogVO>>({
      url: '/user/login-logs',
      method: 'get',
      params,
    }),
}
