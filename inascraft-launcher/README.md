# InasCraft Launcher

Launcher customizado para o servidor InasCraft — Minecraft 1.20.1 NeoForge.

O jogador instala o `.exe`, digita um nickname e clica em **JOGAR**. Tudo o mais (Java, NeoForge, mods, configs) é baixado automaticamente.

---

## Índice

1. [Para desenvolvedores](#1-para-desenvolvedores)
2. [Para o admin — gerenciar o modpack](#2-para-o-admin--gerenciar-o-modpack)
3. [Publicar nova versão do modpack](#3-publicar-nova-versão-do-modpack)
4. [Publicar nova versão do launcher](#4-publicar-nova-versão-do-launcher)
5. [Configuração do servidor](#5-configuração-do-servidor)
6. [Variáveis de configuração](#6-variáveis-de-configuração)

---

## 1. Para desenvolvedores

### Pré-requisitos

- Node.js 18+ (recomendado 20 LTS)
- npm 10+
- Git

### Rodar em modo desenvolvimento

```bash
git clone https://github.com/SEU_USER/SEU_REPO.git
cd inascraft-launcher
npm install
npm run dev
```

O Electron abre com hot-reload. O DevTools fica disponível via `F12`.

### Build para produção

```bash
# Windows (.exe NSIS)
npm run build:win

# Linux (AppImage)
npm run build:linux

# macOS (DMG) — requer macOS
npm run build:mac
```

O instalador é gerado em `release/`.

### Estrutura do projeto

```
src/
  main/           — Processo principal Electron (Node.js)
    installer/    — Java, Minecraft, NeoForge, pack updater
    game/         — Lançador do processo Java
    ipc/          — Handlers IPC (bridge main ↔ renderer)
  preload/        — Script de preload (expõe API ao renderer)
  renderer/src/   — Interface React
    screens/      — Telas: Main, Profile, Settings
    components/   — Componentes reutilizáveis
  shared/         — Tipos TypeScript e constantes compartilhadas

tools/
  build-pack.ts   — Script CLI para gerar o manifest do modpack
  pack-config.json — Configuração do pack (editar antes de usar)
  version.txt     — Versão atual do pack (gerenciado automaticamente)
  CHANGELOG.txt   — Changelog da próxima versão

assets/           — Ícones e imagens do launcher
packfiles/        — Coloque os arquivos do modpack aqui
dist-pack/        — Saída do build-pack (NÃO versionar os .jar aqui)
release/          — Saída do electron-builder (instaladores)
```

---

## 2. Para o admin — gerenciar o modpack

### Configuração inicial

1. Edite `tools/pack-config.json`:

```json
{
  "githubUser": "seu-usuario-github",
  "githubRepo": "inascraft-launcher",
  "minecraft": "1.20.1",
  "modloader": "neoforge",
  "modloaderVersion": "47.1.99"
}
```

2. Edite `src/shared/constants.ts` e preencha `GITHUB_CONFIG`:

```ts
export const GITHUB_CONFIG = {
  USER: 'seu-usuario-github',
  REPO: 'inascraft-launcher',
  // ...
}
```

3. (Opcional) Edite `SERVER_CONFIG` com o IP do servidor quando disponível.

### Adicionar mods ao pack

Coloque os arquivos na pasta `packfiles/`:

```
packfiles/
  mods/
    sodium-mc1.20.1-0.5.3.jar
    iris-mc1.20.1-1.6.11.jar
    ...
  config/
    sodium-options.json
    ...
  resourcepacks/
    ...
  shaderpacks/
    ...
```

> **Regra:** só a pasta `mods/` é atualizada automaticamente no cliente.  
> Arquivos em `config/`, `shaderpacks/` e `options.txt` são protegidos.

### Gerar o manifest

```bash
npm run build-pack
```

Isso:
- Calcula o SHA-256 de cada arquivo
- Incrementa a versão automaticamente (`version.txt`)
- Lê o changelog de `tools/CHANGELOG.txt`
- Gera `dist-pack/manifest.json`
- Copia os arquivos do pack para `dist-pack/files/`
- Exibe o resumo e os próximos passos

### Atualizar o changelog antes de publicar

Edite `tools/CHANGELOG.txt` antes de rodar `build-pack`:

```
- Adicionado mod Sodium
- Removido mod OptiFine
- Atualizado Forge Config API Port para 8.0.0
```

O conteúdo aparece no modal de atualização que o jogador vê no launcher.

---

## 3. Publicar nova versão do modpack

Após rodar `npm run build-pack`, siga estes passos:

### Passo a passo

1. **Crie uma release no GitHub:**
   - Acesse `https://github.com/SEU_USER/SEU_REPO/releases/new`
   - Tag: `v1.0.1` (use a versão gerada pelo script)
   - Título: `InasCraft Pack v1.0.1`
   - Descrição: cole o changelog

2. **Faça upload dos arquivos:**
   - Faça upload de `dist-pack/manifest.json`
   - Faça upload de **todos** os arquivos em `dist-pack/files/`

3. **Publique a release.**

4. **Pronto!** Na próxima vez que os jogadores abrirem o launcher, ele detectará a nova versão, mostrará o changelog e baixará apenas os arquivos alterados.

> **Dica:** O arquivo `manifest.json` deve estar disponível em:  
> `https://github.com/SEU_USER/SEU_REPO/releases/latest/download/manifest.json`

---

## 4. Publicar nova versão do launcher

### Pré-requisitos

- Criar um **Personal Access Token** no GitHub com permissão `repo`
- Definir a variável de ambiente `GH_TOKEN` antes de fazer o build

### Passo a passo

1. **Atualize a versão no `package.json`:**

```json
{
  "version": "1.1.0"
}
```

2. **Configure o token:**

```powershell
$env:GH_TOKEN = "seu_token_aqui"
```

3. **Gere o build e publique:**

```bash
npm run build:win
```

O `electron-builder` gera o instalador em `release/` e, se `GH_TOKEN` estiver definido, publica automaticamente na release do GitHub.

4. **Verifique** que os arquivos `InasCraft-Setup-1.1.0.exe`, `latest.yml` e `blockmap` estão na release.

5. **Launchers antigos** detectarão o update automaticamente na próxima abertura e baixarão a nova versão em background.

---

## 5. Configuração do servidor

### online-mode=false

Para que o launcher funcione sem login Microsoft, configure o servidor com `online-mode=false` em `server.properties`:

```properties
online-mode=false
```

### Por que o UUID offline funciona?

O launcher gera o UUID usando o mesmo algoritmo que o servidor usa para jogadores offline:

```
UUID = uuidv3("OfflinePlayer:" + nickname, DNS_NAMESPACE)
```

Isso garante que:
- O mesmo nick **sempre** gera o mesmo UUID
- O inventário, progresso e dados do jogador são preservados
- Mesmo que o jogador reinstale o launcher, seu UUID será idêntico se usar o mesmo nick

### Aviso ao trocar nickname

Quando o jogador troca o nick nas configurações, o launcher exibe um aviso:

> "Trocar o nickname altera seu UUID e pode fazer você perder o inventário no servidor."

Isso é esperado e correto — oriente seus amigos a escolherem um nick e manterem-no.

---

## 6. Variáveis de configuração

Todas as variáveis configuráveis estão em `src/shared/constants.ts`:

| Variável | Arquivo | Descrição |
|---|---|---|
| `GITHUB_CONFIG.USER` | `constants.ts` | Seu usuário do GitHub |
| `GITHUB_CONFIG.REPO` | `constants.ts` | Nome do repositório |
| `SERVER_CONFIG.IP` | `constants.ts` | IP do servidor Minecraft |
| `SERVER_CONFIG.PORT` | `constants.ts` | Porta (padrão: 25565) |
| `PACK_CONFIG.MODLOADER_VERSION` | `constants.ts` | Versão do NeoForge |
| `githubUser/Repo` | `tools/pack-config.json` | Config do script build-pack |

No `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: SEU_GITHUB_USER    # ← alterar aqui
  repo: SEU_GITHUB_REPO     # ← alterar aqui
```

---

## Licença

MIT — Código do launcher livre para uso. Os arquivos do Minecraft são baixados diretamente dos servidores oficiais da Mojang e sujeitos aos [Termos de Uso da Mojang](https://www.minecraft.net/en-us/eula).
