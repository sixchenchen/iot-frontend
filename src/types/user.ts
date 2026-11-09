import type { PageQuery } from '@/types/api'

/**
 * ============================================================================
 * 用户领域类型（文档 8.1 / 8.6）
 * ============================================================================
 * 用户端资料与登录日志走 /api/user/**；
 * 管理端用户列表、详情、启停、角色与强制解绑走 /api/admin/users/**。
 * ============================================================================
 */

/** GET /user/profile 的响应（avatar 已由 `sys_user.avatar` 持久化）。 */
export interface UserProfileVO {
  userId: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  /** 1-启用, 0-禁用 */
  status: number
  roles: string[]
  permissions: string[]
  lastLoginTime: string | null
  createTime: string | null
}

/** PUT /user/profile 的请求体：字段可省略，传 null 表示不修改。 */
export interface UserProfileUpdateRequest {
  nickname?: string | null
  email?: string | null
  phone?: string | null
  /** 上传接口返回的 `/files/avatar/{uuid}.{ext}`；空串表示清除头像。 */
  avatar?: string | null
}

/** PUT /user/password 的请求体：修改成功后后端会撤销全部 RefreshToken。 */
export interface PasswordChangeRequest {
  oldPassword: string
  newPassword: string
}

/** GET /user/login-logs 的分页元素。 */
export interface LoginLogVO {
  id: number
  username: string
  ip: string | null
  userAgent: string | null
  /** 1-成功, 0-失败（后端登录日志语义） */
  status: number
  message: string | null
  loginTime: string | null
}

/** 管理端用户列表元素。 */
export interface AdminUserVO {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  status: number
  roles: string[]
  lastLoginTime: string | null
  createTime: string | null
}

/** 管理端用户详情：在列表字段基础上补充统计与权限码。 */
export interface AdminUserDetailVO extends AdminUserVO {
  deviceCount: number
  loginCount: number
  permissions: string[]
  updateTime: string | null
}

/** 管理端用户列表筛选参数。 */
export interface AdminUserQuery extends PageQuery {
  keyword?: string
  status?: number
  /** 角色编码，后端兼容旧参数名 roleCode。 */
  role?: string
}

/** PUT /admin/users/{id} 的请求体。 */
export interface AdminUserUpdateRequest {
  nickname?: string
  email?: string
  phone?: string
}

/** PUT /admin/users/{id}/status 的请求体。 */
export interface UserStatusUpdateRequest {
  status: 0 | 1
}

/** PUT /admin/users/{id}/roles 的请求体：整体替换角色，不能为空。 */
export interface UserRolesUpdateRequest {
  roleCodes: string[]
}

/** POST /admin/users/{id}/force-unbind 的请求体。 */
export interface ForceUnbindRequest {
  deviceId: string
}
