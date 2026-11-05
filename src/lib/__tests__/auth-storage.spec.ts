import { describe, expect, it, beforeEach } from 'vitest'
import {
  AUTH_STORAGE_KEYS,
  clearAuthStorage,
  getRememberedUsername,
  getTokenExpiry,
  isAccessTokenExpired,
  readJSON,
  saveRememberedUsername,
  saveTokens,
  writeJSON,
} from '../auth-storage'

/**
 * 认证存储层的核心保障：
 *   1. 脏数据不能导致应用启动崩溃；
 *   2. 退出登录只能清理认证白名单，不能误删同源其他数据。
 */
describe('auth-storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('readJSON 遇到非法 JSON 时返回兜底值并删除脏键', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.userInfo, '{bad json')

    expect(readJSON(AUTH_STORAGE_KEYS.userInfo, null)).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.userInfo)).toBeNull()
  })

  it('readJSON 能正常解析合法 JSON', () => {
    writeJSON(AUTH_STORAGE_KEYS.roles, ['ADMIN'])

    expect(readJSON<string[]>(AUTH_STORAGE_KEYS.roles, [])).toEqual(['ADMIN'])
  })

  it('clearAuthStorage 只清理认证键，保留其他业务数据与记住的用户名', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'token')
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, 'refresh')
    writeJSON(AUTH_STORAGE_KEYS.userInfo, { username: 'admin', nickname: '管理员' })
    saveRememberedUsername('admin')
    localStorage.setItem('theme_mode', 'dark')

    clearAuthStorage()

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.userInfo)).toBeNull()
    // 「记住用户名」应在退出后保留，直到用户取消勾选。
    expect(getRememberedUsername()).toBe('admin')
    // 非认证键必须保留。
    expect(localStorage.getItem('theme_mode')).toBe('dark')
  })

  it('saveTokens 兼容 ISO 时间与时间戳，并能判断过期', () => {
    saveTokens({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2020-01-01T00:00:00Z',
    })

    expect(getTokenExpiry()).toBe(Date.parse('2020-01-01T00:00:00Z'))
    expect(isAccessTokenExpired()).toBe(true)

    saveTokens({
      accessToken: 'token',
      expiresAt: Date.now() + 3600_000,
    })

    expect(isAccessTokenExpired()).toBe(false)
  })
})
