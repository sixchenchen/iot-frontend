import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types/api'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res: AxiosResponse<ApiResponse<unknown>>) => {
    const body = res.data
    if (body.code !== 0 && body.code !== 200) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body.data as any
  },
  (error) => {
    if (error.response?.status === 401) {
      // 1. 清除本地 Token
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')

      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  // 增加 token !== 'undefined' 的校验
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function request<T>(config: Parameters<typeof http.request>[0]): Promise<T> {
  return http.request(config) as unknown as Promise<T>
}