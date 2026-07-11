// 수집 앨범 저장소 — userData/album.json. 형식 검증/정규화는 렌더러 쪽
// 순수 로직(src/engine/collection.ts normalizeAlbum)이 담당하고, 여기서는
// 읽고 쓰기만 한다 (settings.ts와 같은 성격의 얇은 파일 계층).

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

const albumPath = () => path.join(app.getPath('userData'), 'album.json')

export function loadAlbum(): unknown {
  try {
    return JSON.parse(fs.readFileSync(albumPath(), 'utf8'))
  } catch {
    return null // 첫 실행/손상 — 렌더러가 빈 앨범으로 시작
  }
}

export function saveAlbum(data: unknown) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(albumPath(), JSON.stringify(data))
  } catch {
    // 저장 실패는 치명적이지 않음 — 다음 저장 주기에 재시도됨
  }
}
