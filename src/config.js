import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function findAgyExecutable() {
  if (process.env.AG2_CLI_PATH && fs.existsSync(process.env.AG2_CLI_PATH)) {
    return process.env.AG2_CLI_PATH;
  }

  if (process.env.ANTIGRAVITY_AGENTAPI_EXE && fs.existsSync(process.env.ANTIGRAVITY_AGENTAPI_EXE)) {
    return process.env.ANTIGRAVITY_AGENTAPI_EXE;
  }

  const localAppData = process.env.LOCALAPPDATA || "";
  const standardAgyPath = path.join(localAppData, "agy", "bin", "agy.exe");
  if (localAppData && fs.existsSync(standardAgyPath)) {
    return standardAgyPath;
  }

  const userProfile = process.env.USERPROFILE || "";
  const geminiAgyPath = path.join(userProfile, ".gemini", "antigravity-cli", "bin", "agy.exe");
  if (userProfile && fs.existsSync(geminiAgyPath)) {
    return geminiAgyPath;
  }

  return "agy";
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN || "",
  conversationId: process.env.AG2_CONVERSATION_ID || "",
  agyPath: findAgyExecutable(),
  requireMention: process.env.REQUIRE_MENTION !== "false",
  throttleMs: parseInt(process.env.THROTTLE_MS || "400", 10),
  systemPrompt: process.env.SYSTEM_PROMPT || "",
  safeMode: process.env.SAFE_MODE !== "false",
  adminUsers: (process.env.ADMIN_USERS || "")
    .split(",")
    .map(u => u.trim())
    .filter(Boolean),
  allowedChannels: (process.env.ALLOWED_CHANNELS || "")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean),
  nicknames: (process.env.BOT_NICKNAMES || "gaming2gamers,g2g,ash")
    .split(",")
    .map(n => n.trim().toLowerCase())
    .filter(Boolean),
  enableHmb: process.env.ENABLE_HMB !== "false",
  hmbVaultPath: process.env.HMB_VAULT_PATH || path.join(process.cwd(), "data", "memory_vault.hmb"),
  hmbTopK: parseInt(process.env.HMB_TOP_K || "3", 10),
  enableHttpApi: process.env.ENABLE_HTTP_API !== "false",
  httpPort: parseInt(process.env.HTTP_PORT || "18895", 10),
  httpHost: process.env.HTTP_HOST || "127.0.0.1"
};
