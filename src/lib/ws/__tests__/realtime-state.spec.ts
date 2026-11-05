import { describe, expect, it } from 'vitest'
import { appendCapped, stateEntryKey, upsertStateEntry } from '@/lib/ws/realtime-state'

const entry = (target: string, channel: number | null, state: number) => ({
  target,
  channel,
  state,
  updatedAt: 1,
})

describe('实时状态聚合', () => {
  it('stateEntryKey 区分通道与整体状态', () => {
    expect(stateEntryKey('mos', 1)).toBe('mos:1')
    expect(stateEntryKey('mos', null)).toBe('mos:all')
  })

  it('同 target + channel 覆盖为最新值', () => {
    const list = [entry('mos', 1, 1), entry('led', null, 0)]
    const next = upsertStateEntry(list, entry('mos', 1, 0))

    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ target: 'mos', channel: 1, state: 0 })
    expect(next[1]).toMatchObject({ target: 'led', state: 0 })
  })

  it('不同通道追加而不是覆盖', () => {
    const list = [entry('mos', 1, 1)]
    const next = upsertStateEntry(list, entry('mos', 2, 1))

    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ target: 'mos', channel: 2, state: 1 })
  })

  it('整体状态与分通道状态互不影响', () => {
    const list = [entry('mos', 1, 1)]
    const next = upsertStateEntry(list, entry('mos', null, 0))

    expect(next).toHaveLength(2)
    expect(next[1]?.channel).toBeNull()
  })

  it('appendCapped 保留最新 N 条', () => {
    const list = [1, 2, 3]
    expect(appendCapped(list, 4, 3)).toEqual([2, 3, 4])
    expect(appendCapped([], 1, 3)).toEqual([1])
  })
})
