import { existsSync, mkdirSync, createWriteStream, unlinkSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import http from 'http'
import https from 'https'
import { IncomingMessage } from 'http'
import { PACK_CONFIG } from '../../shared/constants'
import type { ProgressEvent } from '../../shared/types'

export type InstallProgressCallback = (progress: ProgressEvent) => void

const MC_VERSION = PACK_CONFIG.MINECRAFT_VERSION
const FABRIC_VERSION = PACK_CONFIG.MODLOADER_VERSION

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

export function getFabricVersionString(): string {
  return `${MC_VERSION}-fabric-${FABRIC_VERSION}`
}

export function isFabricInstalled(installDir: string): boolean {
  const versionStr = getFabricVersionString()
  const json = join(installDir, 'versions', versionStr, `${versionStr}.json`)
  return existsSync(json)
}

export async function installFabric(
  installDir: string,
  _javaPath: string,
  onProgress: InstallProgressCallback
): Promise<void> {
  const versionStr = getFabricVersionString()
  const versionDir = join(installDir, 'versions', versionStr)
  const versionJson = join(versionDir, `${versionStr}.json`)
  const loaderJar = join(versionDir, `${versionStr}.jar`)

  mkdirSync(versionDir, { recursive: true })

  if (existsSync(versionJson)) {
    console.log('[Fabric] Já instalado')
    return
  }

  console.log('[Fabric] Buscando informações da versão...')

  // Obter dados do Fabric
  const fabricMetaUrl = `http://meta.fabricmc.net/v2/versions/loader/${MC_VERSION}/${FABRIC_VERSION}`
  const fabricMeta = await fetchJson<{
    loader: { url: string, sha1: string }
    intermediary: { url: string, sha1: string }
    launchermeta: { libraries: { name: string, url: string }[] }
  }>(fabricMetaUrl)

  console.log('[Fabric] Baixando loader...')
  await downloadFile(fabricMeta.loader.url, loaderJar, (d, t) => {
    onProgress({ stage: 'Baixando Fabric...', current: d, total: t, file: 'fabric-loader.jar' })
  })

  // Baixar o client.jar vanilla para referência
  const vanillaVersionJson = join(installDir, 'versions', MC_VERSION, `${MC_VERSION}.json`)
  if (existsSync(vanillaVersionJson)) {
    const vanillaData = JSON.parse(read_fileSync(vanillaVersionJson, 'utf-8'))

    // Criar versão do Fabric que herda do vanilla
    const fabricVersionJson = {
      id: versionStr,
      releaseTime: new Date().toISOString(),
      time: new Date().toISOString(),
      type: 'release',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      inheritsFrom: MC_VERSION,
      arguments: { game: ['--username', '${auth_player_name}', '--version', '${version_name}', '--gameDir', '${game_directory}', '--assetsDir', '${assets_root}', '--assetIndex', '${assets_index_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}', '--userType', '${user_type}', '--versionType', '${version_type}'] },
      libraries: [
        ...(vanillaData.libraries || []),
        { name: 'net.fabricmc:yarn:' + MC_VERSION + '+build.' + FABRIC_VERSION, url: 'https://maven.fabricmc.net/' },
        { name: 'net.fabricmc:fabric-loader:' + FABRIC_VERSION, url: 'https://maven.fabricmc.net/' },
        ...(vanillaData.libraries?.filter((l: { name: string }) => l.name.includes('launchwrapper')) || [])
      ],
      minimumLauncherVersion: 21,
      assetIndex: vanillaData.assetIndex
    }

    writeFileSync(versionJson, JSON.stringify(fabricVersionJson, null, 2))
  } else {
    // Se não tiver vanilla, criar JSON básico
    const fabricVersionJson = {
      id: versionStr,
      releaseTime: new Date().toISOString(),
      time: new Date().toISOString(),
      type: 'release',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      inheritsFrom: MC_VERSION,
      arguments: { game: [] },
      libraries: [
        { name: 'net.fabricmc:yarn:' + MC_VERSION + '+build.' + FABRIC_VERSION, url: 'https://maven.fabricmc.net/' },
        { name: 'net.fabricmc:fabric-loader:' + FABRIC_VERSION, url: 'https://maven.fabricmc.net/' }
      ],
      minimumLauncherVersion: 21
    }

    writeFileSync(versionJson, JSON.stringify(fabricVersionJson, null, 2))
  }

  console.log('[Fabric] Instalado com sucesso')
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function downloadFile(url: string, dest: string, onProgress?: (d: number, t: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
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

function read_fileSync(path: string, encoding: string): string {
  const { readFileSync } = require('fs')
  return readFileSync(path, encoding)
}