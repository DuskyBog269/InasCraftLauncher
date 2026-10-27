import React from 'react'
import { useElectron } from '../hooks/useElectron'

interface Props {
  log: string
  logPath: string
  onClose: () => void
}

export function CrashModal({ log, logPath, onClose }: Props) {
  const { invoke, IPC } = useElectron()

  async function handleCopyLog() {
    await invoke(IPC.CLIPBOARD_WRITE, log)
    // Feedback visual temporário
    const btn = document.getElementById('copy-log-btn')
    if (btn) {
      btn.textContent = '✓ Copiado!'
      setTimeout(() => { if (btn) btn.textContent = '📋 Copiar log' }, 2000)
    }
  }

  async function handleOpenLogFolder() {
    const dir = logPath.split(/[/\\]/).slice(0, -1).join('/')
    await invoke(IPC.SHELL_OPEN_PATH, dir)
  }

  return (
    <div style={styles.overlay}>
      <div className="mc-panel screen-enter" style={styles.modal}>
        {/* Cabeçalho */}
        <div style={styles.header}>
          <span style={{ fontSize: 24 }}>😕</span>
          <div>
            <h2 style={styles.title}>O jogo fechou inesperadamente</h2>
            <p style={styles.subtitle}>
              Algo deu errado. Copie o log abaixo e envie para o admin.
            </p>
          </div>
        </div>

        {/* Log */}
        <div style={styles.logContainer}>
          <p style={styles.logLabel}>LOG DE ERRO (últimas linhas)</p>
          <textarea
            style={styles.logArea}
            value={log || 'Nenhum log disponível.'}
            readOnly
            spellCheck={false}
          />
        </div>

        {/* Botões */}
        <div style={styles.buttons}>
          <button
            id="copy-log-btn"
            className="mc-button"
            onClick={handleCopyLog}
            style={{ flex: 1 }}
          >
            📋 Copiar log
          </button>
          <button
            className="mc-button"
            onClick={handleOpenLogFolder}
            style={{ flex: 1 }}
          >
            📂 Abrir logs
          </button>
          <button
            className="mc-button mc-button--primary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: 520,
    maxWidth: '92%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 14,
    color: 'var(--color-red)',
  },
  subtitle: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  logContainer: {
    flex: 1,
  },
  logLabel: {
    fontSize: 10,
    color: '#555',
    letterSpacing: 1,
    marginBottom: 4,
  },
  logArea: {
    width: '100%',
    height: 240,
    background: '#0a0a0a',
    color: '#ccc',
    border: '1px solid #333',
    padding: 8,
    fontFamily: 'Consolas, monospace',
    fontSize: 10,
    lineHeight: 1.5,
    resize: 'none',
    outline: 'none',
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
}
