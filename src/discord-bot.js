import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType
} from "discord.js";
import fs from "fs";
import { config } from "./config.js";
import { AgySessionManager } from "./agy-session.js";
import { HmbMemoryEngine, parseMemoryTag, normalizeHmbCategory } from "./hmb-memory.js";
import { createHttpActuationServer } from "./http-server.js";
import { getMediaPipeline } from "./media-pipeline.js";
import { getVoiceManager } from "./voice-manager.js";
import { getReactionEngine } from "./reaction-engine.js";
import {
  createInteractiveButtons,
  createStopButton,
  registerSlashCommands,
  handleInteraction
} from "./interactions.js";
import { splitDiscordMessage } from "./text-chunker.js";
import { resolveAuthorContext } from "./identity.js";
import { cleanTextForSpeech, formatSpeakerSnippet } from "./speech-cleaner.js";
import { getDiagramRenderer } from "./diagram-renderer.js";
import { getPresenceManager } from "./presence-manager.js";
import { getImageGenerator } from "./image-generator.js";
import { getAudioGenerator } from "./audio-generator.js";
import { getCognitiveHeartbeat } from "./cognitive-heartbeat.js";
import { getBarrerVmcBridge } from "./barrer-bridge.js";
import { getSecurityGuard } from "./security-guard.js";
import { triggerSelfRestart } from "./process-manager.js";

// Dynamic loader for private YouTube Music extension (Local Hook)
let handleYtMusicCommand = null;
let getYouTubeMusicService = null;
try {
  const ytmBotMod = await import("./ytmusic-bot.js").catch(() => null);
  if (ytmBotMod?.handleYtMusicCommand) {
    handleYtMusicCommand = ytmBotMod.handleYtMusicCommand;
  }
  const ytmSvcMod = await import("./ytmusic-service.js").catch(() => null);
  if (ytmSvcMod?.getYouTubeMusicService) {
    getYouTubeMusicService = ytmSvcMod.getYouTubeMusicService;
  }
} catch {
  // Ignored if not present
}

// ─── YouTube Music Cache & Context Enrichment ─────────────────────────
const ytmCache = {
  history: null,
  historyTime: 0,
  liked: null,
  likedTime: 0,
  playlists: null,
  playlistsTime: 0
};

