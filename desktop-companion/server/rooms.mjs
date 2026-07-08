// 룸 관리 — 순수 로직 (ws 비의존, vitest 대상).
// 룸 코드 공유가 곧 초대(동의)이며, 코드는 추측이 어려운 6자리로 생성한다.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 혼동 문자(I,L,O,0,1) 제외

export class Rooms {
  constructor(maxPerRoom = 4, rng = Math.random) {
    this.maxPerRoom = maxPerRoom
    this.rng = rng
    /** @type {Map<string, Set<string>>} code -> client ids */
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
    this.rooms.set(code, new Set([clientId]))
    this.clientRoom.set(clientId, code)
    return code
  }

  /** @returns {{ok: true, peers: string[]} | {error: string}} */
  join(code, clientId) {
    const room = this.rooms.get(code)
    if (!room) return { error: 'no-room' }
    if (room.has(clientId)) return { error: 'already-in' }
    if (room.size >= this.maxPerRoom) return { error: 'room-full' }
    this.leave(clientId)
    room.add(clientId)
    this.clientRoom.set(clientId, code)
    return { ok: true, peers: [...room].filter((id) => id !== clientId) }
  }

  /** @returns {{code: string, remaining: string[]} | null} */
  leave(clientId) {
    const code = this.clientRoom.get(clientId)
    if (!code) return null
    const room = this.rooms.get(code)
    room?.delete(clientId)
    this.clientRoom.delete(clientId)
    if (room && room.size === 0) this.rooms.delete(code)
    return { code, remaining: room ? [...room] : [] }
  }

  /** 같은 방의 다른 참여자들 */
  peersOf(clientId) {
    const code = this.clientRoom.get(clientId)
    if (!code) return []
    return [...(this.rooms.get(code) ?? [])].filter((id) => id !== clientId)
  }

  codeOf(clientId) {
    return this.clientRoom.get(clientId) ?? null
  }
}
