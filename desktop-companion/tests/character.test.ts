import { describe, it, expect } from 'vitest'
import { Character, DEFAULT_CONFIG, type World } from '../src/engine/character'

const CY = 500 // 테스트 기본 y (커서를 같은 y에 두면 거리 계산이 1차원과 동일)

const makeWorld = (cursorX: number | null = null, cursorY = CY): World => ({
  cursor: cursorX === null ? null : { x: cursorX, y: cursorY },
  bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 },
  userActive: false,
  userIdleSec: 0,
  home: null,
})

/** dt를 잘게 쪼개 seconds초 동안 시뮬레이션 */
function simulate(char: Character, world: World, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) char.update(step, world)
}

/** 호출마다 순서대로 값을 내주는 rng (마지막 값 이후로는 계속 마지막 값 반복) */
function queueRng(values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('follow (2D)', () => {
  it('가까운 커서에는 걷기로 접근하고 도착하면 멈춘다', () => {
    const char = new Character(100, CY, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(300) // runDistance(420)보다 가까움 → 걷기
    simulate(char, world, 1)
    expect(char.running).toBe(false)
    expect(char.x).toBeGreaterThan(100)
    simulate(char, world, 10)
    expect(Math.abs(300 - char.x)).toBeLessThanOrEqual(DEFAULT_CONFIG.arriveDistance)
    expect(char.moving).toBe(false)
  })

  it('대각선 방향 커서로도 2D 직선 이동한다', () => {
    const char = new Character(100, 100, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(300, 300)
    simulate(char, world, 3)
    expect(char.x).toBeGreaterThan(100)
    expect(char.y).toBeGreaterThan(100) // y로도 이동
  })

  it('커서가 멀면 달리고, 스태미나가 소진되면 지침 상태가 된다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(0)
    let elapsed = 0
    while (char.state === 'follow' && elapsed < 60) {
      world.cursor = { x: char.x + DEFAULT_CONFIG.runDistance + 200, y: CY }
      char.update(1 / 30, world)
      elapsed += 1 / 30
    }
    expect(char.state).toBe('exhausted')
    expect(char.stamina).toBe(0)
  })

  it('지침 상태에서 회복되면 follow로 복귀한다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.state = 'exhausted'
    char.stamina = 0
    // 커서가 가까우면 회복 후 걷기만 하므로 스태미나가 계속 차오른다
    simulate(char, makeWorld(60), 10)
    expect(char.state).toBe('follow')
    expect(char.stamina).toBeGreaterThanOrEqual(DEFAULT_CONFIG.exhaustedRecoverAt)
  })

  it('회복 후 커서가 여전히 멀면 다시 달리다 지친다 (뛰고 나면 지침 루프)', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.state = 'exhausted'
    char.stamina = 0
    const world = makeWorld(0)
    const seen = new Set<string>()
    for (let t = 0; t < 30; t += 1 / 30) {
      world.cursor = { x: char.x + DEFAULT_CONFIG.runDistance + 300, y: CY }
      char.update(1 / 30, world)
      seen.add(char.state)
    }
    expect(seen.has('follow')).toBe(true)
    expect(char.state === 'exhausted' || char.state === 'follow').toBe(true)
  })

  it('달리기 임계 거리 안에서는 스태미나가 줄지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(DEFAULT_CONFIG.runDistance - 50)
    simulate(char, world, 2)
    expect(char.stamina).toBeCloseTo(DEFAULT_CONFIG.staminaMax, 0)
  })
})

