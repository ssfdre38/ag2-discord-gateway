import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType
} from "discord.js";
import fs from "fs";
import { config } from "./config.js";
import { AgySessionManager } from "./agy-session.js";
import { HmbMemoryEngine } from "./hmb-memory.js";
import { createHttpActuationServer } from "./http-server.js";
import { getMediaPipeline } from "./media-pipeline.js";
import { getVoiceManager } from "./voice-manager.js";
import { getReactionEngine } from "./reaction-engine.js";
import {
  createInteractiveButtons,
  registerSlashCommands,
  handleInteraction
} from "./interactions.js";
import { splitDiscordMessage } from "./text-chunker.js";

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
  const voiceManager = getVoiceManager({ speechBinPath: config.speechBinPath });
  const reactionEngine = getReactionEngine(client, {
    enableAutonomousReactions: config.enableAutonomousReactions
  });

  let turnQueue = Promise.resolve();
  const lastChimeByChannel = new Map(); // channelId -> timestamp

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
          reactionEngine
        );
        httpServer.listen(config.httpPort, config.httpHost, () => {
          // Listening locally
        });
      } catch (err) {
        console.error(`[Actuation Server Error] ${err.message}`);
      }
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
    console.log(`║  Voice WebRTC  : ${config.enableVoice ? "Active (Speech Synthesis & Playback) 🎙️" : "Disabled"}`);
    console.log(`║  Reactions     : ${config.enableAutonomousReactions ? "Active (Expressive Sentiment & Actuation) 🎭" : "Disabled"}`);
    console.log(`║  Ambient Listen: Active (Cooldown: ${(config.ambientCooldownMs / 1000).toFixed(0)}s, Min Salience: ${config.ambientMinSalience}) 💬`);
    console.log(`║  Media Pipeline: Active (Images, GIFs, Tenor, ffmpeg keyframes) ║`);
    console.log(`║  Actuation API : ${config.enableHttpApi ? `Active (http://${config.httpHost}:${config.httpPort})` : "Disabled"}`);
    console.log(`║  Admin Users   : ${config.adminUsers.length ? config.adminUsers.join(", ") : "All Users (Open)"}`);
    console.log(`║  Safe Mode     : ${config.safeMode ? "Enabled (Non-admins sandboxed)" : "Disabled"}`);
    console.log(`║  Require @     : ${config.requireMention ? "Enabled (@Mention, Reply, or DM)" : "Disabled"}`);
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    client.user.setPresence({
      activities: [{ name: "with AG2 🚀", type: ActivityType.Playing }],
      status: "online"
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
      config
    });
  });

  // ─── Inbound Message Pipeline ───────────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    // 1. Ignore bot messages
    if (message.author.bot) return;

    const isDM = message.channel.isDMBased();

    // 2. Filter allowed channels if configured
    if (!isDM && config.allowedChannels.length > 0) {
      if (!config.allowedChannels.includes(message.channelId)) return;
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

    const contentLower = message.content.trim().toLowerCase();
    const hasNicknamePrefix = config.nicknames.some(nick =>
      contentLower.startsWith(`${nick} `) ||
      contentLower.startsWith(`${nick},`) ||
      contentLower.startsWith(`${nick}:`)
    );

    const isExplicitInvocation = isDM || isMentioned || isReplyToBot || hasNicknamePrefix;
    const authorName = message.member?.displayName || message.author.displayName || message.author.username;

    // 4. Clean prompt text
    let cleanText = message.content;
    cleanText = cleanText.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();

    for (const nick of config.nicknames) {
      const nickRegex = new RegExp(`^${nick}[,:\\s]+`, "i");
      cleanText = cleanText.replace(nickRegex, "").trim();
    }

    // ─── Proactive Ambient Listener ("Ash Chimes In") ────────────────────────
    const isAmbientChannel = !isDM && config.ambientChannels.includes(message.channelId);

    if (isAmbientChannel && !isExplicitInvocation) {
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
              `User ${authorName} said: "${cleanText}"\n` +
              anchorContext +
              `Instruction: Chime in casually, playfully, and concisely as Ash with a brief 1-2 sentence response. Keep it organic and natural. Do NOT act like a generic AI assistant or repeat their words.`;

            let chimeBuffer = "";
            for await (const delta of agy.runTurn(ambientPrompt, authorName, false)) {
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
            }
          }).catch(err => {
            console.error(`[Ambient Listener Error] ${err.message}`);
          });
        }
      }
      return;
    }

    if (config.requireMention && !isExplicitInvocation) {
      return;
    }

    // 5. Determine user authorization
    const isAdmin = config.adminUsers.length === 0 || config.adminUsers.includes(message.author.id);

    // ─── Admin In-Chat Session Management Commands ───────────────────────────
    const commandLower = cleanText.toLowerCase();

    if (commandLower === "!session" || commandLower === "session") {
      const activeId = agy.getSessionId();
      await message.reply(
        `🔗 **Active AG2 Session**: \`${activeId || "Dynamic Gateway Session (Auto-retained)"}\`\n` +
        `• **Your Access Level**: ${isAdmin ? "👑 Administrator (Full Capabilities)" : "👤 Community Member (Sandboxed)"}`
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
        agy.bindSession(match[0]);
        await message.reply(`✅ **Successfully bound to AG2 session**: \`${match[0]}\`\nAll subsequent turns will execute inside this session context.`);
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
      agy.resetSession();
      await message.reply("🔄 **Session Unbound**: The gateway will spawn a fresh dedicated session on the next prompt.");
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
          `• **Player**: \`${st.playerState}\``
        );
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

    // ─── HMB Memory Bank Commands ───────────────────────────────────────────
    if (commandLower === "!hmb" || commandLower === "!memory" || commandLower === "hmb" || commandLower === "memory") {
      const count = hmb.getMemoryCount();
      const allMemories = hmb.getAllMemories();
      const topCategories = {};
      for (const m of allMemories) {
        topCategories[m.category] = (topCategories[m.category] || 0) + 1;
      }
      const catSummary = Object.entries(topCategories)
        .map(([cat, n]) => `${cat} (${n})`)
        .join(", ") || "None";

      await message.reply(
        `🏛️ **Haven Memory Bank (HMB 64-Bit)**\n` +
        `• **Status**: ${config.enableHmb ? "Active ⚡" : "Disabled"}\n` +
        `• **Anchors Count**: \`${count}\`\n` +
        `• **Categories**: ${catSummary}\n` +
        `• **Vault File**: \`${config.hmbVaultPath}\`\n` +
        `• **Commands**: \`!remember <concept> | <content>\` or \`!recall <query>\``
      );
      return;
    }

    if (commandLower.startsWith("!remember ") || commandLower.startsWith("remember ")) {
      if (!isAdmin) {
        await message.reply("⛔ **Permission Denied**: Only authorized administrators can commit anchors to the HMB vault.");
        return;
      }

      const raw = cleanText.replace(/^!?remember\s+/i, "").trim();
      const parts = raw.split("|").map(p => p.trim());
      const concept = parts[0];
      const content = parts.length > 1 ? parts.slice(1).join("|").trim() : parts[0];

      if (!concept) {
        await message.reply("⚠️ **Usage**: `!remember <concept> | <content>` (e.g. `!remember Server Lore | Shane founded Gaming2Gamers`)");
        return;
      }

      const anchor = hmb.addMemory({
        concept_name: concept,
        text_content: content,
        category: "EPISODIC",
        weight: 1.0,
        emotional_salience: 0.95
      });
      hmb.saveToHmb(config.hmbVaultPath);

      await message.reply(
        `🧠 **Memory Anchor Committed to 64-Bit Vault**:\n` +
        `• **Concept**: \`${anchor.concept_name}\`\n` +
        `• **Content**: ${anchor.text_content}\n` +
        `• **ID**: \`#${anchor.id}\` | **Salience**: \`${anchor.weight.toFixed(2)}\` | **Total Anchors**: \`${hmb.getMemoryCount()}\``
      );
      return;
    }

    if (commandLower.startsWith("!recall ") || commandLower.startsWith("recall ")) {
      const query = cleanText.replace(/^!?recall\s+/i, "").trim();
      if (!query) {
        await message.reply("⚠️ **Usage**: `!recall <query>` (e.g. `!recall temporal cortex`)");
        return;
      }

      const results = hmb.searchTopK(query, 3, 0.10);
      if (results.length === 0) {
        await message.reply(`🔍 **No matching memory anchors found** for: *"${query}"*`);
        return;
      }

      let reply = `🔍 **HMB Semantic Recall for**: *"${query}"*\n`;
      for (const res of results) {
        reply += `• **[${res.anchor.category}] ${res.anchor.concept_name}** (Score: \`${res.score.toFixed(3)}\`)\n  _${res.anchor.text_content}_\n`;
      }
      await message.reply(reply);
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
        } else if (isMentioned || isReplyToBot) {
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

      let replyMessage = null;
      try {
        const isThread = targetChannel.isThread?.() || targetChannel.id !== message.channelId;
        const placeholder = inboundMediaRecords.length > 0
          ? "*Inspecting media & thinking... 🎨✨*"
          : isThread
            ? "*Dedicated execution thread active. Running task... 🧵✨*"
            : "*Thinking... ✨*";

        replyMessage = isThread
          ? await targetChannel.send(placeholder)
          : await message.reply(placeholder);
      } catch (err) {
        console.error(`[Discord] Failed to send reply placeholder: ${err.message}`);
        return;
      }

      let buffer = "";
      let lastEditTime = Date.now();

      let promptToSend = cleanPromptText;
      if (config.enableHmb) {
        const memoryContext = hmb.buildContextInjection(cleanPromptText, config.hmbTopK);
        if (memoryContext) {
          promptToSend = `${memoryContext}${cleanPromptText}`;
        }
        hmb.pushTurn("user", authorName, cleanPromptText);
      }

      if (mediaContext) {
        promptToSend = `${promptToSend}${mediaContext}`;
      }

      try {
        for await (const delta of agy.runTurn(promptToSend, authorName, isAdmin)) {
          buffer += delta;

          const now = Date.now();
          if (now - lastEditTime >= config.throttleMs) {
            const maxStreamLen = config.maxChunkLength || 1950;
            const textToDisplay = buffer.length > maxStreamLen
              ? buffer.slice(0, maxStreamLen) + " …"
              : buffer;
            try {
              await replyMessage.edit(textToDisplay);
              lastEditTime = now;
            } catch {}
          }
        }

        // Final message edit flush with Outbound Media Attachment & Interactive Components
        if (buffer.trim()) {
          const { cleanText: finalContent, reactions } = reactionEngine.extractReactionTags(buffer);

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
          const interactiveComponents = [createInteractiveButtons()];
          const maxChunkLength = config.maxChunkLength || 1950;
          const chunks = splitDiscordMessage(finalClean, maxChunkLength);

          if (chunks.length === 0) {
            await replyMessage.edit("*(Done - no text output)*");
          } else {
            const firstChunk = chunks[0];
            const hasMultipleChunks = chunks.length > 1;

            if (filesToAttach.length > 0) {
              await replyMessage.edit({
                content: firstChunk,
                files: hasMultipleChunks ? [] : filesToAttach,
                components: hasMultipleChunks ? [] : interactiveComponents
              });
              await replyMessage.react("🎨").catch(() => {});
            } else {
              await replyMessage.edit({
                content: firstChunk,
                components: hasMultipleChunks ? [] : interactiveComponents
              });
              await replyMessage.react("✨").catch(() => {});
            }

            for (let i = 1; i < chunks.length; i++) {
              const isLast = (i === chunks.length - 1);
              await targetChannel.send({
                content: chunks[i],
                files: (isLast && filesToAttach.length > 0) ? filesToAttach : [],
                components: isLast ? interactiveComponents : []
              });
            }
          }
        } else {
          await replyMessage.edit("*(Done - no text output)*");
        }
      } catch (err) {
        console.error(`[AG2 Gateway Error] ${err.message}`);
        try {
          await replyMessage.edit(`⚠️ **[AG2 Session Error]**: ${err.message}`);
          await replyMessage.react("⚠️").catch(() => {});
        } catch {}
      }
    }).catch(err => {
      console.error(`[Turn Queue Error] ${err.message}`);
    });
  });

  return client;
}
