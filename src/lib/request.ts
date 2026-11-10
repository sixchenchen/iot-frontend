import axios, {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types/api'
import {
  clearAuthStorage,
  getAccessToken,
  getRefreshToken,
  isAccessTokenExpired,
  saveTokens,
} from './auth-storage'

/**
 * ============================================================================
 * 全项目统一 HTTP 请求层（唯一 axios 出口）
 * ============================================================================
 * 职责：
 *   1. 统一 baseURL / 超时 / 请求头；
 *   2. 自动注入 AccessToken（Bearer）；
 *   3. 解包后端统一响应体 { code, message, data }，业务层拿到的直接是 data；
 *   4. HTTP 401 时用 RefreshToken 续期，并重放被挂起的并发请求；
 *   5. 统一错误提示 + 只清理认证白名单 + SPA 内跳转登录页。
 *
 * 后端约定（需与后端确认后写入接口文档）：
 *   - 成功业务码：code === 0 或 code === 200；其余一律视为失败；
 *   - HTTP 401 表示「未认证 / 凭证过期」，而不是「业务参数错误」。
 * ============================================================================
 */

/** 不允许触发「自动刷新」的接口：登录失败、注册、刷新本身、登出、找回密码。 */
const NO_REFRESH_URLS = [
  '/auth/captcha',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
]

/** 错误提示由页面自行处理的接口（避免拦截器与页面重复弹 toast）。 */
const SILENT_ERROR_URLS = [
  '/auth/captcha',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  // 健康检查在 Header 常驻轮询，失败只展示状态标签，不弹全局错误。
  '/actuator/health',
]

/** HTTP 状态码 → 用户可读文案。 */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: '请求参数有误',
  403: '没有操作权限，请联系管理员',
  404: '请求的资源不存在',
  405: '请求方式不被支持',
  408: '请求超时，请稍后重试',
  429: '操作过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务响应超时，请稍后重试',
}

