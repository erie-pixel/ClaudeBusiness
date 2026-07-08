// 캐릭터 행동 엔진 — 렌더러/Electron에 의존하지 않는 순수 로직.
// 기획서 §3.2 FSM: 사용자 명령 > 스탯 임계값 > 유틸리티(랜덤) 순으로 전이가 결정된다.
// 이동은 화면 전체를 자유롭게 다니는 2D (횡스크롤 바닥 라인 아님).

export type StateName =
  | 'idle'
  | 'wander'
  | 'follow' // 걷기/달리기는 follow 내부 모드(run 플래그)
  | 'exhausted'
  | 'nap'
  | 'stay'
  | 'held' // 마우스로 집어든 상태 — 위치는 렌더러가 커서로 직접 제어
  | 'watch' // 활성 창 쳐다보기
  | 'cowork' // 사용자가 일하는 동안 옆에서 같이 일하기

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface World {
  /** 커서 위치 (창 좌표). 아직 커서 정보를 못 받았으면 null */
  cursor: { x: number; y: number } | null
  /** 캐릭터 발 위치가 다닐 수 있는 영역 */
  bounds: Bounds
  /** 사용자가 지금 활동 중인가 (최근 커서 움직임 기준, 렌더러가 계산) */
  userActive: boolean
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
  // ---- 스탯 (0~100) ----
  hungerRate: number // 배고픔 증가 /s
  hungerFeedRelief: number // 간식 1회당 감소량
  hungryAt: number // 이 이상이면 배고픔 호소
  sleepinessRateDay: number // 졸림 증가 /s (낮)
  sleepinessRateNight: number // 졸림 증가 /s (밤 22~06시)
  sleepinessNapRelief: number // 낮잠 중 감소 /s
  autoNapAt: number // 이 이상이면 스스로 낮잠
  napWakeAt: number // 낮잠 중 이 이하로 내려가면 기상
  // ---- 창 쳐다보기 ----
  watchChance: number // 활성 창 전환 시 쳐다보러 갈 확률
  watchTimeMin: number // 구경 시간 (s)
  watchTimeMax: number
  // ---- 같이 일하기 (Co-work) ----
  coworkThreshold: number // 사용자 활동 누적이 이 시간(s)을 넘으면 발동 후보
  coworkChance: number // 후보가 됐을 때 실제 발동 확률
  coworkTimeMin: number // 같이 일하는 시간 (s)
  coworkTimeMax: number
  coworkIdleGrace: number // 사용자가 이 시간(s) 이상 손을 놓으면 일 그만둠
}

// 기본값은 '차분함' — 상주 앱이므로 존재감은 있되 부산스럽지 않게
export const DEFAULT_CONFIG: CharacterConfig = {
  walkSpeed: 36,
  runSpeed: 150,
  runDistance: 420,
  arriveDistance: 36,
  staminaMax: 100,
  staminaRunDrain: 14,
  staminaRegen: 6,
  staminaNapRegen: 16,
  exhaustedRecoverAt: 35,
  wanderPauseMin: 8,
  wanderPauseMax: 25,
  hungerRate: 100 / (3.5 * 3600), // ~3.5시간에 만배고픔
  hungerFeedRelief: 70,
  hungryAt: 80,
  sleepinessRateDay: 100 / (5 * 3600),
  sleepinessRateNight: 100 / (2 * 3600),
  sleepinessNapRelief: 0.9,
  autoNapAt: 85,
  napWakeAt: 10,
  watchChance: 0.3,
  watchTimeMin: 6,
  watchTimeMax: 14,
  coworkThreshold: 150,
  coworkChance: 0.6,
  coworkTimeMin: 60,
  coworkTimeMax: 180,
  coworkIdleGrace: 20,
}

/** 트레이 메뉴에서 고르는 활동성 프리셋 */
export type ActivityLevel = 'calm' | 'normal' | 'active'

