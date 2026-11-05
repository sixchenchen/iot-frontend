import { isAxiosError } from 'axios'
import { getBusinessMessage } from './errorCodes'

export interface ErrorPayload {
  code?: number
  message?: string
}

/**
 * 从 unknown 错误中安全提取可读消息。
 * 优先级：Axios 响应体 message > 业务码文案 > Error.message > 字符串 > fallback
 *
 * ⚠️ 必须先判断 AxiosError：它继承自 Error，若先走 `instanceof Error` 分支，
 * 只会拿到 "Request failed with status code 401"，从而丢失后端真实文案。
 * 后端 message 通常比前端映射更精确，因此优先使用；仅当 message 缺失时
 * 才按业务码兜底（例如 4013 →「账号已锁定，请 15 分钟后再试」）。
 */
export function getErrorMessage(
  error: unknown,
  fallback = '请求失败，请稍后重试',
): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as ErrorPayload | undefined
    if (typeof data?.message === 'string' && data.message) {
      return data.message
    }
    const codeMessage = getBusinessMessage(data?.code)
    if (codeMessage) return codeMessage
    if (error.message) return error.message
    return fallback
  }

  if (error instanceof Error) {
    if (error.message) return error.message
    const codeMessage = getBusinessMessage((error as Error & { code?: number }).code)
    if (codeMessage) return codeMessage
    return fallback
  }

  if (typeof error === 'string') {
    return error || fallback
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }

  return fallback
}
