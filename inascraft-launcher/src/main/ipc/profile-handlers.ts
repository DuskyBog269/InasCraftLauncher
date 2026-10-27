import { ipcMain } from 'electron'
import { v3 as uuidv3 } from 'uuid'
import { IPC } from '../../shared/ipc-channels'
import type { PlayerProfile } from '../../shared/types'
import { MINECRAFT_OFFLINE_UUID_NAMESPACE, OFFLINE_PLAYER_PREFIX } from '../../shared/constants'
import { store } from '../store'

/**
 * Gera UUID offline no padrão exato do Minecraft:
 * UUID v3 com namespace DNS do string "OfflinePlayer:<nick>"
 *
 * Referência: net.minecraft.server.players.PlayerList#getPlayerForUsername
 */
export function generateOfflineUUID(nick: string): string {
  // O Minecraft usa UUID v3 com namespace DNS (não um namespace customizado)
  return uuidv3(`${OFFLINE_PLAYER_PREFIX}${nick}`, uuidv3.DNS)
}

export function registerProfileHandlers(): void {
  /** Carregar perfil salvo */
  ipcMain.handle(IPC.PROFILE_LOAD, async () => {
    const profile = store.get('profile') as PlayerProfile | undefined
    return profile ?? null
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

    const uuid = generateOfflineUUID(trimmed)
    const profile: PlayerProfile = { nick: trimmed, uuid }

    store.set('profile', profile)
    return profile
  })
}

// Suprimir aviso de variável não usada — usada como fallback de namespace
void MINECRAFT_OFFLINE_UUID_NAMESPACE