export const ACTIVITY_PRESETS: Record<ActivityLevel, Partial<CharacterConfig>> = {
  calm: {
    walkSpeed: 36,
    wanderPauseMin: 8,
    wanderPauseMax: 25,
    watchChance: 0.3,
    coworkThreshold: 150,
  },
  normal: {
    walkSpeed: 42,
    wanderPauseMin: 4,
    wanderPauseMax: 14,
    watchChance: 0.5,
    coworkThreshold: 100,
  },
  active: {
    walkSpeed: 48,
    wanderPauseMin: 2,
    wanderPauseMax: 8,
    watchChance: 0.65,
    coworkThreshold: 60,
  },
}

/** 렌더러가 애니메이션을 고르는 데 쓰는 표시용 상태 */
export type Pose = 'idle' | 'walk' | 'run' | 'pant' | 'sleep' | 'held' | 'work'

export class Character {
  x: number
  y: number
  facing: 1 | -1 = 1
  state: StateName = 'wander'
  running = false
  moving = false
  /** 하트 이모트 잔여 시간 (쓰다듬기/간식) */
  emoteTimer = 0
  /** 말풍선 대사 큐 — 렌더러가 shift()로 꺼내 표시 */
  messages: string[] = []

  // 스탯 (0~100)
  stamina: number
  hunger = 20
  sleepiness = 20
  mood = 70

  private cfg: CharacterConfig
  private rng: () => number
  private getHour: () => number
  private wanderTarget: { x: number; y: number } | null = null
  private pauseTimer = 0
  private hungrySayCooldown = 0
  private watchTarget: { x: number; y: number } | null = null
  private watchTimer = 0
  private lastWindowPoint: { x: number; y: number } | null = null
  private workDesire = 0
  private coworkTarget: { x: number; y: number } | null = null
  private coworkTimer = 0
  private coworkIdleFor = 0
  /** 한 번 일하고 나면 잠시 쉬는 재발동 쿨다운 (s) */
  private coworkCooldown = 0

  constructor(
    x: number,
    y: number,
    cfg: CharacterConfig = DEFAULT_CONFIG,
    rng: () => number = Math.random,
    getHour: () => number = () => new Date().getHours(),
  ) {
    this.x = x
    this.y = y
    this.cfg = { ...cfg }
    this.rng = rng
    this.getHour = getHour
    this.stamina = this.cfg.staminaMax
  }

  /** 활동성 프리셋 적용 (트레이 설정) */
  applyActivity(level: ActivityLevel) {
    Object.assign(this.cfg, ACTIVITY_PRESETS[level])
  }

  private say(text: string) {
    if (this.messages.length < 3) this.messages.push(text)
  }

  // ---- 사용자 명령 (우클릭 메뉴 / 마우스) — 항상 최우선 ----

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
  /** 간식 주기 */
  feed() {
    this.hunger = Math.max(0, this.hunger - this.cfg.hungerFeedRelief)
    this.mood = Math.min(100, this.mood + 10)
    this.emoteTimer = 1.6
    this.say('냠냠!')
    if (this.state === 'nap') this.state = 'idle' // 간식 냄새에 깬다
  }
  /** 좌클릭: 자면 깨우고, 깨어 있으면 쓰다듬기 */
  poke() {
    if (this.state === 'held') return
    if (this.state === 'nap') {
      this.state = 'idle'
      this.pauseTimer = 1
    } else {
      this.emoteTimer = 1.6
      this.mood = Math.min(100, this.mood + 4)
    }
  }

