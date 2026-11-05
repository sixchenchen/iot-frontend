import type { RealtimeStateEntry } from '@/lib/ws/realtime-state'

/**
 * ============================================================================
 * 设备能力集 / 当前状态展示模型（纯函数，便于单测）
 * ============================================================================
 * 后端 JSON 字段规律（文档 8.2 / 8.3）：
 *   capabilities: {"led": 3, "mos": 8, "relay": 1, "servo": 2}
 *   current_state: {"mos": 1, "led_1": 1, "led_2": 0, "servo_1": 90}
 *
 * 约定：
 *   - capabilities 的值表示「该目标的通道数」；
 *   - current_state 的 key 为 `target`（整体/总控）或 `target_{通道号}`；
 *   - 无法识别的 key 不做猜测，统一放入 extra 以原始 JSON 展示。
 *
 * 实时合并规则：
 *   `/state` 推送为增量 `{target, channel, state}`，channel 为 0/null 时
 *   视为整体状态（对应 `target`），>=1 时对应 `target_{channel}`；
 *   同键以实时值覆盖数据库快照。
 * ============================================================================
 */

export type StateTarget = 'led' | 'mos' | 'relay' | 'servo'

export const STATE_TARGET_LABELS: Record<StateTarget, string> = {
  led: 'LED 灯',
  mos: 'MOS 开关',
  relay: '继电器',
  servo: '舵机',
}

/** 固定展示顺序，保证不同设备/页面顺序一致。 */
export const STATE_TARGET_ORDER: StateTarget[] = ['led', 'mos', 'relay', 'servo']

const STATE_KEY_PATTERN = /^(led|mos|relay|servo)(?:_([0-9]+))?$/

export interface CapabilityItem {
  /** 原始能力键（小写）。 */
  key: string
  target: StateTarget | null
  label: string
  /** 通道数。 */
  count: number
}

export interface StateChannel {
  key: string
  target: StateTarget
  /** null 表示整体/总控状态。 */
  channel: number | null
  value: unknown
  /** 是否来自 WebSocket 实时推送。 */
  realtime: boolean
  updatedAt: number | null
}

export interface TargetStateGroup {
  target: StateTarget
  label: string
  /** 声明或推断出的通道数。 */
  capacity: number
  channels: StateChannel[]
}

export interface DeviceStateView {
  groups: TargetStateGroup[]
  /** 无法归入已知目标的键，原样展示。 */
  extra: Record<string, unknown>
  /** 是否存在任何可展示的状态（含 extra）。 */
  hasState: boolean
}

function isStateTarget(value: string): value is StateTarget {
  return (STATE_TARGET_LABELS as Record<string, string>)[value] !== undefined
}

function normalizeCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (value === true) return 1
  return null
}

/** 能力集归一化：只接受数值型通道数，其余键保留在原始 JSON 中。 */
export function summarizeCapabilities(
  capabilities?: Record<string, unknown> | null,
): CapabilityItem[] {
  if (!capabilities) return []

  return Object.entries(capabilities).flatMap(([key, value]) => {
    const count = normalizeCount(value)
    if (count === null) return []
    const target = isStateTarget(key.toLowerCase()) ? key.toLowerCase() : null
    return [
      {
        key: key.toLowerCase(),
        target: target as StateTarget | null,
        label: target ? STATE_TARGET_LABELS[target as StateTarget] : key,
        count,
      },
    ]
  })
}

/** current_state 的 key 解析；不符合规律的返回 null。 */
function resolveStateKey(rawKey: string): { target: StateTarget; channel: number | null } | null {
  const match = STATE_KEY_PATTERN.exec(rawKey.trim().toLowerCase())
  if (!match) return null
  const target = match[1]
  if (!target || !isStateTarget(target)) return null

  const channelText = match[2]
  if (channelText === undefined) return { target, channel: null }
  const channel = Number(channelText)
  return Number.isFinite(channel) ? { target, channel: channel > 0 ? channel : null } : null
}

