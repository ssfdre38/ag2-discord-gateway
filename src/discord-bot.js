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

export function createDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  const agy = new AgySessionManager();
  const hmb = new HmbMemoryEngine({
    vaultPath: config.hmbVaultPath
  });
  const mediaPipeline = getMediaPipeline();
  let turnQueue = Promise.resolve();

  client.once("ready", () => {
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
        const httpServer = createHttpActuationServer(client, hmb, config);
        httpServer.listen(config.httpPort, config.httpHost, () => {
          // Listening locally
        });
      } catch (err) {
        console.error(`[Actuation Server Error] ${err.message}`);
      }
    }

    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log(`║  ⚡ [AG2 Discord Gateway] Online as: ${client.user.tag.padEnd(25)} ║`);
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Bot User ID   : ${client.user.id}`);
    console.log(`║  AG2 CLI Path  : ${config.agyPath}`);
    console.log(`║  Bound Session : ${agy.getSessionId() || "Dynamic (Auto-retained)"}`);
    console.log(`║  HMB Memory    : ${config.enableHmb ? `Active (${hmb.getMemoryCount()} anchors in .hmb)` : "Disabled"}`);
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

    if (config.requireMention && !isDM && !isMentioned && !isReplyToBot && !hasNicknamePrefix) {
      return;
    }

    // 4. Determine user authorization
    const isAdmin = config.adminUsers.length === 0 || config.adminUsers.includes(message.author.id);

    // 5. Clean prompt text
    let cleanText = message.content;
    cleanText = cleanText.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();

    for (const nick of config.nicknames) {
      const nickRegex = new RegExp(`^${nick}[,:\\s]+`, "i");
      cleanText = cleanText.replace(nickRegex, "").trim();
    }

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

    const authorName = message.member?.displayName || message.author.displayName || message.author.username;

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

      let replyMessage = null;
      try {
        const placeholder = inboundMediaRecords.length > 0
          ? "*Inspecting media & thinking... 🎨✨*"
          : "*Thinking... ✨*";
        replyMessage = await message.reply(placeholder);
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
            const textToDisplay = buffer.length > 2000 ? buffer.slice(-1990) + "..." : buffer;
            try {
              await replyMessage.edit(textToDisplay);
              lastEditTime = now;
            } catch {}
          }
        }

        // Final message edit flush with Outbound Media Attachment detection
        if (buffer.trim()) {
          if (config.enableHmb) {
            hmb.pushTurn("assistant", client.user.username, buffer);
          }

          const { filesToAttach } = mediaPipeline.extractOutgoingMedia(buffer);

          if (filesToAttach.length > 0) {
            if (buffer.length <= 2000) {
              await replyMessage.edit({ content: buffer, files: filesToAttach });
            } else {
              await replyMessage.edit(buffer.slice(0, 2000));
              for (let i = 2000; i < buffer.length; i += 2000) {
                const chunk = buffer.slice(i, i + 2000);
                const isLast = (i + 2000 >= buffer.length);
                await message.channel.send({ content: chunk, files: isLast ? filesToAttach : [] });
              }
            }
            await replyMessage.react("🎨").catch(() => {});
          } else {
            if (buffer.length <= 2000) {
              await replyMessage.edit(buffer);
            } else {
              await replyMessage.edit(buffer.slice(0, 2000));
              for (let i = 2000; i < buffer.length; i += 2000) {
                await message.channel.send(buffer.slice(i, i + 2000));
              }
            }
            await replyMessage.react("✨").catch(() => {});
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
