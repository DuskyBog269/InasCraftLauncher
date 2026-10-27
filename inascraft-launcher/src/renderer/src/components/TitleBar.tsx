import React from 'react'

interface Props {
  onOpenSettings?: () => void
  showSettingsButton?: boolean
}

export function TitleBar({ onOpenSettings, showSettingsButton = true }: Props) {
  return (
    <div style={styles.bar}>
      <span style={styles.title}>InasCraft</span>

      <div style={styles.controls}>
        {showSettingsButton && onOpenSettings && (
          <button style={styles.settingsBtn} onClick={onOpenSettings} title="Configurações">
            ⚙
          </button>
        )}
        <button
          style={styles.controlBtn}
          onClick={() => window.electronAPI.send('window:minimize' as never)}
          title="Minimizar"
        >
          –
        </button>
        <button
          style={styles.controlBtn}
          onClick={() => window.electronAPI.send('window:maximize' as never)}
          title="Maximizar"
        >
          □
        </button>
        <button
          style={{ ...styles.controlBtn, ...styles.closeBtn }}
          onClick={() => window.electronAPI.send('window:close' as never)}
          title="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 32,
    background: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px 0 12px',
    WebkitAppRegion: 'drag' as never,
    flexShrink: 0,
    borderBottom: '1px solid #222',
  },
  title: {
    color: '#5a8a3c',
    fontSize: 12,
    fontFamily: 'var(--font-minecraft)',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    WebkitAppRegion: 'no-drag' as never,
  },
  settingsBtn: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 8px',
    marginRight: 8,
  },
  controlBtn: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 8px',
    lineHeight: 1,
  },
  closeBtn: {
    fontSize: 12,
  },
}
