/**
 * ============================================================================
 * 通用能力类型（文档 8.10）
 * ============================================================================
 * 字典接口的 data 为对象，各 key 结构不同；后端若缺少某个 key，
 * 前端统一按空数组降级，避免页面因 undefined 崩溃。
 * ============================================================================
 */

/** 字典下拉项（value 可能是数字或字符串）。 */
export interface DictionaryOption {
  value: string | number
  label: string
}

/** 角色下拉项（来自 sys_role）。 */
export interface RoleOption {
  code: string
  name: string
}

/** GET /common/dictionaries 的响应。 */
export interface Dictionaries {
  roles: RoleOption[]
  userStatus: DictionaryOption[]
  deviceOnline: DictionaryOption[]
  commandStatus: DictionaryOption[]
  otaState: DictionaryOption[]
  alertLevel: DictionaryOption[]
  alertStatus: DictionaryOption[]
  products: string[]
}

/** POST /common/upload/avatar 的响应。 */
export interface AvatarUploadResponse {
  url: string
  size: number
  contentType: string
}

/** GET /actuator/health 的响应（只关心整体 status）。 */
export interface HealthStatus {
  status: string
  components?: Record<string, unknown>
}
