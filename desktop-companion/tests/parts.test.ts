import { describe, it, expect } from 'vitest'
import { composeMap, DEFAULT_LOOK, SPRITE_H, SPRITE_W } from '../src/engine/sprite'
import { BUILTIN_PACK, getPart, partsBySlot } from '../src/engine/parts'

const has = (rows: string[], ch: string) => rows.some((r) => r.includes(ch))

describe('파츠 합성 (composeMap)', () => {
  it('기본 룩은 머리(K)·눈(E)·입(M)·상의(T)가 모두 합성된다', () => {
    const rows = composeMap('idle', DEFAULT_LOOK)
    expect(rows).toHaveLength(SPRITE_H)
    rows.forEach((r) => expect(r).toHaveLength(SPRITE_W))
    expect(has(rows, 'K')).toBe(true)
    expect(has(rows, 'E')).toBe(true)
    expect(has(rows, 'M')).toBe(true)
    expect(has(rows, 'T')).toBe(true)
  })

  it('뒷모습(back) 프레임에는 눈/입이 없고 뒷머리가 얼굴 영역을 덮는다', () => {
    const rows = composeMap('back', DEFAULT_LOOK)
    expect(has(rows, 'E')).toBe(false)
    expect(has(rows, 'M')).toBe(false)
    // 얼굴 중앙(6행)이 머리카락으로 덮여 있다
    expect(rows[6]).toContain('K')
  })

  it('머리스타일을 바꾸면 합성 결과가 달라진다 (긴 머리는 어깨까지 내려옴)', () => {
    const short = composeMap('idle', DEFAULT_LOOK)
    const long = composeMap('idle', { ...DEFAULT_LOOK, hairStyle: 'long' })
    expect(long).not.toEqual(short)
    // 긴 머리는 11행(어깨)에도 K가 있다
    expect(long[11]).toContain('K')
    expect(short[11]).not.toContain('K')
  })

  it('후드티는 음영(U)이 추가된다', () => {
    const tee = composeMap('idle', DEFAULT_LOOK)
    const hoodie = composeMap('idle', { ...DEFAULT_LOOK, topStyle: 'hoodie' })
    expect(has(tee, 'U')).toBe(false)
    expect(has(hoodie, 'U')).toBe(true)
  })

  it('눈 감는 프레임(blink/sleep)에서는 E가 L로 바뀐다', () => {
    const blink = composeMap('blink', DEFAULT_LOOK)
    expect(has(blink, 'E')).toBe(false)
    expect(has(blink, 'L')).toBe(true)
  })

  it('없는 파츠 id는 그 슬롯의 첫 파츠로 폴백한다 (구버전 설정/제거된 모드 호환)', () => {
    const rows = composeMap('idle', { ...DEFAULT_LOOK, hairStyle: 'no-such-mod-part' })
    expect(has(rows, 'K')).toBe(true) // 폴백 머리가 합성됨
    expect(getPart('hair', 'no-such-mod-part').id).toBe(partsBySlot('hair')[0].id)
  })
})

describe('파츠 팩 매니페스트 (모드 포맷)', () => {
  it('내장 팩은 매니페스트 필수 필드를 갖춘다', () => {
    expect(BUILTIN_PACK.name).toBeTruthy()
    expect(BUILTIN_PACK.author).toBeTruthy()
    expect(BUILTIN_PACK.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('모든 슬롯에 최소 1개의 파츠가 있고 id가 유일하다', () => {
    for (const slot of ['hair', 'eyes', 'mouth', 'top'] as const) {
      const list = partsBySlot(slot)
      expect(list.length).toBeGreaterThan(0)
      const ids = list.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('모든 파츠 맵이 16폭 규격을 지킨다 (업로드 린트의 원형)', () => {
    for (const part of BUILTIN_PACK.parts) {
      for (const row of part.map.rows) expect(row.length).toBeLessThanOrEqual(SPRITE_W)
      if (part.back) for (const row of part.back.rows) expect(row.length).toBeLessThanOrEqual(SPRITE_W)
      expect(part.map.y0).toBeGreaterThanOrEqual(0)
      expect(part.map.y0 + part.map.rows.length).toBeLessThanOrEqual(SPRITE_H)
    }
  })
})
