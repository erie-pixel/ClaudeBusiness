// 파츠 팩 모드 로더 — 기획서 §8. userData/mods/<팩 폴더>/manifest.json 을 스캔해
// 렌더러로 보낸다. 검증(린트)은 렌더러의 순수 로직(src/engine/parts.ts validatePack)이
// 담당하고, 여기서는 파일을 읽고 변경을 감시(핫리로드)만 한다.
//
// 모드는 데이터(JSON)만 허용 — 코드 실행 없음 (보안 표면 원천 차단, 기획서 §9.3).

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const modsDir = () => path.join(app.getPath('userData'), 'mods')

/** mods/ 아래 모든 팩 폴더의 manifest.json을 읽어 원본 그대로 반환 (검증 전) */
export function scanModPacks(): unknown[] {
  const dir = modsDir()
  try {
    fs.mkdirSync(dir, { recursive: true }) // 폴더가 보여야 사용자가 모드를 넣을 수 있다
  } catch {
    return []
  }
  const packs: unknown[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = fs.readFileSync(path.join(dir, entry.name, 'manifest.json'), 'utf8')
      packs.push(JSON.parse(raw))
    } catch {
      // manifest가 없거나 JSON이 깨짐 — 이 팩만 조용히 건너뜀
    }
  }
  return packs
}

/** mods/ 변경 감시 — 팩을 넣거나 manifest를 고치면 onChange 호출 (디바운스 0.5s).
 * fs.watch의 recursive 옵션은 리눅스에서 미지원이라, 최상위 + 각 팩 폴더를
 * 개별로 감시한다. 팩 폴더가 추가되면 감시 목록도 다시 만든다. */
export function watchModPacks(onChange: () => void): () => void {
  const watchers: fs.FSWatcher[] = []
  let debounce: NodeJS.Timeout | null = null
  let closed = false

  const fire = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      if (closed) return
      rebuild() // 팩 폴더가 늘었을 수 있으니 감시 목록 갱신
      onChange()
    }, 500)
  }

  const rebuild = () => {
    for (const w of watchers) w.close()
    watchers.length = 0
    const dir = modsDir()
    try {
      watchers.push(fs.watch(dir, fire))
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          try {
            watchers.push(fs.watch(path.join(dir, entry.name), fire))
          } catch {
            // 감시 실패한 폴더는 건너뜀
          }
        }
      }
    } catch {
      // mods 폴더 자체가 없으면 감시 없이 동작 (다음 스캔에서 재생성)
    }
  }

  rebuild()
  return () => {
    closed = true
    if (debounce) clearTimeout(debounce)
    for (const w of watchers) w.close()
  }
}
