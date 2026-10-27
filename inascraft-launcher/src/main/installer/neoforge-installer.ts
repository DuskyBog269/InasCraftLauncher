import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import https from 'https'
import { pipeline } from 'stream/promises'
import { IncomingMessage } from 'http'
import { PACK_CONFIG, DOWNLOAD_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

/** URL base do Maven NeoForge */
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'

/**
 * Baixar e executar o instalador do NeoForge no modo servidor.
 * O instalador instala as libraries e cria o profile de versão.
 */
export async function installNeoForge(
  installDir: string,
  javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  const version = PACK_CONFIG.MODLOADER_VERSION
  const installerJar = join(installDir, 'temp', `neoforge-${version}-installer.jar`)

  mkdirSync(join(installDir, 'temp'), { recursive: true })

  // URL do instalador NeoForge
  const installerUrl = `${NEOFORGE_MAVEN}/${version}/neoforge-${version}-installer.jar`

  onProgress({
    stage: 'Baixando instalador NeoForge',
    current: 0,
    total: 100
  })

  // Baixar instalador com retry
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= DOWNLOAD_CONFIG.MAX_RETRIES; attempt++) {
    try {
      await downloadFile(installerUrl, installerJar, (downloaded, total) => {
        onProgress({
          stage: 'Baixando instalador NeoForge',
          current: downloaded,
          total: total
        })
      })
      lastError = null
      break
    } catch (err) {
      lastError = err as Error
      console.warn(`[NeoForge] Tentativa ${attempt} falhou:`, lastError.message)
      if (attempt < DOWNLOAD_CONFIG.MAX_RETRIES) {
        await sleep(DOWNLOAD_CONFIG.RETRY_DELAYS_MS[attempt - 1])
      }
    }
  }

  if (lastError) throw lastError

  onProgress({
    stage: 'Instalando NeoForge (isso pode demorar um pouco...)',
    current: 0,
    total: 100
  })

  // Executar instalador em modo client (--installClient)
  await runInstallerJar(installerJar, installDir, javaPath)

  // Limpar arquivo temporário
  try { unlinkSync(installerJar) } catch { /* ignorar */ }

  onProgress({
    stage: 'NeoForge instalado com sucesso',
    current: 100,
    total: 100
  })

  console.log('[NeoForge] Instalação concluída')
}

/** Executar o JAR do instalador NeoForge no diretório de instalação */
function runInstallerJar(
  jarPath: string,
  installDir: string,
  javaPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-jar',
      jarPath,
      '--installClient',
      installDir
    ]

    console.log('[NeoForge] Executando instalador:', javaPath, args.join(' '))

    const proc = execFile(javaPath, args, {
      cwd: installDir,
      timeout: 300000 // 5 minutos de timeout
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[NeoForge] Erro do instalador:', stderr)
        reject(new Error(`Instalação do NeoForge falhou: ${error.message}\n${stderr}`))
        return
      }
      console.log('[NeoForge] stdout:', stdout.slice(-500))
      resolve()
    })

    proc.stdout?.on('data', (data) => {
      console.log('[NeoForge]', data.toString().trim())
    })
  })
}

/** Download simples com suporte a redirect e progresso */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doDownload = (currentUrl: string, redirects = 0) => {
      if (redirects > 5) { reject(new Error('Muitos redirecionamentos')); return }

      https.get(currentUrl, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doDownload(res.headers.location, redirects + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ao baixar ${currentUrl}`))
          return
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0

        const fileStream = createWriteStream(destPath)
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          onProgress?.(downloaded, total)
        })

        pipeline(res as NodeJS.ReadableStream, fileStream).then(resolve).catch(reject)
      }).on('error', reject)
    }

    doDownload(url)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Verificar se o NeoForge está instalado buscando o profile de versão.
 */
export function checkNeoForgeInstalled(installDir: string): boolean {
  const versionStr = `${PACK_CONFIG.MINECRAFT_VERSION}-neoforge-${PACK_CONFIG.MODLOADER_VERSION}`
  const jsonPath = join(installDir, 'versions', versionStr, `${versionStr}.json`)
  return existsSync(jsonPath)
}
