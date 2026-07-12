// 엣지패널 방 저장소 — userData/room.json (album/todo store와 같은 얇은 파일 계층).
// 방 위치(좌/우, 세로 오프셋), 링크 보드, 캐릭터 재실(在室) 여부를 저장한다.

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

const roomPath = () => path.join(app.getPath('userData'), 'room.json')

export function loadRoom(): unknown {
  try {
    return JSON.parse(fs.readFileSync(roomPath(), 'utf8'))
  } catch {
    return null
  }
}

export function saveRoom(data: unknown) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(roomPath(), JSON.stringify(data))
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}
