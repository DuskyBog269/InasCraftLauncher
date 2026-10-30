import { existsSync, mkdirSync, createWriteStream, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import http from 'http'
import https from 'https'
import { IncomingMessage } from 'http'
import { execSync } from 'child_process'
import { PACK_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

const MC_VERSION = PACK_CONFIG.MINECRAFT_VERSION
const FORGE_VERSION = PACK_CONFIG.MODLOADER_VERSION

export async function installMinecraft(
  installDir: string,
  _javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  const versionDir = join(installDir, 'versions', MC_VERSION)
  const clientJarJson = join(versionDir, `${MC_VERSION}.json`)
  const clientJarData = join(versionDir, `${MC_VERSION}.jar`)

  mkdirSync(versionDir, { recursive: true })

  if (existsSync(clientJarJson) && existsSync(clientJarData)) {
    console.log('[MC] Já instalado')
    return
  }

  console.log('[MC] Buscando versão...')

  const manifestUrl = `http://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
  const manifest = await fetchJson<{ versions: { id: string, url: string }[] }>(manifestUrl)
  const versionInfo = manifest.versions.find((v: { id: string }) => v.id === MC_VERSION)

  if (!versionInfo) {
    throw new Error(`Versão ${MC_VERSION} não encontrada`)
  }

  const versionData = await fetchJson<{
    downloads: { client: { url: string } }
    mainClass: string
    type: string
    assetIndex: { id: string, url: string }
    libraries: unknown[]
  }>(versionInfo.url)

  console.log('[MC] Baixando client.jar...')
  await downloadFile(versionData.downloads.client.url, clientJarData, (d, t) => {
    onProgress({ stage: 'Baixando Minecraft...', current: d, total: t, file: 'client.jar' })
  })

  const versionJson = {
    id: MC_VERSION,
    releaseTime: versionInfo.releaseTime || new Date().toISOString(),
    time: versionInfo.time || new Date().toISOString(),
    type: versionData.type || 'release',
    mainClass: versionData.mainClass || 'net.minecraft.client.main.Main',
    inheritsFrom: null,
    arguments: { game: [], jvm: [] },
    libraries: versionData.libraries || [],
    minimumLauncherVersion: 21,
    assetIndex: versionData.assetIndex
  }

  writeFileSync(clientJarJson, JSON.stringify(versionJson, null, 2))
  console.log('[MC] Instalado')
}

export function isMinecraftInstalled(installDir: string): boolean {
  const jar = join(installDir, 'versions', MC_VERSION, `${MC_VERSION}.jar`)
  return existsSync(jar)
}

export function getForgeVersionString(): string {
  return `${MC_VERSION}-forge-${FORGE_VERSION}`
}

export function isForgeInstalled(installDir: string): boolean {
  const versionStr = getForgeVersionString()
  const json = join(installDir, 'versions', versionStr, `${versionStr}.json`)
  return existsSync(json)
}

export async function installForge(
  installDir: string,
  javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  const versionStr = getForgeVersionString()
  const versionDir = join(installDir, 'versions', versionStr)
  const versionJson = join(versionDir, `${versionStr}.json`)
  const installerJar = join(installDir, 'forge-installer.jar')

  if (existsSync(versionJson)) {
    console.log('[Forge] Já instalado')
    return
  }

  console.log('[Forge] Baixando installer...')

  // Tentar múltiplas fontes para o installer JAR
  const installerUrls = [
    // Seu GitHub Releases - tag correto
    `https://github.com/DuskyBog269/InasCraftLauncher/releases/download/forge/forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`,
  ]

  let downloaded = false
  for (const url of installerUrls) {
    try {
      console.log('[Forge] Tentando:', url)
      await downloadFile(url, installerJar, (d, t) => {
        onProgress({ stage: 'Baixando Forge...', current: d, total: t, file: 'forge-installer.jar' })
      })
      console.log('[Forge] Installer baixado')
      downloaded = true
      break
    } catch (e) {
      console.log('[Forge] Falhou:', (e as Error).message)
    }
  }

  if (!downloaded) {
    // Última tentativa: скачать do прямой link do repositório
    console.log('[Forge] Tentando fontes alternativas...')
    const altUrls = [
      // Repo fork que pode ter os installers
      `https://raw.githubusercontent.com/MinecraftForge/MinecraftForge/${FORGE_VERSION}/src/main/resources/forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`,
    ]
    for (const url of altUrls) {
      try {
        await downloadFile(url, installerJar, (d, t) => {
          onProgress({ stage: 'Baixando Forge (alt)...', current: d, total: t, file: 'forge-installer.jar' })
        })
        console.log('[Forge] Installer baixado de fonte alternativa')
        downloaded = true
        break
      } catch (e) {
        console.log('[Forge] Alt falhou:', (e as Error).message)
      }
    }
  }

  if (!downloaded) {
    throw new Error('Não foi possível baixar o installer do Forge. Tente fazer upload manualmente no GitHub.')
  }

  console.log('[Forge] Executando installer...')
  onProgress({ stage: 'Instalando Forge...', current: 50, total: 100 })

  // Criar launcher_profiles.json se não existir (Forge exige)
  const launcherProfiles = join(installDir, 'launcher_profiles.json')
  if (!existsSync(launcherProfiles)) {
    const profilesJson = {
      profiles: {
        InasCraft: {
          name: 'InasCraft',
          lastVersionId: MC_VERSION,
          javaArgs: '-Xmx2G'
        }
      },
      selectedProfile: 'InasCraft',
      clientToken: '00000000-0000-0000-0000-000000000000'
    }
    writeFileSync(launcherProfiles, JSON.stringify(profilesJson, null, 2))
    console.log('[Forge] launcher_profiles.json criado')
  }

  // Executar installer
  const psCmd = `"${javaPath}" -jar "${installerJar}" --installClient "${installDir}"`
  let installerOutput = ''
  try {
    installerOutput = execSync(psCmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 180000, encoding: 'utf8' })
    console.log('[Forge] Installer executado:', installerOutput)
  } catch (e: any) {
    console.warn('[Forge] Installer falhou:', e.message)
    if (e.stdout) console.log('[Forge] stdout:', e.stdout.toString())
    if (e.stderr) console.log('[Forge] stderr:', e.stderr.toString())
  }

  // Só limpar installer se funcionou
  if (existsSync(versionJson)) {
    try { unlinkSync(installerJar) } catch { }
    console.log('[Forge] Instalado com sucesso')
  } else {
    console.log('[Forge] Arquivo installer mantido para debug:', installerJar)
    throw new Error('Installer do Forge não criou os arquivos esperados')
  }
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') { reject(new Error('URL inválida')); return }
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      // Seguir redirects (301, 302, etc.)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location
          const fullRedirectUrl = new URL(redirectUrl, url).toString()
          console.log('[HTTP] Redirect para:', fullRedirectUrl)
          fetchText(fullRedirectUrl).then(resolve).catch(reject)
          return
        }
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') { reject(new Error('URL inválida')); return }
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      // Seguir redirects (301, 302, etc.)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location
          const fullRedirectUrl = new URL(redirectUrl, url).toString()
          console.log('[HTTP] Redirect para:', fullRedirectUrl)
          fetchJson<T>(fullRedirectUrl).then(resolve).catch(reject)
          return
        }
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function downloadFile(url: string, dest: string, onProgress?: (d: number, t: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') { reject(new Error('URL inválida: ' + url)); return }
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      // Seguir redirects (301, 302, etc.)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location
          const fullRedirectUrl = new URL(redirectUrl, url).toString()
          console.log('[HTTP] Redirect para:', fullRedirectUrl)
          downloadFile(fullRedirectUrl, dest, onProgress).then(resolve).catch(reject)
          return
        }
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let downloaded = 0, lastTime = Date.now()
      const file = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (Date.now() - lastTime >= 500 && onProgress) {
          onProgress(downloaded, total)
          lastTime = Date.now()
        }
      })
      pipeline(res as NodeJS.ReadableStream, file)
        .then(() => { onProgress?.(total, total); resolve() })
        .catch(reject)
    }).on('error', reject)
  })
}