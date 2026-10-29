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

  // Obter dados do Fabric (retorna um objeto quando versão é especificada)
  const fabricMetaUrl = `http://meta.fabricmc.net/v2/versions/loader/${MC_VERSION}/${FABRIC_VERSION}`
  console.log('[Fabric] Fetching:', fabricMetaUrl)
  const fabricMeta = await fetchJson<{
    loader: { maven: string, version: string, stable: boolean }
    intermediary: { maven: string, version: string, stable: boolean }
    launcherMeta: { version: number, min_java_version: number, libraries: { common: { name: string, url: string }[] } }
  }>(fabricMetaUrl)

  console.log('[Fabric] Loader Maven:', fabricMeta.loader.maven)

  // URL de download do loader (usando Maven)
  // Maven: net.fabricmc:fabric-loader:0.16.9
  // URL: net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar
  const mavenParts = fabricMeta.loader.maven.split(':')
  const groupPath = mavenParts[0].replace(/\./g, '/')
  const artifact = mavenParts[1]
  const version = mavenParts[2]
  const loaderUrl = `https://maven.fabricmc.net/${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`
  console.log('[Fabric] Loader URL:', loaderUrl)

  console.log('[Fabric] Baixando loader...')
  await downloadFile(loaderUrl, loaderJar, (d, t) => {
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
    const req = client.get(url, { headers: { 'User-Agent': 'InasCraft-Launcher/1.0' } }, (res: IncomingMessage) => {
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

function read_fileSync(path: string, encoding: string): string {
  const { readFileSync } = require('fs')
  return readFileSync(path, encoding)
}