import { describe, expect, it } from 'vitest'
import {
  buildDeviceStateView,
  describeChannelState,
  summarizeCapabilities,
} from '@/utils/device-state'
import type { RealtimeStateEntry } from '@/lib/ws/realtime-state'

const CAPABILITIES = { led: 3, mos: 8, relay: 1, servo: 2 }
const CURRENT_STATE = {
  mos: 1,
  led_1: 1,
  led_2: 0,
  mos_1: 1,
  mos_2: 1,
  mos_3: 0,
  relay_1: 0,
  servo_1: 90,
}

function realtime(target: string, channel: number | null, state: number): RealtimeStateEntry {
  return { target, channel, state, updatedAt: 1_700_000_000_000 }
}

describe('设备能力集 / 当前状态展示模型', () => {
  it('能力集按通道数归一化，未知键保留原名', () => {
    expect(summarizeCapabilities(CAPABILITIES)).toEqual([
      { key: 'led', target: 'led', label: 'LED 灯', count: 3 },
      { key: 'mos', target: 'mos', label: 'MOS 开关', count: 8 },
      { key: 'relay', target: 'relay', label: '继电器', count: 1 },
      { key: 'servo', target: 'servo', label: '舵机', count: 2 },
    ])
    expect(summarizeCapabilities({ led: 2, extra: 'x' })[0]?.count).toBe(2)
    expect(summarizeCapabilities(null)).toEqual([])
  })

  it('按 capabilities 补齐未上报通道，并保留整体/总控状态', () => {
    const view = buildDeviceStateView(CAPABILITIES, CURRENT_STATE)

    expect(view.groups.map((group) => group.target)).toEqual(['led', 'mos', 'relay', 'servo'])

    const led = view.groups.find((group) => group.target === 'led')
    expect(led?.channels.map((channel) => channel.channel)).toEqual([1, 2, 3])
    expect(led?.channels[2]?.value).toBeNull()

    const mos = view.groups.find((group) => group.target === 'mos')
    expect(mos?.channels).toHaveLength(9)
    expect(mos?.channels[0]).toMatchObject({ channel: null, value: 1 })
    expect(mos?.channels[1]).toMatchObject({ channel: 1, value: 1 })

    const servo = view.groups.find((group) => group.target === 'servo')
    expect(servo?.channels[0]).toMatchObject({ channel: 1, value: 90 })
    expect(servo?.channels[1]).toMatchObject({ channel: 2, value: null })
    expect(view.hasState).toBe(true)
  })

  it('实时增量覆盖快照：通道 0 归入总控，通道 >=1 归入对应通道', () => {
    const view = buildDeviceStateView(CAPABILITIES, CURRENT_STATE, [
      realtime('mos', 0, 0),
      realtime('led', 1, 0),
    ])

    const mosAggregate = view.groups.find((group) => group.target === 'mos')?.channels[0]
    expect(mosAggregate).toMatchObject({ value: 0, realtime: true })

    const led1 = view.groups.find((group) => group.target === 'led')?.channels[0]
    expect(led1).toMatchObject({ value: 0, realtime: true, updatedAt: 1_700_000_000_000 })
  })

  it('无法识别的键进入 extra，不猜测语义', () => {
    const view = buildDeviceStateView(CAPABILITIES, { temperature: 26, led_1: 1 })

    expect(view.extra).toEqual({ temperature: 26 })
    // capabilities 声明的目标即使没有状态也保留分组（通道值为未知）。
    expect(view.groups.map((group) => group.target)).toEqual(['led', 'mos', 'relay', 'servo'])
    expect(view.groups[0]?.channels[0]).toMatchObject({ channel: 1, value: 1 })
  })

  it('未知实时目标也进入 extra', () => {
    const view = buildDeviceStateView(CAPABILITIES, null, [realtime('sensor', 2, 36)])
    expect(view.extra).toEqual({ sensor_2: 36 })
  })

  it('无任何状态时 hasState 为 false', () => {
    const view = buildDeviceStateView(null, null)
    expect(view.groups).toEqual([])
    expect(view.hasState).toBe(false)
  })

  it('通道值格式化：开/关/角度/未知', () => {
    expect(describeChannelState('led', 1)).toEqual({ text: '开', active: true })
    expect(describeChannelState('mos', 0)).toEqual({ text: '关', active: false })
    expect(describeChannelState('servo', 90)).toEqual({ text: '90°', active: null })
    expect(describeChannelState('led', null)).toEqual({ text: '未知', active: null })
  })
})