describe('wander / idle 사이클 (2D 자유 배회)', () => {
  it('화면 어디든 x·y 목적지를 잡고 이동하며, 도착하면 쉬었다가 재출발한다', () => {
    // rng 시퀀스: 목적지 x(0.9→1800), y(0.2→200), 휴식 배수(0), 다음 목적지...
    const seq = [0.9, 0.2, 0, 0.5, 0.5]
    const char = new Character(0, 1000, DEFAULT_CONFIG, () => seq.shift() ?? 0.5)
    char.state = 'wander'
    const world = makeWorld()
    simulate(char, world, 1)
    expect(char.state).toBe('wander')
    expect(char.moving).toBe(true)
    expect(char.y).toBeLessThan(1000) // y로도 이동 중 (목적지 y=200)
    // 목적지 근처로 순간이동시켜 도착 처리 유도
    char.x = 1800
    char.y = 200.5
    char.update(1 / 60, world)
    expect(char.state).toBe('idle') // 도착 → 휴식 (wanderPauseMin초)
    simulate(char, world, DEFAULT_CONFIG.wanderPauseMin + 0.5)
    expect(char.state).toBe('wander') // 휴식 끝 → 새 목적지로 출발
  })

  it('경계 밖으로 나가지 않는다', () => {
    const char = new Character(1999, 999, DEFAULT_CONFIG, () => 1)
    char.state = 'wander'
    const world = makeWorld()
    simulate(char, world, 30)
    expect(char.x).toBeGreaterThanOrEqual(world.bounds.minX)
    expect(char.x).toBeLessThanOrEqual(world.bounds.maxX)
    expect(char.y).toBeGreaterThanOrEqual(world.bounds.minY)
    expect(char.y).toBeLessThanOrEqual(world.bounds.maxY)
  })
})

describe('명령과 상호작용', () => {
  it('낮잠 중에는 스태미나가 빠르게 회복되고, 클릭하면 깬다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.stamina = 10
    char.commandNap()
    simulate(char, makeWorld(), 3)
    expect(char.pose).toBe('sleep')
    expect(char.stamina).toBeGreaterThan(10 + DEFAULT_CONFIG.staminaRegen * 3)
    char.poke()
    expect(char.state).toBe('idle')
  })

  it('깨어 있을 때 클릭하면 하트 이모트가 나온다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.commandStay()
    char.poke()
    expect(char.emoteTimer).toBeGreaterThan(0)
    expect(char.state).toBe('stay')
  })

  it('그만 따라와 명령은 follow/exhausted에서만 동작한다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.commandNap()
    char.commandStopFollow()
    expect(char.state).toBe('nap')
    char.commandFollow()
    char.commandStopFollow()
    expect(char.state).toBe('idle')
  })
})

describe('집어 옮기기 (held)', () => {
  it('집으면 held 상태가 되어 스스로 움직이지 않고, 렌더러가 위치를 지정한다', () => {
    const char = new Character(100, CY, DEFAULT_CONFIG, () => 0.5)
    const world = makeWorld(1500)
    char.commandFollow()
    char.grab()
    expect(char.state).toBe('held')
    expect(char.pose).toBe('held')
    expect(char.messages).toContain('!?')
    // held 중에는 update가 이동시키지 않는다 (커서가 멀어도)
    simulate(char, world, 2)
    expect(char.x).toBe(100)
    // 렌더러가 커서 위치로 직접 이동
    char.heldMoveTo(800, 600, world.bounds)
    expect(char.x).toBe(800)
    expect(char.y).toBe(600)
  })

  it('놓으면 잠깐 어리둥절하다가 일상으로 복귀한다', () => {
    const char = new Character(100, CY, DEFAULT_CONFIG, () => 0.5)
    char.grab()
    char.release()
    expect(char.state).toBe('idle')
    const world = makeWorld()
    simulate(char, world, 3)
    expect(char.state).toBe('wander') // 어리둥절 끝 → 배회 재개
  })

  it('heldMoveTo는 경계를 벗어나지 않는다', () => {
    const char = new Character(100, CY, DEFAULT_CONFIG, () => 0.5)
    const world = makeWorld()
    char.grab()
    char.heldMoveTo(-500, 99999, world.bounds)
    expect(char.x).toBe(world.bounds.minX)
    expect(char.y).toBe(world.bounds.maxY)
  })
})

