import { describe, it, expect } from 'vitest'
// @ts-expect-error — 서버 모듈은 순수 JS(mjs)
import { Rooms } from '../server/rooms.mjs'
import { PeerStore } from '../src/net/peers'

describe('룸 관리 (relay 서버)', () => {
  it('방을 만들면 6자리 코드가 나오고 생성자가 입장해 있다', () => {
    const rooms = new Rooms(4, () => 0.5)
    const code = rooms.create('a')
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/)
    expect(rooms.codeOf('a')).toBe(code)
    expect(rooms.peersOf('a')).toEqual([])
  })

  it('코드로 참여하면 기존 참여자 목록을 받고, 서로 피어가 된다', () => {
    const rooms = new Rooms(4)
    const code = rooms.create('a')
    const res = rooms.join(code, 'b')
    expect(res).toEqual({ ok: true, peers: ['a'] })
    expect(rooms.peersOf('a')).toEqual(['b'])
  })

  it('없는 방, 가득 찬 방(4명), 중복 참여를 거절한다', () => {
    const rooms = new Rooms(4)
    expect(rooms.join('XXXXXX', 'z')).toEqual({ error: 'no-room' })
    const code = rooms.create('a')
    rooms.join(code, 'b')
    rooms.join(code, 'c')
    rooms.join(code, 'd')
    expect(rooms.join(code, 'e')).toEqual({ error: 'room-full' })
    expect(rooms.join(code, 'b')).toEqual({ error: 'already-in' })
  })

  it('나가면 남은 사람 목록을 알려주고, 빈 방은 유예 후에만 사라진다 (재접속 지원)', () => {
    let now = 1000
    const rooms = new Rooms(4, Math.random, 120000, () => now)
    const code = rooms.create('a')
    rooms.join(code, 'b')
    expect(rooms.leave('a')).toEqual({ code, remaining: ['b'] })
    expect(rooms.leave('b')).toEqual({ code, remaining: [] })
    // 유예 시간 안에는 같은 코드로 재접속 가능 (순간 끊김 복구)
    expect(rooms.join(code, 'a')).toEqual({ ok: true, peers: [] })
    rooms.leave('a')
    // 유예 시간이 지나고 sweep 되면 방 소멸
    now += 120001
    expect(rooms.sweep()).toEqual([code])
    expect(rooms.join(code, 'c')).toEqual({ error: 'no-room' })
  })

  it('sweep은 사람이 있는 방을 지우지 않는다', () => {
    let now = 0
    const rooms = new Rooms(4, Math.random, 100, () => now)
    const code = rooms.create('a')
    now += 10000
    expect(rooms.sweep()).toEqual([])
    expect(rooms.codeOf('a')).toBe(code)
  })

  it('다른 방에 참여하면 이전 방에서 자동으로 나간다', () => {
    const rooms = new Rooms(4)
    const code1 = rooms.create('a')
    rooms.join(code1, 'b')
    const code2 = rooms.create('c')
    rooms.join(code2, 'b')
    expect(rooms.peersOf('a')).toEqual([]) // b는 첫 방에서 나감
    expect(rooms.codeOf('b')).toBe(code2)
  })
})

describe('원격 캐릭터 보간 (PeerStore)', () => {
  const info = (id: string) => ({ id, name: `p${id}`, look: null, state: null })

  it('첫 상태 수신 시 화면 크기 기준 좌표로 스냅한다', () => {
    const store = new PeerStore()
    store.upsert(info('1'))
    store.updateState('1', { nx: 0.5, ny: 0.5, pose: 'idle', facing: 1 })
    store.tick(1 / 60, 2000, 1000)
    const peer = store.peers.get('1')!
    expect(peer.x).toBe(1000)
    expect(peer.y).toBe(500)
  })

  it('이후 상태는 목표를 향해 부드럽게 보간한다 (순간이동 없음)', () => {
    const store = new PeerStore()
    store.upsert(info('1'))
    store.updateState('1', { nx: 0, ny: 0.5, pose: 'walk', facing: 1 })
    store.tick(1 / 60, 1000, 1000)
    store.updateState('1', { nx: 1, ny: 0.5, pose: 'walk', facing: 1 })
    store.tick(1 / 60, 1000, 1000)
    const peer = store.peers.get('1')!
    expect(peer.x).toBeGreaterThan(0)
    expect(peer.x).toBeLessThan(1000) // 한 프레임에 도달하지 않음
    // 충분한 시간이 지나면 수렴
    for (let i = 0; i < 300; i++) store.tick(1 / 60, 1000, 1000)
    expect(peer.x).toBeCloseTo(1000, 0)
  })

  it('해상도가 달라도 정규화 좌표로 같은 상대 위치가 된다', () => {
    const a = new PeerStore()
    const b = new PeerStore()
    for (const store of [a, b]) {
      store.upsert(info('1'))
      store.updateState('1', { nx: 0.25, ny: 0.8, pose: 'idle', facing: -1 })
    }
    a.tick(1 / 60, 1920, 1080)
    b.tick(1 / 60, 2560, 1440)
    expect(a.peers.get('1')!.x / 1920).toBeCloseTo(0.25)
    expect(b.peers.get('1')!.x / 2560).toBeCloseTo(0.25)
  })

  it('near는 반경 안의 피어를 찾는다 (근접 인사/클릭 판정)', () => {
    const store = new PeerStore()
    store.upsert(info('1'))
    store.updateState('1', { nx: 0.5, ny: 0.5, pose: 'idle', facing: 1 })
    store.tick(1 / 60, 1000, 1000)
    expect(store.near(510, 510, 30)).not.toBeNull()
    expect(store.near(700, 700, 30)).toBeNull()
  })

  it('방(집)에 들어간 피어는 near 판정에서 빠진다 (바탕화면에 없음)', () => {
    const store = new PeerStore()
    store.upsert(info('1'))
    store.updateState('1', { nx: 0.5, ny: 0.5, pose: 'sit', facing: 1, inRoom: true })
    store.tick(1 / 60, 1000, 1000)
    expect(store.peers.get('1')!.inRoom).toBe(true)
    expect(store.near(500, 500, 50)).toBeNull() // 자리에 있어도 집에 있으면 제외
    store.updateState('1', { nx: 0.5, ny: 0.5, pose: 'idle', facing: 1, inRoom: false })
    expect(store.near(500, 500, 50)).not.toBeNull() // 나오면 다시 보인다
  })

  it('상태 메시지/프레즌스는 참여 시 초기값을 받고 이후 갱신된다 (SNS)', () => {
    const store = new PeerStore()
    store.upsert({ ...info('1'), status: '회의 중', presence: 'focus' })
    expect(store.peers.get('1')!.status).toBe('회의 중')
    expect(store.peers.get('1')!.presence).toBe('focus')
    store.setStatus('1', '점심')
    store.setPresence('1', 'away')
    expect(store.peers.get('1')!.status).toBe('점심')
    expect(store.peers.get('1')!.presence).toBe('away')
    // 정보가 없는 구버전 피어는 기본값
    store.upsert(info('2'))
    expect(store.peers.get('2')!.status).toBe('')
    expect(store.peers.get('2')!.presence).toBe('online')
  })
})
