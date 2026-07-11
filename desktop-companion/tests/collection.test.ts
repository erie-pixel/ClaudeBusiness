import { describe, it, expect } from 'vitest'
import {
  MEMENTOS,
  MEMENTO_PALETTE,
  FIND_CHANCE,
  emptyAlbum,
  normalizeAlbum,
  rollFind,
  foundKinds,
  daysTogether,
} from '../src/engine/collection'
import { Character, DEFAULT_CONFIG, type World } from '../src/engine/character'

const NOW = 1_800_000_000_000

describe('기념품 카탈로그 규격', () => {
  it('id가 겹치지 않는다', () => {
    const ids = MEMENTOS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 픽셀 맵이 8x8이고 팔레트에 있는 문자만 쓴다', () => {
    for (const m of MEMENTOS) {
      expect(m.map, m.id).toHaveLength(8)
      for (const row of m.map) {
        expect(row.length, m.id).toBe(8)
        for (const ch of row) {
          if (ch === '.') continue
          expect(MEMENTO_PALETTE[ch], `${m.id}: 팔레트에 없는 문자 '${ch}'`).toBeDefined()
        }
      }
    }
  })

  it('희귀도별로 최소 1종 이상 있다', () => {
    for (const rarity of ['common', 'uncommon', 'rare'] as const) {
      expect(MEMENTOS.some((m) => m.rarity === rarity), rarity).toBe(true)
    }
  })
})

describe('발견 추첨 (rollFind)', () => {
  it('발견 확률을 넘는 rng면 아무것도 못 줍는다', () => {
    const album = emptyAlbum(NOW)
    expect(rollFind(album, () => 0.99, NOW)).toBeNull()
    expect(foundKinds(album)).toBe(0)
  })

  it('발견하면 앨범에 기록되고, 같은 것을 또 주우면 개수가 는다', () => {
    const album = emptyAlbum(NOW)
    // 첫 rng(0) < FIND_CHANCE → 발견, 둘째 rng(0) → 가중치 첫 항목
    const rng = () => 0
    const first = rollFind(album, rng, NOW)
    expect(first).not.toBeNull()
    expect(album.found[first!.id]).toEqual({ count: 1, firstAt: NOW })
    const again = rollFind(album, rng, NOW + 1000)
    expect(again!.id).toBe(first!.id)
    expect(album.found[first!.id].count).toBe(2)
    expect(album.found[first!.id].firstAt).toBe(NOW) // 처음 주운 시각 유지
    expect(foundKinds(album)).toBe(1)
  })

  it('rng를 바꾸면 다른 희귀도의 물건도 나온다', () => {
    const album = emptyAlbum(NOW)
    // 추첨 rng를 1에 가깝게 → 가중치 목록의 끝(희귀) 쪽
    let calls = 0
    const rng = () => (calls++ % 2 === 0 ? 0 : 0.999)
    const found = rollFind(album, rng, NOW)
    expect(found).not.toBeNull()
    expect(found!.rarity).toBe('rare')
  })

  it('FIND_CHANCE는 상주 앱에 맞게 낮게 유지된다 (도배 방지)', () => {
    expect(FIND_CHANCE).toBeLessThanOrEqual(0.2)
  })
})

describe('앨범 직렬화/정규화', () => {
  it('손상되거나 없는 데이터는 빈 앨범으로 복구된다', () => {
    for (const raw of [null, undefined, 42, 'x', {}, { journal: 'bad' }]) {
      const album = normalizeAlbum(raw, NOW)
      expect(album.journal.firstRunAt).toBe(NOW)
      expect(album.journal.totalSec).toBe(0)
      expect(foundKinds(album)).toBe(0)
    }
  })

  it('저장 → 로드 왕복이 내용을 보존한다', () => {
    const album = emptyAlbum(NOW)
    rollFind(album, () => 0, NOW)
    album.journal.greets = 3
    album.journal.totalSec = 1234
    const restored = normalizeAlbum(JSON.parse(JSON.stringify(album)), NOW + 999)
    expect(restored).toEqual(album)
  })

  it('카탈로그에서 사라진 기념품 id는 로드 시 걸러진다 (구버전 저장 호환)', () => {
    const raw = {
      journal: emptyAlbum(NOW).journal,
      found: { 'removed-item': { count: 5, firstAt: NOW } },
    }
    expect(foundKinds(normalizeAlbum(raw, NOW))).toBe(0)
  })

  it('함께한 일수는 1일째부터 시작한다', () => {
    const album = emptyAlbum(NOW)
    expect(daysTogether(album, NOW)).toBe(1)
    expect(daysTogether(album, NOW + 86400000 * 2.5)).toBe(3)
  })
})

describe('캐릭터 이벤트 큐', () => {
  const makeWorld = (): World => ({
    cursor: null,
    bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 },
    userActive: false,
    userIdleSec: 0,
    home: null,
  })

  it('배회 목적지에 도착하면 wander-arrive 이벤트가 쌓인다', () => {
    const char = new Character(100, 500, DEFAULT_CONFIG, () => 0.5)
    char.state = 'wander'
    const world = makeWorld()
    for (let t = 0; t < 60 && !char.events.includes('wander-arrive'); t += 1 / 30) {
      char.update(1 / 30, world)
    }
    expect(char.events).toContain('wander-arrive')
  })

  it('이벤트 큐는 소비하지 않아도 무한히 쌓이지 않는다', () => {
    const char = new Character(100, 500, DEFAULT_CONFIG, () => 0.5)
    char.state = 'wander'
    const world = makeWorld()
    for (let t = 0; t < 600; t += 1 / 10) char.update(1 / 10, world)
    expect(char.events.length).toBeLessThanOrEqual(8)
  })
})