describe('스탯 시스템', () => {
  it('간식을 주면 허기가 줄고 기분이 좋아진다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.hunger = 90
    const moodBefore = char.mood
    char.feed()
    expect(char.hunger).toBe(90 - DEFAULT_CONFIG.hungerFeedRelief)
    expect(char.mood).toBeGreaterThan(moodBefore)
    expect(char.messages).toContain('♪')
  })

  it('배가 고프면 조르는 말풍선을 띄운다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    char.hunger = 95
    char.commandStay()
    simulate(char, makeWorld(), 1)
    expect(char.messages).toContain('~?')
  })

  it('졸림이 임계값을 넘으면 스스로 낮잠을 자고, 자고 나면 깬다', () => {
    // 빠른 테스트를 위해 회복 속도를 크게
    const cfg = { ...DEFAULT_CONFIG, sleepinessNapRelief: 50 }
    const char = new Character(0, CY, cfg, () => 0.5)
    char.sleepiness = 90
    char.state = 'stay'
    simulate(char, makeWorld(), 1)
    expect(char.state).toBe('stay') // 사용자 명령(stay) 중에는 자율 낮잠 발동 안 함
    char.state = 'idle'
    char.update(1 / 60, makeWorld())
    expect(char.state).toBe('nap') // idle에서는 발동
    simulate(char, makeWorld(), 3)
    expect(char.state).not.toBe('nap') // 졸림 해소 → 기상
    expect(char.sleepiness).toBeLessThanOrEqual(cfg.napWakeAt)
  })

  it('밤에는 졸림이 더 빨리 쌓인다', () => {
    const day = new Character(0, CY, DEFAULT_CONFIG, () => 0.5, () => 14)
    const night = new Character(0, CY, DEFAULT_CONFIG, () => 0.5, () => 23)
    day.commandStay()
    night.commandStay()
    simulate(day, makeWorld(), 60)
    simulate(night, makeWorld(), 60)
    expect(night.sleepiness).toBeGreaterThan(day.sleepiness)
  })
})

describe('같이 일하기 (cowork)', () => {
  it('사용자 활동이 이어지면 자리 잡고 타이핑하고, 손을 놓으면 그만둔다', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      coworkThreshold: 2,
      coworkChance: 1,
      coworkTimeMin: 600,
      coworkTimeMax: 600,
      coworkIdleGrace: 5,
    }
    // rng 0.4 > watchChance(0.3) → 창 알림은 자리 기억용으로만 쓰임
    const char = new Character(0, 300, cfg, () => 0.4)
    char.state = 'idle'
    char.notifyActiveWindow({ x: 300, y: 300, w: 0, h: 0 })
    expect(char.state).toBe('idle')
    const world = makeWorld()
    world.userActive = true
    simulate(char, world, 4)
    expect(char.state).toBe('cowork')
    expect(char.messages).toContain('!')
    simulate(char, world, 20) // 자리(창 옆 +110)까지 걸어가 타이핑
    expect(char.pose).toBe('work')
    // 사용자가 손을 놓으면 grace 후 그만둠
    world.userActive = false
    simulate(char, world, cfg.coworkIdleGrace + 2)
    expect(char.state).not.toBe('cowork')
    expect(char.messages).toContain('?')
  })

  it('예정된 시간이 끝나면 스스로 마무리한다', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      coworkThreshold: 1,
      coworkChance: 1,
      coworkTimeMin: 3,
      coworkTimeMax: 3,
    }
    const char = new Character(0, 300, cfg, () => 0.4)
    char.state = 'idle'
    char.notifyActiveWindow({ x: 100, y: 300, w: 0, h: 0 })
    const world = makeWorld()
    world.userActive = true
    simulate(char, world, 2)
    expect(char.state).toBe('cowork')
    simulate(char, world, 15)
    expect(char.state).not.toBe('cowork')
    expect(char.messages).toContain('♪')
  })
})

describe('소파 / 홈 모드', () => {
  const HOME = { x: 1000, y: 500, seatX: 1000, seatY: 520, radius: 240 }

  it('배회 목적지가 소파 반경 안으로 제한된다', () => {
    const char = new Character(1000, 500, DEFAULT_CONFIG, () => 0.99)
    char.state = 'wander'
    const world = makeWorld()
    world.home = HOME
    simulate(char, world, 120)
    const dist = Math.hypot(char.x - HOME.x, char.y - HOME.y)
    expect(dist).toBeLessThanOrEqual(HOME.radius + 5)
  })

  it('쉬는 시간이 끝나면 종종 소파에 가서 앉는다', () => {
    // rng 0.1 < 0.45 → idle 종료 시 sit 선택
    const char = new Character(900, 500, DEFAULT_CONFIG, () => 0.1)
    char.state = 'idle'
    const world = makeWorld()
    world.home = HOME
    simulate(char, world, 1)
    expect(char.state).toBe('sit')
    simulate(char, world, 10) // 자리까지 걸어가 앉음
    expect(char.pose).toBe('sit')
    expect(char.x).toBeCloseTo(HOME.seatX, 0)
  })

  it('앉아 있는데 소파가 치워지면 일어난다', () => {
    const char = new Character(1000, 520, DEFAULT_CONFIG, () => 0.1)
    char.state = 'sit'
    const world = makeWorld()
    world.home = null
    char.update(1 / 60, world)
    expect(char.state).toBe('idle')
  })

  it('홈 모드에서는 같이 일하기(cowork)도 발동하지 않는다', () => {
    const cfg = { ...DEFAULT_CONFIG, coworkThreshold: 1, coworkChance: 1 }
    const char = new Character(1000, 500, cfg, () => 0.99)
    char.state = 'wander'
    const world = makeWorld()
    world.home = HOME
    world.userActive = true
    simulate(char, world, 5)
    expect(char.state).not.toBe('cowork')
  })
})

