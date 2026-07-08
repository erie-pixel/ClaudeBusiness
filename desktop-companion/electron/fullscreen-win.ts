// Windows 전면(foreground) 창 감시 — 두 가지 용도:
//  1) 전면 창이 모니터 전체를 덮으면(전체화면 앱) 캐릭터를 숨긴다
//  2) 활성 창 위치/크기를 렌더러에 알려 "창 쳐다보기" 행동을 발동시킨다
// 네이티브 모듈 대신 상주 PowerShell 프로세스 하나로 Win32 API를 폴링한다
// (설치 리스크 0, CPU ~0%). macOS는 setVisibleOnAllWorkspaces의
// visibleOnFullScreen: false가 스페이스 차원에서 처리하므로 불필요.
//
// 제외 규칙:
//  - Progman / WorkerW: 바탕화면 자체가 전면일 때 (항상 화면 전체 크기)
//  - 우리 자신의 프로세스: 캐릭터 클릭으로 오버레이가 전면이 된 경우
//
// 출력 프로토콜: 매 폴마다 한 줄 CSV → "fs,left,top,right,bottom,typing,idleSec"
//   fs: 1=전체화면, 0=아님. 좌표는 전면 창 rect (제외 대상이면 0,0,0,0)
//   typing: 직전 폴 이후 키보드 입력이 있었나 (어떤 키인지는 수집하지 않음 — boolean만)
//   idleSec: 마지막 입력(키/마우스) 이후 경과 초 (GetLastInputInfo)

import { spawn, type ChildProcess } from 'node:child_process'

export interface ForegroundInfo {
  fullscreen: boolean
  rect: { left: number; top: number; right: number; bottom: number } | null
  typing: boolean
  idleSec: number
}

let child: ChildProcess | null = null

const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FSNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO li);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  // 어떤 키가 눌렸는지는 보지 않는다 — "직전 폴 이후 타이핑이 있었나"의 boolean만 집계
  public static bool TypedSinceLastPoll() {
    bool t = false;
    for (int vk = 0x30; vk <= 0x5A; vk++) { if ((GetAsyncKeyState(vk) & 1) != 0) t = true; }
    int[] extra = { 0x20, 0x0D, 0x08, 0xBC, 0xBE, 0xBA, 0xDE };
    foreach (int vk in extra) { if ((GetAsyncKeyState(vk) & 1) != 0) t = true; }
    return t;
  }
  public static uint IdleSeconds() {
    LASTINPUTINFO li = new LASTINPUTINFO();
    li.cbSize = (uint)Marshal.SizeOf(li);
    if (!GetLastInputInfo(ref li)) return 0;
    return (uint)((Environment.TickCount - (int)li.dwTime) / 1000);
  }
}
'@
while ($true) {
  $line = '0,0,0,0,0'
  $h = [FSNative]::GetForegroundWindow()
  if ($h -ne [IntPtr]::Zero) {
    $r = New-Object FSNative+RECT
    [void][FSNative]::GetWindowRect($h, [ref]$r)
    $sb = New-Object System.Text.StringBuilder 256
    [void][FSNative]::GetClassName($h, $sb, 256)
    $cls = $sb.ToString()
    $wpid = [uint32]0
    [void][FSNative]::GetWindowThreadProcessId($h, [ref]$wpid)
    if ($cls -ne 'Progman' -and $cls -ne 'WorkerW' -and $wpid -ne OUR_PID) {
      $scr = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
      $fs = '0'
      if ($r.L -le $scr.Left -and $r.T -le $scr.Top -and $r.R -ge $scr.Right -and $r.B -ge $scr.Bottom) {
        $fs = '1'
      }
      $line = $fs + ',' + $r.L + ',' + $r.T + ',' + $r.R + ',' + $r.B
    }
  }
  $typing = if ([FSNative]::TypedSinceLastPoll()) { '1' } else { '0' }
  $line = $line + ',' + $typing + ',' + [FSNative]::IdleSeconds()
  [Console]::Out.WriteLine($line); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 700
}
`.replace('OUR_PID', String(process.pid))

export function startFullscreenWatcher(onChange: (info: ForegroundInfo) => void) {
  if (process.platform !== 'win32') return

  child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
  )

  let buf = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      const parts = line.split(',').map(Number)
      if (parts.length !== 7 || parts.some(Number.isNaN)) continue
      const [fs, left, top, right, bottom, typing, idleSec] = parts
      const hasRect = right > left && bottom > top
      onChange({
        fullscreen: fs === 1,
        rect: hasRect ? { left, top, right, bottom } : null,
        typing: typing === 1,
        idleSec,
      })
    }
  })

  // 워처가 죽어도 앱은 계속 동작 (감지 기능만 우아하게 상실)
  const degrade = () => onChange({ fullscreen: false, rect: null, typing: false, idleSec: 0 })
  child.on('error', degrade)
  child.on('exit', degrade)
}

export function stopFullscreenWatcher() {
  child?.kill()
  child = null
}
