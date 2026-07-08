// 바탕화면 키우기 — relay 서버 단독 실행 진입점 (기획서 §3.3)
// 실행: npm run server  (기본 포트 8787, PORT 환경변수로 변경)
// 앱의 "방 만들기"는 같은 relay를 앱 안에 내장해 자동으로 띄우므로,
// 이 파일은 상시 서버(VPS 등)를 따로 운영할 때만 필요하다.

import { startRelay } from './relay.mjs'

const PORT = Number(process.env.PORT ?? 8787)
startRelay({ port: PORT })
console.log(`desktop-companion relay listening on :${PORT}`)
