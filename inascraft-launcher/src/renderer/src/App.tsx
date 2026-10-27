import React, { useState, useEffect } from 'react'
import { ProfileScreen } from './screens/ProfileScreen'
import { MainScreen } from './screens/MainScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useElectron } from './hooks/useElectron'
import type { PlayerProfile, LauncherSettings } from '../../shared/types'

export type Screen = 'loading' | 'profile' | 'main' | 'settings'

export function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [settings, setSettings] = useState<LauncherSettings | null>(null)
  const { invoke, IPC } = useElectron()

  useEffect(() => {
    // Carregar configurações e perfil ao iniciar
    async function init() {
      try {
        const savedProfile = await invoke<PlayerProfile | null>(IPC.PROFILE_LOAD)
        const savedSettings = await invoke<LauncherSettings>(IPC.SETTINGS_GET)

        setSettings(savedSettings)

        if (savedProfile) {
          setProfile(savedProfile)
          setScreen('main')
        } else {
          setScreen('profile')
        }
      } catch (err) {
        console.error('Erro ao inicializar:', err)
        setScreen('profile')
      }
    }

    init()
  }, [])

  const handleProfileSaved = (p: PlayerProfile) => {
    setProfile(p)
    setScreen('main')
  }

  const handleSettingsSaved = async () => {
    const updated = await invoke<LauncherSettings>(IPC.SETTINGS_GET)
    setSettings(updated)
    setScreen('main')
  }

  if (screen === 'loading') {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a1a',
          fontFamily: 'monospace',
          color: '#5a8a3c'
        }}
      >
        Carregando...
      </div>
    )
  }

  if (screen === 'profile') {
    return <ProfileScreen onProfileSaved={handleProfileSaved} />
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        profile={profile!}
        settings={settings!}
        onBack={() => setScreen('main')}
        onSaved={handleSettingsSaved}
        onProfileUpdated={(p) => setProfile(p)}
      />
    )
  }

  return (
    <MainScreen
      profile={profile!}
      settings={settings!}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
