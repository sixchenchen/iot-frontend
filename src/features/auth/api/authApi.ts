import { request } from '@/lib/request'

export interface LoginPayload {
  username: string
  password: string
}

// 直接对应后端返回的 data 结构
export interface LoginResponse {
  token: string
  username: string
  nickname: string
  refreshToken: string
  lastLoginTime: string
  roles: string[]
  permissions: string[]
  expiresAt: string
}

export const authApi = {
  login: (payload: LoginPayload) =>
    request<LoginResponse>({
      url: '/auth/login',
      method: 'post',
      data: payload,
    }),
    
  me: () => request<any>({ url: '/auth/me', method: 'get' }),
}