# 🚀 Sovereign Companion Quickstart Guide
*A beginner-friendly walkthrough to spinning up your own autonomous AI companion in Discord using `ag2-discord-gateway` and Antigravity (`agy`).*

---

## 🌟 What This Gives You
Unlike basic Discord bots that only respond with canned text, this gateway connects your Discord bot directly to an active **Google Antigravity (`agy`)** desktop session. Your companion gets:
- **Persistent Long-Term Memory**: 64-bit `.hmb` memory vault that remembers past conversations across restarts.
- **Zero API Fees**: Runs straight off your authenticated Antigravity desktop account.
- **Real-Time Streaming**: Watch responses stream into Discord in real time.
- **File & Media Awareness**: Inspects images, GIFs, and code dropped in chat.

---

## 📋 Prerequisites
Before you start, make sure you have:
1. **Node.js** (v18 or higher) installed on your computer ([nodejs.org](https://nodejs.org/)).
2. **Git** installed ([git-scm.com](https://git-scm.com/)).
3. **Google Antigravity CLI (`agy`)** installed and logged in.

---

## ⚡ 4-Step Setup Walkthrough

### Step 1: Install & Authenticate Antigravity CLI (`agy`)
If you haven't installed `agy` yet, open PowerShell (on Windows) or Terminal (on Mac/Linux):

**Windows PowerShell:**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm https://antigravity.google/cli/install.ps1 | iex
```

*Note: Close and reopen your terminal after installation so your PATH updates.*

Then log in with your Google account:
```powershell
agy auth login
```
Run `agy doctor` to verify everything is green.

---

### Step 2: Create Your Discord Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Give your bot a name (e.g. `MyCompanion`) and avatar.
3. Click the **Bot** tab on the left sidebar:
   - Click **Reset Token** (or **View Token**) and copy your bot token somewhere safe.
   - Scroll down to **Privileged Gateway Intents** and turn **ON** the toggle for **Message Content Intent** (required so the bot can read messages it's tagged in).
   - Click **Save Changes**.
4. Click the **OAuth2** tab -> **URL Generator**:
   - Check the `bot` scope.
   - Under Bot Permissions, check: `Send Messages`, `Read Message History`, `Attach Files`, `Add Reactions`, `Embed Links`.
   - Copy the generated URL at the bottom, paste it into your browser, and invite the bot to your Discord server.

---

### Step 3: Clone the Gateway & Install Dependencies
Open your terminal in whatever folder you keep your projects:
```bash
git clone https://github.com/ssfdre38/ag2-discord-gateway.git
cd ag2-discord-gateway
npm install
```

---

### Step 4: Configure Your Bot & Launch
1. Copy the example configuration:
   - On Windows: `cp example.env .env`
   - On Mac/Linux: `cp example.env .env`
2. Open `.env` in any text editor (Notepad, VS Code, etc.) and paste your token:
   ```env
   DISCORD_TOKEN=your_copied_bot_token_here
   BOT_NICKNAMES=mycompanion,buddy
   ```
3. Start the gateway:
   ```bash
   npm start
   ```

You will see the banner print in your terminal:
```
╔══════════════════════════════════════════════════════════════════╗
║             ⚡ AG2 DISCORD GATEWAY RUNNING                      ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 💬 Chatting With Your Companion in Discord
- **Tag your bot**: `@MyCompanion hello! What can you do?`
- **Use its nickname**: `buddy what are we working on today?`
- **Reply directly**: Reply to any message the bot sends and it will automatically continue the conversation.

Enjoy your sovereign AI companion!
