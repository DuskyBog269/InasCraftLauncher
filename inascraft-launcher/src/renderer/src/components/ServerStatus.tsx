import React, { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import type { ServerStatus as ServerStatusType } from '../../../shared/types'
import { SERVER_CONFIG } from '../../../shared/constants'

export function ServerStatus() {
  const { invoke, IPC } = useElectron()
  const [status, setStatus] = useState<ServerStatusType | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)

  const serverConfigured = SERVER_CONFIG.IP !== 'YOUR_SERVER_IP'
  const serverAddress = SERVER_CONFIG.PORT === 25565
    ? SERVER_CONFIG.IP
    : `${SERVER_CONFIG.IP}:${SERVER_CONFIG.PORT}`

  async function handleCopyIp() {
    try {
      await invoke(IPC.CLIPBOARD_WRITE, serverAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignorar */ }
  }

  useEffect(() => {
    if (!serverConfigured) return

    checkStatus()
    // Verificar a cada 60 segundos
    const interval = setInterval(checkStatus, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function checkStatus() {
    if (checking) return
    setChecking(true)
    try {
      const result = await invoke<ServerStatusType>(IPC.SERVER_STATUS)
      setStatus(result)
    } catch {
      setStatus({ online: false })
    } finally {
      setChecking(false)
    }
  }

  if (!serverConfigured) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.dot, background: '#555' }} />
        <span style={styles.label}>Servidor não configurado</span>
      </div>
    )
  }

  if (!status) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.dot, background: '#888', animation: 'blink 1s infinite' }} />
        <span style={styles.label}>Verificando servidor...</span>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.dot,
          background: status.online ? '#5a8a3c' : '#cc3333',
          boxShadow: status.online ? '0 0 4px #5a8a3c' : undefined
        }}
      />
      <span style={styles.label}>
        {status.online ? (
          <>
            <span style={{ color: 'var(--color-grass)' }}>Online</span>
            {status.players !== undefined && (
              <span style={{ color: '#888' }}>
                {' '}· {status.players}/{status.maxPlayers ?? '?'} jogadores
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--color-red)' }}>Offline</span>
        )}
      </span>

      <button
        style={styles.refreshBtn}
        onClick={checkStatus}
        disabled={checking}
        title="Atualizar status"
      >
        ↻
      </button>

      <button
        style={styles.copyBtn}
        onClick={handleCopyIp}
        title={`Copiar IP (${serverAddress})`}
      >
        {copied ? '✓ IP copiado!' : '📋 Copiar IP'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 0, // pixel art — quadrado
    flexShrink: 0,
  },
  label: {
    color: 'var(--color-text)',
    textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
  },
  refreshBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-dim)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 2px',
    textShadow: '1px 1px 0 #000',
  },
  copyBtn: {
    background: 'rgba(18, 18, 18, 0.8)',
    border: '1px solid #444',
    color: 'var(--color-text)',
    cursor: 'pointer',
    fontSize: 10,
    padding: '2px 6px',
    marginLeft: 4,
    fontFamily: 'inherit',
  },
}
