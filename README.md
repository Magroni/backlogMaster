# 🎮 Game Backlog Master — App Local PC (Auto-Detecção + SQLite)

App 100% local para Windows feito em **FastAPI + SQLite + Interface Web Dark-Mode** que **detecta automaticamente o que você está jogando no PC** (Steam, Epic Games, PC Game Pass e `.exe` customizados) e integra **HowLongToBeat**, **Steam**, **PC Game Pass**, **Epic Freebies**, **CheapShark**, **IsThereAnyDeal** e **ProtonDB**.

## 🚀 Como Iniciar (1 clique)

- **Com janela de status:** dê duplo clique em **`Iniciar_BacklogMaster.bat`**
- **Silencioso em segundo plano:** dê duplo clique em **`Iniciar_Silencioso.vbs`** *(pode colocar um atalho na pasta `shell:startup` do Windows para rastrear suas jogatinas automaticamente sempre que ligar o PC!)*
- Endereço no navegador: **http://127.0.0.1:8765**

## ✨ Principais Recursos

- **📡 Detector Automático de Jogos no PC (`psutil`)**:
  - Escaneia automaticamente jogos instalados na **Steam** (`libraryfolders.vdf`), **Epic Games** (`Manifests`) e **PC Game Pass** (`XboxGames`).
  - Detecta quando você abre qualquer jogo, mostra cronômetro ao vivo **`🟢 JOGANDO AGORA`**, muda o status para `Jogando` e, ao fechar o jogo, **salva a sessão e soma as horas exatas automaticamente no SQLite** (`data/backlog_master.db`).
  - Também permite vincular qualquer `.exe` rodando agora (emuladores, jogos avulsos, GOG) em 1 clique.
- **⏱️ HowLongToBeat Real (`howlongtobeatpy`)**: tempos *Main*, *Main+Extra* e *100%* rodando direto do seu PC sem bloqueios.
- **🎮 PC Game Pass (Sem Chave!)**:
  - Avisa na **Wishlist** se o jogo **já está incluso no PC Game Pass** antes de você comprar na Steam/Epic.
  - Lista ao vivo os jogos **"🚨 Saindo em Breve"** cruzando com o seu Backlog + calculadora de ROI (`R$/hora`).
- **🎁 Epic Games Grátis da Semana (Sem Chave!)**: lista atual e próxima semana com link direto de resgate.
- **💨 Steam Integrada**: busca instantânea com preços em R$, capas verticais HD, importação de biblioteca e Wishlist + sync de horas e conquistas + **▶ Iniciar Jogo** direto pelo app.
- **🎲 Roleta do Backlog + 📊 Dashboard com 4 gráficos interativos (Chart.js)**.

*(A versão anterior em Google Sheets + Apps Script foi mantida intacta em `apps-script/` caso queira consultar.)*
