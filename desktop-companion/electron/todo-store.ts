// 할일 목록 저장소 — userData/todos.json (album-store와 같은 얇은 파일 계층).
// 내용 검증은 렌더러가 담당하고 여기서는 읽고 쓰기만 한다.

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

const todosPath = () => path.join(app.getPath('userData'), 'todos.json')

export function loadTodos(): unknown {
  try {
    return JSON.parse(fs.readFileSync(todosPath(), 'utf8'))
  } catch {
    return null
  }
}

export function saveTodos(data: unknown) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(todosPath(), JSON.stringify(data))
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}
