import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type {
  AdminRoleDetailVO,
  AdminRoleQuery,
  AdminRoleSaveRequest,
  AdminRoleVO,
  RolePermissionsUpdateRequest,
  RoleStatusUpdateRequest,
} from '@/types/access'

/**
 * ============================================================================
 * 管理端角色接口（文档 8.11）
 * ============================================================================
 * 权限码：
 *   - role:list              → 分页、全部角色、详情、查询角色权限
 *   - role:create            → 新增
 *   - role:update            → 编辑、启停
 *   - role:delete            → 删除（内置角色与已绑定用户的角色会被后端拒绝）
 *   - role:assign-permission → 覆盖式分配权限
 * ============================================================================
 */
export const roleApi = {
  /** GET /admin/roles?pageNum=&pageSize=&keyword=&status= */
  list: (params: AdminRoleQuery) =>
    request<PageResult<AdminRoleVO>>({
      url: '/admin/roles',
      method: 'get',
      params,
    }),

  /** GET /admin/roles/all —— 下拉选择用，不分页。 */
  all: () =>
    request<AdminRoleVO[]>({
      url: '/admin/roles/all',
      method: 'get',
    }),

  /** GET /admin/roles/{id} —— 含 permissionIds / permCodes。 */
  detail: (id: number) =>
    request<AdminRoleDetailVO>({
      url: `/admin/roles/${id}`,
      method: 'get',
    }),

  /** POST /admin/roles —— 返回新角色 ID。 */
  create: (data: AdminRoleSaveRequest) =>
    request<number>({
      url: '/admin/roles',
      method: 'post',
      data,
    }),

  /** PUT /admin/roles/{id} —— 内置角色不允许修改 roleCode。 */
  update: (id: number, data: AdminRoleSaveRequest) =>
    request<void>({
      url: `/admin/roles/${id}`,
      method: 'put',
      data,
    }),

  /** PUT /admin/roles/{id}/status —— 内置角色不允许禁用。 */
  updateStatus: (id: number, data: RoleStatusUpdateRequest) =>
    request<void>({
      url: `/admin/roles/${id}/status`,
      method: 'put',
      data,
    }),

  /** DELETE /admin/roles/{id} —— 仍有用户绑定时返回 4402。 */
  remove: (id: number) =>
    request<void>({
      url: `/admin/roles/${id}`,
      method: 'delete',
    }),

  /** GET /admin/roles/{id}/permissions —— 角色已有权限 ID 列表。 */
  permissions: (id: number) =>
    request<number[]>({
      url: `/admin/roles/${id}/permissions`,
      method: 'get',
    }),

  /** PUT /admin/roles/{id}/permissions —— 覆盖式分配，空数组表示清空。 */
  updatePermissions: (id: number, data: RolePermissionsUpdateRequest) =>
    request<void>({
      url: `/admin/roles/${id}/permissions`,
      method: 'put',
      data,
    }),
}