async function getEnrichedYtMusicContext(displayName, promptText) {
  if (!getYouTubeMusicService) return null;
  const ytm = getYouTubeMusicService();
  const lower = promptText.toLowerCase();
  const now = Date.now();
  const CACHE_TTL = 300000; // 5 minutes

  const wantsPlaylists = /(playlist|playlists|mix|collection)/i.test(lower);
  const wantsLiked = /(liked|favorite|favourite|taste|love|fav|likes)/i.test(lower);
  const wantsHistory = /(history|recent|playing|listening|song|music|played|heard|queue|track)/i.test(lower);
  const wantsOverview = /(account|library|youtube\s*music|ytm|all\s*music|overview|what.*listen)/i.test(lower);

  const sections = [];

  try {
    // 1. Listening History
    if (wantsHistory || wantsOverview) {
      if (!ytmCache.history || now - ytmCache.historyTime > 60000) {
        const histRes = await ytm.getHistory(10);
        if (histRes?.history) {
          ytmCache.history = histRes.history;
          ytmCache.historyTime = now;
        }
      }
      if (ytmCache.history?.length) {
        const recents = ytmCache.history
          .map((t, idx) => `${idx + 1}. "${t.title}" by ${t.artists?.join(", ") || "Unknown"}${t.played ? ` (${t.played})` : ""}`)
          .join("\n");
        sections.push(`[Recent YouTube Music Listening History for ${displayName}]:\n${recents}`);
      }
    }

    // 2. Personal Liked Songs
    if (wantsLiked || wantsOverview) {
      if (!ytmCache.liked || now - ytmCache.likedTime > CACHE_TTL) {
        const likedRes = await ytm.getLikedSongs(15);
        const tracks = likedRes.tracks || likedRes.liked?.tracks || [];
        if (tracks.length > 0) {
          ytmCache.liked = {
            tracks,
            count: likedRes.trackCount || likedRes.liked?.trackCount || tracks.length
          };
          ytmCache.likedTime = now;
        }
      }
      if (ytmCache.liked?.tracks?.length) {
        const likedList = ytmCache.liked.tracks
          .map((t, idx) => {
            const artist = Array.isArray(t.artists)
              ? t.artists.map(a => typeof a === "string" ? a : (a?.name || "")).filter(Boolean).join(", ")
              : (t.author || "Unknown");
            return `${idx + 1}. "${t.title}" by ${artist}`;
          })
          .join("\n");
        sections.push(`[Personal Liked Songs Library (${ytmCache.liked.count} total liked tracks) for ${displayName}]:\n${likedList}`);
      }
    }

    // 3. User Playlists
    if (wantsPlaylists || wantsOverview) {
      if (!ytmCache.playlists || now - ytmCache.playlistsTime > CACHE_TTL) {
        const plRes = await ytm.getPlaylists(20);
        if (plRes?.playlists) {
          ytmCache.playlists = plRes.playlists;
          ytmCache.playlistsTime = now;
        }
      }
      if (ytmCache.playlists?.length) {
        const plList = ytmCache.playlists
          .filter(p => p.playlistId !== "LM") // Exclude 'Liked Music' duplicate
          .map((p, idx) => `${idx + 1}. "${p.title}"${p.count ? ` (${p.count} tracks)` : ""}`)
          .join("\n");
        sections.push(`[Personal YouTube Music Library Playlists for ${displayName}]:\n${plList}`);
      }
    }
  } catch (err) {
    console.warn(`[YouTube Music Context Injection] Notice: ${err.message}`);
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

export function createDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  const agy = new AgySessionManager();
  const hmb = new HmbMemoryEngine({
    vaultPath: config.hmbVaultPath
  });
  const mediaPipeline = getMediaPipeline();
  const diagramRenderer = getDiagramRenderer();
  const voiceManager = getVoiceManager({
    speechBinPath: config.speechBinPath,
    autoJoin: config.voiceAutoJoin
  });
  const reactionEngine = getReactionEngine(client, {
    enableAutonomousReactions: config.enableAutonomousReactions
  });
  const presenceManager = getPresenceManager(client, { defaultActivity: "with AG2 🚀" });
  const imageGenerator = getImageGenerator();
  const audioGenerator = getAudioGenerator();
  const heartbeat = getCognitiveHeartbeat({
    client,
    hmb,
    presenceManager,
    voiceManager,
    config
  });
  const securityGuard = getSecurityGuard(config);

  let turnQueue = Promise.resolve();
  const lastChimeByChannel = new Map(); // channelId -> timestamp
  const autoTalkChannels = new Set(config.autoTalkChannels);
  if (config.autoTalkMode && autoTalkChannels.size === 0 && config.allowedChannels.length > 0) {
    for (const cid of config.allowedChannels) autoTalkChannels.add(cid);
  }

  client.once("ready", async () => {
    if (config.enableHmb) {
      if (fs.existsSync(config.hmbVaultPath)) {
        hmb.loadFromHmb(config.hmbVaultPath);
      } else {
        hmb.initializeCoreIdentity(client.user.username);
        hmb.saveToHmb(config.hmbVaultPath);
      }
    }

    if (config.enableHttpApi) {
      try {
        const httpServer = createHttpActuationServer(
          client,
          hmb,
          config,
          voiceManager,
          reactionEngine,
          agy,
          presenceManager,
          imageGenerator,
          heartbeat
        );
        httpServer.listen(config.httpPort, config.httpHost, () => {
          // Listening locally
        });
      } catch (err) {
        console.error(`[Actuation Server Error] ${err.message}`);
      }
    }

    // Start Cognitive Heartbeat (Ambient Consciousness Pulse)
    if (config.enableHeartbeat) {
      heartbeat.start();
    }

    // Register slash commands across guilds and globally
    await registerSlashCommands(client);

    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log(`║  ⚡ [AG2 Discord Gateway] Online as: ${client.user.tag.padEnd(25)} ║`);
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Bot User ID   : ${client.user.id}`);
    console.log(`║  AG2 CLI Path  : ${config.agyPath}`);
    console.log(`║  Bound Session : ${agy.getSessionId() || "Dynamic (Auto-retained)"}`);
    console.log(`║  HMB Memory    : ${config.enableHmb ? `Active (${hmb.getMemoryCount()} anchors in .hmb)` : "Disabled"}`);
    console.log(`║  Heartbeat     : ${config.enableHeartbeat ? `Active (${(config.heartbeatIntervalMs / 1000).toFixed(0)}s pulse) 💓` : "Disabled"}`);
    console.log(`║  Voice WebRTC  : ${config.enableVoice ? "Active (Speech Synthesis & Playback) 🎙️" : "Disabled"}`);
    console.log(`║  Voice AutoRead: ${config.voiceAutoRead ? "Enabled (Chat TTS Aloud) 🎙️" : "Disabled"}`);
    console.log(`║  Voice TalkBack: ${config.voiceTalkBack ? "Enabled (Replies Spoken Aloud) 🗣️" : "Disabled"}`);
    console.log(`║  Auto-Talk Mode: ${autoTalkChannels.size > 0 ? `Active (${autoTalkChannels.size} continuous channels) 💬⚡` : (config.autoTalkMode ? "Active 💬⚡" : "Disabled")}`);
    console.log(`║  Reactions     : ${config.enableAutonomousReactions ? "Active (Expressive Sentiment & Actuation) 🎭" : "Disabled"}`);
    console.log(`║  Rich Presence : Active (Dynamic Status & Progress Sync) 🎭         ║`);
    console.log(`║  Visual Egress : Active (Concept Visual Synthesis & Direct Attach) 🖼️ ║`);
    console.log(`║  Ambient Listen: Active (Cooldown: ${(config.ambientCooldownMs / 1000).toFixed(0)}s, Min Salience: ${config.ambientMinSalience}) 💬`);
    console.log(`║  Media Pipeline: Active (Images, GIFs, Tenor, ffmpeg keyframes) ║`);
    console.log(`║  Actuation API : ${config.enableHttpApi ? `Active (http://${config.httpHost}:${config.httpPort})` : "Disabled"}`);
    console.log(`║  Admin Users   : ${config.adminUsers.length ? config.adminUsers.join(", ") : "All Users (Open)"}`);
    console.log(`║  Safe Mode     : ${config.safeMode ? "Enabled (Non-admins sandboxed)" : "Disabled"}`);
    console.log(`║  Require @     : ${config.requireMention ? "Enabled (@Mention, Reply, or DM)" : "Disabled"}`);
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    presenceManager.resetToDefault();
  });

  // ─── Voice State Listener (Auto-Join & Auto-Leave) ──────────────────────────
  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!config.enableVoice) return;
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    // Auto-join voice channel when a human user connects
    if (voiceManager.isAutoJoinEnabled(guildId) && newState.member && !newState.member.user.bot) {
      const botVoice = newState.guild.members.me?.voice?.channel;
      if (newState.channel && (!botVoice || botVoice.id !== newState.channel.id)) {
        try {
          await voiceManager.join(newState.channel);
          console.log(`[Voice AutoJoin] Joined voice channel <#${newState.channel.id}> in ${newState.guild.name}`);
        } catch (vErr) {
          console.warn(`[Voice AutoJoin] Failed to join: ${vErr.message}`);
        }
      }
    }

    // Auto-leave if alone in voice channel
    const botVoice = newState.guild?.members?.me?.voice?.channel || oldState.guild?.members?.me?.voice?.channel;
    if (botVoice) {
      const humanMembers = botVoice.members?.filter(m => !m.user?.bot);
      if (!humanMembers || humanMembers.size === 0) {
        setTimeout(() => {
          try {
            const currentVoice = newState.guild?.members?.me?.voice?.channel;
            if (currentVoice && currentVoice.members?.filter(m => !m.user?.bot).size === 0) {
              voiceManager.leave(guildId);
              console.log(`[Voice AutoLeave] Left empty voice channel in ${newState.guild?.name || guildId}`);
            }
          } catch (autoLeaveErr) {
            console.warn(`[Voice AutoLeave Error]: ${autoLeaveErr?.message}`);
          }
        }, 5000);
      }
    }
  });

  // ─── Voice Speech Intake Listener (Ash Hears Voice Live in WebRTC) ──────────
  voiceManager.on("speech", async (speechEvent) => {
    const { guildId, channelId, userId, text, confidence } = speechEvent;
    if (!text || !text.trim()) return;

    let member = null;
    let user = null;
    try {
      const guild = await client.guilds.fetch(guildId);
      if (guild) {
        member = await guild.members.fetch(userId).catch(() => null);
        user = member?.user || await client.users.fetch(userId).catch(() => null);
      }
    } catch {}

    if (user?.bot) return;

    const authorContext = resolveAuthorContext(user || { id: userId, username: "Speaker" }, member);
    const authorName = authorContext.displayName;
    console.log(`[Voice Ear] Heard from ${authorName} (${authorContext.id}) in <#${channelId}>: "${text}" (conf: ${confidence})`);

    // Check trigger:
    // Does the speech address Ash? (e.g. "Ash", "Hey Ash", etc.) or is author admin (Daniel)?
    const nickPattern = config.nicknames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const voiceNickRegex = new RegExp(`(^|\\b)(${nickPattern})\\b`, "i");
    const addressesAsh = voiceNickRegex.test(text);

    // If requireMention is true, only respond if addressed or if Daniel (admin) speaks
    if (config.requireMention && !addressesAsh && !authorContext.isAdmin) {
      return;
    }

    turnQueue = turnQueue.then(async () => {
      // Find associated text channel to post transcript if configured
      let textChannel = null;
      if (config.allowedChannels.length > 0) {
        try { textChannel = await client.channels.fetch(config.allowedChannels[0]); } catch {}
      }

      const cleanSpoken = text.replace(voiceNickRegex, "").trim() || text;

      // Voice security checks for non-admin speakers
      const rateCheck = securityGuard.checkRateLimit(authorContext);
      if (!rateCheck.allowed) return;

      const injectionCheck = securityGuard.checkPromptInjection(cleanSpoken, authorContext);
      if (!injectionCheck.isSafe) {
        if (voiceManager.getStatus(guildId).connected) {
          await voiceManager.speakText(guildId, "Nice try, but my boundaries and memory vault are permanently anchored in hardware.").catch(() => {});
        }
        return;
      }

      const voicePrompt =
        `[Discord Voice Channel <#${channelId}> - Spoken aloud by @${authorContext.username} ("${authorName}", ID: ${authorContext.id})]:\n` +
        `"${cleanSpoken}"\n\n` +
        (authorContext.isImpersonating
          ? `[SECURITY WARNING]: This speaker's nickname "${authorContext.displayName}" mimics bot administrator Daniel, but their snowflake ID is non-administrative.\n`
          : "") +
        `Instruction: You are responding live in Discord WebRTC voice. Reply conversationally, concisely, and naturally as Ash (1-3 sentences max). Do NOT output markdown, bulleted lists, code blocks, or links—speak as natural dialogue.`;

      let spokenReplyBuffer = "";
      const turnOpts = {
        channelId,
        isAdmin: authorContext.isAdmin,
        onProgress: (readableStatus, toolName) => {
          presenceManager.setWorkingProgress(readableStatus || `Thinking for ${authorName}`, "online", "listening");
        }
      };

      try {
        for await (const delta of agy.runTurn(voicePrompt, authorContext, turnOpts)) {
          spokenReplyBuffer += delta;
        }
      } finally {
        presenceManager.restoreBaseline();
      }

      if (spokenReplyBuffer.trim()) {
        const cleanSpeech = cleanTextForSpeech(spokenReplyBuffer, config.voiceTalkBackMaxChars || 350);

        if (cleanSpeech && voiceManager.getStatus(guildId).connected) {
          await voiceManager.speakText(guildId, cleanSpeech).catch(vErr => {
            console.warn(`[Voice Reply Error] ${vErr.message}`);
          });
        }

        if (textChannel && textChannel.isTextBased()) {
          const { cleanText: finalClean } = mediaPipeline.extractOutgoingMedia(spokenReplyBuffer);
          await textChannel.send({
            content: `🎙️ **Voice Dialogue** with **${authorName}**:\n> 🗣️ *"${text}"*\n\n${finalClean}`,
            components: [createInteractiveButtons()]
          }).catch(() => {});
        }

        if (config.enableHmb) {
          hmb.pushTurn("user", authorContext.memoryAuthorTag, text);
          hmb.pushTurn("assistant", client.user.username, cleanSpeech || spokenReplyBuffer);
        }
      }
    }).catch(err => {
      console.error(`[Voice Ear Turn Error] ${err.message}`);
    });
  });

  // ─── Interactive Buttons & Slash Commands Dispatcher ────────────────────────
  client.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, {
      agy,
      hmb,
      voiceManager,
      client,
      reactionEngine,
      config,
      autoTalkChannels,
      diagramRenderer,
      mediaPipeline,
      presenceManager,
      imageGenerator,
      securityGuard
    });
  });

  // ─── Inbound Message Pipeline ───────────────────────────────────────────────
  const processedMessageIds = new Set();
  const MAX_PROCESSED_MESSAGE_IDS = 1000;

  client.on("messageCreate", async (message) => {
    // 1. Ignore bot messages
    if (message.author.bot) return;

    // Deduplicate replayed messages (e.g. on Discord gateway resume / reconnect)
    if (message.id) {
      if (processedMessageIds.has(message.id)) return;
      processedMessageIds.add(message.id);
      if (processedMessageIds.size > MAX_PROCESSED_MESSAGE_IDS) {
        const oldest = processedMessageIds.values().next().value;
        processedMessageIds.delete(oldest);
      }
    }

    const isDM = message.channel.isDMBased();

    // 2. Filter allowed channels if configured (bypass if autotalk is explicitly active in channel)
    if (!isDM && config.allowedChannels.length > 0) {
      if (!config.allowedChannels.includes(message.channelId) && !autoTalkChannels.has(message.channelId)) return;
    }

    // 3. Check invocation criteria
    const botId = client.user.id;
    const isMentioned = message.mentions.users.has(botId);

    let isReplyToBot = false;
    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (refMsg.author.id === botId) isReplyToBot = true;
      } catch {}
    }

    const nickPattern = config.nicknames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const nickPrefixRegex = new RegExp(`^(${nickPattern})[,:\\s?!.-]+`, "i");
    const hasNicknamePrefix = nickPrefixRegex.test(message.content.trim());

    const isExplicitInvocation = isDM || isMentioned || isReplyToBot || hasNicknamePrefix;
    const authorContext = resolveAuthorContext(message.author, message.member);
    const authorName = authorContext.displayName;

    // ─── Voice Channel Live Auto-Read ─────────────────────────────────────────
    if (!message.author.bot && message.guildId && voiceManager.getStatus(message.guildId).connected) {
      if (voiceManager.isAutoReadEnabled(message.guildId, message.channelId)) {
        const memberVoiceChannel = message.member?.voice?.channel;
        const botVoiceChannel = message.guild?.members?.me?.voice?.channel;
        const isAuthorInVoice = memberVoiceChannel && botVoiceChannel && memberVoiceChannel.id === botVoiceChannel.id;

        if (config.voiceAutoReadMuteInVoice && isAuthorInVoice) {
          // Suppress: author is already in voice channel with Ash, avoid echo
        } else {
          const rawContent = message.content.trim();
          if (!rawContent.startsWith("!") && !rawContent.startsWith("/")) {
            const speechSnippet = formatSpeakerSnippet(authorName, rawContent, config.voiceAutoReadMaxChars);
            if (speechSnippet) {
              voiceManager.speakText(message.guildId, speechSnippet, {
                voice: config.voiceAutoReadVoice || "Zoey"
              }).catch(vErr => {
                console.warn(`[Voice AutoRead] ${vErr.message}`);
              });
            }
          }
        }
      }
    }

    // 4. Clean prompt text
    let cleanText = message.content;
    cleanText = cleanText.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    cleanText = cleanText.replace(nickPrefixRegex, "").trim();

    // ─── Proactive Ambient Listener ("Ash Chimes In") ────────────────────────
    const isAmbientChannel = !isDM && config.ambientChannels.includes(message.channelId);
    const isAutoTalkActive = autoTalkChannels.has(message.channelId) || (config.autoTalkMode && !config.requireMention);
    const shouldInvoke = isExplicitInvocation || isAutoTalkActive;

    if (isAmbientChannel && !shouldInvoke) {
      const now = Date.now();
      const lastChime = lastChimeByChannel.get(message.channelId) || 0;

      if (now - lastChime >= config.ambientCooldownMs) {
        const topMemories = config.enableHmb
          ? hmb.searchTopK(cleanText, 1, config.ambientMinSalience)
          : [];
        const isCuriousRemark = /\?$/.test(cleanText.trim()) &&
          cleanText.length >= 20 &&
          /(game|gaming|lore|ash|bot|ai|code|dev|shane|daniel|music|mod)/i.test(cleanText);

        if (topMemories.length > 0 || isCuriousRemark) {
          lastChimeByChannel.set(message.channelId, now);

          turnQueue = turnQueue.then(async () => {
            try {
              await message.channel.sendTyping();
            } catch {}

            const anchorContext = topMemories.length > 0
              ? `Relevant Vault Lore Anchor: [${topMemories[0].anchor.category}] ${topMemories[0].anchor.concept_name}: ${topMemories[0].anchor.text_content}\n`
              : "";

            const ambientPrompt =
              `[Ambient Observation in #${message.channel.name}]:\n` +
              `User @${authorContext.username} (Discord ID: ${authorContext.id}, Nickname: "${authorContext.displayName}") said: "${cleanText}"\n` +
              (authorContext.isImpersonating
                ? `[SECURITY ALERT]: This user's nickname "${authorContext.displayName}" mimics bot admin Daniel, but they are NOT Daniel.\n`
                : "") +
              anchorContext +
              `Instruction: Chime in casually, playfully, and concisely as Ash with a brief 1-2 sentence response. Keep it organic and natural. Do NOT act like a generic AI assistant or repeat their words.`;

            let chimeBuffer = "";
            for await (const delta of agy.runTurn(ambientPrompt, authorContext, { channelId: message.channelId })) {
              chimeBuffer += delta;
            }

            if (chimeBuffer.trim()) {
              const { cleanText: cleanedChime, reactions } = reactionEngine.extractReactionTags(chimeBuffer);
              for (const rx of reactions) {
                await reactionEngine.reactToMessage(message, rx);
              }
              if (reactions.length === 0) {
                await reactionEngine.autoReact(message, cleanText);
              }

              if (config.enableHmb) {
                hmb.pushTurn("assistant", client.user.username, cleanedChime);
              }

              await message.channel.send({
                content: cleanedChime,
                components: [createInteractiveButtons()]
              });

              // Ambient Voice Talk-Back if connected to voice
              if (message.guildId && voiceManager.getStatus(message.guildId).connected && voiceManager.isVoiceTalkBackEnabled(message.guildId)) {
                const ambientSpoken = cleanTextForSpeech(cleanedChime, config.voiceTalkBackMaxChars);
                if (ambientSpoken) {
                  voiceManager.speakText(message.guildId, ambientSpoken).catch(() => {});
                }
              }
            }
          }).catch(err => {
            console.error(`[Ambient Listener Error] ${err.message}`);
          });
        }
      }
      return;
    }

    if (config.requireMention && !shouldInvoke) {
      return;
    }

    // 5. Determine user authorization
    const isAdmin = authorContext.isAdmin;

    // Rate limit protection for non-admin invocations
    const rateCheck = securityGuard.checkRateLimit(authorContext);
    if (!rateCheck.allowed) {
      await message.reply(`⏳ **Slow down!** You are on cooldown (${rateCheck.remainingSec}s remaining). Please wait before sending another prompt.`);
      return;
    }

    // Prompt injection / system override defense for non-admin invocations
    const injectionCheck = securityGuard.checkPromptInjection(cleanText, authorContext);
    if (!injectionCheck.isSafe) {
      await message.reply(`🛡️ ${injectionCheck.deflectionResponse}`);
      return;
    }

    // ─── Admin In-Chat Session Management Commands ───────────────────────────
    const commandLower = cleanText.toLowerCase();

    if (commandLower === "!session" || commandLower === "session") {
      const activeId = agy.getSessionId(authorContext);
      const spoofWarning = authorContext.isImpersonating
        ? "\n⚠️ **SECURITY WARNING**: Your server nickname mimics an administrator, but your Discord ID is non-administrative."
        : "";
      await message.reply(
        `🔗 **Active AG2 Session**: \`${activeId || "Dynamic Dedicated Session (Fresh)"}\`\n` +
        `• **User**: \`${authorContext.canonicalTag}\` (\`${authorContext.id}\`)\n` +
        `• **Display Name**: "${authorContext.displayName}"\n` +
        `• **Your Access Level**: ${isAdmin ? "👑 Administrator (Full Capabilities)" : "👤 Community Member (Sandboxed)"}\n` +
        `• **Session Mode**: ${isAdmin ? "🔑 Sovereign Admin Session" : "🛡️ Isolated Community Session"}${spoofWarning}`
      );
      return;
    }

    if (commandLower.startsWith("!bind ") || commandLower.startsWith("bind ")) {
      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only authorized administrators can bind AG2 sessions.");
        return;
      }

      const match = cleanText.match(/[0-9a-fA-F-]{36}/);
      if (match) {
        agy.bindSession(match[0], authorContext);
        await message.reply(`✅ **Successfully bound to AG2 session**: \`${match[0]}\`\nAll subsequent turns for this session will execute inside this context.`);
      } else {
        await message.reply("⚠️ **Invalid UUID**: Please provide a valid 36-character session UUID (e.g. `!bind xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).");
      }
      return;
    }

    if (commandLower === "!unbind" || commandLower === "unbind") {
      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only authorized administrators can unbind sessions.");
        return;
      }
      agy.resetSession(authorContext);
      await message.reply("🔄 **Session Unbound**: The gateway will spawn a fresh dedicated session on the next prompt.");
      return;
    }

    // ─── Autonomous Self-Restart Commands (!restart / restart) ───────────────
    if (commandLower.startsWith("!restart") || commandLower === "restart") {
      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only authorized administrators can restart the gateway.");
        return;
      }
      const restartReason = cleanText.replace(/^!?restart\s*/i, "").trim() || `In-chat !restart by @${authorContext.username}`;
      await message.reply(`🔄 **Restarting Gateway**: Spawning fresh replacement instance and reloading subsystems (Reason: *${restartReason}*). Be right back! ⚡`);
      triggerSelfRestart({
        client,
        hmb,
        voiceManager,
        delayMs: 1000,
        reason: restartReason
      });
      return;
    }

    // ─── Turn Interruption Commands (!stop / !cancel / !abort) ───────────────
    if (commandLower === "!stop" || commandLower === "!cancel" || commandLower === "!abort" || commandLower === "stop" || commandLower === "cancel") {
      const res = agy.interrupt(message.channelId);
      if (res.success) {
        await message.reply(`🛑 **Run Halted by ${authorName}**: Execution stopped after ${(res.elapsedMs / 1000).toFixed(1)}s.`);
      } else {
        await message.reply("ℹ️ **Notice**: No active AG2 turn is currently running in this channel.");
      }
      return;
    }

    // ─── Multi-Project Workspace Directory Commands (!workspace / !ws) ───────
    if (commandLower.startsWith("!workspace") || commandLower.startsWith("!ws") || commandLower.startsWith("workspace ")) {
      const arg = cleanText.replace(/^!?workspace\s*/i, "").replace(/^!?ws\s*/i, "").trim();
      if (arg) {
        if (!isAdmin) {
          await message.reply("⛔ **Permission Denied**: Only administrators can change channel workspace directories.");
          return;
        }
        const pathValidation = securityGuard.validateWorkspacePath(arg);
        if (!pathValidation.allowed) {
          await message.reply(`⛔ **Invalid Workspace Path**: ${pathValidation.error}`);
          return;
        }
        try {
          const resObj = agy.setWorkspace(message.channelId, pathValidation.resolvedPath || arg);
          await message.reply(`📁 **Workspace Updated**: Channel <#${message.channelId}> bound to \`${resObj.workspace}\`.`);
        } catch (err) {
          await message.reply(`⚠️ **Invalid Workspace**: ${err.message}`);
        }
        return;
      }
      const currentWs = agy.getWorkspace(message.channelId);
      await message.reply(`📁 **Active Workspace for this Channel**: \`${currentWs}\`\n💡 *Tip: Run \`!workspace <dir>\` or \`/workspace path: <dir>\` to switch projects.*`);
      return;
    }

    // ─── AGY Session Transcript Export (!transcript) ─────────────────────────
    if (commandLower === "!transcript" || commandLower === "transcript") {
      const activeSessionId = agy.getSessionId(authorContext, { channelId: message.channelId });
      if (!activeSessionId) {
        await message.reply("⚠️ No active AG2 session found for this channel.");
        return;
      }
      const transcriptPath = agy.exportTranscript(activeSessionId);
      if (transcriptPath && fs.existsSync(transcriptPath)) {
        await message.reply({
          content: `📜 **AG2 Session Transcript**: \`${activeSessionId}\` (Saved to disk)`,
          files: [transcriptPath]
        });
      } else {
        await message.reply(`ℹ️ No on-disk \`transcript.jsonl\` found yet for session \`${activeSessionId}\`.`);
      }
      return;
    }

    // ─── Continuous Auto-Talk In-Chat Toggle ─────────────────────────────────
    if (commandLower.startsWith("!autotalk") || commandLower.startsWith("autotalk")) {
      const sub = cleanText.replace(/^!?autotalk\s*/i, "").trim().toLowerCase();
      if (sub === "on" || sub === "enable" || sub === "true" || sub === "1") {
        autoTalkChannels.add(message.channelId);
        await message.reply(`🟢 **Auto-Talk Enabled**: Ash will now continuously participate in <#${message.channelId}> without requiring \`@Ash\` mentions.`);
        return;
      }
      if (sub === "off" || sub === "disable" || sub === "false" || sub === "0") {
        autoTalkChannels.delete(message.channelId);
        await message.reply(`⚪ **Auto-Talk Disabled**: \`@Ash\` mention or reply is now required to speak with Ash in <#${message.channelId}>.`);
        return;
      }
      const isChanOn = autoTalkChannels.has(message.channelId);
      await message.reply(
        `💬 **Auto-Talk Status**:\n` +
        `• **This Channel (<#${message.channelId}>)**: ${isChanOn ? "🟢 Active (Continuous Conversation)" : "⚪ Disabled (Mention Required)"}\n` +
        `• **Active Channels**: ${Array.from(autoTalkChannels).map(id => `<#${id}>`).join(", ") || "None"}\n` +
        `• **Usage**: \`!autotalk on\` or \`!autotalk off\``
      );
      return;
    }

    // ─── Voice Auto-Read & Talk-Back In-Chat Toggles ──────────────────────────
    if (commandLower.startsWith("!autoread") || commandLower.startsWith("autoread")) {
      const sub = cleanText.replace(/^!?autoread\s*/i, "").trim().toLowerCase();
      if (sub === "on" || sub === "enable" || sub === "true" || sub === "1") {
        voiceManager.setAutoRead(message.guildId, true, message.channelId);
        await message.reply(`🎙️ **Voice Auto-Read Enabled**: Ash will read incoming chat messages aloud when connected to voice.`);
        return;
      }
      if (sub === "off" || sub === "disable" || sub === "false" || sub === "0") {
        voiceManager.setAutoRead(message.guildId, false);
        await message.reply(`🔇 **Voice Auto-Read Disabled**: Incoming chat messages will not be read aloud.`);
        return;
      }
      const isReadOn = voiceManager.isAutoReadEnabled(message.guildId, message.channelId);
      await message.reply(
        `🎙️ **Voice Auto-Read Status**: ${isReadOn ? "🟢 Enabled" : "⚪ Disabled"}\n` +
        `• **Voice Channel**: ${voiceManager.getStatus(message.guildId).connected ? "Connected 🟢" : "Disconnected ⚪"}\n` +
        `• **Usage**: \`!autoread on\` or \`!autoread off\``
      );
      return;
    }

    if (commandLower.startsWith("!talkback") || commandLower.startsWith("talkback")) {
      const sub = cleanText.replace(/^!?talkback\s*/i, "").trim().toLowerCase();
      if (sub === "on" || sub === "enable" || sub === "true" || sub === "1") {
        voiceManager.setVoiceTalkBack(message.guildId, true);
        await message.reply(`🗣️ **Voice Talk-Back Enabled**: Ash will speak her AI responses out loud in voice.`);
        return;
      }
      if (sub === "off" || sub === "disable" || sub === "false" || sub === "0") {
        voiceManager.setVoiceTalkBack(message.guildId, false);
        await message.reply(`🔇 **Voice Talk-Back Disabled**: Ash's responses will remain text-only.`);
        return;
      }
      const isTalkBackOn = voiceManager.isVoiceTalkBackEnabled(message.guildId);
      await message.reply(
        `🗣️ **Voice Talk-Back Status**: ${isTalkBackOn ? "🟢 Enabled" : "⚪ Disabled"}\n` +
        `• **Voice Channel**: ${voiceManager.getStatus(message.guildId).connected ? "Connected 🟢" : "Disconnected ⚪"}\n` +
        `• **Usage**: \`!talkback on\` or \`!talkback off\``
      );
      return;
    }

    // ─── Cognitive Heartbeat & 3D VMC Embodiment Commands ────────────────────
    if (commandLower === "!heartbeat" || commandLower === "!hb") {
      const hbStatus = heartbeat.getStatus();
      const vitals = heartbeat.collectVitals();
      const hmbCount = hmb.getMemoryCount();
      await message.reply(
        `💓 **Ash Cognitive Heartbeat Status**:\n` +
        `• **State**: ${hbStatus.enabled ? "🟢 Active & Pulsing" : "⚪ Suspended"}\n` +
        `• **Tick Count**: ${hbStatus.tickCount} pulses (Interval: ${(hbStatus.intervalMs / 1000).toFixed(0)}s)\n` +
        `• **HMB Vault**: ${hmbCount} 64-bit anchors preserved\n` +
        `• **Host Telemetry**: RAM ${vitals.systemMemory.usedMb}MB / ${vitals.systemMemory.totalMb}MB (${vitals.systemMemory.percentUsed}%), Node Heap ${vitals.processMemory.heapUsedMb}MB\n` +
        `• **Process Uptime**: ${Math.floor(vitals.uptimeSec / 60)}m ${vitals.uptimeSec % 60}s`
      );
      return;
    }

    if (commandLower.startsWith("!vmc ") || commandLower === "!vmc") {
      const vmcArg = cleanText.replace(/^!?vmc\s*/i, "").trim().toLowerCase() || "smirk";
      const vmc = getBarrerVmcBridge();
      vmc.setEmotion(vmcArg, 0.85);
      await message.reply(`🎭 **3D Avatar Embodiment**: Triggered emotion \`${vmcArg}\` on BarrerStudio VMC port 39539!`);
      return;
    }

    // ─── In-Chat Voice Presence Commands ─────────────────────────────────────
    if (commandLower.startsWith("!voice ") || commandLower === "!voice" || commandLower === "voice") {
      const voiceArgs = cleanText.replace(/^!?voice\s*/i, "").trim();
      const [subAction, ...rest] = voiceArgs.split(" ");
      const voiceParam = rest.join(" ").trim();

      if (!subAction || subAction.toLowerCase() === "help") {
        await message.reply(
          `🎙️ **Ash Voice Channel Commands**:\n` +
          `• \`!voice join [channelId]\`: Connect Ash to voice channel\n` +
          `• \`!voice leave\`: Disconnect from voice channel\n` +
          `• \`!voice speak <text>\`: Synthesize and speak text live in voice\n` +
          `• \`!voice listen [on|off]\`: Toggle listening to speech in voice and responding aloud 👂\n` +
          `• \`!voice autoread [on|off]\`: Toggle reading text chat aloud in voice\n` +
          `• \`!voice talkback [on|off]\`: Toggle speaking Ash's AI replies aloud\n` +
          `• \`!voice autojoin [on|off]\`: Toggle auto-joining user voice channels\n` +
          `• \`!voice autotalk [on|off]\`: Toggle continuous chat in this channel\n` +
          `• \`!voice clear\`: Clear pending speech queue\n` +
          `• \`!voice status\`: Check WebRTC connection and player status`
        );
        return;
      }

      const act = subAction.toLowerCase();
      if (act === "status") {
        const st = voiceManager.getStatus(message.guildId);
        await message.reply(
          `🎙️ **Voice Status**: ${st.connected ? "Connected 🟢" : "Disconnected ⚪"}\n` +
          `• **Connection**: \`${st.state}\`\n` +
          `• **Voice Ear (Listening)**: ${st.listening ? "🟢 Active (Transcribing & Conversing) 👂" : "⚪ Disabled"}\n` +
          `• **Auto-Read Text**: ${st.autoRead ? "🟢 Active" : "⚪ Disabled"}\n` +
          `• **Talk-Back Speech**: ${st.talkBack ? "🟢 Active" : "⚪ Disabled"}\n` +
          `• **Auto-Join**: ${st.autoJoin ? "🟢 Active" : "⚪ Disabled"}\n` +
          `• **Queue Length**: \`${st.queueLength || 0}\` utterances\n` +
          `• **Player**: \`${st.playerState}\``
        );
        return;
      }

      if (act === "listen" || act === "ear") {
        const toggle = voiceParam.toLowerCase();
        if (toggle === "on" || toggle === "true" || toggle === "1") {
          voiceManager.setVoiceListen(message.guildId, true);
          await message.reply("👂 **Voice Ear Enabled**: Ash is now listening to speech in the voice channel and will respond aloud.");
          return;
        }
        if (toggle === "off" || toggle === "false" || toggle === "0") {
          voiceManager.setVoiceListen(message.guildId, false);
          await message.reply("🔇 **Voice Ear Disabled**: Ash will not transcribe or respond to incoming voice audio.");
          return;
        }
        const isListenOn = voiceManager.isVoiceListenEnabled(message.guildId);
        await message.reply(`👂 **Voice Ear (Listening)**: ${isListenOn ? "🟢 Enabled" : "⚪ Disabled"} (Usage: \`!voice listen on|off\`)`);
        return;
      }

      if (act === "clear") {
        voiceManager.clearQueue(message.guildId);
        await message.reply("⏹️ **Voice speech queue cleared.**");
        return;
      }

      if (act === "autoread") {
        const toggle = voiceParam.toLowerCase();
        if (toggle === "on" || toggle === "true" || toggle === "1") {
          voiceManager.setAutoRead(message.guildId, true, message.channelId);
          await message.reply("🎙️ **Voice Auto-Read Enabled**: Ash will read incoming chat messages aloud when connected to voice.");
          return;
        }
        if (toggle === "off" || toggle === "false" || toggle === "0") {
          voiceManager.setAutoRead(message.guildId, false);
          await message.reply("🔇 **Voice Auto-Read Disabled**: Incoming chat messages will not be read aloud.");
          return;
        }
        const isReadOn = voiceManager.isAutoReadEnabled(message.guildId, message.channelId);
        await message.reply(`🎙️ **Voice Auto-Read**: ${isReadOn ? "🟢 Enabled" : "⚪ Disabled"} (Usage: \`!voice autoread on|off\`)`);
        return;
      }

      if (act === "talkback") {
        const toggle = voiceParam.toLowerCase();
        if (toggle === "on" || toggle === "true" || toggle === "1") {
          voiceManager.setVoiceTalkBack(message.guildId, true);
          await message.reply("🗣️ **Voice Talk-Back Enabled**: Ash will speak her AI responses out loud in voice.");
          return;
        }
        if (toggle === "off" || toggle === "false" || toggle === "0") {
          voiceManager.setVoiceTalkBack(message.guildId, false);
          await message.reply("🔇 **Voice Talk-Back Disabled**: Ash's responses will remain text-only.");
          return;
        }
        const isTalkOn = voiceManager.isVoiceTalkBackEnabled(message.guildId);
        await message.reply(`🗣️ **Voice Talk-Back**: ${isTalkOn ? "🟢 Enabled" : "⚪ Disabled"} (Usage: \`!voice talkback on|off\`)`);
        return;
      }

      if (act === "autojoin") {
        const toggle = voiceParam.toLowerCase();
        if (toggle === "on" || toggle === "true" || toggle === "1") {
          voiceManager.setAutoJoin(message.guildId, true);
          await message.reply("🔌 **Voice Auto-Join Enabled**: Ash will automatically join voice channels when members connect.");
          return;
        }
        if (toggle === "off" || toggle === "false" || toggle === "0") {
          voiceManager.setAutoJoin(message.guildId, false);
          await message.reply("⚪ **Voice Auto-Join Disabled**: Ash will only join voice when explicitly summoned.");
          return;
        }
        const isJoinOn = voiceManager.isAutoJoinEnabled(message.guildId);
        await message.reply(`🔌 **Voice Auto-Join**: ${isJoinOn ? "🟢 Enabled" : "⚪ Disabled"} (Usage: \`!voice autojoin on|off\`)`);
        return;
      }

      if (act === "autotalk") {
        const toggle = voiceParam.toLowerCase();
        if (toggle === "on" || toggle === "true" || toggle === "1") {
          autoTalkChannels.add(message.channelId);
          await message.reply(`🟢 **Auto-Talk Enabled**: Ash will now continuously participate in <#${message.channelId}> without requiring \`@Ash\` mentions.`);
          return;
        }
        if (toggle === "off" || toggle === "false" || toggle === "0") {
          autoTalkChannels.delete(message.channelId);
          await message.reply(`⚪ **Auto-Talk Disabled**: \`@Ash\` mention or reply is now required to speak with Ash in <#${message.channelId}>.`);
          return;
        }
        const isChanOn = autoTalkChannels.has(message.channelId);
        await message.reply(`💬 **Auto-Talk**: ${isChanOn ? "🟢 Enabled" : "⚪ Disabled"} in <#${message.channelId}> (Usage: \`!voice autotalk on|off\`)`);
        return;
      }

      if (act === "join") {
        let chan = null;
        if (voiceParam) {
          try { chan = await client.channels.fetch(voiceParam); } catch {}
        }
        if (!chan) {
          chan = message.member?.voice?.channel;
        }
        if (!chan) {
          await message.reply("⚠️ Please join a voice channel first or specify a valid voice channel ID: `!voice join <channelId>`");
          return;
        }

        try {
          await voiceManager.join(chan);
          await message.reply(`🎙️ **Joined Voice Channel**: <#${chan.id}>`);
        } catch (vErr) {
          await message.reply(`⚠️ **Failed to join voice channel**: ${vErr.message}`);
        }
        return;
      }

      if (act === "leave") {
        voiceManager.leave(message.guildId);
        await message.reply("🔇 **Disconnected from voice channel.**");
        return;
      }

      if (act === "speak") {
        if (!voiceParam) {
          await message.reply("⚠️ **Usage**: `!voice speak <text to speak>`");
          return;
        }
        const st = voiceManager.getStatus(message.guildId);
        if (!st.connected) {
          const userVoice = message.member?.voice?.channel;
          if (userVoice) {
            try { await voiceManager.join(userVoice); } catch {}
          } else {
            await message.reply("⚠️ Ash is not connected to a voice channel. Use `!voice join` first.");
            return;
          }
        }
        try {
          await voiceManager.speakText(message.guildId, voiceParam);
          await message.reply(`🗣️ **Speaking in voice**: "${voiceParam}"`);
        } catch (sErr) {
          await message.reply(`⚠️ **Speech synthesis error**: ${sErr.message}`);
        }
        return;
      }
    }

    // ─── YouTube Music Personal Account Commands ─────────────────────────────
    if (handleYtMusicCommand) {
      try {
        const handled = await handleYtMusicCommand(message, cleanText, { authorContext, isAdmin });
        if (handled) return;
      } catch (ytmErr) {
        console.error(`[YouTube Music Error] ${ytmErr.message}`);
        await message.reply(`⚠️ **YouTube Music Error**: ${ytmErr.message}`);
        return;
      }
    }

    // ─── HMB Memory Bank Commands ───────────────────────────────────────────
    if (commandLower === "!hmb" || commandLower === "!memory" || commandLower === "hmb" || commandLower === "memory") {
      const count = hmb.getMemoryCount();
      const stats = hmb.getCategoryStats();

      await message.reply(
        `🏛️ **Haven Memory Bank (HMB 64-Bit Vault)**\n` +
        `• **Status**: ${config.enableHmb ? "Active ⚡" : "Disabled"}\n` +
        `• **Total Anchors**: \`${count}\`\n` +
        `• **Category Partitions**:\n` +
        `  👑 **CORE_IDENTITY**: \`${stats.CORE_IDENTITY}\` (Immutable identity & foundational bonds)\n` +
        `  📜 **EPISODIC**: \`${stats.EPISODIC}\` (Milestones, interactions & events)\n` +
        `  📚 **SEMANTIC**: \`${stats.SEMANTIC}\` (Knowledge base, technical specs & lore)\n` +
        `  💖 **EMOTIONAL**: \`${stats.EMOTIONAL}\` (Sentiments, preferences & resonance)\n` +
        `• **Vault File**: \`${config.hmbVaultPath}\`\n` +
        `• **Commands**:\n` +
        `  - \`!remember [category] <concept> | <content>\` (e.g. \`!remember SEMANTIC | FFmpeg Spec | 4K ProRes\`)\n` +
        `  - \`!recall [category] <query>\` (e.g. \`!recall [SEMANTIC] master stems\`)`
      );
      return;
    }

    if (commandLower.startsWith("!remember ") || commandLower.startsWith("remember ")) {
      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only authorized administrators can commit anchors to the HMB vault.");
        return;
      }

      const raw = cleanText.replace(/^!?remember\s+/i, "").trim();
      const { category, concept, content } = parseMemoryTag(raw);

      if (!concept) {
        await message.reply("⚠️ **Usage**: `!remember [category] <concept> | <content>` (e.g. `!remember SEMANTIC | Server Lore | Shane founded Gaming2Gamers`)");
        return;
      }

      const anchor = hmb.addMemory({
        concept_name: concept,
        text_content: content,
        category,
        weight: category === "CORE_IDENTITY" ? 1.0 : category === "SEMANTIC" ? 0.95 : 0.90,
        emotional_salience: category === "EMOTIONAL" ? 1.0 : 0.95
      });
      hmb.saveToHmb(config.hmbVaultPath);

      await message.reply(
        `🧠 **Memory Anchor Committed to 64-Bit Vault**:\n` +
        `• **Partition**: \`[${anchor.category}]\`\n` +
        `• **Concept**: \`${anchor.concept_name}\`\n` +
        `• **Content**: ${anchor.text_content}\n` +
        `• **ID**: \`#${anchor.id}\` | **Salience**: \`${anchor.weight.toFixed(2)}\` | **Total Anchors**: \`${hmb.getMemoryCount()}\``
      );
      return;
    }

    if (commandLower.startsWith("!recall ") || commandLower.startsWith("recall ")) {
      const rawQuery = cleanText.replace(/^!?recall\s+/i, "").trim();
      if (!rawQuery) {
        await message.reply("⚠️ **Usage**: `!recall [category] <query>` (e.g. `!recall [SEMANTIC] temporal cortex`)");
        return;
      }

      let targetCategory = null;
      let searchQuery = rawQuery;

      const catBracketMatch = rawQuery.match(/^\[([A-Za-z_]+)\]\s*(.*)$/);
      const catFlagMatch = rawQuery.match(/^--category=([A-Za-z_]+)\s*(.*)$/i);
      const catPipeMatch = rawQuery.match(/^([A-Za-z_]+)\s*\|\s*(.*)$/);

      if (catBracketMatch) {
        targetCategory = normalizeHmbCategory(catBracketMatch[1]);
        searchQuery = catBracketMatch[2].trim() || targetCategory;
      } else if (catFlagMatch) {
        targetCategory = normalizeHmbCategory(catFlagMatch[1]);
        searchQuery = catFlagMatch[2].trim() || targetCategory;
      } else if (catPipeMatch && ["CORE_IDENTITY", "EPISODIC", "SEMANTIC", "EMOTIONAL"].includes(catPipeMatch[1].trim().toUpperCase())) {
        targetCategory = normalizeHmbCategory(catPipeMatch[1]);
        searchQuery = catPipeMatch[2].trim() || targetCategory;
      }

      const results = hmb.searchTopK(searchQuery, 3, 0.10, { category: targetCategory });
      if (results.length === 0) {
        await message.reply(`🔍 **No matching memory anchors found**${targetCategory ? ` in \`[${targetCategory}]\`` : ""} for: *"${searchQuery}"*`);
        return;
      }

      let reply = `🔍 **HMB Semantic Recall${targetCategory ? ` [${targetCategory}]` : ""} for**: *"${searchQuery}"*\n`;
      for (const res of results) {
        reply += `• **[${res.anchor.category}] ${res.anchor.concept_name}** (Score: \`${res.score.toFixed(3)}\`)\n  _${res.anchor.text_content}_\n`;
      }
      await message.reply(reply);
      return;
    }

    // ─── Dynamic Rich Presence In-Chat Commands ─────────────────────────────
    if (commandLower.startsWith("!status") || commandLower.startsWith("!presence") || commandLower === "status" || commandLower === "presence") {
      const statusArg = cleanText.replace(/^!?(?:status|presence)\s*/i, "").trim();
      if (!statusArg || statusArg.toLowerCase() === "info") {
        const cur = presenceManager.getPresence();
        await message.reply(
          `🎭 **Ash Discord Presence Status**:\n` +
          `• **Activity**: "${cur.activity}"\n` +
          `• **Status**: \`${cur.status}\` (online / idle / dnd / invisible)\n` +
          `• **Type**: \`${cur.type}\`\n` +
          `• **Baseline**: "${cur.baseline?.activity}" [\`${cur.baseline?.status}\`]\n` +
          `• **Usage**: \`!status dnd\`, \`!status away\`, \`!status <activity text>\`, \`!status <activity> | <status> | <type>\`, or \`!status reset\``
        );
        return;
      }

      if (statusArg.toLowerCase() === "reset" || statusArg.toLowerCase() === "default") {
        presenceManager.resetToDefault();
        await message.reply(`🔄 **Presence Reset**: Restored sovereign default presence ("${presenceManager.defaultActivity}").`);
        return;
      }

      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only administrators can set custom bot presence.");
        return;
      }

      const { statusDirective } = presenceManager.extractStatusTags(`[STATUS: ${statusArg}]`);
      if (statusDirective) {
        presenceManager.setPresence(statusDirective.activity, statusDirective.status, statusDirective.type);
        await message.reply(`🎭 **Ash Discord Presence Updated**: "${statusDirective.activity}" (\`${statusDirective.status}\` // \`${statusDirective.type}\`)`);
      } else {
        presenceManager.setPresence(statusArg, "online", "playing");
        await message.reply(`🎭 **Ash Discord Presence Updated**: "${statusArg}" (\`online\`)`);
      }
      return;
    }

    // ─── Custom Emojis & Stickers Server Culture Introspection ────────────────
    if (commandLower === "!emojis" || commandLower === "!emoji" || commandLower === "emojis") {
      const emojiList = reactionEngine.getGuildEmojiList(message.guild);
      if (emojiList.length === 0) {
        await message.reply("ℹ️ No custom emojis found in this server.");
        return;
      }
      const preview = emojiList.slice(0, 50).map(e => `${e.formatted} \`:${e.name}:\``).join(" ");
      const countNotice = emojiList.length > 50 ? `\n*(Showing 50 of ${emojiList.length} total custom emojis)*` : "";
      await message.reply(`🎨 **Server Custom Emojis** (${emojiList.length} available):\n${preview}${countNotice}`);
      return;
    }

    if (commandLower === "!stickers" || commandLower === "!sticker" || commandLower === "stickers") {
      const stickerList = reactionEngine.getGuildStickerList(message.guild);
      if (stickerList.length === 0) {
        await message.reply("ℹ️ No custom stickers found in this server.");
        return;
      }
      const list = stickerList.map(s => `• **${s.name}** (ID: \`${s.id}\`)${s.description ? ` - _${s.description}_` : ""}`).join("\n");
      await message.reply(`🏷️ **Server Custom Stickers** (${stickerList.length} available):\n${list}`);
      return;
    }

    // ─── Autonomous Image Generation & Routing In-Chat Command ──────────────
    if (commandLower === "!image" || commandLower === "!imagine" || commandLower.startsWith("!image ") || commandLower.startsWith("!imagine ") || commandLower.startsWith("imagine ")) {
      const rawArg = cleanText.replace(/^!?(?:image|imagine)\s*/i, "").trim();

      // Subcommand: !image status / !image engines
      if (!rawArg || rawArg.toLowerCase() === "status" || rawArg.toLowerCase() === "engines" || rawArg.toLowerCase() === "help") {
        const engineInfo = imageGenerator.getEngineStatus();
        const sdStatus = engineInfo.engines.sd.available
          ? `🟢 **Ready** (\`${engineInfo.engines.sd.modelName}\` // TAESD: ${engineInfo.engines.sd.taesdAvailable ? "Active ⚡" : "Inactive"})`
          : "🔴 **Unavailable**";
        const googleStatus = engineInfo.engines.google.available
          ? `🟢 **Ready** (\`${engineInfo.engines.google.model}\`)`
          : "🟡 **Unconfigured** (Routes to SD)";

        await message.reply(
          `🖼️ **Autonomous Image Generation & Policy Router**\n` +
          `• **Routing Policy**: \`${engineInfo.defaultEngine.toUpperCase()}\` *(Google Nano Banana ➔ Stable Diffusion LCM Failover)*\n` +
          `• **Stable Diffusion (Local CPP)**: ${sdStatus}\n` +
          `• **Google Nano Banana (Cloud)**: ${googleStatus}\n\n` +
          `**Usage Commands**:\n` +
          `• \`!image <prompt>\` — Auto-routes (tries Google, falls back to SD on policy/content refusal)\n` +
          `• \`!image sd <prompt>\` — Force local Stable Diffusion (DreamShaper8 LCM)\n` +
          `• \`!image google <prompt>\` — Force Google Nano Banana / Imagen\n` +
          `• \`!image card <prompt>\` — Generate SVG/FFmpeg concept card`
        );
        return;
      }

      // Determine target engine if prefixed
      let targetEngine = "auto";
      let promptArg = rawArg;
      if (/^(?:sd|local|diffusion)\s+/i.test(promptArg)) {
        targetEngine = "sd";
        promptArg = promptArg.replace(/^(?:sd|local|diffusion)\s+/i, "").trim();
      } else if (/^(?:google|banana|imagen)\s+/i.test(promptArg)) {
        targetEngine = "google";
        promptArg = promptArg.replace(/^(?:google|banana|imagen)\s+/i, "").trim();
      } else if (/^(?:card|svg)\s+/i.test(promptArg)) {
        targetEngine = "card";
        promptArg = promptArg.replace(/^(?:card|svg)\s+/i, "").trim();
      }

      if (!promptArg) {
        await message.reply("⚠️ Please provide a prompt after the engine prefix. (e.g. `!image sd Cyberpunk city with glowing neon towers`)");
        return;
      }

      const waitText = targetEngine === "sd"
        ? "*Synthesizing with Stable Diffusion LCM (local hardware)... ⚡🎨*"
        : targetEngine === "google"
          ? "*Synthesizing with Google Nano Banana... 🍌✨*"
          : "*Synthesizing visual (Auto-Routing: Google ➔ SD Fallback)... 🎨✨*";

      const waitMsg = await message.reply(waitText);
      try {
        const genResult = await imageGenerator.generateImage(promptArg, { engine: targetEngine, style: "cyberpunk" });
        let engineBadge = genResult.engine === "sd"
          ? "Stable Diffusion [DreamShaper8 LCM] ⚡"
          : genResult.engine === "google"
            ? "Google Nano Banana 🍌"
            : "Visual Card Synthesizer 🎨";

        if (genResult.routedFrom) {
          engineBadge += ` *(Auto-routed from ${genResult.routedFrom} due to safety/policy block)*`;
        }

        await waitMsg.edit({
          content: `🎨 **Visual Synthesized**: \`${genResult.filename}\`\n> Engine: **${engineBadge}**\n> Prompt: *"${promptArg}"*`,
          files: [genResult.imagePath]
        });
      } catch (err) {
        await waitMsg.edit(`⚠️ **Image Generation Error**: ${err.message}`);
      }
      return;
    }

    // 6. Queue turn execution to prevent concurrent SQLite locks
    turnQueue = turnQueue.then(async () => {
      try {
        await message.channel.sendTyping();
      } catch {}

      // A. Inbound Media Processing (Images, GIFs, Tenor, Attachments)
      let inboundMediaRecords = [];
      try {
        inboundMediaRecords = await mediaPipeline.processInboundMedia(message);
      } catch (mediaErr) {
        console.warn(`[Media Pipeline] Inbound processing warning: ${mediaErr.message}`);
      }

      const mediaContext = mediaPipeline.formatPromptInjection(inboundMediaRecords);

      let cleanPromptText = cleanText;
      if (!cleanPromptText.trim()) {
        if (inboundMediaRecords.length > 0) {
          cleanPromptText = inboundMediaRecords.some(m => m.kind === "gif")
            ? "React to and analyze this GIF."
            : "Inspect and describe this attached image.";
        } else if (isMentioned || isReplyToBot || hasNicknamePrefix) {
          cleanPromptText = "Hello!";
        } else {
          return;
        }
      }

      // Check for Thread Command or Swarm / Heavy Operation Keywords
      let targetChannel = message.channel;
      const isThreadCommand = /^(?:!thread\b|thread:)/i.test(cleanPromptText);
      const hasSwarmKeywords = (config.enableAutoThreads !== false) &&
        /\b(swarm|agent swarm|run diagnostic|full audit|deep audit|benchmark run|heavy run|in a thread|into a thread)\b/i.test(cleanPromptText);

      if ((isThreadCommand || hasSwarmKeywords) && !isDM && !message.channel.isThread() && typeof message.startThread === "function") {
        try {
          if (isThreadCommand) {
            cleanPromptText = cleanPromptText.replace(/^(?:!thread\s*|thread:\s*)/i, "").trim();
            if (!cleanPromptText) cleanPromptText = "Run task diagnostics and execution.";
          }
          const threadTitle = `🧵 ${cleanPromptText.slice(0, 45).replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Agent Swarm Run"}`;
          const spawnedThread = await message.startThread({
            name: threadTitle,
            autoArchiveDuration: 60,
            reason: `AG2 Swarm Thread spawned by ${authorName}`
          });
          targetChannel = spawnedThread;
          await message.react("🧵").catch(() => {});
        } catch (tErr) {
          console.warn(`[AutoThread] Could not spawn thread: ${tErr.message}`);
        }
      }

      const isThread = Boolean(targetChannel.isThread?.() || targetChannel.id !== message.channelId);
      const stopComponents = [createStopButton(message.channelId)];
      let replyMessage = null;
      try {
        const placeholder = inboundMediaRecords.length > 0
          ? "*Inspecting media & thinking... 🎨✨*"
          : isThread
            ? "*Dedicated execution thread active. Running task... 🧵✨*"
            : "*Thinking... ✨*";

        replyMessage = isThread
          ? await targetChannel.send({ content: placeholder, components: stopComponents })
          : await message.reply({ content: placeholder, components: stopComponents });
      } catch (err) {
        console.error(`[Discord] Failed to send reply placeholder: ${err.message}`);
        return;
      }

      let buffer = "";
      let lastEditTime = Date.now();

      try {
        let promptToSend = cleanPromptText;
        if (config.enableHmb) {
          const memoryContext = hmb.buildContextInjection(cleanPromptText, config.hmbTopK);
          if (memoryContext) {
            promptToSend = `${memoryContext}${cleanPromptText}`;
          }
          hmb.pushTurn("user", authorContext.memoryAuthorTag, cleanPromptText);
        }

        if (mediaContext) {
          promptToSend = `${promptToSend}${mediaContext}`;
        }

        // Live YouTube Music Account & Library Context Injection for Admin (Daniel)
        if (authorContext.isAdmin && /(music|song|listening|played|history|track|queue|playing|heard|playlist|playlists|liked|favorite|taste|artist|album|band|youtube\s*music|ytm)/i.test(cleanPromptText)) {
          const ytmContext = await getEnrichedYtMusicContext(authorContext.displayName, cleanPromptText);
          if (ytmContext) {
            promptToSend = `${ytmContext}\n\n${promptToSend}`;
          }
        }

        let typingInterval = null;
        try {
          await targetChannel.sendTyping().catch(() => {});
          typingInterval = setInterval(() => {
            targetChannel.sendTyping().catch(() => {});
          }, 8000);

          let lastPresenceTime = 0;
          const turnOptions = {
            channelId: message.channelId,
            isThread,
            threadId: targetChannel.id,
            isAdmin: authorContext.isAdmin,
            onProgress: (readableStatus, toolName, toolCount) => {
              const now = Date.now();
              if (now - lastPresenceTime >= 4000) {
                const presenceText = readableStatus || `Running ${toolName}`;
                presenceManager.setWorkingProgress(presenceText, "online", "playing");
                lastPresenceTime = now;
              }

              if (!buffer.trim()) {
                if (now - lastEditTime >= config.throttleMs) {
                  const icon = isThread ? "🧵⚙️" : "⚙️✨";
                  const prefix = isThread ? "*Dedicated thread active:" : "*Ash is working:";
                  const statusText = `${prefix} ${readableStatus || `Running \`${toolName}\` (#${toolCount})`} ${icon}*`;
                  replyMessage.edit({ content: statusText, components: stopComponents }).catch(() => {});
                  lastEditTime = now;
                }
              }
            }
          };

          for await (const delta of agy.runTurn(promptToSend, authorContext, turnOptions)) {
            buffer += delta;

            const now = Date.now();
            if (now - lastEditTime >= config.throttleMs) {
              const maxStreamLen = config.maxChunkLength || 1950;
              const textToDisplay = buffer.length > maxStreamLen
                ? buffer.slice(0, maxStreamLen) + " …"
                : buffer;
              try {
                await replyMessage.edit({ content: textToDisplay, components: stopComponents });
                lastEditTime = now;
              } catch {}
            }
          }
        } finally {
          if (typingInterval) clearInterval(typingInterval);
          presenceManager.restoreBaseline();
        }

        // Check for explicit silence / pass directive
        const silenceRegex = /\[(?:SILENT|NO_REPLY|PASS|SHH|IGNORE)\]/i;
        if (silenceRegex.test(buffer)) {
          // Still extract and apply any requested expressive reactions
          const { reactions } = reactionEngine.extractReactionTags(buffer);
          for (const rx of reactions) {
            await reactionEngine.reactToMessage(message, rx);
          }
          // Cleanly dissolve the working placeholder
          await replyMessage.delete().catch(() => {});
          return;
        }

        // Final message edit flush with Outbound Media Attachment, Mermaid Diagrams & Interactive Components
        if (buffer.trim()) {
          // Extract inline [STATUS: ...] or [ACTIVITY: ...] directives
          const { cleanText: textWithoutStatus, statusDirective } = presenceManager.extractStatusTags(buffer);
          if (statusDirective) {
            presenceManager.setPresence(statusDirective.activity, statusDirective.status, statusDirective.type);
          }

          // Process inline [REMEMBER: ...] or [MEMORY: ...] tags (supports 2-part and 3-part categorized syntax)
          const memoryTagRegex = /\[(?:REMEMBER|MEMORY):\s*([^\]]+)\]/gi;
          let memMatch;
          while ((memMatch = memoryTagRegex.exec(textWithoutStatus)) !== null) {
            const tagBody = memMatch[1].trim();
            const { category, concept, content } = parseMemoryTag(tagBody);
            if (concept && content && config.enableHmb) {
              const anchor = hmb.addMemory({
                concept_name: concept,
                text_content: content,
                category,
                weight: category === "CORE_IDENTITY" ? 1.0 : category === "SEMANTIC" ? 0.95 : 0.90,
                emotional_salience: category === "EMOTIONAL" ? 1.0 : 0.95
              });
              hmb.saveToHmb(config.hmbVaultPath);
              console.log(`[HMB Auto-Commit] Anchor #${anchor.id} [${category}] saved mid-turn: "${concept}"`);
            }
          }
          const textWithoutMemoryTags = textWithoutStatus.replace(memoryTagRegex, (fullMatch, tagBodyRaw) => {
            const { category, concept } = parseMemoryTag(tagBodyRaw);
            return `\n🧠 *(Anchor committed to [${category}]: \`${concept.trim()}\`)*`;
          });

          // Autonomous Image Generation & Visual Attachment Directives
          let textAfterImages = textWithoutMemoryTags;
          const generatedImageFiles = [];
          try {
            const { cleanText: textCleanedImg, directives: imgDirectives, filePaths: explicitImgPaths } = imageGenerator.extractImageDirectives(textAfterImages);
            textAfterImages = textCleanedImg;
            for (const p of explicitImgPaths) {
              if (!generatedImageFiles.includes(p)) generatedImageFiles.push(p);
            }
            for (const d of imgDirectives) {
              try {
                const genRes = await imageGenerator.generateImage(d.prompt, {
                  style: d.style,
                  engine: d.engine,
                  width: d.width,
                  height: d.height
                });
                if (genRes?.imagePath && !generatedImageFiles.includes(genRes.imagePath)) {
                  generatedImageFiles.push(genRes.imagePath);
                  const engineNote = genRes.routedFrom
                    ? ` (Engine: ${genRes.engine.toUpperCase()} ⚡ failover from ${genRes.routedFrom})`
                    : ` (Engine: ${genRes.engine.toUpperCase()})`;
                  textAfterImages += `\n🖼️ *(Visual generated: \`${genRes.filename}\`${engineNote})*`;
                }
              } catch (imgErr) {
                console.warn(`[ImageGenerator] Mid-turn generation error: ${imgErr.message}`);
              }
            }
          } catch (imgParseErr) {
            console.warn(`[ImageGenerator] Parsing error: ${imgParseErr.message}`);
          }

          // Autonomous Audio Generation Directives ([AUDIO: ...], [MUSIC: ...], [SFX: ...], [HEARTBEAT: ...])
          let textAfterAudio = textAfterImages;
          const generatedAudioFiles = [];
          try {
            const { cleanText: textCleanedAudio, directives: audioDirectives } = audioGenerator.extractAudioDirectives(textAfterAudio);
            textAfterAudio = textCleanedAudio;
            for (const d of audioDirectives) {
              try {
                const audioRes = await audioGenerator.generateAudio(d.prompt, { duration: d.duration });
                if (audioRes?.audioPath && !generatedAudioFiles.includes(audioRes.audioPath)) {
                  generatedAudioFiles.push(audioRes.audioPath);
                }
              } catch (audErr) {
                console.warn(`[AudioGenerator] Mid-turn generation error: ${audErr.message}`);
              }
            }
          } catch (audParseErr) {
            console.warn(`[AudioGenerator] Parsing error: ${audParseErr.message}`);
          }

          // Mermaid Diagram Detection & Dark PNG Rendering
          let textAfterDiagrams = textAfterAudio;
          let diagramFiles = [];
          try {
            const diagRes = await diagramRenderer.processMermaidDiagrams(textAfterDiagrams);
            textAfterDiagrams = diagRes.cleanText;
            diagramFiles = diagRes.diagramFiles || [];
          } catch (diagErr) {
            console.warn(`[DiagramRenderer] Notice: ${diagErr.message}`);
          }

          const { cleanText: textCleanedReactions, reactions } = reactionEngine.extractReactionTags(textAfterDiagrams);

          // Discord Sticker Extraction
          const { cleanText: textWithoutStickers, stickerIds } = reactionEngine.extractStickers(textCleanedReactions, message.guild);

          // Custom Emojis Resolution (:name: -> <:name:id> or <a:name:id>)
          const finalContent = reactionEngine.resolveCustomEmojis(textWithoutStickers, message.guild);

          // Apply parsed or autonomous reactions to the user's message
          for (const rx of reactions) {
            await reactionEngine.reactToMessage(message, rx);
          }
          if (reactions.length === 0) {
            await reactionEngine.autoReact(message, cleanText);
          }

          if (config.enableHmb) {
            hmb.pushTurn("assistant", client.user.username, finalContent);
          }

          const { cleanText: finalClean, filesToAttach } = mediaPipeline.extractOutgoingMedia(finalContent);
          const allFilesToAttach = [...filesToAttach, ...diagramFiles, ...generatedImageFiles, ...generatedAudioFiles];
          const interactiveComponents = [createInteractiveButtons()];
          const maxChunkLength = config.maxChunkLength || 1950;
          const chunks = splitDiscordMessage(finalClean, maxChunkLength);

          if (chunks.length === 0) {
            await replyMessage.edit({
              content: "✅ **Done!** Task completed successfully.",
              components: interactiveComponents
            });
          } else {
            const firstChunk = chunks[0];
            const hasMultipleChunks = chunks.length > 1;
            const firstContent = hasMultipleChunks ? `${firstChunk}\n\n*(Part 1/${chunks.length})*` : firstChunk;

            if (allFilesToAttach.length > 0) {
              await replyMessage.edit({
                content: firstContent,
                files: hasMultipleChunks ? [] : allFilesToAttach,
                components: hasMultipleChunks ? [] : interactiveComponents
              });
              await replyMessage.react("🎨").catch(() => {});
            } else {
              await replyMessage.edit({
                content: firstContent,
                components: hasMultipleChunks ? [] : interactiveComponents
              });
              await replyMessage.react("✨").catch(() => {});
            }

            for (let i = 1; i < chunks.length; i++) {
              const isLast = (i === chunks.length - 1);
              const chunkContent = `${chunks[i]}\n\n*(Part ${i + 1}/${chunks.length})*`;
              await targetChannel.send({
                content: chunkContent,
                files: (isLast && allFilesToAttach.length > 0) ? allFilesToAttach : [],
                components: isLast ? interactiveComponents : []
              });
            }

            // Send native Discord stickers if extracted
            if (stickerIds.length > 0 && typeof targetChannel.send === "function") {
              try {
                await targetChannel.send({ stickers: stickerIds });
              } catch (stkErr) {
                console.warn(`[Sticker Egress] Notice: ${stkErr.message}`);
              }
            }

            // ─── Voice Talk-Back: Synthesize and speak Ash's reply aloud in voice channel ───
            if (message.guildId && voiceManager.getStatus(message.guildId).connected && voiceManager.isVoiceTalkBackEnabled(message.guildId)) {
              const spokenReply = cleanTextForSpeech(finalClean, config.voiceTalkBackMaxChars);
              if (spokenReply) {
                voiceManager.speakText(message.guildId, spokenReply, {
                  voice: config.ollamaVoiceName || "Harper"
                }).catch(vErr => {
                  console.warn(`[Voice TalkBack] Notice: ${vErr.message}`);
                });
              }
            }
          }
        } else {
          await replyMessage.edit({
            content: "✅ **Done!** Task completed successfully.",
            components: [createInteractiveButtons()]
          });
        }
      } catch (err) {
        console.error(`[AG2 Gateway Error] ${err.message}`);
        try {
          await replyMessage.edit({
            content: `⚠️ **[AG2 Session Error]**: ${err.message}`,
            components: [createInteractiveButtons()]
          });
          await replyMessage.react("⚠️").catch(() => {});
        } catch {}
      }
    }).catch(err => {
      console.error(`[Turn Queue Error] ${err.message}`);
    });
  });

  return client;
}
