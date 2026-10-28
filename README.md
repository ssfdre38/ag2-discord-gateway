# ⚡ AG2 Discord Gateway (`ag2-discord-gateway`)

> **Direct bidirectional streaming gateway connecting Discord bots directly to Antigravity (AG2 / AGY) sessions.**  
> *Zero API keys required. Powered natively by your authenticated Antigravity desktop account.*

---

## 🌟 Highlights

- **Native AG2 Session Binding**: Talks directly to your active Antigravity session (`agy.exe --conversation <id>`). Whatever codebase, files, instructions, or tools your AG2 session has, your Discord bot knows too.
- **🏛️ 64-Bit HMB Memory Engine**: Direct TypeScript/JS port of Daniel's `haven-cpp` Hierarchical Memory Bank. Provides lightning-fast semantic cosine recall with salience and emotional resonance across 4 partitions (`CORE_IDENTITY`, `EPISODIC`, `SEMANTIC`, `EMOTIONAL`).
- **🎭 Dynamic Rich Presence Status**: Reflects in-flight task progress, tool execution, and custom activities (*"Compiling MicaNT on Xeon"*, *"Rendering Sovereign trailers"*) live on Discord.
- **🖼️ Autonomous Visual Synthesis & Egress**: Direct concept art, architectural diagram, and UI mockup generation with auto-attachment into Discord chat without manual hops.
- **🎨 Custom Server Emojis & Native Stickers**: Auto-resolves raw shortcodes (`:pepe_hype:`) to animated `<a:name:id>` and static `<:name:id>`, extracts `[STICKER: ...]` tags, and provides server culture introspection.
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
| `!stop` / `!cancel` | All | Halt and interrupt any active in-flight AG2 execution immediately. |
| `!workspace [path]` | Admin | Inspect or bind the current Discord channel to a specific local workspace directory. |
| `!transcript` | All | Export the active channel's AG2 conversation transcript as a Markdown artifact. |
| `!autotalk [on\|off\|status]` | All | Toggle continuous chat participation without requiring `@Ash` mentions. |
| `!autoread [on\|off\|status]` | All | Toggle voice auto-reading of incoming text messages aloud via TTS. |
| `!talkback [on\|off\|status]` | All | Toggle speaking Ash's AI replies aloud directly in voice channel. |
| `!voice join [channelId]` | All | Connect Ash to your voice channel (or specified voice channel). |
| `!voice leave` | All | Disconnect Ash from the voice channel. |
| `!voice speak <text>` | All | Synthesize text to speech and speak directly into the voice channel. |
| `!voice listen [on\|off]` | All | Toggle Voice Ear: Ash transcribes human speech in WebRTC and replies aloud. |
| `!voice autoread [on\|off]` | All | Toggle reading text chat aloud in voice. |
| `!voice talkback [on\|off]` | All | Toggle speaking Ash's AI replies aloud in voice. |
| `!voice autojoin [on\|off]` | All | Toggle automatically joining voice when members connect. |
| `!voice clear` | All | Clear pending speech audio queue. |
| `!voice status` | All | Inspect WebRTC connection, queue length, and companion settings. |
| `!hmb` / `!memory` | All | Displays memory vault statistics and counts across all 4 category partitions. |
| `!remember [category] <concept> \| <content>` | Admin | Stores an anchor into the 64-bit vault (`CORE_IDENTITY`, `EPISODIC`, `SEMANTIC`, `EMOTIONAL`). |
| `!recall [category] <query>` | All | Semantic cosine search against the vault (optionally filtered by category partition). |
| `!session` | All | Displays the current active AG2 session UUID. |
| `!status [activity]` | Admin/All | Inspect or dynamically update Ash's Discord presence activity. |
| `!image <prompt>` | All | Synthesize a concept visual or diagram card with auto-routing (Google ➔ SD failover). |
| `!image sd <prompt>` | All | Force local hardware Stable Diffusion generation (DreamShaper8 LCM GGUF). |
| `!image google <prompt>` | All | Force Google Nano Banana / Imagen 3 cloud generation. |
| `!image status` | All | Inspect status of local Stable Diffusion, TAESD, and Google Nano Banana engines. |
| `!emojis` | All | Introspect and list all custom Discord emojis available in this server. |
| `!stickers` | All | Introspect and list all custom Discord stickers available in this server. |
| `!bind <uuid>` | Admin | Binds the bot to a specific existing AG2 conversation session. |
| `!unbind` | Admin | Unbinds session so the bot starts a fresh conversation turn. |

