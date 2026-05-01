import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const backendDir = resolve(rootDir, 'backend')
const bridgeDir = resolve(process.env.CATREADER_BRIDGE_DIR || resolve(rootDir, '..', 'opencli-rss-bridge'))
const goCache = process.env.GOCACHE || '/private/tmp/catreader-go-cache'

if (!existsSync(bridgeDir)) {
  console.error(`[dev] opencli-rss-bridge not found at ${bridgeDir}`)
  console.error('[dev] Set CATREADER_BRIDGE_DIR if the bridge lives somewhere else.')
  process.exit(1)
}

mkdirSync(goCache, { recursive: true })

const processes = []
let shuttingDown = false

const services = [
  {
    name: 'backend',
    command: 'go',
    args: ['run', './cmd/catreader-server'],
    cwd: backendDir,
    env: { GOCACHE: goCache },
  },
  {
    name: 'bridge',
    command: 'npm',
    args: ['start'],
    cwd: bridgeDir,
  },
  {
    name: 'frontend',
    command: 'npm',
    args: ['run', 'dev:frontend', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    cwd: rootDir,
  },
]

console.log('[dev] Starting CatReader local stack')
console.log('[dev] Frontend: http://127.0.0.1:5173')
console.log('[dev] Backend:  http://127.0.0.1:8080/health')
console.log('[dev] Bridge:   http://localhost:3847/feeds')
console.log('[dev] Press Ctrl+C to stop all services.')

for (const service of services) {
  processes.push(start(service))
}

function start(service) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => writeLines(service.name, chunk, false))
  child.stderr.on('data', chunk => writeLines(service.name, chunk, true))

  child.on('error', err => {
    console.error(`[${service.name}] failed to start: ${err.message}`)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `exit code ${code}`
    console.error(`[${service.name}] stopped with ${reason}; stopping the rest of the stack.`)
    shutdown(code || 1)
  })

  return child
}

function writeLines(name, chunk, stderr) {
  const stream = stderr ? process.stderr : process.stdout
  const lines = chunk.toString().split(/\r?\n/)
  for (const line of lines) {
    if (line.length > 0) {
      stream.write(`[${name}] ${line}\n`)
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGINT')
    }
  }

  setTimeout(() => process.exit(code), 500)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
