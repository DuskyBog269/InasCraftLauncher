import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { Client as MinecraftClient } from 'minecraft-launcher-core'
import type { PlayerProfile } from '../../shared/types'
import { PACK_CONFIG } from '../../shared/constants'

export type GameEventCallback = (event: 'start' | 'exit' | 'crash', data?: unknown) => void

/** Log de saída do processo do jogo */
let gameLogPath = ''

/**
 * Iniciar o Minecraft com o perfil offline fornecido.
 * Emite callbacks para eventos de start, exit e crash.
 */
export async function launchGame(
  installDir: string,
  javaPath: string,
  profile: PlayerProfile,
  ramMb: number,
  onEvent: GameEventCallback,
  onLog: (line: string) => void
): Promise<void> {
  const logsDir = join(installDir, 'launcher-logs')
  mkdirSync(logsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  gameLogPath = join(logsDir, `game-${timestamp}.log`)

  // Construir a string de versão do NeoForge
  const versionString = getNeoForgeVersionString()

  const launcher = new MinecraftClient()

  const options = {
    clientPackage: undefined,
    // Autenticação offline — nick e UUID do perfil salvo
    authorization: {
      access_token: 'offline',
      client_token: 'offline',
      uuid: profile.uuid,
      name: profile.nick,
      meta: {
        type: 'offline' as const,
        demo: false
      }
    },
    root: installDir,
    version: {
      number: PACK_CONFIG.MINECRAFT_VERSION,
      type: 'release',
      custom: versionString
    },
    memory: {
      max: `${ramMb}M`,
      min: '512M'
    },
    javaPath: javaPath,
    // Argumentos JVM adicionais para performance
    customLaunchArgs: [
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+UseG1GC',
      '-XX:G1NewSizePercent=20',
      '-XX:G1ReservePercent=20',
      '-XX:MaxGCPauseMillis=50',
      '-XX:G1HeapRegionSize=32M'
    ]
  }

  return new Promise((resolve, reject) => {
    // Log de dados do jogo
    launcher.on('data', (data: string) => {
      const line = data.toString().trim()
      if (line) {
        logToFile(line)
        onLog(line)
      }
    })

    // Progresso de download de assets durante o launch
    launcher.on('download', () => { /* assets já instalados */ })

    // Jogo iniciado com sucesso
    launcher.on('start', () => {
      console.log('[Game] Minecraft iniciado')
      onEvent('start')
    })

    // Jogo fechado
    launcher.on('close', (code: number) => {
      console.log(`[Game] Minecraft fechou com código: ${code}`)
      if (code === 0 || code === null) {
        onEvent('exit')
        resolve()
      } else {
        const log = getLastLogLines(200)
        onEvent('crash', { code, log, logPath: gameLogPath })
        // Resolver mesmo em crash — o erro é tratado pelo caller via callback
        resolve()
      }
    })

    launcher.on('error', (err: Error) => {
      console.error('[Game] Erro ao iniciar:', err)
      reject(err)
    })

    launcher.launch(options).catch(reject)
  })
}

/** String de versão usada no launch (versão customizada NeoForge) */
function getNeoForgeVersionString(): string {
  return `${PACK_CONFIG.MINECRAFT_VERSION}-neoforge-${PACK_CONFIG.MODLOADER_VERSION}`
}

/** Escrever linha no arquivo de log */
function logToFile(line: string): void {
  if (!gameLogPath) return
  try {
    appendFileSync(gameLogPath, line + '\n')
  } catch { /* ignorar erro de I/O no log */ }
}

/** Ler as últimas N linhas do log atual */
function getLastLogLines(n: number): string {
  if (!gameLogPath || !existsSync(gameLogPath)) return ''
  try {
    const content = readFileSync(gameLogPath, 'utf8')
    const lines = content.split('\n')
    return lines.slice(Math.max(0, lines.length - n)).join('\n')
  } catch {
    return ''
  }
}
