import { execSync } from 'child_process'
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { IncomingMessage } from 'http'
import { pipeline } from 'stream/promises'
import extract from 'extract-zip'
import * as tar from 'tar'
import { DOWNLOAD_CONFIG } from '../../shared/constants'

export type JavaProgressCallback = (downloaded: number, total: number, speed: number) => void

/** Plataforma normalizada para a API do Adoptium */
function getAdoptiumOs(): string {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'mac'
    default:
      return 'linux'
  }
}

/** Arquitetura normalizada para a API do Adoptium */
function getAdoptiumArch(): string {
  const arch = process.arch
  if (arch === 'x64') return 'x64'
  if (arch === 'arm64') return 'aarch64'
  return 'x64'
}

/** Verificar se um executável Java é compatível (Java 17+) */
function checkJavaVersion(javaExe: string): boolean {
  try {
    const output = execSync(`"${javaExe}" -version 2>&1`, {
      encoding: 'utf8',
      timeout: 5000
    })
    // "version "17", "version "21", etc.
    const match = output.match(/version\s+"?(\d+)/i)
    if (match) {
      const major = parseInt(match[1], 10)
      return major >= 17
    }
    return false
  } catch {
    return false
  }
}

/** Fazer download de uma URL com suporte a redirect e callback de progresso */
function download(
  url: string,
  destPath: string,
  onProgress?: JavaProgressCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doDownload = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Muitos redirecionamentos'))
        return
      }

      https
        .get(currentUrl, (res: IncomingMessage) => {
          // Seguir redirect
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doDownload(res.headers.location, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download falhou com status ${res.statusCode}`))
            return
          }

          const total = parseInt(res.headers['content-length'] ?? '0', 10)
          let downloaded = 0
          let lastTime = Date.now()
          let lastBytes = 0

          const fileStream = createWriteStream(destPath)

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            const now = Date.now()
            const elapsed = (now - lastTime) / 1000
            if (elapsed > 0.5 && onProgress) {
              const speed = (downloaded - lastBytes) / elapsed
              onProgress(downloaded, total, speed)
              lastTime = now
              lastBytes = downloaded
            }
          })

          pipeline(res as NodeJS.ReadableStream, fileStream)
            .then(() => {
              onProgress?.(total, total, 0)
              resolve()
            })
            .catch(reject)
        })
        .on('error', reject)
    }

    doDownload(url)
  })
}

/**
 * Encontrar ou baixar o JRE Java 17 (Temurin/Adoptium).
 *
 * Ordem de busca:
 * 1. JRE embutido em <installDir>/runtime/jre-17/
 * 2. Java 17+ no PATH do sistema
 * 3. Baixar da API Adoptium e instalar em <installDir>/runtime/jre-17/
 *
 * @returns Caminho absoluto para o executável `java`
 */
export async function resolveJava(
  installDir: string,
  onProgress?: JavaProgressCallback
): Promise<string> {
  const runtimeDir = join(installDir, 'runtime', 'jre-17')
  const javaExeName = process.platform === 'win32' ? 'java.exe' : 'java'
  const bundledJavaExe = join(runtimeDir, 'bin', javaExeName)

  // 1. Verificar JRE embutido
  if (existsSync(bundledJavaExe) && checkJavaVersion(bundledJavaExe)) {
    console.log('[Java] Usando JRE embutido:', bundledJavaExe)
    return bundledJavaExe
  }

  // 2. Verificar Java do sistema
  const systemJavaExes = process.platform === 'win32'
    ? ['java.exe', join(process.env.JAVA_HOME ?? '', 'bin', 'java.exe')]
    : ['java', join(process.env.JAVA_HOME ?? '', 'bin', 'java')]

  for (const exe of systemJavaExes) {
    if (exe && checkJavaVersion(exe)) {
      console.log('[Java] Usando Java do sistema:', exe)
      return exe
    }
  }

  // 3. Baixar Temurin JRE 17 da Adoptium
  console.log('[Java] Java 17 não encontrado, baixando Temurin JRE 17...')
  const javaExePath = await downloadJRE(runtimeDir, onProgress)
  return javaExePath
}

/** Baixar e extrair o Temurin JRE 17 para o diretório de runtime */
async function downloadJRE(
  runtimeDir: string,
  onProgress?: JavaProgressCallback
): Promise<string> {
  const os = getAdoptiumOs()
  const arch = getAdoptiumArch()
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'

  // URL da API Adoptium para o JRE 17 mais recente
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/17/hotspot?os=${os}&architecture=${arch}&image_type=jre&jvm_impl=hotspot&vendor=eclipse`

  // Buscar metadados para obter a URL de download real
  const metadata = await fetchJson<AdoptiumAsset[]>(apiUrl)
  if (!metadata || metadata.length === 0) {
    throw new Error('Não foi possível obter metadados do Java da Adoptium')
  }

  // Encontrar o arquivo correto (.zip para Windows, .tar.gz para outros)
  const asset = metadata[0].binary.package
  const downloadUrl = asset.link
  const fileName = asset.name

  if (!mkdirSync(runtimeDir, { recursive: true }) !== undefined) {
    mkdirSync(runtimeDir, { recursive: true })
  }

  const tempFile = join(runtimeDir, `..`, `jre-download.${ext}`)

  console.log(`[Java] Baixando de: ${downloadUrl}`)

  // Download com retries
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= DOWNLOAD_CONFIG.MAX_RETRIES; attempt++) {
    try {
      await download(downloadUrl, tempFile, onProgress)
      lastError = null
      break
    } catch (err) {
      lastError = err as Error
      console.warn(`[Java] Tentativa ${attempt} falhou:`, lastError.message)
      if (attempt < DOWNLOAD_CONFIG.MAX_RETRIES) {
        await sleep(DOWNLOAD_CONFIG.RETRY_DELAYS_MS[attempt - 1])
      }
    }
  }

  if (lastError) throw lastError

  // Extrair
  console.log('[Java] Extraindo JRE...')
  if (existsSync(runtimeDir)) {
    // Limpar diretório anterior se existir
    require('fs').rmSync(runtimeDir, { recursive: true, force: true })
  }
  mkdirSync(runtimeDir, { recursive: true })

  const parentDir = join(runtimeDir, '..')

  if (ext === 'zip') {
    await extract(tempFile, { dir: parentDir })
  } else {
    await tar.extract({ file: tempFile, cwd: parentDir })
  }

  // Limpar arquivo temporário
  try { unlinkSync(tempFile) } catch { /* ignorar */ }

  // Encontrar o diretório extraído (pode ter nome diferente como jdk-17.0.x-jre)
  const extractedDirs = require('fs').readdirSync(parentDir).filter(
    (f: string) => f.startsWith('jdk') || f.startsWith('jre')
  )

  if (extractedDirs.length > 0) {
    const extractedDir = join(parentDir, extractedDirs[0])
    // Renomear para jre-17 para consistência
    require('fs').renameSync(extractedDir, runtimeDir)
  }

  const javaExeName = process.platform === 'win32' ? 'java.exe' : 'java'
  const javaExe = join(runtimeDir, 'bin', javaExeName)

  // Tornar executável no Linux/macOS
  if (process.platform !== 'win32') {
    require('fs').chmodSync(javaExe, '755')
  }

  if (!existsSync(javaExe)) {
    throw new Error(`Java extraído mas executável não encontrado em: ${javaExe}`)
  }

  console.log('[Java] JRE 17 instalado com sucesso em:', javaExe)
  void fileName // usado para logging implícito
  return javaExe
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

interface AdoptiumAsset {
  binary: {
    package: {
      link: string
      name: string
      size: number
      checksum: string
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