describe('사용자 방치 감지', () => {
  it('사용자가 오래 자리를 비우면 갸웃(?)하고, 돌아오면 리셋된다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.99)
    char.commandStay()
    const world = makeWorld()
    world.userIdleSec = 120
    char.state = 'idle'
    char.update(1 / 60, world)
    expect(char.messages).toContain('?')
    char.messages.length = 0
    char.update(1 / 60, world)
    expect(char.messages).not.toContain('?') // 한 번만
    world.userIdleSec = 0
    char.update(1 / 60, world)
    world.userIdleSec = 120
    char.update(1 / 60, world)
    expect(char.messages).toContain('?') // 새 방치 에피소드에 다시 반응
  })
})

describe('활동성 프리셋', () => {
  it('활발함 프리셋은 차분함보다 걸음이 빠르다', () => {
    const calm = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    const active = new Character(0, CY, DEFAULT_CONFIG, () => 0.5)
    active.applyActivity('active')
    calm.commandFollow()
    active.commandFollow()
    const world = makeWorld(300)
    simulate(calm, world, 1)
    simulate(active, world, 1)
    expect(active.x).toBeGreaterThan(calm.x)
  })
})

describe('친구에게 인사 (social)', () => {
  it('근처 친구 알림을 받으면 다가가서 인사하고, 끝나면 쿨다운 동안 재발동하지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1) // 0.1 < 0.4 → 발동
    char.state = 'idle'
    char.notifyPeerNearby({ x: 200, y: CY })
    expect(char.state).toBe('social')
    const world = makeWorld()
    simulate(char, world, 10) // 걸어가서 도착
    expect(Math.abs(char.x - 200)).toBeLessThanOrEqual(35)
    expect(char.messages.length).toBeGreaterThan(0) // 인사 이모트
    simulate(char, world, 12) // socialTimer 종료
    expect(char.state).not.toBe('social')
    // 쿨다운 중에는 재발동 안 함
    char.state = 'idle'
    char.notifyPeerNearby({ x: 300, y: CY })
    expect(char.state).toBe('idle')
  })

  it('따라오기 등 사용자 명령 중에는 인사하러 가지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1)
    char.commandFollow()
    char.notifyPeerNearby({ x: 200, y: CY })
    expect(char.state).toBe('follow')
  })
})

describe('창 쳐다보기 (watch)', () => {
  it('활성 창 알림을 받으면 확률에 따라 구경하러 간다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1) // rng 0.1 < watchChance 0.5 → 발동
    char.state = 'idle'
    char.notifyActiveWindow({ x: 500, y: 302, w: 0, h: 0 })
    expect(char.state).toBe('watch')
    const world = makeWorld()
    simulate(char, world, 5)
    // 목표 지점으로 이동 중이거나 도착
    expect(char.x).toBeGreaterThan(0)
  })

  it('도착하면 뒤돌아서(back) 구경하고, 끝나면 일상으로 돌아간다', () => {
    const cfg = { ...DEFAULT_CONFIG, watchTimeMin: 3, watchTimeMax: 3 }
    const char = new Character(490, 295, cfg, () => 0.1)
    char.state = 'idle'
    char.notifyActiveWindow({ x: 500, y: 302, w: 0, h: 0 })
    expect(char.state).toBe('watch')
    simulate(char, makeWorld(), 1.5) // 10px 거리 → 금방 도착, 구경 중
    expect(char.pose).toBe('back') // 뒤돌아보기
    simulate(char, makeWorld(), 4)
    expect(char.state === 'idle' || char.state === 'wander').toBe(true)
  })

  it('홈(소파) 모드에서는 구경하러 나가지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.01)
    char.state = 'idle'
    char.notifyActiveWindow({ x: 500, y: 302, w: 0, h: 0 }, true) // homeMode
    expect(char.state).toBe('idle')
  })

  it('따라오기 중에는 한눈팔지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1)
    char.commandFollow()
    char.notifyActiveWindow({ x: 500, y: 302, w: 0, h: 0 })
    expect(char.state).toBe('follow')
  })
})