  /** 마우스로 집어들기 (머리를 잡힘) */
  grab() {
    if (this.state !== 'held') {
      this.state = 'held'
      this.say('으앗?!')
    }
  }
  /** 내려놓기 */
  release() {
    if (this.state === 'held') {
      this.state = 'idle'
      this.pauseTimer = 1.2 // 잠깐 어리둥절
      this.say('휴…')
    }
  }
  /** 집힌 동안 렌더러가 위치를 직접 지정 */
  heldMoveTo(x: number, y: number, bounds: Bounds) {
    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, x))
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, y))
  }

  /** 활성 창이 바뀌었다는 알림 → 확률적으로 구경하러 감 */
  notifyActiveWindow(point: { x: number; y: number }) {
    this.lastWindowPoint = point // Co-work 자리 선정에도 사용
    if (this.state === 'watch') {
      this.watchTarget = point // 이미 구경 중이면 새 창으로 관심 이동
      return
    }
    if (this.state !== 'wander' && this.state !== 'idle') return
    if (this.rng() < this.cfg.watchChance) {
      this.state = 'watch'
      this.watchTarget = point
      this.watchTimer =
        this.cfg.watchTimeMin + this.rng() * (this.cfg.watchTimeMax - this.cfg.watchTimeMin)
      if (this.rng() < 0.3) this.say('오~ 뭐 해?')
    }
  }

  get pose(): Pose {
    switch (this.state) {
      case 'held':
        return 'held'
      case 'nap':
        return 'sleep'
      case 'exhausted':
        return 'pant'
      case 'follow':
        return this.moving ? (this.running ? 'run' : 'walk') : 'idle'
      case 'cowork':
        return this.moving ? 'walk' : 'work'
      case 'wander':
      case 'watch':
        return this.moving ? 'walk' : 'idle'
      default:
        return 'idle'
    }
  }

  update(dt: number, world: World) {
    if (this.emoteTimer > 0) this.emoteTimer -= dt
    this.moving = false
    this.running = false

    this.updateStats(dt)

    switch (this.state) {
      case 'held':
        return // 위치는 렌더러가 제어, 이동/전이 없음
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
        if (this.sleepiness <= this.cfg.napWakeAt) {
          this.state = 'idle'
          this.pauseTimer = 2
        }
        break
      case 'watch':
        this.updateWatch(dt, world)
        this.regen(dt)
        break
      case 'cowork':
        this.updateCowork(dt, world)
        this.regen(dt)
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

    // 스탯 임계값 자율 전이 (사용자 명령 상태에서는 발동 안 함)
    if (
      this.sleepiness >= this.cfg.autoNapAt &&
      (this.state === 'wander' || this.state === 'idle')
    ) {
      this.state = 'nap'
      this.say('졸려…')
    }

    // 같이 일하기: 사용자 활동이 꾸준히 이어지면 옆에 와서 같이 일한다
    if (this.coworkCooldown > 0) this.coworkCooldown -= dt
    if (this.state !== 'cowork') {
      if (world.userActive) this.workDesire += dt
      else this.workDesire = Math.max(0, this.workDesire - dt * 0.5)
    }
    if (
      this.workDesire >= this.cfg.coworkThreshold &&
      this.coworkCooldown <= 0 &&
      (this.state === 'wander' || this.state === 'idle')
    ) {
      this.workDesire = 0
      if (this.rng() < this.cfg.coworkChance) {
        this.state = 'cowork'
        this.coworkTarget = null
        this.coworkTimer =
          this.cfg.coworkTimeMin + this.rng() * (this.cfg.coworkTimeMax - this.cfg.coworkTimeMin)
        this.coworkIdleFor = 0
        this.say('나도 일할래!')
      }
    }

    const b = world.bounds
    this.x = Math.max(b.minX, Math.min(b.maxX, this.x))
    this.y = Math.max(b.minY, Math.min(b.maxY, this.y))
  }

  private updateStats(dt: number) {
    this.hunger = Math.min(100, this.hunger + this.cfg.hungerRate * dt)
    const hour = this.getHour()
    const night = hour >= 22 || hour < 6
    if (this.state === 'nap') {
      this.sleepiness = Math.max(0, this.sleepiness - this.cfg.sleepinessNapRelief * dt)
    } else {
      this.sleepiness = Math.min(
        100,
        this.sleepiness + (night ? this.cfg.sleepinessRateNight : this.cfg.sleepinessRateDay) * dt,
      )
    }
    // 배고픔이 심하면 기분이 서서히 나빠진다
    if (this.hunger >= this.cfg.hungryAt) {
      this.mood = Math.max(0, this.mood - 0.02 * dt * 60)
      this.hungrySayCooldown -= dt
      if (this.hungrySayCooldown <= 0 && this.state !== 'nap' && this.state !== 'held') {
        this.say('배고파…')
        this.hungrySayCooldown = 45
      }
    }
  }

  private regen(dt: number) {
    this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.staminaRegen * dt)
  }

  /** 목표 지점으로 2D 직선 이동. 이동했으면 true */
  private moveToward(tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - this.x
    const dy = ty - this.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.5) return false
    const step = Math.min(speed * dt, dist)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    // 수직 이동뿐일 때는 바라보는 방향 유지
    if (Math.abs(dx) > 1) this.facing = dx > 0 ? 1 : -1
    return true
  }

  private updateFollow(dt: number, world: World) {
    if (!world.cursor) return
    const dist = Math.hypot(world.cursor.x - this.x, world.cursor.y - this.y)
    if (dist <= this.cfg.arriveDistance) return // 도착 — 커서 옆에 서 있기

    const wantRun = dist > this.cfg.runDistance && this.stamina > 0
    const speed = wantRun ? this.cfg.runSpeed : this.cfg.walkSpeed
    this.moving = this.moveToward(world.cursor.x, world.cursor.y, speed, dt)
    this.running = wantRun && this.moving

    if (this.running) {
      this.stamina -= this.cfg.staminaRunDrain * dt
      if (this.stamina <= 0) {
        this.stamina = 0
        this.state = 'exhausted'
        this.say('헥헥…')
      }
    }
  }

  private updateWander(dt: number, world: World) {
    const b = world.bounds
    if (this.wanderTarget === null) {
      // 화면 어디든 자유롭게 — x, y 각각 랜덤 지점
      this.wanderTarget = {
        x: b.minX + this.rng() * (b.maxX - b.minX),
        y: b.minY + this.rng() * (b.maxY - b.minY),
      }
    }
    const t = this.wanderTarget
    if (Math.hypot(t.x - this.x, t.y - this.y) <= 2) {
      // 도착 → 잠깐 쉬었다가 다음 목적지
      this.wanderTarget = null
      this.state = 'idle'
      this.pauseTimer =
        this.cfg.wanderPauseMin + this.rng() * (this.cfg.wanderPauseMax - this.cfg.wanderPauseMin)
      return
    }
    this.moving = this.moveToward(t.x, t.y, this.cfg.walkSpeed, dt)
  }

  private updateCowork(dt: number, world: World) {
    const b = world.bounds
    if (!this.coworkTarget) {
      // 활성 창 상단 한쪽 구석, 없으면 커서 옆자리
      const base = this.lastWindowPoint ?? world.cursor
      if (!base) {
        this.state = 'idle'
        this.pauseTimer = 1
        return
      }
      this.coworkTarget = {
        x: Math.max(b.minX, Math.min(b.maxX, base.x + 110)),
        y: Math.max(b.minY, Math.min(b.maxY, base.y)),
      }
    }
    const t = this.coworkTarget
    if (Math.hypot(t.x - this.x, t.y - this.y) > 4) {
      this.moving = this.moveToward(t.x, t.y, this.cfg.walkSpeed, dt)
      return
    }
    // 자리 잡고 타이핑
    this.coworkTimer -= dt
    if (world.userActive) {
      this.coworkIdleFor = 0
    } else {
      this.coworkIdleFor += dt
      if (this.coworkIdleFor >= this.cfg.coworkIdleGrace) {
        this.endCowork(2)
        this.say('쉬는 거야?')
        return
      }
    }
    if (this.coworkTimer <= 0) {
      this.endCowork(2 + this.rng() * 4)
      this.say('오늘도 열일!')
    }
  }

  private endCowork(pause: number) {
    this.coworkTarget = null
    this.state = 'idle'
    this.pauseTimer = pause
    this.workDesire = 0
    this.coworkCooldown = 60 // 방금 일했으니 당분간은 다시 안 옴
  }

  private updateWatch(dt: number, world: World) {
    if (!this.watchTarget) {
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const b = world.bounds
    const tx = Math.max(b.minX, Math.min(b.maxX, this.watchTarget.x))
    const ty = Math.max(b.minY, Math.min(b.maxY, this.watchTarget.y))
    if (Math.hypot(tx - this.x, ty - this.y) > 4) {
      this.moving = this.moveToward(tx, ty, this.cfg.walkSpeed, dt)
      return
    }
    // 도착 — 구경
    this.watchTimer -= dt
    if (this.watchTimer <= 0) {
      this.watchTarget = null
      this.state = 'idle'
      this.pauseTimer = 1 + this.rng() * 3
    }
  }
}