/** 请求配置上的自定义字段（axios 默认类型未声明）。 */
interface RetryableConfig extends InternalAxiosRequestConfig {
  /** 是否已经重试过，防止无限刷新循环。 */
  _retry?: boolean
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

/**
 * 刷新专用实例：不挂拦截器，避免刷新接口自身 401 时再次进入刷新逻辑。
 * 仍然复用同一 baseURL，保证与业务请求打到同一个后端。
 */
const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

function isNoRefreshUrl(url?: string): boolean {
  if (!url) return false
  return NO_REFRESH_URLS.some((item) => url.includes(item))
}

function isSilentUrl(url?: string): boolean {
  if (!url) return false
  return SILENT_ERROR_URLS.some((item) => url.includes(item))
}

/** 统一错误提示。grouping 让并发相同报错合并展示，避免刷屏。 */
function showErrorToast(message: string): void {
  if (!message) return
  ElMessage({ message, type: 'error', duration: 3000, grouping: true })
}

/** 从任意异常中提取后端 message（用于 401 之外的服务端响应）。 */
function extractHttpErrorMessage(error: AxiosError): string {
  const data = error.response?.data as Partial<ApiResponse<unknown>> | undefined
  if (data && typeof data.message === 'string' && data.message) {
    return data.message
  }
  const status = error.response?.status
  if (status && HTTP_ERROR_MESSAGES[status]) {
    return HTTP_ERROR_MESSAGES[status]
  }
  if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (!error.response) return '网络异常，请检查网络连接'
  return '请求失败，请稍后重试'
}

/**
 * 请求拦截器：补 Authorization 头。
 * token 只作「携带凭证」，前端不做任何签名/加密；真正的鉴权由后端完成。
 */
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 并发刷新控制：同一时刻只允许一个刷新请求，其余请求挂起等待。 */
let isRefreshing = false

interface PendingRequest {
  resolve: (token: string) => void
  reject: (error: unknown) => void
}

let requestQueue: PendingRequest[] = []

/** 刷新成功后统一放行挂起请求。 */
function flushQueue(token: string): void {
  requestQueue.forEach((item) => item.resolve(token))
  requestQueue = []
}

/** 刷新失败后统一拒绝挂起请求，避免 Promise 永久 pending 导致页面 loading 卡死。 */
function rejectQueue(error: unknown): void {
  requestQueue.forEach((item) => item.reject(error))
  requestQueue = []
}

/**
 * 清理登录态并在 SPA 内跳转登录页。
 * - 使用 router.replace 而不是 location.href：保留 SPA 状态、支持子路径部署、
 *   不会整页刷新丢失未提交数据；
 * - 动态 import 路由实例，避免 request → router → guards → store → api → request
 *   的循环依赖在模块初始化阶段互相等待。
 */
async function redirectToLogin(): Promise<void> {
  clearAuthStorage()
  try {
    const { default: router } = await import('@/router')
    const current = router.currentRoute.value
    if (current.name === 'Login') return
    const redirect = current.fullPath && current.fullPath !== '/' ? current.fullPath : undefined
    await router.replace({ name: 'Login', query: redirect ? { redirect } : undefined })
    showErrorToast('登录状态已失效，请重新登录')
  } catch {
    // 路由尚未就绪（极早期 401）时退化为整页跳转，保证不会停留在无权限页面。
    window.location.assign('/login')
  }
}

/**
 * 刷新 AccessToken。
 * - 显式校验 HTTP 状态以外的业务包装，避免后端返回 200 + code!=0 时把
 *   undefined 写入 localStorage；
 * - 同时兼容后端做 RefreshToken 轮换（返回新的 refreshToken）。
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('没有刷新凭证')

  const response = await refreshClient.post<
    ApiResponse<{ token: string; refreshToken?: string; expiresAt?: string }>
  >('/auth/refresh', { refreshToken })

  const body = response.data
  if (!body || body.code === undefined || (body.code !== 0 && body.code !== 200)) {
    throw new Error(body?.message || '刷新登录状态失败')
  }
  const token = body.data?.token
  if (!token) throw new Error('刷新登录状态失败：未返回 Token')

  saveTokens({
    accessToken: token,
    refreshToken: body.data?.refreshToken,
    expiresAt: body.data?.expiresAt,
  })
  return token
}

/**
 * 全局共享的刷新 Promise。
 * HTTP 拦截器与 WebSocket beforeConnect 共用同一刷新流程：
 *   - 避免两边同时调用 /auth/refresh 导致 RefreshToken 旋转后互相报废；
 *   - 刷新完成后清空，后续调用重新发起。
 */
let sharedRefreshPromise: Promise<string> | null = null

function refreshAccessTokenOnce(): Promise<string> {
  if (!sharedRefreshPromise) {
    sharedRefreshPromise = refreshAccessToken().finally(() => {
      sharedRefreshPromise = null
    })
  }
  return sharedRefreshPromise
}

/**
 * 获取「即将过期则先刷新」的 AccessToken。
 * WebSocket 连接/重连前调用，避免带上一个几秒后失效的 Token。
 *
 * @param bufferMs 提前刷新窗口，默认 5 分钟（WS 心跳期间 Token 不应中途失效）。
 */
export async function getFreshAccessToken(bufferMs = 5 * 60_000): Promise<string> {
  const token = getAccessToken()
  if (token && !isAccessTokenExpired(bufferMs)) return token
  return refreshAccessTokenOnce()
}

/**
 * axios 的类型声明要求成功拦截器必须返回 AxiosResponse，但本层刻意返回
 * 「已解包的业务数据」（运行时 axios 允许）。这里用受控断言绕过类型约束，
 * 由对外入口 request<T>() 恢复正确的业务类型。
 */
function unwrap(value: unknown): AxiosResponse {
  return value as unknown as AxiosResponse
}

http.interceptors.response.use(
  (res: AxiosResponse<ApiResponse<unknown>>) => {
    const body = res.data
    // 兜底：文件流、第三方接口等没有统一包装时原样返回。
    if (!body || typeof body.code === 'undefined') return unwrap(body)

    // 业务失败：HTTP 200 但业务码非成功 → 统一提示并 reject。
    if (body.code !== 0 && body.code !== 200) {
      const message = body.message || '请求失败'
      if (!isSilentUrl(res.config?.url)) showErrorToast(message)
      const error = new Error(message)
      ;(error as Error & { code?: number }).code = body.code
      return Promise.reject(error)
    }
    return unwrap(body.data)
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined
    const status = error.response?.status
    const url = originalRequest?.url

    // ============ 1. 401 且不在白名单：尝试刷新一次 ============
    if (status === 401 && originalRequest && !originalRequest._retry && !isNoRefreshUrl(url)) {
      originalRequest._retry = true

      // 已有刷新在进行：把当前请求挂起，等新 token 到达后重放。
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          requestQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(http(originalRequest))
            },
            reject,
          })
        })
      }

      isRefreshing = true
      try {
        const newToken = await refreshAccessTokenOnce()
        flushQueue(newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return http(originalRequest)
      } catch (refreshError) {
        // 刷新失败：先 reject 队列（含当前请求），再清理登录态并跳转。
        rejectQueue(refreshError)
        await redirectToLogin()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // ============ 2. 白名单内的 401（如密码错误）：交给页面展示真实原因 ============
    if (status === 401 && isNoRefreshUrl(url)) {
      if (!isSilentUrl(url)) showErrorToast('用户名或密码错误，或登录状态已失效')
      return Promise.reject(error)
    }

    // ============ 3. 其它 401：凭证确实无效，直接清理并回登录页 ============
    if (status === 401) {
      const current = window.location.pathname
      if (current !== '/login') {
        await redirectToLogin()
      }
      return Promise.reject(error)
    }

    // ============ 4. 常规错误：按状态码映射文案 ============
    const message = extractHttpErrorMessage(error)
    if (!isSilentUrl(url)) showErrorToast(message)
    const normalized = new Error(message)
    ;(normalized as Error & { status?: number }).status = status
    return Promise.reject(normalized)
  },
)

/**
 * 对外统一入口：业务层只关心 T（即后端 body.data 的类型）。
 * 说明：响应拦截器已解包，因此这里的类型断言是必要且受控的。
 */
export function request<T>(config: Parameters<typeof http.request>[0]): Promise<T> {
  return http.request(config) as unknown as Promise<T>
}
