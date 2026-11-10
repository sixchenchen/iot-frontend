import type { PageQuery } from '@/types/api'

/**
 * ============================================================================
 * 权限域类型（文档 8.11 角色管理 / 8.12 权限管理）
 * ============================================================================
 * RBAC 模型：用户 → 角色（sys_role）→ 权限（sys_permission）。
 *   - 角色为内置（builtIn=1）时：不可删除、不可改 roleCode、不可禁用；
 *   - 权限编码创建后不可修改，被角色引用时不可删除；
 *   - 角色授权为「覆盖式」写入，空数组表示清空权限。
 * ============================================================================
 */

/** 权限类型（后端枚举，直出文案由前端映射）。 */
export type PermissionType = 'MENU' | 'BUTTON' | 'API' | 'ACTION'

/** GET /admin/roles 的分页元素。 */
export interface AdminRoleVO {
  id: number
  roleCode: string
  roleName: string
  description: string | null
  /** 1-启用, 0-禁用 */
  status: number
  /** 1-内置角色（ADMIN/OPS/USER），0-自定义 */
  builtIn: number
  userCount: number
  permissionCount: number
  createTime: string | null
  updateTime: string | null
}

/** GET /admin/roles/{id}：详情补充已分配权限。 */
export interface AdminRoleDetailVO extends AdminRoleVO {
  permissionIds: number[]
  permCodes: string[]
}

/** GET /admin/roles 的查询参数。 */
export interface AdminRoleQuery extends PageQuery {
  /** 角色编码/名称模糊匹配 */
  keyword?: string
  status?: number
}

/** POST /admin/roles 与 PUT /admin/roles/{id} 的请求体。 */
export interface AdminRoleSaveRequest {
  roleCode: string
  roleName: string
  description?: string
  status: 0 | 1
}

/** PUT /admin/roles/{id}/status 的请求体。 */
export interface RoleStatusUpdateRequest {
  status: 0 | 1
}

/** PUT /admin/roles/{id}/permissions 的请求体：覆盖式分配。 */
export interface RolePermissionsUpdateRequest {
  permissionIds: number[]
}

/** GET /admin/permissions 的分页元素。 */
export interface AdminPermissionVO {
  id: number
  permCode: string
  permName: string
  permType: PermissionType
  resource: string | null
  action: string | null
  description: string | null
  /** 1-启用, 0-禁用 */
  status: number
  roleCount: number
  createTime: string | null
  updateTime: string | null
}

/** GET /admin/permissions 的查询参数。 */
export interface AdminPermissionQuery extends PageQuery {
  keyword?: string
  permType?: PermissionType
  resource?: string
  status?: number
}

/**
 * POST /admin/permissions 与 PUT /admin/permissions/{id} 的请求体。
 * resource / action 不传时后端按 permCode 的 `resource:action` 自动拆分。
 */
export interface AdminPermissionSaveRequest {
  permCode: string
  permName: string
  permType: PermissionType
  resource?: string
  action?: string
  description?: string
  status: 0 | 1
}

/** PUT /admin/permissions/{id}/status 的请求体。 */
export interface PermissionStatusUpdateRequest {
  status: 0 | 1
}

/** 权限类型展示文案与标签色。 */
export const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
  MENU: '菜单',
  BUTTON: '按钮',
  API: '接口',
  ACTION: '操作',
}

export const PERMISSION_TYPE_TAG_TYPES: Record<PermissionType, 'primary' | 'success' | 'warning' | 'info'> =
  {
    MENU: 'primary',
    BUTTON: 'success',
    API: 'warning',
    ACTION: 'info',
  }

/** 权限类型下拉选项。 */
export const PERMISSION_TYPE_OPTIONS = (
  Object.keys(PERMISSION_TYPE_LABELS) as PermissionType[]
).map((value) => ({ value, label: PERMISSION_TYPE_LABELS[value] }))
