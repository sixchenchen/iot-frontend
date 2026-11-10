import { describe, expect, it } from 'vitest'
import { getErrorCode, getErrorMessage } from '../getErrorMessage'

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

/** 业务码用于页面差异化处理（如验证码错误后刷新图片）。 */
describe('getErrorCode', () => {
  it('读取业务失败 Error 上挂载的 code', () => {
    const businessError = Object.assign(new Error('验证码错误'), { code: 4031 })

    expect(getErrorCode(businessError)).toBe(4031)
  })

  it('读取 Axios 响应体中的 code', () => {
    const axiosLikeError = {
      isAxiosError: true,
      message: 'Request failed with status code 403',
      response: { status: 403, data: { code: 4030, message: '验证码已过期' } },
    }

    expect(getErrorCode(axiosLikeError)).toBe(4030)
  })

  it('无法识别时返回 undefined', () => {
    expect(getErrorCode(null)).toBeUndefined()
    expect(getErrorCode(new Error('network'))).toBeUndefined()
  })
})
