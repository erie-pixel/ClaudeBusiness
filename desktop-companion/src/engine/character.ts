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
  | 'watch' // 활성 창 쳐다보기 (뒤돌아서 구경)
  | 'climb' // 활성 창 위로 올라가 걸터앉기
  | 'peek' // 활성 창 옆에서 빼꼼 구경하기
  | 'cowork' // 사용자가 일하는 동안 옆에서 같이 일하기
  | 'sit' // 소파에 앉아 쉬기 (홈 모드)
  | 'social' // 친구 캐릭터에게 다가가 인사 (멀티플레이)
  | 'jot' // 사용자가 막 타이핑을 시작한 순간 반응해 잠깐 받아적는 흉내
  | 'cheer' // 오래 일하는 사용자를 응원하러 커서 근처로 다가옴

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Home {
  /** 활동 반경의 중심 (소파 위치) */
  x: number
  y: number
  /** 앉는 자리 (발 기준) */
  seatX: number
  seatY: number
  /** 이 반경 안에서만 배회 */
  radius: number
}

export interface World {
  /** 커서 위치 (창 좌표). 아직 커서 정보를 못 받았으면 null */
  cursor: { x: number; y: number } | null
  /** 캐릭터 발 위치가 다닐 수 있는 영역 */
  bounds: Bounds
  /** 사용자가 지금 활동 중인가 (커서/키보드 입력 기준, 렌더러가 계산) */
  userActive: boolean
  /** 사용자가 마지막 입력 후 몇 초 지났나 */
  userIdleSec: number
  /** 소파(가구) 홈 모드 — 설정 시 이 주변에서만 활동 */
  home: Home | null
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

// 기본값은 '보통' — 상주 앱이므로 존재감은 있되 부산스럽지 않게
export const DEFAULT_CONFIG: CharacterConfig = {
  walkSpeed: 30,
  runSpeed: 150,
  runDistance: 420,
  arriveDistance: 36,
  staminaMax: 100,
  staminaRunDrain: 14,
  staminaRegen: 6,
  staminaNapRegen: 16,
  exhaustedRecoverAt: 35,
  wanderPauseMin: 18,
  wanderPauseMax: 45,
  hungerRate: 100 / (3.5 * 3600), // ~3.5시간에 만배고픔
  hungerFeedRelief: 70,
  hungryAt: 80,
  sleepinessRateDay: 100 / (5 * 3600),
  sleepinessRateNight: 100 / (2 * 3600),
  sleepinessNapRelief: 0.9,
  autoNapAt: 85,
  napWakeAt: 10,
  watchChance: 0.18,
  watchTimeMin: 6,
  watchTimeMax: 14,
  coworkThreshold: 260,
  coworkChance: 0.6,
  coworkTimeMin: 60,
  coworkTimeMax: 180,
  coworkIdleGrace: 20,
}

/** 트레이 메뉴에서 고르는 활동성 프리셋 */
export type ActivityLevel = 'calm' | 'normal' | 'active'

export const ACTIVITY_PRESETS: Record<ActivityLevel, Partial<CharacterConfig>> = {
  // 가장 차분함 — 거의 가만히 있고 가끔만 움직임
  calm: {
    walkSpeed: 26,
    wanderPauseMin: 40,
    wanderPauseMax: 100,
    watchChance: 0.08,
    coworkThreshold: 480,
  },
  normal: {
    walkSpeed: 30,
    wanderPauseMin: 18,
    wanderPauseMax: 45,
    watchChance: 0.18,
    coworkThreshold: 260,
  },
  // 예전 '차분함' 수준이 이제 가장 활발한 단계
  active: {
    walkSpeed: 36,
    wanderPauseMin: 8,
    wanderPauseMax: 25,
    watchChance: 0.3,
    coworkThreshold: 150,
  },
}

/** 렌더러가 애니메이션을 고르는 데 쓰는 표시용 상태 */
export type Pose =
  | 'idle'
  | 'walk'
  | 'run'
  | 'pant'
  | 'sleep'
  | 'held'
  | 'work'
  | 'back' // 뒤돌아서 구경
  | 'sit'

export class Character {
  x: number
  y: number
  facing: 1 | -1 = 1
  state: StateName = 'wander'
  running = false
  moving = false
  /** 하트 이모트 잔여 시간 (쓰다듬기/간식) */
  emoteTimer = 0
  /** 이모트 심볼 큐 (!, ?, ♪ 등) — 렌더러가 shift()로 꺼내 머리 위에 표시 */
  messages: string[] = []
  /** 의미 이벤트 큐 — 렌더러가 매 프레임 비워 간다 (수집 앨범 등 부가 시스템용).
   * 'wander-arrive': 배회 목적지 도착 (기념품 발견 추첨 지점)
   * 'cowork-end': 같이 일하기 한 세션 종료
   * 'greeted': 친구에게 인사함
   * 'cheered': 일하는 사용자를 응원하러 옴 */
  events: string[] = []

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
  private climbTarget: { x: number; y: number } | null = null
  private climbTimer = 0
  private climbArrived = false
  private peekTarget: { x: number; y: number } | null = null
  private peekTimer = 0
  private peekFaceDir: 1 | -1 = 1
  private peekArrived = false
  private jotTimer = 0
  /** 받아적기 흉내 재발동 쿨다운 — 생활 행동답게 가끔만 (매 타이핑 반응 방지) */
  private jotCooldown = 0
  private cheerTarget: { x: number; y: number } | null = null
  private cheerTimer = 0
  private cheerArrived = false
  /** 응원 재발동 쿨다운 */
  private cheerCooldown = 0
  private workDesire = 0
  private coworkTarget: { x: number; y: number } | null = null
  private coworkTimer = 0
  private coworkIdleFor = 0
  /** 한 번 일하고 나면 잠시 쉬는 재발동 쿨다운 (s) */
  private coworkCooldown = 0
  /** watch 목적지 도착 여부 (뒤돌아보기 포즈) */
  private watchArrived = false
  private sitTimer = 0
  /** 사용자 장기 방치에 한 번만 반응 */
  private idleReacted = false
  private socialTarget: { x: number; y: number } | null = null
  private socialTimer = 0
  private socialGreeted = false
  /** 인사 후 잠시 쉬는 재발동 쿨다운 (s) */
  private socialCooldown = 0

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
    this.say('♪')
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
      this.say('!?')
    }
  }
  /** 내려놓기 */
  release() {
    if (this.state === 'held') {
      this.state = 'idle'
      this.pauseTimer = 1.2 // 잠깐 어리둥절
      this.say('…')
    }
  }
  /** 집힌 동안 렌더러가 위치를 직접 지정 */
  heldMoveTo(x: number, y: number, bounds: Bounds) {
    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, x))
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, y))
  }

  /** 친구 캐릭터가 근처에 있다는 알림 → 확률적으로 다가가 인사 */
  notifyPeerNearby(point: { x: number; y: number }) {
    if (this.socialCooldown > 0) return
    if (this.state === 'social') {
      this.socialTarget = point // 친구가 움직이면 따라 감
      return
    }
    if (this.state !== 'wander' && this.state !== 'idle') return
    if (this.rng() < 0.4) {
      this.state = 'social'
      this.socialTarget = point
      this.socialTimer = 4 + this.rng() * 5
      this.socialGreeted = false
    }
  }

  /** 근처 친구가 인사 기호(!/♪)를 보내는 걸 감지했다는 알림 → 한가하면 거의 항상
   * 다가가서 화답한다. 순전히 랜덤으로 서로 지나치기만 하던 것과 달리, 한쪽이
   * 인사하면 상대가 반응해 주고받는 대화하는 느낌을 만든다. */
  notifyGreeted(point: { x: number; y: number }) {
    if (this.state === 'social') {
      this.socialTarget = point
      return
    }
    if (this.state !== 'wander' && this.state !== 'idle') return
    this.state = 'social'
    this.socialTarget = point
    this.socialTimer = 4 + this.rng() * 5
    this.socialGreeted = false
  }

  /** 창 위에 걸터앉을 무작위 지점 (가장자리는 피해서 안정적으로 보이게) */
  private pickClimbSpot(rect: { x: number; y: number; w: number; h: number }) {
    const margin = Math.min(14, rect.w / 2)
    const x = rect.x + margin + this.rng() * Math.max(0, rect.w - margin * 2)
    return { x, y: rect.y }
  }

  /** 사용자가 막 타이핑을 시작한 순간(가만있다가→입력) 알림. 생활 행동의 하나라서
   * 매번이 아니라 가끔만 — 확률에 더해 긴 쿨다운(5분+)이 걸려 있고, 이미 뭔가
   * 하고 있으면 방해하지 않는다. */
  notifyTypingStarted() {
    if (this.jotCooldown > 0) return
    if (this.state !== 'wander' && this.state !== 'idle') return
    if (this.rng() < 0.35) {
      this.state = 'jot'
      this.jotTimer = 1.2 + this.rng() * 0.8
      this.jotCooldown = 300 + this.rng() * 240 // 5~9분에 한 번만
      this.say('!')
    }
  }

  /** 활성 창이 바뀌었다는 알림 → 확률적으로 구경/올라타기/빼꼼 중 하나 (홈 모드에서는 안 함) */
  notifyActiveWindow(rect: { x: number; y: number; w: number; h: number }, homeMode = false) {
    const topCenter = { x: rect.x + rect.w / 2, y: rect.y - 2 }
    this.lastWindowPoint = topCenter // Co-work 자리 선정에도 사용
    if (homeMode) return
    if (this.state === 'watch') {
      this.watchTarget = topCenter // 이미 구경 중이면 새 창으로 관심 이동
      return
    }
    if (this.state === 'climb') {
      this.climbTarget = this.pickClimbSpot(rect)
      return
    }
    if (this.state === 'peek') {
      // 이미 빼꼼 중이면 같은 쪽에서 새 창 기준으로 자리만 갱신
      const side: 1 | -1 = this.peekFaceDir === -1 ? 1 : -1
      this.peekTarget = { x: rect.x + (side === 1 ? rect.w + 10 : -10), y: rect.y + Math.min(rect.h, 50) }
      return
    }
    if (this.state !== 'wander' && this.state !== 'idle') return
    if (this.rng() < this.cfg.watchChance) {
      const roll = this.rng()
      const dur =
        this.cfg.watchTimeMin + this.rng() * (this.cfg.watchTimeMax - this.cfg.watchTimeMin)
      if (roll < 0.5) {
        this.state = 'watch'
        this.watchArrived = false
        this.watchTarget = topCenter
        this.watchTimer = dur
        if (this.rng() < 0.5) this.say('?')
      } else if (roll < 0.75) {
        this.state = 'climb'
        this.climbArrived = false
        this.climbTarget = this.pickClimbSpot(rect)
        this.climbTimer = dur
      } else {
        const side: 1 | -1 = this.rng() < 0.5 ? 1 : -1 // 1=창 오른쪽 밖, -1=창 왼쪽 밖
        this.peekTarget = { x: rect.x + (side === 1 ? rect.w + 10 : -10), y: rect.y + Math.min(rect.h, 50) }
        this.peekFaceDir = side === 1 ? -1 : 1 // 창 쪽을 바라봄
        this.peekArrived = false
        this.state = 'peek'
        this.peekTimer = dur
      }
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
      case 'watch':
        return this.moving ? 'walk' : this.watchArrived ? 'back' : 'idle'
      case 'climb':
        return this.moving ? 'walk' : 'sit' // 창 위에 걸터앉은 모습
      case 'peek':
        return this.moving ? 'walk' : 'idle' // 창 옆에서 빼꼼 — 몸을 기울여 구경
      case 'jot':
        return 'work' // 그 자리에 잠깐 앉아 받아적는 흉내
      case 'sit':
        return this.moving ? 'walk' : 'sit'
      case 'cheer':
      case 'social':
      case 'wander':
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
      case 'climb':
        this.updateClimb(dt, world)
        this.regen(dt)
        break
      case 'peek':
        this.updatePeek(dt, world)
        this.regen(dt)
        break
      case 'jot':
        this.jotTimer -= dt
        if (this.jotTimer <= 0) {
          this.state = 'idle'
          this.pauseTimer = 1 + this.rng() * 2
        }
        this.regen(dt)
        break
      case 'cheer':
        this.updateCheer(dt, world)
        this.regen(dt)
        break
      case 'cowork':
        this.updateCowork(dt, world)
        this.regen(dt)
        break
      case 'sit':
        this.updateSit(dt, world)
        this.regen(dt)
        break
      case 'social':
        this.updateSocial(dt, world)
        this.regen(dt)
        break
      case 'wander':
        this.updateWander(dt, world)
        this.regen(dt)
        break
      case 'idle':
        this.pauseTimer -= dt
        if (this.pauseTimer <= 0) {
          // 홈(소파) 모드에서는 배회 대신 종종 소파에 앉는다
          if (world.home && this.rng() < 0.45) {
            this.state = 'sit'
            this.sitTimer = 20 + this.rng() * 40
          } else {
            this.state = 'wander'
            this.wanderTarget = null
          }
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
      this.say('Zz…')
    }

    // 사용자가 오래 자리를 비우면 두리번거리며 갸웃 (한 번만)
    if (world.userIdleSec >= 90) {
      if (
        !this.idleReacted &&
        (this.state === 'wander' || this.state === 'idle' || this.state === 'sit')
      ) {
        this.idleReacted = true
        this.say('?')
        this.facing = this.facing === 1 ? -1 : 1 // 두리번
      }
    } else if (world.userIdleSec < 5) {
      this.idleReacted = false
    }

    if (this.socialCooldown > 0) this.socialCooldown -= dt
    if (this.jotCooldown > 0) this.jotCooldown -= dt
    if (this.cheerCooldown > 0) this.cheerCooldown -= dt

    // 같이 일하기: 사용자 활동이 꾸준히 이어지면 옆에 와서 같이 일한다 (홈 모드에서는 안 함)
    if (this.coworkCooldown > 0) this.coworkCooldown -= dt
    if (this.state !== 'cowork') {
      if (world.userActive) this.workDesire += dt
      else this.workDesire = Math.max(0, this.workDesire - dt * 0.5)
    }
    if (
      this.workDesire >= this.cfg.coworkThreshold &&
      this.coworkCooldown <= 0 &&
      !world.home &&
      (this.state === 'wander' || this.state === 'idle')
    ) {
      this.workDesire = 0
      if (this.rng() < this.cfg.coworkChance) {
        this.state = 'cowork'
        this.coworkTarget = null
        this.coworkTimer =
          this.cfg.coworkTimeMin + this.rng() * (this.cfg.coworkTimeMax - this.cfg.coworkTimeMin)
        this.coworkIdleFor = 0
        this.say('!')
      } else if (world.cursor && this.cheerCooldown <= 0 && this.rng() < 0.5) {
        // 같이 일하러 오지는 않더라도 가끔 응원하러 다가온다 — 생활 행동의 하나
        this.state = 'cheer'
        this.cheerTarget = { x: world.cursor.x - 60 * this.facing, y: world.cursor.y + 40 }
        this.cheerTimer = 3 + this.rng() * 2
        this.cheerArrived = false
        this.cheerCooldown = 420 + this.rng() * 300 // 7~12분에 한 번만
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
        this.say('~?')
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
        this.say(';;')
      }
    }
  }

  private updateWander(dt: number, world: World) {
    const b = world.bounds
    if (this.wanderTarget === null) {
      if (world.home) {
        // 홈 모드 — 소파 반경 안의 랜덤 지점만
        const angle = this.rng() * Math.PI * 2
        const r = this.rng() * world.home.radius
        this.wanderTarget = {
          x: Math.max(b.minX, Math.min(b.maxX, world.home.x + Math.cos(angle) * r)),
          y: Math.max(b.minY, Math.min(b.maxY, world.home.y + Math.sin(angle) * r)),
        }
      } else {
        // 화면 어디든 자유롭게 — x, y 각각 랜덤 지점
        this.wanderTarget = {
          x: b.minX + this.rng() * (b.maxX - b.minX),
          y: b.minY + this.rng() * (b.maxY - b.minY),
        }
      }
    }
    const t = this.wanderTarget
    if (Math.hypot(t.x - this.x, t.y - this.y) <= 2) {
      // 도착 → 잠깐 쉬었다가 다음 목적지
      this.wanderTarget = null
      this.state = 'idle'
      this.pauseTimer =
        this.cfg.wanderPauseMin + this.rng() * (this.cfg.wanderPauseMax - this.cfg.wanderPauseMin)
      if (this.events.length < 8) this.events.push('wander-arrive')
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
        this.say('?')
        return
      }
    }
    if (this.coworkTimer <= 0) {
      this.endCowork(2 + this.rng() * 4)
      this.say('♪')
    }
  }

  private endCowork(pause: number) {
    this.coworkTarget = null
    this.state = 'idle'
    this.pauseTimer = pause
    this.workDesire = 0
    this.coworkCooldown = 60 // 방금 일했으니 당분간은 다시 안 옴
    if (this.events.length < 8) this.events.push('cowork-end')
  }

  private updateSit(dt: number, world: World) {
    if (!world.home) {
      // 소파가 치워짐 → 일어난다
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const { seatX, seatY } = world.home
    if (Math.hypot(seatX - this.x, seatY - this.y) > 3) {
      this.moving = this.moveToward(seatX, seatY, this.cfg.walkSpeed, dt)
      return
    }
    this.x = seatX
    this.y = seatY
    this.sitTimer -= dt
    if (this.sitTimer <= 0) {
      this.state = 'idle'
      this.pauseTimer = 2 + this.rng() * 4
    }
  }

  private updateSocial(dt: number, world: World) {
    if (!this.socialTarget) {
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const b = world.bounds
    const tx = Math.max(b.minX, Math.min(b.maxX, this.socialTarget.x))
    const ty = Math.max(b.minY, Math.min(b.maxY, this.socialTarget.y))
    const dist = Math.hypot(tx - this.x, ty - this.y)
    if (dist > 34) {
      this.moving = this.moveToward(tx, ty, this.cfg.walkSpeed, dt)
      return
    }
    // 도착 — 친구를 바라보며 인사
    if (Math.abs(tx - this.x) > 1) this.facing = tx > this.x ? 1 : -1
    if (!this.socialGreeted) {
      this.socialGreeted = true
      // 두 박자로 짧게 — 인사 하나만 툭 던지고 끝나기보다 주고받는 느낌
      const first = this.rng() < 0.5 ? '♪' : '!'
      this.say(first)
      this.say(first === '!' ? '♪' : '!')
      this.emoteTimer = 1.6 // 하트도 살짝
      if (this.events.length < 8) this.events.push('greeted')
    }
    this.socialTimer -= dt
    if (this.socialTimer <= 0) {
      this.socialTarget = null
      this.state = 'idle'
      this.pauseTimer = 2 + this.rng() * 4
      this.socialCooldown = 45 + this.rng() * 30
    }
  }

  private updateClimb(dt: number, world: World) {
    if (!this.climbTarget) {
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const b = world.bounds
    const tx = Math.max(b.minX, Math.min(b.maxX, this.climbTarget.x))
    const ty = Math.max(b.minY, Math.min(b.maxY, this.climbTarget.y))
    if (Math.hypot(tx - this.x, ty - this.y) > 3) {
      this.moving = this.moveToward(tx, ty, this.cfg.walkSpeed, dt)
      this.climbArrived = false
      return
    }
    this.x = tx
    this.y = ty
    if (!this.climbArrived) {
      this.climbArrived = true
      this.say('!')
    }
    this.climbTimer -= dt
    if (this.climbTimer <= 0) {
      this.climbTarget = null
      this.state = 'idle'
      this.pauseTimer = 1 + this.rng() * 3
    }
  }

  private updatePeek(dt: number, world: World) {
    if (!this.peekTarget) {
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const b = world.bounds
    const tx = Math.max(b.minX, Math.min(b.maxX, this.peekTarget.x))
    const ty = Math.max(b.minY, Math.min(b.maxY, this.peekTarget.y))
    if (Math.hypot(tx - this.x, ty - this.y) > 3) {
      this.moving = this.moveToward(tx, ty, this.cfg.walkSpeed, dt)
      this.peekArrived = false
      return
    }
    this.x = tx
    this.y = ty
    this.facing = this.peekFaceDir // 창 쪽을 향해 고정 (이동 방향과 무관하게)
    if (!this.peekArrived) {
      this.peekArrived = true
      this.say('?')
    }
    this.peekTimer -= dt
    if (this.peekTimer <= 0) {
      this.peekTarget = null
      this.state = 'idle'
      this.pauseTimer = 1 + this.rng() * 3
    }
  }

  private updateCheer(dt: number, world: World) {
    if (!this.cheerTarget) {
      this.state = 'idle'
      this.pauseTimer = 1
      return
    }
    const b = world.bounds
    const tx = Math.max(b.minX, Math.min(b.maxX, this.cheerTarget.x))
    const ty = Math.max(b.minY, Math.min(b.maxY, this.cheerTarget.y))
    if (Math.hypot(tx - this.x, ty - this.y) > 6) {
      this.moving = this.moveToward(tx, ty, this.cfg.walkSpeed, dt)
      return
    }
    if (!this.cheerArrived) {
      this.cheerArrived = true
      // 커서(작업 지점)를 바라보며 응원
      if (world.cursor && Math.abs(world.cursor.x - this.x) > 1) {
        this.facing = world.cursor.x > this.x ? 1 : -1
      }
      this.say('♪')
      this.say('!')
      this.emoteTimer = 1.6
      if (this.events.length < 8) this.events.push('cheered')
    }
    this.cheerTimer -= dt
    if (this.cheerTimer <= 0) {
      this.cheerTarget = null
      this.state = 'idle'
      this.pauseTimer = 2 + this.rng() * 3
    }
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
      this.watchArrived = false
      return
    }
    // 도착 — 뒤돌아서(화면 쪽을 보며) 구경
    this.watchArrived = true
    this.watchTimer -= dt
    if (this.watchTimer <= 0) {
      this.watchTarget = null
      this.watchArrived = false
      this.state = 'idle'
      this.pauseTimer = 1 + this.rng() * 3
    }
  }
}
