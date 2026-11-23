# 🎮 Game Backlog Master — App Desktop Nativo para Windows

Aplicativo desktop completo e standalone (**`GameBacklogMaster.exe`**) para Windows — **sem precisar de Python, sem scripts, sem janela de terminal e sem aba de navegador**.

## ⬇️ Como Usar (Zero Configuração)

1. Baixe **`GameBacklogMaster.exe`** na aba **[Releases](https://github.com/Magroni/backlogMaster/releases)** deste repositório *(compilado automaticamente pelo GitHub Actions)*.
2. Dê duplo clique em **`GameBacklogMaster.exe`**.
3. Pronto! O app abre em sua **janela própria nativa** e cria um **ícone na bandeja do Windows (System Tray)**.
   - Ao fechar no **`X`**, ele minimiza para a bandeja e continua **detectando automaticamente o que você está jogando no PC**.
   - Ative **"⚡ Iniciar com o Windows"** (pelo ícone da bandeja ou em *Configurações*) para rastrear todas as suas jogatinas automaticamente sempre que ligar o PC!
   - Seu banco de dados SQLite fica salvo em segurança em `%LOCALAPPDATA%\GameBacklogMaster\backlog_master.db`.

## ✨ Recursos

- **📡 Detector Automático em Tempo Real (`Steam`, `Epic Games`, `PC Game Pass` e `.exe` avulsos)**:
  - Escaneia automaticamente os jogos instalados nos seus discos (`libraryfolders.vdf`, `Epic Manifests` e `XboxGames`).
  - Detecta quando você abre qualquer jogo, exibe o cronômetro ao vivo **`🟢 JOGANDO AGORA`** e, ao fechar o jogo, **salva a sessão e soma as horas jogadas automaticamente**.
- **⏱️ HowLongToBeat (`howlongtobeatpy`)**: tempos *Main*, *Main+Extra* e *100%* rodando direto do seu PC.
- **🎮 PC Game Pass (Sem Chave!)**:
  - Avisa na **Wishlist** se o jogo **já está incluso no PC Game Pass** antes de você gastar na Steam/Epic.
  - Lista ao vivo **"🚨 Saindo em Breve"** cruzando com o seu Backlog + calculadora de ROI (`R$/hora`).
- **🎁 Epic Games Grátis da Semana (Sem Chave!)**: lista atual e próxima semana com link direto de resgate.
- **💨 Steam Integrada**: preços em R$, capas verticais HD, importação de biblioteca/Wishlist, sync de horas/conquistas e botão **▶ Jogar**.
- **🎲 Roleta do Backlog + 📊 Dashboard com 4 gráficos interativos**.

## 🛠️ Compilar o `.exe` localmente (para desenvolvimento)

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python scripts\build_exe.py
```
O executável final será gerado em `dist/GameBacklogMaster.exe`.
