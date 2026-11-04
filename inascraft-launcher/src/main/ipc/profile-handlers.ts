import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import { IPC } from '../../shared/ipc-channels'
import type { PlayerProfile } from '../../shared/types'
import { OFFLINE_PLAYER_PREFIX } from '../../shared/constants'
import { store } from '../store'

/**
 * Gera UUID offline no padrão exato do Java/Minecraft:
 * UUID.nameUUIDFromBytes(("OfflinePlayer:" + nick).getBytes(StandardCharsets.UTF_8))
 *
 * Referência: net.minecraft.core.UUIDUtil#createOfflinePlayerUUID
 */
export function generateOfflineUUID(nick: string): string {
  const md5Bytes = createHash('md5')
    .update(`${OFFLINE_PLAYER_PREFIX}${nick}`, 'utf8')
    .digest()

  // Ajustar bits conforme RFC 4122 (UUID v3 / Java UUID.nameUUIDFromBytes)
  md5Bytes[6] = (md5Bytes[6] & 0x0f) | 0x30 // versão 3
  md5Bytes[8] = (md5Bytes[8] & 0x3f) | 0x80 // variante IETF

  const hex = md5Bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function registerProfileHandlers(): void {
  /** Carregar perfil salvo (atualizando UUID legado se necessário) */
  ipcMain.handle(IPC.PROFILE_LOAD, async () => {
    const profile = store.get('profile') as PlayerProfile | undefined
    if (!profile) return null

    const expectedUuid = generateOfflineUUID(profile.nick)
    if (profile.uuid !== expectedUuid) {
      profile.uuid = expectedUuid
      store.set('profile', profile)
    }

    return profile
  })

  /** Salvar perfil (novo ou atualizado) */
  ipcMain.handle(IPC.PROFILE_SAVE, async (_event, nick: string) => {
    if (!nick || typeof nick !== 'string') {
      throw new Error('Nick inválido')
    }

    const trimmed = nick.trim()
    if (trimmed.length < 3 || trimmed.length > 16) {
      throw new Error('Nick deve ter entre 3 e 16 caracteres')
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new Error('Nick deve conter apenas letras, números e underscore')
    }

    const currentProfile = store.get('profile') as PlayerProfile | undefined
    const uuid = generateOfflineUUID(trimmed)
    const profile: PlayerProfile = {
      ...currentProfile,
      nick: trimmed,
      uuid
    }

    store.set('profile', profile)
    return profile
  })
}
