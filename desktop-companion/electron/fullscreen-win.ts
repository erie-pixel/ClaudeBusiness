// Windows 전체화면 앱 감지 — 전면(foreground) 창이 모니터 전체를 덮으면 캐릭터를 숨긴다.
// 네이티브 모듈 대신 상주 PowerShell 프로세스 하나로 Win32 API를 폴링한다
// (설치 리스크 0, CPU ~0%). macOS는 setVisibleOnAllWorkspaces의
// visibleOnFullScreen: false가 스페이스 차원에서 처리하므로 불필요.
//
// 제외 규칙:
//  - Progman / WorkerW: 바탕화면 자체가 전면일 때 (항상 화면 전체 크기)
//  - 우리 자신의 프로세스: 캐릭터 클릭으로 오버레이가 전면이 된 경우

import { spawn, type ChildProcess } from 'node:child_process'

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
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
'@
$prev = ''
while ($true) {
  $isFs = $false
  $h = [FSNative]::GetForegroundWindow()
  if ($h -ne [IntPtr]::Zero) {
    $r = New-Object FSNative+RECT
    [void][FSNative]::GetWindowRect($h, [ref]$r)
    $sb = New-Object System.Text.StringBuilder 256
    [void][FSNative]::GetClassName($h, $sb, 256)
    $cls = $sb.ToString()
    $wpid = [uint32]0
    [void][FSNative]::GetWindowThreadProcessId($h, [ref]$wpid)
    $scr = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
    if ($cls -ne 'Progman' -and $cls -ne 'WorkerW' -and $wpid -ne OUR_PID) {
      if ($r.L -le $scr.Left -and $r.T -le $scr.Top -and $r.R -ge $scr.Right -and $r.B -ge $scr.Bottom) {
        $isFs = $true
      }
    }
  }
  $msg = if ($isFs) { '1' } else { '0' }
  if ($msg -ne $prev) { [Console]::Out.WriteLine($msg); [Console]::Out.Flush(); $prev = $msg }
  Start-Sleep -Milliseconds 700
}
`.replace('OUR_PID', String(process.pid))

export function startFullscreenWatcher(onChange: (fullscreen: boolean) => void) {
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
      if (line === '1') onChange(true)
      else if (line === '0') onChange(false)
    }
  })

  // 워처가 죽어도 앱은 계속 동작 (감지 기능만 우아하게 상실)
  child.on('error', () => onChange(false))
  child.on('exit', () => onChange(false))
}

export function stopFullscreenWatcher() {
  child?.kill()
  child = null
}
