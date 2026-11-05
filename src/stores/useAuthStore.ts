import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi, type RegisterPayload } from '@/features/auth/api/authApi'
import { AUTH_STORAGE_KEYS, clearAuthStorage, getAccessToken, getTokenExpiry, isAccessTokenExpired, readJSON, saveTokens, writeJSON } from '@/lib/auth-storage'

/**
 * ============================================================================
 * 认证状态 Store（登录态、角色、权限码的唯一内存来源）
 * ============================================================================
 * 状态模型：
 *   - user        当前用户基础信息 { username, nickname }
 *   - roles       角色列表（后端只有 ADMIN / USER）
 *   - permCodes   细粒度权限码（如 device:list、device:manage）
 *   - token       当前 AccessToken（内存镜像，持久化在 localStorage 白名单键）
 *
 * ⚠️ 安全边界：
 *   localStorage 是可写介质，任何用户都能把它改成 ["ADMIN"]。因此：
 *   - 前端角色/权限只用于「菜单显隐、按钮显示」这类展示控制；
 *   - 接口是否放行必须由后端基于 token 校验；
 *   - 应用启动/刷新后建议调用 /auth/me 校准权限，避免登录快照过期。
 * ============================================================================
 */
interface UserInfo {
  username: string
  nickname: string
}

export const useAuthStore = defineStore('auth', () => {
  /**
   * 初始化从本地缓存恢复。
   * readJSON 内部已做 try/catch：脏数据会被删除并降级为默认值，
   * 不会再出现「localStorage 被改坏 → 启动白屏」的问题。
   */
  const user = ref<UserInfo | null>(readJSON<UserInfo | null>(AUTH_STORAGE_KEYS.userInfo, null))
  const roles = ref<string[]>(readJSON<string[]>(AUTH_STORAGE_KEYS.roles, []))
  const permCodes = ref<string[]>(readJSON<string[]>(AUTH_STORAGE_KEYS.permissions, []))
  const token = ref<string | null>(getAccessToken())
  const expiresAt = ref<number | null>(getTokenExpiry())
  const lastLoginTime = ref<string | null>(
    readJSON<string | null>(AUTH_STORAGE_KEYS.lastLoginTime, null),
  )

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => roles.value.includes('ADMIN'))
  const isUser = computed(() => roles.value.includes('USER'))

  /**
   * 会话是否可用：登录态 + Token 未过期。
   * 与 isLoggedIn 的区别：这里会实时判断过期时间，守卫应使用该方法。
   * 注意：过期判断存在 30 秒提前量；无法解析过期时间时视为未过期，
   * 最终仍由后端 401 兜底。
   */
  function isSessionValid(): boolean {
    return !!token.value && !!user.value && !isAccessTokenExpired()
  }

  function hasRole(role: string): boolean {
    return Array.isArray(roles.value) && roles.value.includes(role)
  }

  function hasPermission(code: string): boolean {
    return Array.isArray(permCodes.value) && permCodes.value.includes(code)
  }

  /** 仅清理内存状态（不触碰 localStorage）。 */
  function clearMemory(): void {
    user.value = null
    roles.value = []
    permCodes.value = []
    token.value = null
    expiresAt.value = null
    lastLoginTime.value = null
  }

  /**
   * 登录：调用接口 → 落盘 token → 同步内存状态 → 持久化用户信息。
   *
   * 注意：
   *   - 不再打印完整登录响应（原实现会把 token/refreshToken 输出到控制台）；
   *   - expiresAt 会被规范化后存储，供守卫与「即将过期提醒」使用；
   *   - 登录成功后建议由后端 /auth/me 再校准一次权限，避免快照过期。
   */
  async function login(username: string, password: string): Promise<void> {
    const res = await authApi.login({ username, password })

    if (!res?.token) {
      throw new Error('登录失败：未获取到 Token')
    }

    // 1. 持久化凭证（只写白名单键，过期时间由 auth-storage 统一规范化）。
    saveTokens({
      accessToken: res.token,
      refreshToken: res.refreshToken,
      expiresAt: res.expiresAt,
    })
    expiresAt.value = getTokenExpiry()

    // 2. 同步内存状态（后端未返回 username/nickname 时回退到登录输入）。
    const userInfo: UserInfo = {
      username: res.username || username,
      nickname: res.nickname || username,
    }
    user.value = userInfo
    roles.value = Array.isArray(res.roles) ? res.roles : []
    permCodes.value = Array.isArray(res.permissions) ? res.permissions : []
    token.value = res.token
    lastLoginTime.value = res.lastLoginTime ?? null

    // 3. 持久化用户快照（仅作首屏缓存，不作为鉴权依据）。
    writeJSON(AUTH_STORAGE_KEYS.userInfo, userInfo)
    writeJSON(AUTH_STORAGE_KEYS.roles, roles.value)
    writeJSON(AUTH_STORAGE_KEYS.permissions, permCodes.value)
    if (lastLoginTime.value) {
      writeJSON(AUTH_STORAGE_KEYS.lastLoginTime, lastLoginTime.value)
    }
  }

  /** 注册：仅透传后端结果，不写入登录态（是否自动登录属于产品策略）。 */
  async function register(payload: RegisterPayload) {
    return authApi.register(payload)
  }

  /**
   * 登出：先通知后端吊销（失败也继续）→ 再彻底清理前端状态。
   * 清理范围限定在认证白名单，不会误删同源下的主题/语言等其他数据。
   */
  async function logout(): Promise<void> {
    try {
      await authApi.logout(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken) || undefined)
    } catch {
      // 后端登出失败不影响前端退出：本地凭证必须清理。
    } finally {
      clearMemory()
      clearAuthStorage()
    }
  }

  /** 异常兜底 / 测试用：清理内存与认证存储。 */
  function reset(): void {
    clearMemory()
    clearAuthStorage()
  }

  /**
   * 多标签页登录态同步：
   * 另一个标签页登录/退出后，本标签页通过 storage 事件同步内存状态，
   * 避免出现「一个标签已退出、另一个仍认为已登录」。
   */
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === AUTH_STORAGE_KEYS.accessToken) {
        token.value = event.newValue || null
        if (!event.newValue) {
          clearMemory()
        }
        return
      }
      if (event.key === AUTH_STORAGE_KEYS.userInfo) {
        user.value = readJSON<UserInfo | null>(AUTH_STORAGE_KEYS.userInfo, null)
        roles.value = readJSON<string[]>(AUTH_STORAGE_KEYS.roles, [])
        permCodes.value = readJSON<string[]>(AUTH_STORAGE_KEYS.permissions, [])
        token.value = getAccessToken()
      }
    })
  }

  return {
    user,
    roles,
    permCodes,
    token,
    expiresAt,
    lastLoginTime,
    isLoggedIn,
    isAdmin,
    isUser,
    isSessionValid,
    hasRole,
    hasPermission,
    login,
    register,
    reset,
    logout,
  }
})
