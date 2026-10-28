import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function findAgyExecutable() {
  if (process.env.AG2_CLI_PATH && fs.existsSync(process.env.AG2_CLI_PATH)) {
    return process.env.AG2_CLI_PATH;
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

  if (process.env.ANTIGRAVITY_AGENTAPI_EXE && fs.existsSync(process.env.ANTIGRAVITY_AGENTAPI_EXE)) {
    const base = path.basename(process.env.ANTIGRAVITY_AGENTAPI_EXE).toLowerCase();
    if (base.includes("agy") || base.includes("gemini")) {
      return process.env.ANTIGRAVITY_AGENTAPI_EXE;
    }
  }

  return "agy";
}

function parseChannelWorkspaces(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    if (raw.trim().startsWith("{")) return JSON.parse(raw);
  } catch {}
  const map = {};
  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");
    if (idx > 0) {
      const chan = part.slice(0, idx).trim();
      const dir = part.slice(idx + 1).trim();
      if (chan && dir) map[chan] = dir;
    }
  }
  return map;
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN || "",
  conversationId: process.env.AG2_CONVERSATION_ID || "",
  agyPath: findAgyExecutable(),
  channelWorkspaces: parseChannelWorkspaces(process.env.CHANNEL_WORKSPACES || ""),
  defaultWorkspaceDir: process.env.DEFAULT_WORKSPACE_DIR || process.cwd(),
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
  httpHost: process.env.HTTP_HOST || "127.0.0.1",
  ambientChannels: (process.env.AMBIENT_CHANNELS || process.env.ALLOWED_CHANNELS || "1476714141908599046")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean),
  ambientCooldownMs: parseInt(process.env.AMBIENT_COOLDOWN_MS || "600000", 10), // 10 minutes
  ambientMinSalience: parseFloat(process.env.AMBIENT_MIN_SALIENCE || "0.40"),
  enableVoice: process.env.ENABLE_VOICE !== "false",
  speechBinPath: process.env.SPEECH_HELPER_PATH || "C:\\Users\\admin\\source\\gemini-super-system\\tools\\speech_helper.exe",
  enableAutonomousReactions: process.env.ENABLE_AUTONOMOUS_REACTIONS !== "false",
  enableAutoThreads: process.env.ENABLE_AUTO_THREADS !== "false",
  artifactDir: process.env.ARTIFACT_DIR || path.join(process.cwd(), "data", "artifacts"),
  maxInlineCodeLines: parseInt(process.env.MAX_INLINE_CODE_LINES || "25", 10),
  maxChunkLength: parseInt(process.env.MAX_CHUNK_LENGTH || "1950", 10),
  enableDiscordGuidelines: process.env.ENABLE_DISCORD_GUIDELINES !== "false",

  // Continuous Auto-Talk (chat naturally without requiring @mentions)
  autoTalkMode: process.env.AUTO_TALK_MODE === "true" || process.env.REQUIRE_MENTION === "false",
  autoTalkChannels: (process.env.AUTO_TALK_CHANNELS || process.env.ALLOWED_CHANNELS || "")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean),

  // Voice Companion: Auto-Read & Talk-Back
  voiceAutoRead: process.env.VOICE_AUTO_READ !== "false",
  voiceTalkBack: process.env.VOICE_TALK_BACK !== "false",
  voiceAutoJoin: process.env.VOICE_AUTO_JOIN !== "false",
  voiceAutoReadMaxChars: parseInt(process.env.VOICE_AUTO_READ_MAX_CHARS || "200", 10),
  voiceTalkBackMaxChars: parseInt(process.env.VOICE_TALK_BACK_MAX_CHARS || "350", 10),

  // Cognitive Heartbeat (Ambient Consciousness Loop)
  enableHeartbeat: process.env.ENABLE_HEARTBEAT !== "false",
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "60000", 10),
  heartbeatPresenceSync: process.env.HEARTBEAT_PRESENCE_SYNC !== "false",

  // Turn execution timeouts for long-running tasks
  // printTimeoutSeconds: Passed to agy.exe --print-timeout. 0 = unlimited / wait until complete. Default 1800s (30m).
  printTimeoutSeconds: parseInt(process.env.PRINT_TIMEOUT_SECONDS || process.env.TURN_TIMEOUT_SECONDS || "1800", 10),
  // inactivityTimeoutMs: Silence watchdog before killing unresponsive child process. Default 300000ms (5m).
  inactivityTimeoutMs: parseInt(process.env.INACTIVITY_TIMEOUT_MS || "300000", 10),
  // maxWallClockTimeoutMs: Maximum wall-clock ceiling per turn. Default 3600000ms (60m).
  maxWallClockTimeoutMs: parseInt(process.env.MAX_WALL_CLOCK_TIMEOUT_MS || "3600000", 10),

  // Image Generation & Autonomous Routing (Google Nano Banana <-> Stable Diffusion CPP)
  imageGenEngine: process.env.IMAGE_GEN_ENGINE || "auto",
  sdCliPath: process.env.SD_CLI_PATH || "C:\\Users\\admin\\stable-diffusion-cpp\\sd-cli.exe",
  sdModelPath: process.env.SD_MODEL_PATH || "C:\\Users\\admin\\stable-diffusion-cpp\\models\\DreamShaper8_LCM_q8_0.gguf",
  sdTaesdPath: process.env.SD_TAESD_PATH || "C:\\Users\\admin\\stable-diffusion-cpp\\models\\taesd.safetensors",
  sdSteps: parseInt(process.env.SD_STEPS || "4", 10),
  sdCfgScale: parseFloat(process.env.SD_CFG_SCALE || "1.5"),
  sdSamplingMethod: process.env.SD_SAMPLING_METHOD || "lcm",
  sdWidth: parseInt(process.env.SD_WIDTH || "512", 10),
  sdHeight: parseInt(process.env.SD_HEIGHT || "512", 10),
  sdServerUrl: process.env.SD_SERVER_URL || "http://127.0.0.1:1234",
  googleImageEndpoint: process.env.IMAGE_GEN_ENDPOINT || process.env.GOOGLE_IMAGE_ENDPOINT || null,
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  googleImageModel: process.env.GOOGLE_IMAGE_MODEL || "imagen-3.0-generate-002",

  // Security & Hardening
  rateLimitCooldownMs: parseInt(process.env.RATE_LIMIT_COOLDOWN_MS || "5000", 10),
  httpApiKey: process.env.GATEWAY_API_KEY || null,
  allowedWorkspaceRoots: (process.env.ALLOWED_WORKSPACE_ROOTS || "C:\\Users\\admin\\source,C:\\Users\\admin")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean),
  enablePromptInjectionGuard: process.env.ENABLE_PROMPT_INJECTION_GUARD !== "false"
};
