import React from 'react'
import { useElectron } from '../hooks/useElectron'

interface Props {
  status: {
    status: string
    info?: { version: string }
    percent?: number
  }
}

export function UpdateBanner({ status }: Props) {
  const { invoke, IPC } = useElectron()

  async function handleInstall() {
    await invoke(IPC.UPDATER_INSTALL)
  }

  if (status.status === 'downloading') {
    return (
      <div style={styles.banner}>
        <span>⬇ Baixando atualização do launcher... {status.percent?.toFixed(0)}%</span>
      </div>
    )
  }

  if (status.status === 'ready' && status.info) {
    return (
      <div style={{ ...styles.banner, background: '#1a2d0a', borderColor: '#3d5c28' }}>
        <span>
          ✓ InasCraft <strong>{status.info.version}</strong> baixado
        </span>
        <button className="mc-button" onClick={handleInstall} style={styles.restartBtn}>
          Reiniciar para atualizar
        </button>
      </div>
    )
  }

  if (status.status === 'available' && status.info) {
    return (
      <div style={styles.banner}>
        <span>Nova versão disponível: {status.info.version}. Baixando...</span>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: '#1a1a0a',
    color: 'var(--color-amber)',
    padding: '5px 16px',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #4a3800',
    flexShrink: 0,
  },
  restartBtn: {
    fontSize: 11,
    padding: '3px 12px',
  },
}
