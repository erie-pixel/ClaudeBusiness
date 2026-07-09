// macOS 전면 창 감시 — Windows(fullscreen-win.ts)와 같은 역할, 같은 CSV 프로토콜.
// 상주 헬퍼(native/mac-watcher.swift, CI에서 컴파일해 앱에 내장)를 실행해 폴링한다.
// 권한 요청 없음: 창 "위치"만 읽고(화면 기록 권한 불필요), 유휴시간은 화면보호기가
// 쓰는 시스템 카운터를 읽을 뿐이라(손쉬운 사용 권한 불필요) 별도 승인 절차가 없다.
//
// 전체화면 자동 숨김은 두 메커니즘이 함께 동작:
//  1) main.ts의 setVisibleOnAllWorkspaces({visibleOnFullScreen:false}) — macOS
//     네이티브 전체화면(Spaces)으로 전환되면 OS가 즉시 처리, 폴링 불필요
//  2) 이 워처의 fullscreen 플래그 — 유튜브를 그냥 "창 최대화"만 한 경우처럼
//     Spaces 전환 없이 화면을 덮는 경우까지 잡아준다 (Windows와 동일 기준)
//
// 헬퍼가 없거나 죽으면(구버전 앱, 컴파일 실패 등) 감지 기능만 조용히 사라지고
// 앱은 계속 정상 동작한다 — Windows 워처와 같은 성격의 안전망.

import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { ForegroundInfo } from './watcher-types'

let child: ChildProcess | null = null

function binaryPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'mac-watcher')
    : path.join(app.getAppPath(), 'build', 'mac-watcher')
}

export function startFullscreenWatcher(onChange: (info: ForegroundInfo) => void) {
  if (process.platform !== 'darwin') return

  const bin = binaryPath()
  if (!fs.existsSync(bin)) return // 개발 모드에서 헬퍼를 직접 컴파일하지 않았다면 조용히 생략

  child = spawn(bin, [], { stdio: ['ignore', 'pipe', 'ignore'] })

  let buf = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      const parts = line.split(',').map(Number)
      if (parts.length !== 7 || parts.some(Number.isNaN)) continue
      const [fsFlag, left, top, right, bottom, typing, idleSec] = parts
      const hasRect = right > left && bottom > top
      onChange({
        fullscreen: fsFlag === 1,
        rect: hasRect ? { left, top, right, bottom } : null,
        typing: typing === 1,
        idleSec,
      })
    }
  })

  const degrade = () => onChange({ fullscreen: false, rect: null, typing: false, idleSec: 0 })
  child.on('error', degrade)
  child.on('exit', degrade)
}

export function stopFullscreenWatcher() {
  child?.kill()
  child = null
}
