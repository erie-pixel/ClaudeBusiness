export interface RelayHandle {
  port: number
  close(): void
}

export function startRelay(opts?: { port?: number }): RelayHandle
