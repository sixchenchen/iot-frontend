/**
 * 统一错误日志入口。
 * 后续可在此接入 Sentry / 埋点，业务代码不需要改。
 */
export function logError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  console.error(`[${scope}]`, error, extra ?? '')
  // TODO: Sentry.captureException(error, { tags: { scope }, extra })
}
