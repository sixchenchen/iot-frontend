/**
 * 死信记录（GET /admin/dead-letters 的 Page<SysDeadLetter> 元素）。
 * 详情接口返回同一结构，因此无需额外定义。
 */
export interface DeadLetter {
  id: number
  topic: string
  payload: string | null
  errorMsg: string | null
  /** 1-可重试, 0-不可重试 */
  isRetryable: number
  /** 0-未处理, 1-已重放成功, 2-已忽略 */
  status: number
  retryCount: number
  createTime: string | null
  updateTime: string | null
}
