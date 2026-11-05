/**
 * ============================================================================
 * 全局 API 类型（唯一来源）
 * ============================================================================
 * 约定：
 *   - ApiResponse<T> 是后端统一响应包装 { code, message, data }；
 *   - PageResult<T> 对应后端 MyBatis-Plus 的分页返回 { records, total, size, current }；
 *   - 业务模块从这里导入，禁止在 features 内再定义第二套分页/响应模型。
 * ============================================================================
 */

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp?: string
}

/** 分页结果（字段名与后端保持一致，避免联调时二次转换）。 */
export interface PageResult<T> {
  records: T[]
  total: number
  size: number
  current: number
}

/** 分页查询入参（后端使用 pageNum/pageSize）。 */
export interface PageQuery {
  pageNum: number
  pageSize: number
}
