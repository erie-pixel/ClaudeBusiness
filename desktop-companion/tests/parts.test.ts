import { describe, it, expect, afterEach } from 'vitest'
import { ALL_FRAME_NAMES, composeMap, DEFAULT_LOOK, SPRITE_H, SPRITE_W } from '../src/engine/sprite'
import { BUILTIN_PACK, getPart, partsBySlot, setModPacks, validatePack } from '../src/engine/parts'

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

describe('애니메이션 프레임 규격', () => {
  it('모든 프레임이 정확히 24행 16폭이다', () => {
    for (const name of ALL_FRAME_NAMES) {
      const rows = composeMap(name, DEFAULT_LOOK)
      expect(rows, name).toHaveLength(SPRITE_H)
      for (const r of rows) expect(r.length, name).toBe(SPRITE_W)
    }
  })

  it('서기/걷기 디딤 프레임은 발이 바닥(마지막 행)에 닿아 있다', () => {
    for (const name of ['idle', 'walkA', 'walkB', 'runA', 'runB'] as const) {
      const rows = composeMap(name, DEFAULT_LOOK)
      expect(rows[SPRITE_H - 1].includes('B'), name).toBe(true)
    }
  })

  it('달리기 공중 프레임은 발이 바닥에서 떠 있다', () => {
    const rows = composeMap('runMid', DEFAULT_LOOK)
    expect(rows[SPRITE_H - 1].includes('B')).toBe(false)
    expect(rows[SPRITE_H - 2].includes('B')).toBe(false)
  })

  it('서 있을 때 다리가 걷기 지나감 프레임보다 1비트 짧다 (몸이 1px 낮음)', () => {
    const idle = composeMap('idle', DEFAULT_LOOK)
    const pass = composeMap('walkMid', DEFAULT_LOOK)
    // idle은 맨 윗줄이 투명하고(몸 전체가 1px 아래), walkMid는 머리가 맨 위부터
    expect(/[^.]/.test(idle[0])).toBe(false)
    expect(pass[1].includes('K')).toBe(true)
  })

  it('달리기 프레임은 걷기와 다른 전용 실루엣이다', () => {
    expect(composeMap('runA', DEFAULT_LOOK)).not.toEqual(composeMap('walkA', DEFAULT_LOOK))
    expect(composeMap('runMid', DEFAULT_LOOK)).not.toEqual(composeMap('walkMid', DEFAULT_LOOK))
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

describe('모드 팩 검증/로드 (validatePack + setModPacks)', () => {
  afterEach(() => setModPacks([])) // 다른 테스트에 모드 팩이 새지 않게

  const GOOD_PACK = {
    name: '테스트 팩',
    author: 'tester',
    version: '1.0.0',
    parts: [
      {
        id: 'mod-mohawk',
        slot: 'hair',
        name: '모히칸',
        map: { y0: 0, rows: ['.......KK.......', '.......KK.......', '....KKKKKKKK....'] },
      },
    ],
  }

  it('규격에 맞는 팩은 통과하고 옷장 목록에 나타난다', () => {
    const { pack, errors } = validatePack(GOOD_PACK)
    expect(errors).toEqual([])
    expect(pack).not.toBeNull()
    setModPacks([pack!])
    expect(partsBySlot('hair').some((p) => p.id === 'mod-mohawk')).toBe(true)
    // 내장 파츠도 그대로 남아 있다 (1급 시민 공존)
    expect(partsBySlot('hair').some((p) => p.id === 'short')).toBe(true)
  })

  it('모드 파츠가 composeMap으로 실제 합성된다', () => {
    const { pack } = validatePack(GOOD_PACK)
    setModPacks([pack!])
    const rows = composeMap('idle', { ...DEFAULT_LOOK, hairStyle: 'mod-mohawk' })
    expect(rows[1]).toContain('K') // 모히칸이 1행(y0=0+padTop 1)에 합성됨
  })

  it('구조가 깨진 manifest는 사유와 함께 거부된다', () => {
    expect(validatePack(null).pack).toBeNull()
    expect(validatePack('x').pack).toBeNull()
    expect(validatePack({}).errors.length).toBeGreaterThan(0)
    expect(validatePack({ name: 'x', author: 'y', version: '1', parts: [] }).pack).toBeNull()
  })

  it('개별 파츠 문제(잘못된 slot, 너무 긴 행, id 중복)는 그 파츠만 걸러낸다', () => {
    const { pack, errors } = validatePack({
      name: '섞인 팩',
      author: 't',
      version: '1',
      parts: [
        GOOD_PACK.parts[0],
        { id: 'bad-slot', slot: 'pants', name: 'x', map: { y0: 0, rows: ['..'] } },
        { id: 'bad-row', slot: 'hair', name: 'x', map: { y0: 0, rows: ['.'.repeat(17)] } },
        { ...GOOD_PACK.parts[0] }, // id 중복
      ],
    })
    expect(pack!.parts).toHaveLength(1)
    expect(errors.length).toBe(3)
  })

  it('setModPacks를 다시 호출하면 이전 모드 팩이 교체된다 (핫리로드)', () => {
    const { pack } = validatePack(GOOD_PACK)
    setModPacks([pack!])
    expect(partsBySlot('hair').some((p) => p.id === 'mod-mohawk')).toBe(true)
    setModPacks([])
    expect(partsBySlot('hair').some((p) => p.id === 'mod-mohawk')).toBe(false)
    // 사라진 모드 파츠를 쓰던 설정은 폴백된다
    expect(getPart('hair', 'mod-mohawk').id).toBe(partsBySlot('hair')[0].id)
  })
})
