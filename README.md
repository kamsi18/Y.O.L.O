# ⚡ Y.O.L.O (You Only Live Once)

An intense online tactical top-down sci-fi shooter featuring power-ups, cover mechanics, live match history showcases, and flexible game modes (1v1 Duels & 10-Player Survival Battle Royale).

---

## 🚀 Quick Start

The server is already installed and running on your machine:
- Open your browser at: **[http://localhost:3050](http://localhost:3050)**

### To Run / Restart Anytime:

```powershell
node server/index.js
```

---

## 🎮 Game Modes

1. **Solo vs Computer**:
   - **1v1 Duel**: Face an adaptive AI bot in a close-quarters tactical arena.
   - **10-Player Survival (Battle Royale)**: Free-for-All against 9 AI combatants with a contracting danger zone!
   - **AI Difficulty**: Choose between *Recruit*, *Veteran*, and *Cyber-God*.

2. **Online Multiplayer**:
   - **1v1 Online Duel**: Quick Match or private Room Code to invite a friend.
   - **10-Player Survival of the Fittest**: Real-time room where up to 10 players fight. The host can fill remaining slots with tactical bots so you never have to wait!

---

## 🌟 Key Features

1. **Dual Health & Shield Bars**:
   - Overhead dynamic health and shield bars on all combatants in the arena.
   - Top-screen HUD displaying your health/shield and your opponent's health/shield with live numeric readouts.
   - Side survivor roster in Survival mode showing all remaining players' health.

2. **Career Dossier & Match History Showcase**:
   - Inspect any opponent's full career dossier: Win Rate %, K/D Ratio, Total Kills, Damage Dealt, Win Streak, and chronological match history.
   - Accessible in the lobby, during combat (press `TAB` or click "📋 DOSSIER"), and on the post-match victory screen.

3. **Mandatory Online Verification**:
   - Real-time connection monitor with live ping display.
   - Automatic offline blocker if internet drops.

4. **Tactical Power-Ups**:
   - **🔥 2.5x Quad Damage**: Heavy plasma rounds with incendiary trails dealing 50 damage.
   - **🤖 Hologram Clone**: Tactical drone fighting by your side that draws fire and attacks enemies.
   - **🛡️ 2x Shield Barrier**: Overcharged 200-capacity forcefield bubble absorbing 100% of damage.
   - **⏳ Chrono Slow (5s, 7s, 10s)**: Traps opponents in a temporal warp matrix, slowing movement and fire rate by 60%!

5. **Obstacles & Stealth Cover**:
   - **Steel Barricades**: Solid indestructible walls for tactical peeking.
   - **Destructible Crates**: Temporary cover with health bars that shatter under sustained fire.
   - **Stealth Camouflage Fog Zones**: Energy mist fields where players hiding inside are invisible on the radar and invisible to rivals outside!

6. **Persistent Save System**:
   - Revisit anytime: Your profile, stats, unlocked emblem, color, and match logs are saved in both browser storage and the server database (`server/data/db.json`).

---

## 🕹️ Controls

| Action | Control |
| :--- | :--- |
| **Move** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Aim** | Mouse cursor |
| **Shoot** | Left Mouse Button or `Spacebar` |
| **Inspect Opponent Dossier** | `Tab` or click HUD "📋 DOSSIER" |
| **Tactical Chat** | `T` or Chat input box |
| **Mute / Unmute Audio** | `M` |

Menus and layout: edit index.html and the stylesheet.
Bot difficulty, power-ups and game rules: edit the scripts in js/.

