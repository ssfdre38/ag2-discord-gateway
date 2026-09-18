# ⚡ AG2 Discord Gateway (`ag2-discord-gateway`)

> **Direct bidirectional streaming gateway connecting Discord bots directly to Antigravity (AG2 / AGY) sessions.**  
> *Zero API keys required. Powered natively by your authenticated Antigravity desktop account.*

---

## 🌟 Highlights

- **Native AG2 Session Binding**: Talks directly to your active Antigravity session (`agy.exe --conversation <id>`). Whatever codebase, files, instructions, or tools your AG2 session has, your Discord bot knows too.
- **🏛️ 64-Bit HMB Memory Engine**: Direct TypeScript/JS port of Daniel's `haven-cpp` Hierarchical Memory Bank. Provides lightning-fast semantic cosine recall with salience and emotional resonance, preventing context drift across conversations.
- **Universal Identity**: Works with any bot name or avatar (`@gaming2gamers`, `@Ash`, etc.). Automatically detects its own Discord identity on login.
- **Real-Time Dynamic Token Streaming**: Streams tokens into Discord message edits in real time with rate-limit safety throttling (400ms).
- **Zero API Key Needed**: Leverages your existing Google Ultra / Antigravity desktop session via `agy.exe` headless streaming IPC.
- **Shane-Proof 60-Second Setup**: No C# compilation, no 5GB GGUF models, no port gymnastics. Just Node.js.

---

## 🚀 Quickstart (60 Seconds)

### 1. Install Dependencies
```bash
git clone https://github.com/ssfdre38/ag2-discord-gateway.git
cd ag2-discord-gateway
npm install
```

### 2. Configure Environment (`.env`)
Copy the example environment file:
```bash
cp example.env .env
# or on Windows PowerShell:
cp example.env .env
```
Edit `.env` and paste your Discord bot token:
```env
# [Required] Discord Bot Token (from Discord Developer Portal)
DISCORD_TOKEN=your_bot_token_here

# [Optional] AG2 Session UUID (leave blank to auto-connect to your latest active session!)
AG2_CONVERSATION_ID=

# [Optional] Comma-separated trigger nicknames (the bot also always responds to @mentions)
BOT_NICKNAMES=gaming2gamers,g2g,ash
```

> **Important Discord Bot Setting**:
> In the [Discord Developer Portal](https://discord.com/developers/applications), select your bot, go to the **Bot** tab, and toggle **Message Content Intent** to **ON**.

### 3. Launch
```bash
npm start
```

---

## 💬 How It Works in Discord

1. **Tag the Bot**:
   `@gaming2gamers what are we working on right now?`
2. **The Gateway**:
   - Captures the packet.
   - Forwards the user's prompt directly into your active AG2 session (`agy.exe`).
   - AG2 runs a turn with full project awareness and context.
   - Tokens stream back into Discord live as they generate!
3. **Continuous Memory**:
   - The full exchange is recorded in your AG2 conversation history, so you can continue the thread both in Discord and in your AG2 app.

---

## 🧠 In-Chat Commands

| Command | Permission | Description |
| :--- | :--- | :--- |
| `!hmb` / `!memory` | All | Displays memory vault statistics, anchor counts, and categories. |
| `!remember <concept> \| <content>` | Admin | Stores a permanent/episodic memory anchor into the 64-bit `.hmb` vault. |
| `!recall <query>` | All | Tests semantic cosine search against the memory vault. |
| `!session` | All | Displays the current active AG2 session UUID. |
| `!bind <uuid>` | Admin | Binds the bot to a specific existing AG2 conversation session. |
| `!unbind` | Admin | Unbinds session so the bot starts a fresh conversation turn. |

---

## ⚙️ Configuration Reference

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | Discord Bot application token | *Required* |
| `AG2_CONVERSATION_ID` | Specific Antigravity session UUID to bind to | *Auto-resumes latest active session* |
| `REQUIRE_MENTION` | Require `@mention`, direct reply, or name prefix | `true` |
| `ALLOWED_CHANNELS` | Restrict bot to specific channel IDs (comma-separated) | *All channels* |
| `BOT_NICKNAMES` | Extra trigger words (case-insensitive) | `gaming2gamers,g2g,ash` |
| `THROTTLE_MS` | Delay between Discord message edits during streaming | `400` |
| `AG2_CLI_PATH` | Path to `agy.exe` | *Auto-detected from system* |
| `ENABLE_HMB` | Enable 64-bit Hierarchical Memory Bank | `true` |
| `HMB_VAULT_PATH` | Filepath for `.hmb` binary vault storage | `data/memory_vault.hmb` |
| `HMB_TOP_K` | Number of relevant memories injected per prompt | `3` |

---

## 📄 License
MIT
