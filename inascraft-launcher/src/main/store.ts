import Store from 'electron-store'
import { join } from 'path'
import { app } from 'electron'
import type { LauncherSettings } from '../shared/types'
import { RAM_DEFAULTS } from '../shared/constants'

// Schema para validação e valores padrão
const schema = {
  installDir: {
    type: 'string',
    default: join(app.getPath('appData'), 'InasCraft')
  },
  ramMb: {
    type: 'number',
    default: 2048
  },
  profile: {
    type: 'object',
    default: undefined
  },
  installedVersion: {
    type: 'string',
    default: undefined
  },
  javaPath: {
    type: 'string',
    default: undefined
  },
  lastUpdateCheck: {
    type: 'number',
    default: 0
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const store = new Store<LauncherSettings & Record<string, any>>({
  name: 'inascraft-config',
  schema: schema as any
})

/**
 * Calcular RAM recomendada com base na memória total do sistema.
 * Usa metade da RAM disponível, limitado a RAM_DEFAULTS.MAX_CAP.
 */
export function getRecommendedRam(): number {
  const totalMb = Math.floor(require('os').totalmem() / 1024 / 1024)
  const half = Math.floor(totalMb * RAM_DEFAULTS.RECOMMENDED_FRACTION)
  const clamped = Math.max(RAM_DEFAULTS.MIN, Math.min(half, RAM_DEFAULTS.MAX_CAP))
  // Arredondar para múltiplo de 256
  return Math.floor(clamped / RAM_DEFAULTS.STEP) * RAM_DEFAULTS.STEP
}

/**
 * Retornar diretório de instalação atual.
 * Cria o diretório se não existir.
 */
export function getInstallDir(): string {
  const dir = store.get('installDir') as string
  const fs = require('fs')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}
