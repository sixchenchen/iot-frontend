/**
 * ============================================================================
 * 认证相关本地存储的唯一入口
 * ============================================================================
 * 为什么需要这一层：
 *   1. 统一 key 常量，避免各模块散落字符串导致「删了一个、漏了一个」；
 *   2. localStorage 可能被用户/插件写入脏数据，JSON.parse 必须做容错；
 *   3. 退出登录 / 401 只清理认证白名单，绝不能 localStorage.clear()，
 *      否则会误删同源下其他业务（主题、语言、其他应用）的数据；
 *   4. 多标签页同步、Token 过期判断都依赖这里的统一格式。
 *
 * 安全边界：
 *   localStorage 可被任意修改，这里的数据只能用于「展示层控制」，
 *   真正的鉴权必须由后端校验 Token。
 * ============================================================================
 */

/** 认证相关的存储键（白名单，清理登录态时只允许操作这些键）。 */
export const AUTH_STORAGE_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  userInfo: 'user_info',
  roles: 'user_roles',
  permissions: 'user_perms',
  expiresAt: 'token_expires_at',
  lastLoginTime: 'last_login_time',
  rememberedUsername: 'remembered_username',
} as const

/** 登录态清理时允许删除的键（不含「记住用户名」，该键由用户主动取消勾选才清除）。 */
const CLEARABLE_KEYS: string[] = [
  AUTH_STORAGE_KEYS.accessToken,
  AUTH_STORAGE_KEYS.refreshToken,
  AUTH_STORAGE_KEYS.userInfo,
  AUTH_STORAGE_KEYS.roles,
  AUTH_STORAGE_KEYS.permissions,
  AUTH_STORAGE_KEYS.expiresAt,
  AUTH_STORAGE_KEYS.lastLoginTime,
]

/**
 * 安全读取 JSON。
 * 解析失败（脏数据 / 手工改坏）时删除该键并返回兜底值，避免应用启动白屏。
 */
export function readJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(key)
  if (raw === null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    safeRemove(key)
    return fallback
  }
}

/** 安全写入 JSON（配额不足等异常不向上抛，避免阻断登录流程）。 */
export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储不可用（隐私模式 / 配额满）时静默降级为「仅内存态」。
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** 获取 AccessToken（字符串 "undefined"/"null" 视为无值，历史脏数据兜底）。 */
export function getAccessToken(): string | null {
  const token = safeGet(AUTH_STORAGE_KEYS.accessToken)
  return token && token !== 'undefined' && token !== 'null' ? token : null
}

/** 获取 RefreshToken。 */
export function getRefreshToken(): string | null {
  const token = safeGet(AUTH_STORAGE_KEYS.refreshToken)
  return token && token !== 'undefined' && token !== 'null' ? token : null
}

/**
 * 规范化后端返回的过期时间。
 * 兼容 ISO 字符串与「秒 / 毫秒」时间戳；无法解析时返回 null（视为未知）。
 */
export function normalizeExpiry(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value
  }
  // 兼容后端常见的 "YYYY-MM-DD HH:mm:ss"（Safari 不接受空格分隔）。
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ? value.replace(' ', 'T')
    : value
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

/** 写入 Token 与过期时间。 */
export function saveTokens(params: {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | number | null
}): void {
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, params.accessToken)
  if (params.refreshToken) {
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, params.refreshToken)
  }
  const expiry = normalizeExpiry(params.expiresAt)
  if (expiry) {
    localStorage.setItem(AUTH_STORAGE_KEYS.expiresAt, String(expiry))
  } else {
    // 后端未返回新的过期时间时清掉旧值，避免刷新拿到新 Token 后
    // 仍被上一枚 Token 的过期时间误判为「已过期」。
    safeRemove(AUTH_STORAGE_KEYS.expiresAt)
  }
}

/** 读取规范化后的 Token 过期时间（毫秒时间戳），未知时返回 null。 */
export function getTokenExpiry(): number | null {
  const raw = safeGet(AUTH_STORAGE_KEYS.expiresAt)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 判断 AccessToken 是否已过期。
 * @param bufferMs 提前量，默认 30 秒，避免「刚好在过期瞬间发请求」。
 * @returns true=已过期；false=未过期或无法判断（此时交给后端 401 兜底）。
 */
export function isAccessTokenExpired(bufferMs = 30_000): boolean {
  const raw = safeGet(AUTH_STORAGE_KEYS.expiresAt)
  if (!raw) return false
  const expiry = Number(raw)
  if (!Number.isFinite(expiry)) return false
  return Date.now() + bufferMs >= expiry
}

/** 清理全部认证数据（只删白名单，保留用户主动记住的其他偏好）。 */
export function clearAuthStorage(): void {
  CLEARABLE_KEYS.forEach(safeRemove)
}

/** 记住登录用户名（「记住我」勾选时写入）。 */
export function saveRememberedUsername(username: string): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEYS.rememberedUsername, username)
  } catch {
    // ignore
  }
}

/** 读取「记住我」保存的用户名。 */
export function getRememberedUsername(): string {
  return safeGet(AUTH_STORAGE_KEYS.rememberedUsername) ?? ''
}

/** 清除「记住我」保存的用户名。 */
export function clearRememberedUsername(): void {
  safeRemove(AUTH_STORAGE_KEYS.rememberedUsername)
}
