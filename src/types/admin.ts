/**
 * 管理端运维类型（文档 8.9）。
 *
 * 说明：项目暂无独立审计表，/admin/audit-logs 复用指令流水（DeviceCommand），
 * 因此审计日志复用 types/command.ts 的 DeviceCommand 类型。
 */
export interface DashboardSummaryVO {
  deviceTotal: number
  onlineCount: number
  offlineCount: number
  todayCommandCount: number
  todayFailedCount: number
  /** 百分比，两位小数。 */
  failureRate: number
  otaRunningCount: number
  unhandledAlertCount: number
}
