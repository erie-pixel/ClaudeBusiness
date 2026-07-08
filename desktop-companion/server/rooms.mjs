// 룸 관리 — 순수 로직 (ws 비의존, vitest 대상).
// 룸 코드 공유가 곧 초대(동의)이며, 코드는 추측이 어려운 6자리로 생성한다.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 혼동 문자(I,L,O,0,1) 제외

export class Rooms {
  constructor(maxPerRoom = 4, rng = Math.random, graceMs = 120000, now = Date.now) {
    this.maxPerRoom = maxPerRoom
    this.rng = rng
    /** 빈 방을 바로 지우지 않고 이 시간 동안 보존 — 순간 끊김 후 재접속 지원 */
    this.graceMs = graceMs
    this.now = now
    /** @type {Map<string, {members: Set<string>, emptiedAt: number | null}>} */
    this.rooms = new Map()
    /** @type {Map<string, string>} client id -> code */
    this.clientRoom = new Map()
  }

  makeCode() {
    let code = ''
    for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)]
    return this.rooms.has(code) ? this.makeCode() : code
  }

  /** 방 생성 + 생성자 입장. 방 코드 반환 */
  create(clientId) {
    this.leave(clientId) // 기존 방에 있었다면 정리
    const code = this.makeCode()
    this.rooms.set(code, { members: new Set([clientId]), emptiedAt: null })
    this.clientRoom.set(clientId, code)
    return code
  }

  /** @returns {{ok: true, peers: string[]} | {error: string}} */
  join(code, clientId) {
    const room = this.rooms.get(code)
    if (!room) return { error: 'no-room' }
    if (room.members.has(clientId)) return { error: 'already-in' }
    if (room.members.size >= this.maxPerRoom) return { error: 'room-full' }
    this.leave(clientId)
    room.members.add(clientId)
    room.emptiedAt = null
    this.clientRoom.set(clientId, code)
    return { ok: true, peers: [...room.members].filter((id) => id !== clientId) }
  }

  /** @returns {{code: string, remaining: string[]} | null} */
  leave(clientId) {
    const code = this.clientRoom.get(clientId)
    if (!code) return null
    const room = this.rooms.get(code)
    room?.members.delete(clientId)
    this.clientRoom.delete(clientId)
    if (room && room.members.size === 0) room.emptiedAt = this.now()
    return { code, remaining: room ? [...room.members] : [] }
  }

  /** 유예 시간이 지난 빈 방 정리. 지운 코드 목록 반환 */
  sweep() {
    const now = this.now()
    const removed = []
    for (const [code, room] of this.rooms) {
      if (room.emptiedAt !== null && now - room.emptiedAt >= this.graceMs) {
        this.rooms.delete(code)
        removed.push(code)
      }
    }
    return removed
  }

  /** 같은 방의 다른 참여자들 */
  peersOf(clientId) {
    const code = this.clientRoom.get(clientId)
    if (!code) return []
    return [...(this.rooms.get(code)?.members ?? [])].filter((id) => id !== clientId)
  }

  codeOf(clientId) {
    return this.clientRoom.get(clientId) ?? null
  }
}
