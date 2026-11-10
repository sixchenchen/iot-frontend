import { request } from '@/lib/request'
import type { PageResult } from '@/types/api'
import type { DashboardSummaryVO } from '@/types/admin'
import type { CommandQuery, DeviceCommand } from '@/types/command'

/**
 * ============================================================================
 * 管理端运维接口
 * ============================================================================
 *   - GET /admin/dashboard/summary（权限 device:list）
 *   - GET /admin/audit-logs（权限 device:list）
 *
 * 已知限制：项目暂无独立审计表，/audit-logs 复用 device_command 指令流水，
 * 只反映「指令类操作」。页面文案应明确为「指令审计」，不要承诺覆盖全部操作。
 * ============================================================================
 */
export const opsApi = {
  /** GET /admin/dashboard/summary */
  summary: () =>
    request<DashboardSummaryVO>({
      url: '/admin/dashboard/summary',
      method: 'get',
    }),

  /**
   * GET /admin/audit-logs
   * 参数：deviceId、operator、source（WEB/API/SCHEDULE/SYSTEM）、from、to。
   */
  auditLogs: (params: CommandQuery & { operator?: string; source?: string }) =>
    request<PageResult<DeviceCommand>>({
      url: '/admin/audit-logs',
      method: 'get',
      params,
    }),
}
