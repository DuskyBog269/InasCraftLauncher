import { ipcMain, BrowserWindow, clipboard, shell, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import net from 'net'
import { IPC } from '../../shared/ipc-channels'
import { SERVER_CONFIG } from '../../shared/constants'
import type { ServerStatus } from '../../shared/types'

export function registerUtilHandlers(mainWindow: BrowserWindow): void {
  /** Escrever texto na área de transferência */
  ipcMain.handle(IPC.CLIPBOARD_WRITE, async (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  /** Abrir um caminho no explorador de arquivos */
  ipcMain.handle(IPC.SHELL_OPEN_PATH, async (_event, path: string) => {
    await shell.openPath(path)
  })

  /** Obter versão do launcher */
  ipcMain.handle(IPC.APP_VERSION, async () => {
    return app.getVersion()
  })

  /** Instalar update baixado e reiniciar */
  ipcMain.handle(IPC.UPDATER_INSTALL, async () => {
    autoUpdater.quitAndInstall(false, true)
  })

  /**
   * Verificar status do servidor Minecraft via ping TCP.
   * Envia um pacote de handshake simplificado e lê a resposta.
   */
  ipcMain.handle(IPC.SERVER_STATUS, async (): Promise<ServerStatus> => {
    const ip = SERVER_CONFIG.IP
    const port = SERVER_CONFIG.PORT

    if (ip === 'YOUR_SERVER_IP') {
      return { online: false }
    }

    try {
      const status = await pingMinecraftServer(ip, port, 5000)
      return status
    } catch {
      return { online: false }
    }
  })

  // Controles de janela (frame customizado)
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow.close())
}

/**
 * Ping ao servidor Minecraft usando o protocolo de status (1.7+).
 * Envia handshake + status request e decodifica a resposta JSON.
 */
function pingMinecraftServer(host: string, port: number, timeout: number): Promise<ServerStatus> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let data = Buffer.alloc(0)
    let resolved = false

    const cleanup = () => {
      if (!socket.destroyed) socket.destroy()
    }

    const timer = setTimeout(() => {
      cleanup()
      if (!resolved) { resolved = true; reject(new Error('Timeout')) }
    }, timeout)

    socket.connect(port, host, () => {
      // Pacote de Handshake: PacketID=0x00, Protocol=760 (1.20.1), host, port, nextState=1
      const hostBuf = Buffer.from(host, 'utf8')
      const handshake = Buffer.alloc(7 + hostBuf.length)
      let offset = 0

      // PacketID
      handshake[offset++] = 0x00
      // Protocol version (varInt 763 para 1.20.1)
      handshake[offset++] = 0xfb
      handshake[offset++] = 0x05
      // Host string length + host
      handshake[offset++] = hostBuf.length
      hostBuf.copy(handshake, offset); offset += hostBuf.length
      // Port
      handshake.writeUInt16BE(port, offset); offset += 2
      // Next state = 1 (status)
      handshake[offset++] = 0x01

      // Prefixar com o tamanho do pacote (varInt)
      const handshakePacket = prependLength(handshake.slice(0, offset))

      // Pacote de Status Request (vazio, só o ID)
      const statusRequest = prependLength(Buffer.from([0x00]))

      socket.write(Buffer.concat([handshakePacket, statusRequest]))
    })

    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk])

      // Tentar decodificar resposta
      try {
        // Pular length varInt
        let i = 0
        while (i < data.length && (data[i] & 0x80)) i++
        i++ // último byte do varInt
        // Pular PacketID (0x00)
        i++
        // String JSON: comprimento (varInt) + dados
        let strLen = 0
        let shift = 0
        while (i < data.length) {
          const b = data[i++]
          strLen |= (b & 0x7f) << shift
          shift += 7
          if (!(b & 0x80)) break
        }
        if (strLen === 0 || i + strLen > data.length) return

        const json = data.slice(i, i + strLen).toString('utf8')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: any = JSON.parse(json)

        clearTimeout(timer)
        cleanup()

        if (!resolved) {
          resolved = true
          resolve({
            online: true,
            players: parsed?.players?.online,
            maxPlayers: parsed?.players?.max,
            motd: typeof parsed?.description === 'string'
              ? parsed.description
              : parsed?.description?.text
          })
        }
      } catch { /* aguardar mais dados */ }
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      cleanup()
      if (!resolved) { resolved = true; reject(err) }
    })

    socket.on('close', () => {
      clearTimeout(timer)
      if (!resolved) { resolved = true; reject(new Error('Conexão fechada')) }
    })
  })
}

/** Prefixar buffer com seu comprimento como varInt */
function prependLength(buf: Buffer): Buffer {
  const len = buf.length
  const lenBuf = Buffer.alloc(4)
  let offset = 0
  let val = len
  while (val > 0x7f) {
    lenBuf[offset++] = (val & 0x7f) | 0x80
    val >>>= 7
  }
  lenBuf[offset++] = val & 0x7f
  return Buffer.concat([lenBuf.slice(0, offset), buf])
}
