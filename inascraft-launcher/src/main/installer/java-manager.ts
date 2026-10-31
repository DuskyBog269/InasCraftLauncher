import { execSync } from 'child_process'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { IncomingMessage } from 'http'
import { pipeline } from 'stream/promises'

export type JavaProgressCallback = (downloaded: number, total: number, speed: number) => void

function checkJavaVersion(javaExe: string): boolean {
  try {
    const output = execSync(`"${javaExe}" -version 2>&1`, { encoding: 'utf8', timeout: 5000 })
    const match = output.match(/version\s+"?(\d+)/i)
    return match ? parseInt(match[1], 10) >= 17 : false
  } catch {
    return false
  }
}

export async function resolveJava(installDir: string, onProgress?: JavaProgressCallback): Promise<string> {
  // Procurar em qualquer pasta jdk-* que tenha java.exe
  const javaExe = findJavaInInstallDir(installDir)

  if (javaExe && checkJavaVersion(javaExe)) {
    console.log('[Java] Usando Java existente:', javaExe)
    return javaExe
  }

  // Verificar Java do sistema
  for (const candidate of getSystemJavaCandidates()) {
    if (checkJavaVersion(candidate)) {
      console.log('[Java] Java do sistema:', candidate)
      return candidate
    }
  }

  // Baixar novo Java
  return downloadAndSetupJava(installDir, onProgress)
}

function findJavaInInstallDir(installDir: string): string | null {
  const runtimeDir = join(installDir, 'runtime')
  if (!existsSync(runtimeDir)) return null

  const entries = readdirSync(runtimeDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes('jdk')) {
      const javaExe = join(runtimeDir, entry.name, 'bin', 'java.exe')
      if (existsSync(javaExe)) return javaExe
    }
  }
  return null
}

function getSystemJavaCandidates(): string[] {
  const candidates = ['java.exe']
  if (process.env.JAVA_HOME) {
    candidates.push(join(process.env.JAVA_HOME, 'bin', 'java.exe'))
  }
  return candidates
}

async function downloadAndSetupJava(installDir: string, onProgress?: JavaProgressCallback): Promise<string> {
  // Baixar do GitHub Releases (tag: forge)
  const downloadUrl = 'https://github.com/DuskyBog269/InasCraftLauncher/releases/download/forge/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip'

  const runtimeDir = join(installDir, 'runtime')
  const tempFile = join(runtimeDir, 'jre-download.zip')

  mkdirSync(runtimeDir, { recursive: true })

  if (existsSync(tempFile)) unlinkSync(tempFile)

  console.log('[Java] Download Java 21 do GitHub...')
  await downloadWithRedirects(downloadUrl, tempFile, onProgress)

  // Limpar pastas JDK antigas
  const oldFolders = readdirSync(runtimeDir).filter(f => f.startsWith('jdk'))
  for (const folder of oldFolders) {
    rmSync(join(runtimeDir, folder), { recursive: true, force: true })
  }

  console.log('[Java] Extraindo...')
  const psCmd = `Expand-Archive -Path "${tempFile}" -DestinationPath "${runtimeDir}" -Force`
  try {
    execSync(`powershell -Command "${psCmd}"`, { stdio: 'pipe' })
  } catch (e) {
    throw new Error(`Falha na extração: ${e}`)
  }

  unlinkSync(tempFile)

  // Encontrar pasta JDK extraída
  const entries = readdirSync(runtimeDir, { withFileTypes: true })
  let jdkPath: string | null = null
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes('jdk')) {
      jdkPath = join(runtimeDir, entry.name)
      break
    }
  }

  if (!jdkPath) throw new Error('Pasta JDK não encontrada')

  const javaExe = join(jdkPath, 'bin', 'java.exe')
  if (!existsSync(javaExe)) throw new Error(`Java não encontrado: ${javaExe}`)

  console.log('[Java] Java pronto:', javaExe)
  return javaExe
}

function downloadWithRedirects(url: string, destPath: string, onProgress?: JavaProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl: string, redirects = 0) => {
      if (redirects > 10) { reject(new Error('Muitos redirects')); return }

      https.get(currentUrl, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          doRequest(res.headers.location, redirects + 1)
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
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
          if (elapsed >= 0.5 && onProgress) {
            onProgress(downloaded, total, (downloaded - lastBytes) / elapsed)
            lastTime = now
            lastBytes = downloaded
          }
        })

        pipeline(res as NodeJS.ReadableStream, fileStream)
          .then(() => { onProgress?.(total, total, 0); resolve() })
          .catch(e => { console.error('[Java] Erro:', e.message); reject(e) })
      }).on('error', e => { console.error('[Java] Erro:', e.message); reject(e) })
    }
    doRequest(url)
  })
}