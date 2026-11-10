import { request } from '@/lib/request'
import type { PageQuery, PageResult } from '@/types/api'
import type { Device } from '@/types/device'
import type {
  AdminUserCreateRequest,
  AdminUserDetailVO,
  AdminUserQuery,
  AdminUserUpdateRequest,
  AdminUserVO,
  ForceUnbindRequest,
  UserRolesUpdateRequest,
  UserStatusUpdateRequest,
} from '@/types/user'

/**
 * ============================================================================
 * 管理端用户接口
 * ============================================================================
 * 全部需要 ADMIN 角色，具体接口再校验权限码：
 *   - user:list   → 列表、详情、用户绑定设备
 *   - user:update → 编辑资料、启停、分配角色
 *   - user:delete → 删除用户
 *   - device:unbind → 强制解绑
 * ============================================================================
 */
export const adminUserApi = {
  /** GET /admin/users?pageNum=&pageSize=&keyword=&status=&role= */
  list: (params: AdminUserQuery) =>
    request<PageResult<AdminUserVO>>({
      url: '/admin/users',
      method: 'get',
      params,
    }),

  /** GET /admin/users/{id} */
  detail: (id: number) =>
    request<AdminUserDetailVO>({
      url: `/admin/users/${id}`,
      method: 'get',
    }),

  /** POST /admin/users —— 新增用户并分配角色，返回新用户 ID。 */
  create: (data: AdminUserCreateRequest) =>
    request<number>({
      url: '/admin/users',
      method: 'post',
      data,
    }),

  /** PUT /admin/users/{id} —— 编辑昵称/邮箱/手机号。 */
  update: (id: number, data: AdminUserUpdateRequest) =>
    request<void>({
      url: `/admin/users/${id}`,
      method: 'put',
      data,
    }),

  /** PUT /admin/users/{id}/status —— 启用/禁用。 */
  updateStatus: (id: number, data: UserStatusUpdateRequest) =>
    request<void>({
      url: `/admin/users/${id}/status`,
      method: 'put',
      data,
    }),

  /** PUT /admin/users/{id}/roles —— 整体替换角色，roleCodes 不能为空。 */
  updateRoles: (id: number, data: UserRolesUpdateRequest) =>
    request<void>({
      url: `/admin/users/${id}/roles`,
      method: 'put',
      data,
    }),

  /** GET /admin/users/{id}/devices?pageNum=&pageSize= */
  devices: (id: number, params: PageQuery) =>
    request<PageResult<Device>>({
      url: `/admin/users/${id}/devices`,
      method: 'get',
      params,
    }),

  /** POST /admin/users/{id}/force-unbind —— 便于设备转绑其他用户。 */
  forceUnbind: (id: number, data: ForceUnbindRequest) =>
    request<void>({
      url: `/admin/users/${id}/force-unbind`,
      method: 'post',
      data,
    }),

  /** DELETE /admin/users/{id} —— 逻辑删除，用户名会被改写为 #DEL# 前缀。 */
  deleteUser: (id: number) =>
    request<void>({
      url: `/admin/users/${id}`,
      method: 'delete',
    }),
}
