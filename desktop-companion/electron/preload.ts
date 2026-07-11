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
  hourlyChime: boolean
  onboarded: boolean
}

export interface CompanionBridge {
  onCursor(cb: (pos: { x: number; y: number }) => void): void
  onActiveWindow(cb: (rect: { x: number; y: number; w: number; h: number }) => void): void
  onUserInput(cb: (input: { typing: boolean; idleSec: number }) => void): void
  onSettings(cb: (s: RendererSettings) => void): void
  onAlbum(cb: (data: unknown) => void): void
  onTodos(cb: (data: unknown) => void): void
  onOpenChat(cb: () => void): void
  setInteractive(interactive: boolean): void
  setPollRate(active: boolean): void
  saveSofa(sofa: SofaState): void
  saveLook(look: LookState): void
  saveAlbum(data: unknown): void
  saveTodos(data: unknown): void
  saveOnboarded(): void
  saveMp(mp: { playerName: string; serverUrl: string }): void
  ensureRelay(): Promise<{ ok: boolean; port?: number; ips?: string[]; error?: string }>
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
  onAlbum: (cb) => {
    ipcRenderer.on('album', (_e, data) => cb(data))
  },
  onTodos: (cb) => {
    ipcRenderer.on('todos', (_e, data) => cb(data))
  },
  onOpenChat: (cb) => {
    ipcRenderer.on('open-chat', () => cb())
  },
  saveSofa: (sofa) => ipcRenderer.send('save-sofa', sofa),
  saveLook: (look) => ipcRenderer.send('save-look', look),
  saveAlbum: (data) => ipcRenderer.send('save-album', data),
  saveTodos: (data) => ipcRenderer.send('save-todos', data),
  saveOnboarded: () => ipcRenderer.send('save-onboarded'),
  saveMp: (mp) => ipcRenderer.send('save-mp', mp),
  ensureRelay: () => ipcRenderer.invoke('ensure-relay'),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  setPollRate: (active) => ipcRenderer.send('set-poll-rate', active),
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
}

contextBridge.exposeInMainWorld('companion', bridge)
