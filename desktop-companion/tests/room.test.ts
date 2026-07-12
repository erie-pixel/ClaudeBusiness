import { describe, it, expect } from 'vitest'
import {
  FURNITURE,
  ROOM_PALETTE,
  ROOM_THEMES,
  ROOM_SIZES,
  MAX_FURNITURE,
  MAX_BOARD_ITEMS,
  defaultRoomData,
  normalizeRoomData,
  furnitureById,
} from '../src/engine/room'

describe('가구 카탈로그 규격', () => {
  it('id가 겹치지 않고, 픽셀 맵이 팔레트 문자만 쓴다', () => {
    const ids = FURNITURE.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of FURNITURE) {
      expect(f.map.length).toBeGreaterThan(0)
      for (const row of f.map) {
        for (const ch of row) {
          if (ch === '.') continue
          expect(ROOM_PALETTE[ch], `${f.id}: 팔레트에 없는 문자 '${ch}'`).toBeDefined()
        }
      }
    }
  })

  it('바닥/벽 가구가 모두 있다', () => {
    expect(FURNITURE.some((f) => f.kind === 'floor')).toBe(true)
    expect(FURNITURE.some((f) => f.kind === 'wall')).toBe(true)
  })

  it('테마와 크기 프리셋이 유효하다', () => {
    expect(ROOM_THEMES.length).toBeGreaterThanOrEqual(3)
    for (const key of ['S', 'M', 'L'] as const) {
      expect(ROOM_SIZES[key].w).toBeGreaterThan(0)
      expect(ROOM_SIZES[key].h).toBeGreaterThan(0)
    }
    expect(ROOM_SIZES.S.w).toBeLessThan(ROOM_SIZES.L.w)
  })
})

describe('방 데이터 정규화 (normalizeRoomData)', () => {
  it('기본 방은 정규화를 통과해도 그대로다', () => {
    const d = defaultRoomData()
    expect(normalizeRoomData(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })

  it('깨진 데이터는 기본 방으로 복구된다', () => {
    for (const raw of [null, undefined, 'x', 42, []]) {
      const d = normalizeRoomData(raw)
      expect(d.size).toBe('M')
      expect(d.theme).toBe(0)
    }
  })

  it('모르는 가구 id·범위 밖 좌표·초과 항목은 걸러지거나 보정된다', () => {
    const d = normalizeRoomData({
      size: 'L',
      theme: 999,
      furniture: [
        { id: 'no-such-furniture', x: 0.5, d: 0.5 },
        { id: 'couch', x: 5, d: -3 },
        ...Array.from({ length: 30 }, () => ({ id: 'plant', x: 0.5, d: 0.5 })),
      ],
      board: [
        { text: 'ㅎ'.repeat(200), url: 'https://example.com' },
        { text: '', url: 'https://example.com' },
        { text: 'javascript 링크', url: 'javascript:alert(1)' },
        ...Array.from({ length: 30 }, (_, i) => ({ text: `item${i}` })),
      ],
    })
    expect(d.size).toBe('L')
    expect(d.theme).toBe(0) // 범위 밖 테마 → 기본
    expect(d.furniture.every((f) => furnitureById(f.id))).toBe(true)
    expect(d.furniture.length).toBeLessThanOrEqual(MAX_FURNITURE)
    const couch = d.furniture.find((f) => f.id === 'couch')!
    expect(couch.x).toBe(1) // 클램프
    expect(couch.d).toBe(0)
    expect(d.board.length).toBeLessThanOrEqual(MAX_BOARD_ITEMS)
    expect(d.board[0].text.length).toBeLessThanOrEqual(80)
    const js = d.board.find((b) => b.text === 'javascript 링크')!
    expect(js.url).toBeUndefined() // http/https 아닌 URL은 제거
  })

  it('board 항목은 텍스트만도, 링크 포함도 가능하다', () => {
    const d = normalizeRoomData({
      ...defaultRoomData(),
      board: [{ text: '메모' }, { text: '기획서', url: 'https://notion.so/doc' }],
    })
    expect(d.board).toEqual([{ text: '메모' }, { text: '기획서', url: 'https://notion.so/doc' }])
  })
})
