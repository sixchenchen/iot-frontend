import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../getErrorMessage'

/**
 * 回归用例：AxiosError 继承自 Error，若先判断 instanceof Error，
 * 会丢失后端返回的真实业务文案（本次 E2E 已实际暴露该缺陷）。
 */
describe('getErrorMessage', () => {
  it('优先返回 Axios 响应体中的后端 message', () => {
    const axiosLikeError = {
      isAxiosError: true,
      message: 'Request failed with status code 401',
      response: { status: 401, data: { code: 401, message: '用户名或密码错误' } },
    }

    expect(getErrorMessage(axiosLikeError, '兜底文案')).toBe('用户名或密码错误')
  })

  it('无响应体 message 时回退到 Error.message', () => {
    const axiosLikeError = {
      isAxiosError: true,
      message: 'Network Error',
      response: undefined,
    }

    expect(getErrorMessage(axiosLikeError, '兜底文案')).toBe('Network Error')
  })

  it('未知类型返回兜底文案', () => {
    expect(getErrorMessage(null, '兜底文案')).toBe('兜底文案')
    expect(getErrorMessage({}, '兜底文案')).toBe('兜底文案')
  })
})
