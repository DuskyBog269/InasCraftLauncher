import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import type { PlayerProfile } from '../../shared/types'
import { PACK_CONFIG } from '../../shared/constants'

export type GameEventCallback = (event: 'start' | 'exit' | 'crash', data?: unknown) => void

/** Log de saída do processo do jogo */
let gameLogPath = ''

/** Processo do jogo */
let gameProcess: ChildProcess | null = null

/**
 * Iniciar o Minecraft com o perfil offline fornecido.
 * Constrói o comando Java manualmente para garantir que os argumentos JVM do Forge sejam passados corretamente.
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

  const versionString = getForgeVersionString()
  const versionJsonPath = join(installDir, 'versions', versionString, `${versionString}.json`)

  if (!existsSync(versionJsonPath)) {
    throw new Error(`Version JSON não encontrado: ${versionJsonPath}`)
  }

  const versionData = JSON.parse(readFileSync(versionJsonPath, 'utf8'))
  const mainClass = versionData.mainClass || 'net.minecraft.client.main.Main'

  // Ler o assetIndex do vanilla JSON (o Forge não tem assetIndex próprio)
  const vanillaJsonPath = join(installDir, 'versions', PACK_CONFIG.MINECRAFT_VERSION, `${PACK_CONFIG.MINECRAFT_VERSION}.json`)
  const vanillaData = existsSync(vanillaJsonPath)
    ? JSON.parse(readFileSync(vanillaJsonPath, 'utf8'))
    : null
  const assetIndexId = vanillaData?.assetIndex?.id || PACK_CONFIG.MINECRAFT_VERSION

  // Construir argumentos JVM do version.json
  const jvmArgs = buildJvmArgs(versionData, installDir, ramMb)

  console.log('[Game] JVM args count:', jvmArgs.length)

  // Construir argumentos do jogo
  const gameArgs = buildGameArgs(versionData, profile, versionString, installDir, assetIndexId)

  // Construir classpath
  const classpath = buildClasspath(versionData, installDir)

  // Montar comando Java
  const javaArgs = [
    ...jvmArgs,
    '-cp', classpath,
    mainClass,
    ...gameArgs
  ]

  console.log('[Game] Comando completo:')
  console.log(javaPath, javaArgs.join(' '))

  console.log('[Game] Executando Java:', javaPath)
  console.log('[Game] Args:', javaArgs.join(' '))

  return new Promise((resolve, reject) => {
    try {
      // Criar logger de eventos
      const logEvent = (data: Buffer) => {
        const line = data.toString().trim()
        if (line) {
          logToFile(line)
          onLog(line)
        }
      }

      // Iniciar processo
      gameProcess = spawn(javaPath, javaArgs, {
        cwd: installDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let resolved = false

      const doResolve = () => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      }

      // Capturar saída
      gameProcess.stdout?.on('data', logEvent)
      gameProcess.stderr?.on('data', logEvent)

      // Processo iniciou
      gameProcess.on('spawn', () => {
        console.log('[Game] Minecraft iniciado')
        onEvent('start')
      })

      // Processo terminou
      gameProcess.on('close', (code) => {
        console.log(`[Game] Minecraft fechou com código: ${code}`)
        doResolve()
        if (code === 0 || code === null) {
          onEvent('exit')
        } else {
          const log = getLastLogLines(200)
          onEvent('crash', { code, log, logPath: gameLogPath })
        }
      })

      gameProcess.on('error', (err) => {
        console.error('[Game] Erro ao iniciar:', err)
        reject(err)
      })

    } catch (err) {
      reject(err)
    }
  })
}

/** Parar o jogo se estiver rodando */
export function stopGame(): void {
  if (gameProcess) {
    console.log('[Game] Parando processo...')
    gameProcess.kill('SIGTERM')
    gameProcess = null
  }
}

