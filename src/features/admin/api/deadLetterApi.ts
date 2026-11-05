import { request } from '@/lib/request'
import type { PageQuery, PageResult } from '@/types/api'
import type { DeadLetter } from '@/types/deadLetter'

/**
 * 管理端死信接口（文档 5.19 / 5.20 / 8.9）。
 * 权限：仅校验 ROLE_ADMIN，没有权限码，因此菜单/页面按角色控制即可。
 * 忽略后 status=2，之后不能再重放。
 */
export const deadLetterApi = {
  /** GET /admin/dead-letters?pageNum=&pageSize= */
  list: (params: PageQuery) =>
    request<PageResult<DeadLetter>>({
      url: '/admin/dead-letters',
      method: 'get',
      params,
    }),

  /** GET /admin/dead-letters/{id} */
  detail: (id: number) =>
    request<DeadLetter>({
      url: `/admin/dead-letters/${id}`,
      method: 'get',
    }),

  /** POST /admin/dead-letters/{id}/replay */
  replay: (id: number) =>
    request<void>({
      url: `/admin/dead-letters/${id}/replay`,
      method: 'post',
    }),

  /** POST /admin/dead-letters/{id}/ignore —— status 置为 2（已忽略）。 */
  ignore: (id: number) =>
    request<void>({
      url: `/admin/dead-letters/${id}/ignore`,
      method: 'post',
    }),
}
