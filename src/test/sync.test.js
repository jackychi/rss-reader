import { describe, expect, it } from 'vitest'
import { mergeStates } from '../utils/sync'

describe('sync mergeStates', () => {
  it('keeps latest read status while preserving first readAt for read/read merges', () => {
    const merged = mergeStates(
      { readStatus: [{ articleKey: 'a', status: 'read', readAt: 100, updatedAt: 100 }] },
      { readStatus: [{ articleKey: 'a', status: 'read', readAt: 200, updatedAt: 200 }] }
    )

    expect(merged.readStatus).toEqual([
      { articleKey: 'a', status: 'read', readAt: 100, updatedAt: 200 },
    ])
  })

  it('lets newer unread state override older read state', () => {
    const merged = mergeStates(
      { readStatus: [{ articleKey: 'a', status: 'read', readAt: 100, updatedAt: 100 }] },
      { readStatus: [{ articleKey: 'a', status: 'unread', updatedAt: 300 }] }
    )

    expect(merged.readStatus).toEqual([
      { articleKey: 'a', status: 'unread', readAt: 0, updatedAt: 300 },
    ])
    expect(merged.readingList).toEqual([])
  })

  it('keeps reading-list tombstones and filters them from the visible list', () => {
    const merged = mergeStates(
      { readingList: [{ id: 'a', title: 'saved', savedAt: 100, updatedAt: 100 }] },
      { readingList: [{ id: 'a', removedAt: 300, updatedAt: 300 }] }
    )

    expect(merged.readingList).toEqual([])
    expect(merged.readingListAll).toEqual([{ id: 'a', removedAt: 300, updatedAt: 300 }])
  })

  it('merges read and audio positions by updatedAt', () => {
    const merged = mergeStates(
      {
        readPositions: { a: { position: 0.2, updatedAt: 100 } },
        audioPositions: { a: { position: 15, updatedAt: 400 } },
      },
      {
        readPositions: { a: { position: 0.8, updatedAt: 300 } },
        audioPositions: { a: { position: 3, updatedAt: 200 } },
      }
    )

    expect(merged.readPositions.a).toEqual({ position: 0.8, updatedAt: 300 })
    expect(merged.audioPositions.a).toEqual({ position: 15, updatedAt: 400 })
  })
})
