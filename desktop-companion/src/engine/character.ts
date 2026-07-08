// 캐릭터 행동 엔진 — 렌더러/Electron에 의존하지 않는 순수 로직.
// 기획서 §3.2 FSM: 사용자 명령 > 스탯 임계값 > 유틸리티(랜덤) 순으로 전이가 결정된다.

export type StateName =
  | 'idle'
  | 'wander'
  | 'follow' // 걷기/달리기는 follow 내부 모드(run 플래그)
  | 'exhausted'
  | 'nap'
  | 'stay'

export interface World {
  /** 커서 위치 (창 좌표). 아직 커서 정보를 못 받았으면 null */
  cursor: { x: number; y: number } | null
  /** 캐릭터가 서 있는 바닥 y (발 기준) */
  floorY: number
  minX: number
  maxX: number
}

export interface CharacterConfig {
  walkSpeed: number // px/s
  runSpeed: number // px/s
  /** 커서가 이보다 멀면 달리기 시도 (px) */
  runDistance: number
  /** 커서와 이 거리 안이면 도착으로 간주 (px) */
  arriveDistance: number
  staminaMax: number
  staminaRunDrain: number // per second
  staminaRegen: number // per second (평상시)
  staminaNapRegen: number // per second (낮잠)
  /** 지침 상태에서 이 수치까지 회복되면 복귀 */
  exhaustedRecoverAt: number
  /** 배회 시 멈춰 쉬는 시간 범위 (s) */
  wanderPauseMin: number
  wanderPauseMax: number
}

export const DEFAULT_CONFIG: CharacterConfig = {
  walkSpeed: 42,
  runSpeed: 150,
  runDistance: 420,
  arriveDistance: 28,
  staminaMax: 100,
  staminaRunDrain: 14,
  staminaRegen: 6,
  staminaNapRegen: 16,
  exhaustedRecoverAt: 35,
  wanderPauseMin: 2,
  wanderPauseMax: 8,
}

/** 렌더러가 애니메이션을 고르는 데 쓰는 표시용 상태 */
export type Pose = 'idle' | 'walk' | 'run' | 'pant' | 'sleep'

export class Character {
  x: number
  facing: 1 | -1 = 1
  state: StateName = 'wander'
  stamina: number
  running = false
  /** 하트 이모트 잔여 시간 (쓰다듬기) */
  emoteTimer = 0

  private cfg: CharacterConfig
  private rng: () => number
  private wanderTarget: number | null = null
  private pauseTimer = 0

  constructor(x: number, cfg: CharacterConfig = DEFAULT_CONFIG, rng: () => number = Math.random) {
    this.x = x
    this.cfg = cfg
    this.rng = rng
    this.stamina = cfg.staminaMax
  }

  // ---- 사용자 명령 (우클릭 메뉴) — 항상 최우선 ----

  commandFollow() {
    this.state = 'follow'
  }
  commandStopFollow() {
    if (this.state === 'follow' || this.state === 'exhausted') this.state = 'idle'
  }
  commandNap() {
    this.state = 'nap'
  }
  commandStay() {
    this.state = 'stay'
  }
  /** 좌클릭: 자면 깨우고, 깨어 있으면 쓰다듬기 */
  poke() {
    if (this.state === 'nap') {
      this.state = 'idle'
    } else {
      this.emoteTimer = 1.6
    }
  }

  get pose(): Pose {
    switch (this.state) {
      case 'nap':
        return 'sleep'
      case 'exhausted':
        return 'pant'
      case 'follow':
        return this.moving ? (this.running ? 'run' : 'walk') : 'idle'
      case 'wander':
        return this.moving ? 'walk' : 'idle'
      default:
        return 'idle'
    }
  }

  moving = false

  update(dt: number, world: World) {
    if (this.emoteTimer > 0) this.emoteTimer -= dt
    this.moving = false
    this.running = false

    switch (this.state) {
      case 'follow':
        this.updateFollow(dt, world)
        break
      case 'exhausted':
        // 헥헥거리며 회복 대기 → 회복되면 하던 follow 재개
        this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.staminaRegen * 1.5 * dt)
        if (this.stamina >= this.cfg.exhaustedRecoverAt) this.state = 'follow'
        break
      case 'nap':
        this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.staminaNapRegen * dt)
        break
      case 'wander':
        this.updateWander(dt, world)
        this.regen(dt)
        break
      case 'idle':
        this.pauseTimer -= dt
        if (this.pauseTimer <= 0) {
          this.state = 'wander'
          this.wanderTarget = null
        }
        this.regen(dt)
        break
      case 'stay':
        this.regen(dt)
        break
    }

    this.x = Math.max(world.minX, Math.min(world.maxX, this.x))
  }

  private regen(dt: number) {
    this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.staminaRegen * dt)
  }

  private updateFollow(dt: number, world: World) {
    if (!world.cursor) return
    const dx = world.cursor.x - this.x
    const dist = Math.abs(dx)
    if (dist <= this.cfg.arriveDistance) return // 도착 — 옆에 서 있기

    this.facing = dx > 0 ? 1 : -1
    const wantRun = dist > this.cfg.runDistance && this.stamina > 0
    const speed = wantRun ? this.cfg.runSpeed : this.cfg.walkSpeed
    this.x += Math.sign(dx) * Math.min(speed * dt, dist)
    this.moving = true
    this.running = wantRun

    if (wantRun) {
      this.stamina -= this.cfg.staminaRunDrain * dt
      if (this.stamina <= 0) {
        this.stamina = 0
        this.state = 'exhausted'
      }
    }
  }

  private updateWander(dt: number, world: World) {
    if (this.wanderTarget === null) {
      this.wanderTarget = world.minX + this.rng() * (world.maxX - world.minX)
      this.facing = this.wanderTarget > this.x ? 1 : -1
    }
    const dx = this.wanderTarget - this.x
    if (Math.abs(dx) <= 2) {
      // 도착 → 잠깐 쉬었다가 다음 목적지
      this.wanderTarget = null
      this.state = 'idle'
      this.pauseTimer =
        this.cfg.wanderPauseMin + this.rng() * (this.cfg.wanderPauseMax - this.cfg.wanderPauseMin)
      return
    }
    this.facing = dx > 0 ? 1 : -1
    this.x += Math.sign(dx) * Math.min(this.cfg.walkSpeed * dt, Math.abs(dx))
    this.moving = true
  }
}