---

## ⚡ Slash Commands (`/`) & Interactive Modals

The gateway registers 14 rich native Discord slash commands with instant per-guild and global synchronization, along with interactive modal dialogs:

- **`/status [activity] [status] [type]`**: Dynamically inspect or set Ash's Discord rich presence activity.
- **`/imagine prompt: <text> [engine: auto|sd|google|card] [style]`**: Generate visual concept art or HUD cards and auto-attach directly to Discord. Supports auto-routing with failover from Google Nano Banana to local Stable Diffusion (`DreamShaper8_LCM_q8_0.gguf`).
- **`/emojis`**: Introspect and list custom emojis available in the server.
- **`/stickers`**: Introspect and list custom stickers available in the server.
- **`/goal [objective]`**: Launch an autonomous, long-running goal run with unlimited timeout (up to 2h ceiling), automated test verification, and self-healing. *Omit `objective` to pop open a multi-line Discord form modal with Objective, Constraints, and Workspace inputs.*
- **`/plan [task]`**: Request a detailed step-by-step architectural plan before modifying any code. *Omit `task` to pop open a multi-line Discord form modal with Task, Technical Context, and Workspace inputs.*
- **`/compact`**: Compact ongoing conversation context to free up tokens while preserving architectural decisions.
- **`/transcript`**: Export the active session's transcript logs into a downloadable Markdown file.
- **`/workspace [path]`**: View or switch the active workspace directory bound to this Discord channel.
- **`/thread task: <text>`**: Automatically spawn a dedicated Discord thread for heavy agent swarms or audits.
- **`/autotalk enabled: <true|false>`**: Toggle continuous chat participation in this channel.
- **`/vitals`**: Inspect real-time gateway health, process memory (RSS/Heap), uptime, and voice state.
- **`/memory [stats|recall|remember]`**: Query or manage the 64-bit Hierarchical Memory Bank (.hmb).
- **`/voice [join|leave|speak|listen|autoread|talkback|status]`**: Control WebRTC voice streaming, live speech intake (ear), and AI speech.

### 🎛️ Interactive Action Row Buttons
Every AI message includes 5 interactive action buttons:
1. **`[ 🧠 Save to Vault ]`**: Opens a pre-filled modal dialog allowing you to customize the Concept Name, Category (EPISODIC/LORE/SYSTEM), and Content before saving to the 64-bit vault.
2. **`[ 💡 Explain More ]`**: Requests a deeper explanation of the previous response with live token streaming.
3. **`[ 📋 Plan ]`**: Opens the multi-line Planning Modal to blueprint a new task.
4. **`[ 🎯 Goal ]`**: Opens the multi-line Goal Modal to execute an autonomous task.
5. **`[ 📊 Vitals ]`**: Shows real-time process memory, voice state, and gateway uptime.

---

## 🖼️ Multi-Engine Image Routing & Policy Failover

The gateway integrates a multi-tier generative image routing system designed to prevent censorship blocks and service interruptions:

```
[Inbound Prompt]
       │
       ▼
 ┌───────────────┐
 │ Engine Policy │
 └───────┬───────┘
         │
    Auto │ (Default)
         ▼
┌───────────────────────────┐
│ 🍌 Google Nano Banana      │  Refused (Policy / Safety / DOM)
│    (Imagen 3 / Cloud API) │─────────────────────────────────┐
└────────────┬──────────────┘                                 │
             │ Success                                        │
             ▼                                                ▼
  [Direct Discord Egress]                      ┌───────────────────────────┐
                                               │ ⚡ Stable Diffusion CPP   │
                                               │    (DreamShaper8 LCM)     │
                                               │    TAESD Acceleration     │
                                               └──────────────┬────────────┘
                                                              │ Success
                                                              ▼
                                                   [Direct Discord Egress]
```

