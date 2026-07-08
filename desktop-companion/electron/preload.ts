import { contextBridge, ipcRenderer } from 'electron'

export interface SofaState {
  enabled: boolean
  x: number // 정규화 0~1
  y: number
}

export interface LookState {
  skin: number
  hair: number
  top: number
  bottom: number
  hairStyle: string
  eyesStyle: string
  mouthStyle: string
  topStyle: string
}

export interface RendererSettings {
  scale: number
  activity: 'calm' | 'normal' | 'active'
  sofa: SofaState
  look: LookState
  playerName: string
  serverUrl: string
}

export interface CompanionBridge {
  onCursor(cb: (pos: { x: number; y: number }) => void): void
  onActiveWindow(cb: (rect: { x: number; y: number; w: number; h: number }) => void): void
  onUserInput(cb: (input: { typing: boolean; idleSec: number }) => void): void
  onSettings(cb: (s: RendererSettings) => void): void
  onOpenChat(cb: () => void): void
  setInteractive(interactive: boolean): void
  setPollRate(active: boolean): void
  saveSofa(sofa: SofaState): void
  saveLook(look: LookState): void
  saveMp(mp: { playerName: string; serverUrl: string }): void
  hideWindow(): void
  quitApp(): void
}

const bridge: CompanionBridge = {
  onCursor: (cb) => {
    ipcRenderer.on('cursor', (_e, pos) => cb(pos))
  },
  onActiveWindow: (cb) => {
    ipcRenderer.on('active-window', (_e, rect) => cb(rect))
  },
  onUserInput: (cb) => {
    ipcRenderer.on('user-input', (_e, input) => cb(input))
  },
  onSettings: (cb) => {
    ipcRenderer.on('settings', (_e, s) => cb(s))
  },
  onOpenChat: (cb) => {
    ipcRenderer.on('open-chat', () => cb())
  },
  saveSofa: (sofa) => ipcRenderer.send('save-sofa', sofa),
  saveLook: (look) => ipcRenderer.send('save-look', look),
  saveMp: (mp) => ipcRenderer.send('save-mp', mp),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  setPollRate: (active) => ipcRenderer.send('set-poll-rate', active),
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
}

contextBridge.exposeInMainWorld('companion', bridge)
