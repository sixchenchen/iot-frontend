import { request } from '@/lib/request'

/**
 * ============================================================================
 * 认证接口（features/auth/api）
 * ============================================================================
 * 覆盖文档第 4 章已实现的 4 个认证接口：register / login / refresh / logout。
 *
 * 约定：
 *   - 登录响应字段是 token（不是 accessToken），同时返回 refreshToken；
 *   - RefreshToken 一次一换（旋转），刷新后必须用返回值覆盖两个 token；
 *   - 登出时 AccessToken 会被加入黑名单，RefreshToken 被撤销；
 *   - 所有函数返回值均为后端 body.data（request.ts 已解包）。
 * ============================================================================
 */

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  password: string
  nickname?: string
  email?: string
  phone?: string
}

export interface RegisterResponse {
  userId: number
  username: string
  nickname: string
}

export interface LoginResponse {
  token: string
  username: string
  nickname: string
  refreshToken: string
  lastLoginTime: string | null
  roles: string[]
  permissions: string[]
  /** 格式 yyyy-MM-dd HH:mm:ss（auth-storage 的 normalizeExpiry 已兼容）。 */
  expiresAt: string
}

export const authApi = {
  /** POST /auth/login —— 业务码 4010/4011/4013（HTTP 200 返回）。 */
  login: (payload: LoginPayload) =>
    request<LoginResponse>({
      url: '/auth/login',
      method: 'post',
      data: payload,
      // 后端会读取该头写入 RefreshToken 记录；不传时默认 web。
      headers: { 'X-Device-Type': 'web' },
    }),

  /** POST /auth/register —— 注册成功不自动登录，需再调登录接口。 */
  register: (payload: RegisterPayload) =>
    request<RegisterResponse>({
      url: '/auth/register',
      method: 'post',
      data: payload,
    }),

  /** POST /auth/refresh —— 错误码 4012/4015；旧 refreshToken 立即失效。 */
  refresh: (refreshToken: string) =>
    request<LoginResponse>({
      url: '/auth/refresh',
      method: 'post',
      data: { refreshToken },
    }),

  /** POST /auth/logout —— refreshToken 可传 null；失败也应由调用方本地清理。 */
  logout: (refreshToken?: string) =>
    request<void>({
      url: '/auth/logout',
      method: 'post',
      data: { refreshToken: refreshToken ?? null },
    }),
}