function channelKey(target: StateTarget, channel: number | null): string {
  return channel === null || channel <= 0 ? target : `${target}_${channel}`
}

/**
 * 合并「数据库快照 + 实时增量」，输出可直接渲染的分组模型。
 * 实时值优先；capabilities 声明的通道即使未上报也会补占位，便于用户识别。
 */
export function buildDeviceStateView(
  capabilities?: Record<string, unknown> | null,
  currentState?: Record<string, unknown> | null,
  realtimeStates: RealtimeStateEntry[] = [],
): DeviceStateView {
  const channelMap = new Map<string, StateChannel>()
  const extra: Record<string, unknown> = {}

  const upsert = (
    target: StateTarget,
    channel: number | null,
    value: unknown,
    realtime: boolean,
    updatedAt: number | null,
  ) => {
    const key = channelKey(target, channel)
    channelMap.set(key, {
      key,
      target,
      channel: channel === null || channel <= 0 ? null : channel,
      value,
      realtime,
      updatedAt,
    })
  }

  Object.entries(currentState ?? {}).forEach(([rawKey, value]) => {
    const parsed = resolveStateKey(rawKey)
    if (!parsed) {
      extra[rawKey] = value
      return
    }
    upsert(parsed.target, parsed.channel, value, false, null)
  })

  realtimeStates.forEach((entry) => {
    const target = entry.target.trim().toLowerCase()
    if (!isStateTarget(target)) {
      const key = entry.channel && entry.channel > 0 ? `${target}_${entry.channel}` : target
      extra[key] = entry.state
      return
    }
    upsert(target, entry.channel, entry.state, true, entry.updatedAt)
  })

  const capacityByTarget = new Map<StateTarget, number>()
  summarizeCapabilities(capabilities).forEach((item) => {
    if (item.target) capacityByTarget.set(item.target, item.count)
  })

  const groups = STATE_TARGET_ORDER.flatMap<TargetStateGroup>((target) => {
    const entries = [...channelMap.values()].filter((item) => item.target === target)
    const declared = capacityByTarget.get(target)
    const maxChannel = entries.reduce(
      (max, item) => (item.channel !== null ? Math.max(max, item.channel) : max),
      0,
    )
    const capacity = Math.max(declared ?? 0, maxChannel)

    if (entries.length === 0 && capacity === 0) return []

    const channels: StateChannel[] = []
    const aggregate = channelMap.get(target)
    if (aggregate) channels.push(aggregate)

    for (let channel = 1; channel <= capacity; channel += 1) {
      const found = channelMap.get(channelKey(target, channel))
      channels.push(
        found ?? {
          key: `${target}_${channel}`,
          target,
          channel,
          value: null,
          realtime: false,
          updatedAt: null,
        },
      )
    }

    // 超出 capabilities 声明的通道仍然展示，避免设备扩展通道后数据丢失。
    entries
      .filter((item) => item.channel !== null && item.channel > capacity)
      .sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0))
      .forEach((item) => channels.push(item))

    return [
      {
        target,
        label: STATE_TARGET_LABELS[target],
        capacity,
        channels,
      },
    ]
  })

  return {
    groups,
    extra,
    hasState: groups.length > 0 || Object.keys(extra).length > 0,
  }
}

export interface ChannelDisplay {
  text: string
  /** true=开 / false=关 / null=非开关型或未知。 */
  active: boolean | null
}

/** 把通道值转成人类可读文案：开关型显示开/关，舵机显示角度。 */
export function describeChannelState(target: StateTarget, value: unknown): ChannelDisplay {
  if (value === null || value === undefined || value === '') {
    return { text: '未知', active: null }
  }
  if (typeof value === 'boolean') {
    return value ? { text: '开', active: true } : { text: '关', active: false }
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    if (target === 'servo') return { text: `${numeric}°`, active: null }
    return numeric === 0 ? { text: '关', active: false } : { text: '开', active: true }
  }

  return { text: String(value), active: null }
}