- **Cloud Primary (Google Nano Banana via agy-cli)**: High-resolution cloud rendering powered natively by Antigravity's built-in `image-generator` subagent — requiring zero external API keys and leveraging your authenticated Google Ultra / Antigravity tier.
- **Local Sovereign Engine (Stable Diffusion CPP - DreamShaper8 LCM GGUF)**: Runs on local hardware (`C:\Users\admin\stable-diffusion-cpp\models\DreamShaper8_LCM_q8_0.gguf`). Leveraging Latent Consistency Models (LCM) and Tiny AutoEncoder (TAESD), it generates high quality 512x512 images in only 4 steps (~4.5s on CPU).
- **Autonomous Policy Failover**: If Google Nano Banana refuses to generate an image due to safety filters, moderation policies, prompt blocks, or DOM selector failures, the gateway catches the rejection and automatically re-routes the prompt to the local Stable Diffusion engine, guaranteeing uncensored and reliable image delivery.
- **Mid-Turn Extraction Tags**:
  - `[IMAGE: prompt]` — Auto-routes (Google ➔ SD failover)
  - `[IMAGE_SD: prompt]` / `[IMAGE: prompt | sd]` — Force local Stable Diffusion
  - `[IMAGE_GOOGLE: prompt]` / `[NANO_BANANA: prompt]` — Force Google Nano Banana
  - `[IMAGE: prompt | card]` — Force SVG/FFmpeg concept card

---

## 📊 Architecture Diagram & Artifact Viewer

1. **Automatic Mermaid Rendering**: Any ````mermaid ... ```` code block produced by the agent is automatically converted into a high-resolution dark-mode PNG (`#2B2D31`) and attached directly to the Discord message.
2. **Local Artifact Web Viewer**: Generated diagrams, logs, and artifacts can be inspected locally in any browser via `http://127.0.0.1:18895/artifacts/<filename>` with a GitHub-Dark styled viewer.

---

## ⚡ Outbound Actuation (AG2 $\to$ Discord)

The gateway includes a local loopback API (`http://127.0.0.1:18895`) and stdio Model Context Protocol (MCP) server so AG2 agents, IDEs, and CLI scripts can actuate Discord proactively.

### 1. Connecting AG2 via MCP
Add the gateway to your Antigravity / AG2 `mcp_config.json`:
```json
{
  "mcpServers": {
    "discord-gateway": {
      "command": "node",
      "args": ["C:/Users/admin/source/ag2-discord-gateway/src/mcp-server.js"]
    }
  }
}
```
**Tools Available to AG2:**
- `discord_post_message({ message, channelId? })`: Post directly to Discord.
- `discord_upload_file({ filePath, message?, channelId? })`: Upload local files, rendered videos, stems, or archives up to 25 MB directly to Discord.
- `discord_read_recent({ channelId?, limit? })`: Read recent channel history.
- `discord_get_status()`: Get gateway health, bot tag, and channel list.
- `ash_set_presence({ activity, status? })`: Dynamically update Ash's Discord presence activity and status (*"Compiling MicaNT on Xeon"*).
- `generate_image({ prompt, style?, channelId? })`: Synthesize concept visuals / UI mockups and optionally post directly to Discord.
- `discord_list_emojis({ guildId? })`: Query server custom emojis for expressive chat replies.
- `discord_list_stickers({ guildId? })`: Query server custom stickers.
- `hmb_store_memory({ concept, content, category? })`: Store a high-salience memory anchor in one of 4 partitions.
- `hmb_query_memory({ query, topK?, category? })`: Query the 64-bit `.hmb` vault with semantic search.

### 2. Instant CLI Tool
You can actuate Discord from PowerShell or terminal scripts:
```bash
# Check status
node src/cli.js status

# Post a message to Discord
node src/cli.js send "Build complete on main branch! 🚀"

# Read recent channel history
node src/cli.js history --limit 5

# Query long-term memory
node src/cli.js recall "memory architecture"
```

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
| `ENABLE_HTTP_API` | Enable local loopback actuation API | `true` |
| `HTTP_PORT` | Port for local loopback API and MCP bridge | `18895` |
| `HTTP_HOST` | Host binding for local loopback API | `127.0.0.1` |
| `PRINT_TIMEOUT_SECONDS` | CLI execution timeout per turn in seconds (`0` = unlimited) | `1800` (30m) |
| `INACTIVITY_TIMEOUT_MS` | Watchdog timeout for complete child process silence (ms) | `300000` (5m) |
| `MAX_WALL_CLOCK_TIMEOUT_MS` | Maximum wall-clock ceiling per turn (ms) | `3600000` (60m) |

---

## 📄 License
MIT