/** Construir argumentos JVM a partir do version.json */
function buildJvmArgs(versionData: any, installDir: string, ramMb: number): string[] {
  const args: string[] = []

  // Memoria
  args.push(`-Xmx${ramMb}M`)
  args.push(`-Xms512M`)

  // Extrair argumentos JVM do version.json
  const jvmArgList = versionData.arguments?.jvm || []

  const libDir = join(installDir, 'libraries')
  const nativesDir = join(installDir, 'natives')

  for (const arg of jvmArgList) {
    if (typeof arg === 'string') {
      let expanded = arg
        .replace(/\$\{library_directory\}/g, libDir)
        .replace(/\$\{natives_directory\}/g, nativesDir)
        .replace(/\$\{version_name\}/g, getForgeVersionString())

      // Substituir classpath_separator (ponto e vírgula no Windows)
      expanded = expanded.replace(/\$\{classpath_separator\}/g, ';')

      args.push(expanded)
    } else if (typeof arg === 'object' && arg.rules) {
      // Argumento com regras (por OS)
      // Simplificado: aceitar todos
      if (arg.value) {
        const values = Array.isArray(arg.value) ? arg.value : [arg.value]
        for (const v of values) {
          let expanded = v
            .replace(/\$\{library_directory\}/g, libDir)
            .replace(/\$\{natives_directory\}/g, nativesDir)
            .replace(/\$\{version_name\}/g, getForgeVersionString())
            .replace(/\$\{classpath_separator\}/g, ';')
          args.push(expanded)
        }
      }
    }
  }

  // Adicionar argumentos extras se ainda não estiverem presentes
  const hasAddOpens = args.some(a => a.includes('java.base/java.lang.invoke=ALL-UNNAMED'))
  if (!hasAddOpens) {
    args.push('--add-opens=java.base/java.lang.invoke=ALL-UNNAMED')
    args.push('--add-opens=java.base/java.lang=ALL-UNNAMED')
    args.push('--add-opens=java.base/java.io=ALL-UNNAMED')
    args.push('--add-opens=java.base/java.nio=ALL-UNNAMED')
    args.push('--add-opens=java.base/sun.nio.ch=ALL-UNNAMED')
    args.push('--add-opens=java.base/sun.security.util=ALL-UNNAMED')
  }

  return args
}

/** Construir argumentos do jogo */
function buildGameArgs(versionData: any, profile: PlayerProfile, versionString: string, installDir: string, assetIndexId: string): string[] {
  const args: string[] = []

  // Argumentos padrão do Minecraft
  const gameArgList = versionData.arguments?.game || []

  for (const arg of gameArgList) {
    if (typeof arg === 'string') {
      args.push(arg)
    } else if (typeof arg === 'object' && arg.value) {
      const values = Array.isArray(arg.value) ? arg.value : [arg.value]
      args.push(...values)
    }
  }

  // Adicionar argumentos de autenticação offline
  args.push('--username', profile.nick)
  args.push('--uuid', profile.uuid)
  args.push('--accessToken', 'offline')
  args.push('--clientId', 'offline')
  args.push('--xuid', '') // Xbox Live - vazio para offline
  args.push('--userType', 'mojang')

  // Tipo de lançamento e versão
  args.push('--version', versionString)
  args.push('--gameDir', installDir)
  args.push('--assetsDir', join(installDir, 'assets'))
  args.push('--assetIndex', assetIndexId)

  // Launch mode
  args.push('--width', '854')
  args.push('--height', '480')
  args.push('--fullscreen', 'false')

  return args
}

/** Construir classpath completo para o BootstrapLauncher */
function buildClasspath(versionData: any, installDir: string): string {
  const classpath: string[] = []
  const libDir = join(installDir, 'libraries')
  const versionDir = join(installDir, 'versions')

  // Verificar se é Forge moderno (usa BootstrapLauncher)
  const isModernForge = versionData.mainClass === 'cpw.mods.bootstraplauncher.BootstrapLauncher'

  // Primeiro, adicionar libraries do vanilla (que o Forge herda)
  const vanillaVersionPath = join(versionDir, PACK_CONFIG.MINECRAFT_VERSION, `${PACK_CONFIG.MINECRAFT_VERSION}.json`)
  if (existsSync(vanillaVersionPath)) {
    const vanillaData = JSON.parse(readFileSync(vanillaVersionPath, 'utf8'))
    for (const lib of vanillaData.libraries || []) {
      const artifact = lib.downloads?.artifact
      if (artifact?.path) {
        const jarPath = join(libDir, artifact.path)
        if (existsSync(jarPath) && !classpath.includes(jarPath)) {
          classpath.push(jarPath)
        }
      }
    }
  }

  // Adicionar libraries do Forge (version.json atual)
  for (const lib of versionData.libraries || []) {
    const artifact = lib.downloads?.artifact
    if (artifact?.path) {
      const jarPath = join(libDir, artifact.path)
      if (existsSync(jarPath) && !classpath.includes(jarPath)) {
        classpath.push(jarPath)
      }
    }
  }

  // NO FORGE MODERNO: não adicionar o client.jar vanilla, pois o Forge já carrega
  // o Minecraft pelos jars patched (client-srg, client-extra, forge-client)
  // Adicionar client.jar SÓ para versões antigas do Forge ou Minecraft vanilla
  if (!isModernForge) {
    const clientJar = join(versionDir, PACK_CONFIG.MINECRAFT_VERSION, `${PACK_CONFIG.MINECRAFT_VERSION}.jar`)
    if (existsSync(clientJar)) {
      classpath.push(clientJar)
    }
  }

  console.log('[Game] Classpath entries:', classpath.length)
  console.log('[Game] Is modern forge:', isModernForge)

  // Separador de classpath (ponto e vírgula no Windows)
  return classpath.join(';')
}

/** String de versão usada no launch (versão customizada Forge) */
function getForgeVersionString(): string {
  return `${PACK_CONFIG.MINECRAFT_VERSION}-forge-${PACK_CONFIG.MODLOADER_VERSION}`
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