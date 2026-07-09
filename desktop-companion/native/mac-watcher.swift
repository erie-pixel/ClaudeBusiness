// macOS 화면 워처 — Windows의 PowerShell 워처(electron/fullscreen-win.ts)와 같은 역할,
// 같은 출력 프로토콜을 쓴다: 매 폴마다 "fs,left,top,right,bottom,typing,idleSec"
//   fs: 1=활성 창이 화면 전체를 덮음(전체화면/최대화), 0=아님
//   좌표: CoreGraphics 전역 좌표(좌상단 원점) — Electron의 screen 모듈과 동일한 규약
//   typing: 직전 폴(0.7s) 사이 키 입력이 있었나 (어떤 키인지는 절대 읽지 않음)
//   idleSec: 마지막 키/마우스 입력 이후 경과 초
//
// 권한 요청 없음이 설계 원칙:
//  - CGWindowListCopyWindowInfo는 창 "위치"만 읽는다. 창 제목(kCGWindowName)을
//    요청하지 않으므로 화면 기록(Screen Recording) 권한이 필요 없다.
//  - CGEventSource의 유휴시간 API는 화면보호기가 쓰는 것과 동일한 시스템 카운터를
//    읽을 뿐이라 손쉬운 사용(Accessibility)·입력 모니터링 권한이 필요 없다.
// CI(macos-latest)에서 컴파일해 앱에 내장하므로, 사용자는 Xcode 없이도 그대로 실행된다.

import AppKit
import CoreGraphics
import Foundation

let ourPID = ProcessInfo.processInfo.processIdentifier

/// 이 지점을 포함하는 디스플레이의 전역 좌표 프레임 (CGDisplayBounds — 좌상단 원점,
/// NSScreen.frame과 달리 창 좌표계와 같은 축을 쓴다)
func displayFrame(containing point: CGPoint) -> CGRect? {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    guard count > 0 else { return nil }
    var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &displays, &count)
    for id in displays where CGDisplayBounds(id).contains(point) {
        return CGDisplayBounds(id)
    }
    return displays.first.map { CGDisplayBounds($0) }
}

struct WindowInfo {
    let left: Int
    let top: Int
    let right: Int
    let bottom: Int
    let isFullscreen: Bool
}

/// 프론트 앱이 소유한 레이어 0(일반 창) 중 첫 번째 — 통상 그 앱의 활성 창
func frontmostWindow() -> WindowInfo? {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return nil }
    if frontApp.processIdentifier == ourPID { return nil }

    guard let list = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID)
        as? [[String: AnyObject]]
    else { return nil }

    for info in list {
        guard let ownerPID = info[kCGWindowOwnerPID as String] as? NSNumber,
            ownerPID.int32Value == frontApp.processIdentifier,
            let layer = info[kCGWindowLayer as String] as? NSNumber,
            layer.intValue == 0,
            let boundsDict = info[kCGWindowBounds as String] as? NSDictionary
        else { continue }

        var rect = CGRect.zero
        guard CGRectMakeWithDictionaryRepresentation(boundsDict, &rect) else { continue }

        let left = Int(rect.origin.x)
        let top = Int(rect.origin.y)
        let right = Int(rect.origin.x + rect.size.width)
        let bottom = Int(rect.origin.y + rect.size.height)

        var isFullscreen = false
        if let screen = displayFrame(containing: rect.origin) {
            let sx = Int(screen.origin.x), sy = Int(screen.origin.y)
            let sw = Int(screen.origin.x + screen.size.width)
            let sh = Int(screen.origin.y + screen.size.height)
            isFullscreen = left <= sx && top <= sy && right >= sw && bottom >= sh
        }
        return WindowInfo(left: left, top: top, right: right, bottom: bottom, isFullscreen: isFullscreen)
    }
    return nil
}

while true {
    var line = "0,0,0,0,0"
    if let w = frontmostWindow() {
        line = "\(w.isFullscreen ? 1 : 0),\(w.left),\(w.top),\(w.right),\(w.bottom)"
    }

    let idleSeconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .null)
    let sinceKeyDown = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
    let typed = sinceKeyDown < 0.7 // 폴 간격 안에 키 입력이 있었는지만 — 어떤 키인지는 모름

    print("\(line),\(typed ? 1 : 0),\(Int(idleSeconds))")
    fflush(stdout)
    Thread.sleep(forTimeInterval: 0.7)
}