describe('창 위에 올라타기 (climb)', () => {
  it('구경 여부가 발동됐을 때 일부는 창 위로 올라가 걸터앉는다', () => {
    const cfg = { ...DEFAULT_CONFIG, watchChance: 1, watchTimeMin: 2, watchTimeMax: 2 }
    // A: watchChance 통과(항상 통과), B: roll=0.6 → climb 구간(0.5~0.75), C: 지속시간용
    const char = new Character(500, 300, cfg, queueRng([0.05, 0.6, 0.5]))
    char.state = 'idle'
    char.notifyActiveWindow({ x: 400, y: 250, w: 200, h: 100 })
    expect(char.state).toBe('climb')
    simulate(char, makeWorld(), 3) // 창 위 지점까지 걸어가 도착
    expect(char.pose).toBe('sit') // 걸터앉은 자세
    expect(Math.abs(char.y - 250)).toBeLessThanOrEqual(1) // 창 상단(y=250)에 서 있음
    simulate(char, makeWorld(), 8) // 구경 시간이 끝나고 내려온다
    expect(char.state === 'idle' || char.state === 'wander').toBe(true)
  })

  it('이미 올라가 있는데 활성 창이 바뀌면 새 창 위 지점으로 다시 잡는다', () => {
    const cfg = { ...DEFAULT_CONFIG, watchChance: 1, watchTimeMin: 60, watchTimeMax: 60 }
    const char = new Character(500, 300, cfg, queueRng([0.05, 0.6, 0.5]))
    char.state = 'idle'
    char.notifyActiveWindow({ x: 400, y: 250, w: 200, h: 100 })
    expect(char.state).toBe('climb')
    char.notifyActiveWindow({ x: 900, y: 150, w: 200, h: 100 })
    expect(char.state).toBe('climb') // climb 상태 유지, 목적지만 새 창 기준으로 이동
    simulate(char, makeWorld(), 25) // 새 목적지가 멀리 있어 도착까지 시간이 더 걸린다
    expect(Math.abs(char.y - 150)).toBeLessThanOrEqual(1)
  })
})

describe('창 옆에서 빼꼼 (peek)', () => {
  it('구경 여부가 발동됐을 때 일부는 창 옆에서 창 쪽을 보며 빼꼼거린다', () => {
    const cfg = { ...DEFAULT_CONFIG, watchChance: 1, watchTimeMin: 2, watchTimeMax: 2 }
    // roll=0.9 → peek 구간(0.75~1), side rng=0.9(<0.5 아님) → side=-1(창 왼쪽 밖에 서서 오른쪽=창을 봄)
    const char = new Character(500, 300, cfg, queueRng([0.05, 0.9, 0.5, 0.9]))
    char.state = 'idle'
    char.notifyActiveWindow({ x: 400, y: 250, w: 200, h: 100 })
    expect(char.state).toBe('peek')
    simulate(char, makeWorld(), 5) // 창 옆 지점까지 도착
    expect(char.facing).toBe(1) // 창(오른쪽)을 향해 고정
    simulate(char, makeWorld(), 8)
    expect(char.state === 'idle' || char.state === 'wander').toBe(true)
  })
})

describe('타이핑 시작 반응 (jot)', () => {
  it('한가할 때 타이핑이 막 시작되면 가끔 잠깐 받아적는 흉내를 낸다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1) // 0.1 < 0.35 → 발동
    char.state = 'idle'
    char.notifyTypingStarted()
    expect(char.state).toBe('jot')
    expect(char.pose).toBe('work')
    simulate(char, makeWorld(), 5)
    expect(char.state === 'idle' || char.state === 'wander').toBe(true)
  })

  it('다른 일을 하고 있으면 반응하지 않는다', () => {
    const char = new Character(0, CY, DEFAULT_CONFIG, () => 0.1)
    char.commandFollow()
    char.notifyTypingStarted()
    expect(char.state).toBe('follow')
  })
})
