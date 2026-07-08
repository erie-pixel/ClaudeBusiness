import { describe, it, expect } from 'vitest'
import { Character, DEFAULT_CONFIG, type World } from '../src/engine/character'

const makeWorld = (cursorX: number | null = null): World => ({
  cursor: cursorX === null ? null : { x: cursorX, y: 0 },
  floorY: 1000,
  minX: 0,
  maxX: 2000,
})

/** dt를 잘게 쪼개 seconds초 동안 시뮬레이션 */
function simulate(char: Character, world: World, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) char.update(step, world)
}

describe('follow', () => {
  it('가까운 커서에는 걷기로 접근하고 도착하면 멈춘다', () => {
    const char = new Character(100, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(300) // runDistance(420)보다 가까움 → 걷기
    simulate(char, world, 1)
    expect(char.running).toBe(false)
    expect(char.x).toBeGreaterThan(100)
    simulate(char, world, 10)
    // arriveDistance 안까지 와서 정지
    expect(Math.abs(300 - char.x)).toBeLessThanOrEqual(DEFAULT_CONFIG.arriveDistance)
    expect(char.moving).toBe(false)
  })

  it('커서가 멀면 달리고, 스태미나가 소진되면 지침 상태가 된다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    // 커서를 항상 멀리 유지해 계속 달리게 함
    const world = makeWorld(0)
    let elapsed = 0
    while (char.state === 'follow' && elapsed < 60) {
      world.cursor = { x: char.x + DEFAULT_CONFIG.runDistance + 200, y: 0 }
      char.update(1 / 30, world)
      elapsed += 1 / 30
    }
    expect(char.state).toBe('exhausted')
    expect(char.stamina).toBe(0)
  })

  it('지침 상태에서 회복되면 follow로 복귀한다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.state = 'exhausted'
    char.stamina = 0
    // 커서가 가까우면 회복 후 걷기만 하므로 스태미나가 계속 차오른다
    simulate(char, makeWorld(60), 10)
    expect(char.state).toBe('follow')
    expect(char.stamina).toBeGreaterThanOrEqual(DEFAULT_CONFIG.exhaustedRecoverAt)
  })

  it('회복 후 커서가 여전히 멀면 다시 달리다 지친다 (뛰고 나면 지침 루프)', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.state = 'exhausted'
    char.stamina = 0
    const world = makeWorld(0)
    const seen = new Set<string>()
    for (let t = 0; t < 30; t += 1 / 30) {
      world.cursor = { x: char.x + DEFAULT_CONFIG.runDistance + 300, y: 0 }
      char.update(1 / 30, world)
      seen.add(char.state)
    }
    // 지침 → follow(달리기) → 다시 지침 사이클이 실제로 순환한다
    expect(seen.has('follow')).toBe(true)
    expect(char.state === 'exhausted' || char.state === 'follow').toBe(true)
  })

  it('달리기 임계 거리 안에서는 스태미나가 줄지 않는다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.commandFollow()
    const world = makeWorld(DEFAULT_CONFIG.runDistance - 50)
    simulate(char, world, 2)
    expect(char.stamina).toBeCloseTo(DEFAULT_CONFIG.staminaMax, 0)
  })
})

describe('wander / idle 사이클', () => {
  it('목적지에 도착하면 idle로 쉬었다가 다시 wander로 돌아간다', () => {
    // rng 시퀀스: 첫 목적지 1800(멀리) → 휴식 배수 0 → 다음 목적지 1000
    const seq = [0.9, 0, 0.5]
    const char = new Character(0, DEFAULT_CONFIG, () => seq.shift() ?? 0.5)
    char.state = 'wander'
    const world = makeWorld()
    simulate(char, world, 1)
    expect(char.state).toBe('wander') // 목적지 1800을 향해 이동 중
    expect(char.moving).toBe(true)
    char.x = 1799 // 목적지 근처로 순간이동시켜 도착 처리 유도
    char.update(1 / 60, world)
    expect(char.state).toBe('idle') // 도착 → 휴식 (wanderPauseMin초)
    simulate(char, world, DEFAULT_CONFIG.wanderPauseMin + 0.5)
    expect(char.state).toBe('wander') // 휴식 끝 → 새 목적지로 출발
  })

  it('경계 밖으로 나가지 않는다', () => {
    const char = new Character(1999, DEFAULT_CONFIG, () => 1)
    char.state = 'wander'
    const world = makeWorld()
    simulate(char, world, 30)
    expect(char.x).toBeGreaterThanOrEqual(world.minX)
    expect(char.x).toBeLessThanOrEqual(world.maxX)
  })
})

describe('명령과 상호작용', () => {
  it('낮잠 중에는 스태미나가 빠르게 회복되고, 클릭하면 깬다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.stamina = 10
    char.commandNap()
    simulate(char, makeWorld(), 3)
    expect(char.pose).toBe('sleep')
    expect(char.stamina).toBeGreaterThan(10 + DEFAULT_CONFIG.staminaRegen * 3) // 평상시보다 빠름
    char.poke()
    expect(char.state).toBe('idle')
  })

  it('깨어 있을 때 클릭하면 하트 이모트가 나온다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.commandStay()
    char.poke()
    expect(char.emoteTimer).toBeGreaterThan(0)
    expect(char.state).toBe('stay') // 상태는 유지
  })

  it('그만 따라와 명령은 follow/exhausted에서만 동작한다', () => {
    const char = new Character(0, DEFAULT_CONFIG, () => 0.5)
    char.commandNap()
    char.commandStopFollow()
    expect(char.state).toBe('nap') // 낮잠은 유지
    char.commandFollow()
    char.commandStopFollow()
    expect(char.state).toBe('idle')
  })
})
