import { existsSync, mkdirSync, createWriteStream, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import https from 'https'
import { IncomingMessage } from 'http'
import { execSync } from 'child_process'
import { PACK_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

const MC_VERSION = PACK_CONFIG.MINECRAFT_VERSION

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

  const manifestUrl = `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
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
  return `${MC_VERSION}-forge-${PACK_CONFIG.MODLOADER_VERSION}`
}

export function isNeoForgeInstalled(installDir: string): boolean {
  const versionStr = getForgeVersionString()
  const json = join(installDir, 'versions', versionStr, `${versionStr}.json`)
  return existsSync(json)
}

export async function installNeoForge(
  installDir: string,
  javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  const versionStr = getForgeVersionString()
  const versionDir = join(installDir, 'versions', versionStr)
  const versionJson = join(versionDir, `${versionStr}.json`)

  if (existsSync(versionJson)) {
    console.log('[Forge] Já instalado')
    return
  }

  const forgeVersion = PACK_CONFIG.MODLOADER_VERSION

  // URL do installer Forge — formato correto
  // https://maven.readthedocs.io/en/latest/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar
  const installerUrl = `https://maven.readthedocs.io/en/latest/net/minecraftforge/forge/${MC_VERSION}-${forgeVersion}/forge-${MC_VERSION}-${forgeVersion}-installer.jar`
  const installerJar = join(installDir, 'forge-installer.jar')

  console.log('[Forge] Baixando installer:', installerUrl)

  try {
    await downloadFile(installerUrl, installerJar, (d, t) => {
      onProgress({ stage: 'Baixando Forge...', current: d, total: t, file: 'forge-installer.jar' })
    })
    console.log('[Forge] Installer baixado')
  } catch (e) {
    // Se falhar, tentar buscar versão mais recente
    console.log('[Forge] Versão não encontrada, buscando última versão...')
    const latest = await fetchLatestForgeVersion(MC_VERSION)
    console.log('[Forge] Última versão:', latest)

    // Atualizar a constante
    require('../../shared/constants').PACK_CONFIG.MODLOADER_VERSION = latest
    const newVersionStr = getForgeVersionString()
    const newInstallerUrl = `https://maven.readthedocs.io/en/latest/net/minecraftforge/forge/${MC_VERSION}-${latest}/forge-${MC_VERSION}-${latest}-installer.jar`

    await downloadFile(newInstallerUrl, installerJar, (d, t) => {
      onProgress({ stage: 'Baixando Forge...', current: d, total: t, file: 'forge-installer.jar' })
    })
  }

  console.log('[Forge] Executando installer...')
  onProgress({ stage: 'Instalando Forge...', current: 50, total: 100 })

  const psCmd = `"${javaPath}" -jar "${installerJar}" --installClient "${installDir}"`
  try {
    execSync(psCmd, { stdio: 'pipe', timeout: 120000 })
    console.log('[Forge] Installer executado')
  } catch (e) {
    console.warn('[Forge] Installer pode ter falhado:', e)
  }

  try { unlinkSync(installerJar) } catch { }

  if (existsSync(versionJson)) {
    console.log('[Forge] Instalado com sucesso')
  }
}

async function fetchLatestForgeVersion(mcVersion: string): Promise<string> {
  // Buscar todas as versões disponíveis no Maven
  const url = 'https://maven.readthedocs.io/en/latest/net/minecraftforge/forge/maven-metadata.xml'
  const xml = await fetchText(url)

  // Parse simples do XML para extrair a última versão
  const versions: string[] = []
  const regex = /<version>([^<]+)<\/version>/g
  let match
  while ((match = regex.exec(xml)) !== null) {
    versions.push(match[1])
  }

  // Filtrar versões compatíveis com MC 1.20.1 (Forge 47.x para 1.20.1)
  const compatible = versions.filter(v => v.startsWith('47.'))
  if (compatible.length > 0) {
    // Retornar a versão mais recente (ordenação semântica)
    return compatible.sort((a, b) => {
      const parse = (v: string) => v.split('.').map(Number)
      const pa = parse(a), pb = parse(b)
      for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i]
      }
      return 0
    })[0]
  }

  // Fallback: versão conhecida que funciona
  return '47.2.0'
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function downloadFile(url: string, dest: string, onProgress?: (d: number, t: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let downloaded = 0, lastTime = Date.now(), lastBytes = 0
      const file = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed >= 0.5 && onProgress) {
          onProgress(downloaded, total)
          lastTime = now; lastBytes = downloaded
        }
      })
      pipeline(res as NodeJS.ReadableStream, file)
        .then(() => { onProgress?.(total, total); resolve() })
        .catch(reject)
    }).on('error', reject)
  })
}