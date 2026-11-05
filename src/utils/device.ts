/**
 * 设备相关的纯函数工具（无副作用，便于单测）。
 *
 * 后端约定（见《FRONTEND_API.md》）：
 *   - deviceId 为 12 位十六进制 MAC，后端会统一大小写并去除分隔符，前端先规范化再提交；
 *   - bindCode 为设备机身二维码上的 6 位绑定码；
 *   - 时间字段：普通字段为 ISO-8601（含 T），登录相关字段为 "yyyy-MM-dd HH:mm:ss"。
 */

/** 规范化 MAC：去掉所有非十六进制字符并转大写。 */
export function normalizeMac(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

/** 12 位十六进制 MAC 校验（允许输入时带分隔符，如 B4:BF:E9:0C:DB:A1）。 */
export function isValidMac(value: string): boolean {
  return /^[0-9A-F]{12}$/.test(normalizeMac(value))
}

/** 6 位绑定码校验（字母或数字）。 */
export function isValidBindCode(value: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(value.trim())
}

/**
 * 在线状态归一化。
 * 用户端接口返回 1/0，管理端 VO 返回 boolean，页面统一走该函数避免两套判断。
 */
export function isDeviceOnline(online: number | boolean | null | undefined): boolean {
  return online === true || online === 1
}

/** 运行时长（秒）格式化为「x 天 x 小时 x 分」。 */
export function formatUptime(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) {
    return '-'
  }
  if (seconds < 60) return `${seconds} 秒`
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分`)
  return parts.join(' ') || '不足 1 分'
}

/** 安全的 JSON 展示：异常结构回退为字符串，避免渲染阶段抛错。 */
export function prettyJSON(value: unknown): string {
  if (value === null || value === undefined) return '暂无'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 字节数格式化（后端已给 sizeText 时优先使用后端值）。 */
export function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`
}

/** 展示用时间：把 ISO 的 T 换成空格，并去掉毫秒与时区后缀。 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '')
}

/** OTA 阶段文案（7.3）。 */
export const OTA_STATE_LABELS: Record<string, string> = {
  accepted: '已受理',
  downloading: '下载中',
  verifying: '校验中',
  flashing: '刷写中',
  rebooting: '重启中',
  success: '成功',
  failed: '失败',
}

/** 终态（success/failed）之后不再接受同一 commandId 的旧消息。 */
export function isOtaTerminalState(state?: string | null): boolean {
  return state === 'success' || state === 'failed'
}

/** 设备控制能力（target）文案。后端无枚举校验，前端维护白名单。 */
export const CONTROL_TARGET_LABELS: Record<string, string> = {
  mos: 'MOS 开关',
  led: 'LED 灯',
  servo: '舵机',
  relay: '继电器',
  ota: 'OTA',
  config: '配置',
}

/** 控制动作白名单（文档建议取值）。 */
export const CONTROL_ACTIONS = ['set', 'get', 'toggle', 'start', 'reset', 'cancel'] as const

/** 根据设备 controlled 目标生成默认 params，减少用户手写 JSON 出错。 */
export function defaultControlParams(target: string): Record<string, unknown> {
  if (target === 'servo') return { angle: 90 }
  if (target === 'config') return {}
  return { state: 1 }
}

/**
 * 按设备 capabilities 推导可用的控制目标。
 * capabilities 结构随产品而定，这里只做「已知键」白名单：
 *   - 若 capabilities 中存在已知目标键且值为真，则只展示这些目标；
 *   - 否则回退到全部已知目标（后端仍会做设备侧校验）。
 */
export function availableControlTargets(row: { capabilities?: Record<string, unknown> | null }): string[] {
  const known = Object.keys(CONTROL_TARGET_LABELS)
  const caps = row.capabilities
  if (!caps || typeof caps !== 'object') return known

  const enabled = known.filter((key) => {
    const value = caps[key]
    return value !== undefined && value !== null && value !== false && value !== 0
  })
  return enabled.length > 0 ? enabled : known
}

/** 支持按通道下发的物理目标（capabilities 中的值即通道数）。 */
const CHANNEL_TARGETS = ['mos', 'led', 'relay', 'servo'] as const

/** capabilities 缺失时的保守默认值，仅用于 UI 上限，不影响后端校验。 */
const DEFAULT_CHANNEL_COUNTS: Record<string, number> = { mos: 8, led: 1, relay: 1, servo: 1 }

/** 目标是否支持通道选择。 */
export function supportsChannel(target: string): boolean {
  return (CHANNEL_TARGETS as readonly string[]).includes(target)
}

/**
 * 目标的通道上限（用于控制弹窗的通道选择器）。
 * capabilities 的值为通道数（如 led:3 表示 3 路），缺失时回退默认值。
 */
export function channelCountOf(
  row: { capabilities?: Record<string, unknown> | null },
  target: string,
): number {
  const raw = row.capabilities?.[target]
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw))
  if (raw === true) return 1
  return DEFAULT_CHANNEL_COUNTS[target] ?? 1
}
