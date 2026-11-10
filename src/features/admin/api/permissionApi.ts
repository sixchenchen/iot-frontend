import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type {
  AdminPermissionQuery,
  AdminPermissionSaveRequest,
  AdminPermissionVO,
  PermissionStatusUpdateRequest,
} from '@/types/access'

/**
 * ============================================================================
 * 管理端权限接口（文档 8.12）
 * ============================================================================
 * 权限码：
 *   - permission:list   → 分页、全部权限、详情
 *   - permission:create → 新增
 *   - permission:update → 编辑、启停
 *   - permission:delete → 删除（逻辑删除；被角色引用时返回 4022）
 *
 * 约束：
 *   - permCode 必须符合 `resource:action` 小写格式，创建后不可修改（改则 4024）；
 *   - resource / action 为空时后端自动从 permCode 拆分。
 * ============================================================================
 */
export const permissionApi = {
  /** GET /admin/permissions?pageNum=&pageSize=&keyword=&permType=&resource=&status= */
  list: (params: AdminPermissionQuery) =>
    request<PageResult<AdminPermissionVO>>({
      url: '/admin/permissions',
      method: 'get',
      params,
    }),

  /** GET /admin/permissions/all —— 授权树/分组用，不分页。 */
  all: () =>
    request<AdminPermissionVO[]>({
      url: '/admin/permissions/all',
      method: 'get',
    }),

  /** GET /admin/permissions/{id} */
  detail: (id: number) =>
    request<AdminPermissionVO>({
      url: `/admin/permissions/${id}`,
      method: 'get',
    }),

  /** POST /admin/permissions —— 返回新权限 ID。 */
  create: (data: AdminPermissionSaveRequest) =>
    request<number>({
      url: '/admin/permissions',
      method: 'post',
      data,
    }),

  /** PUT /admin/permissions/{id} —— permCode 不可变更。 */
  update: (id: number, data: AdminPermissionSaveRequest) =>
    request<void>({
      url: `/admin/permissions/${id}`,
      method: 'put',
      data,
    }),

  /** PUT /admin/permissions/{id}/status */
  updateStatus: (id: number, data: PermissionStatusUpdateRequest) =>
    request<void>({
      url: `/admin/permissions/${id}/status`,
      method: 'put',
      data,
    }),

  /** DELETE /admin/permissions/{id} —— 逻辑删除，被角色引用时返回 4022。 */
  remove: (id: number) =>
    request<void>({
      url: `/admin/permissions/${id}`,
      method: 'delete',
    }),
}
