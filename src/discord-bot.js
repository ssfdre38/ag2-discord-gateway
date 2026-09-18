import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType
} from "discord.js";
import { config } from "./config.js";
import { AgySessionManager } from "./agy-session.js";

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
  let turnQueue = Promise.resolve();

  client.once("ready", () => {
    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log(`║  ⚡ [AG2 Discord Gateway] Online as: ${client.user.tag.padEnd(25)} ║`);
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Bot User ID   : ${client.user.id}`);
    console.log(`║  AG2 CLI Path  : ${config.agyPath}`);
    console.log(`║  Bound Session : ${agy.getSessionId() || "Dynamic (Auto-retained)"}`);
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

    if (!cleanText && (isMentioned || isReplyToBot)) {
      cleanText = "Hello!";
    }

    const authorName = message.member?.displayName || message.author.displayName || message.author.username;

    // 6. Queue turn execution to prevent concurrent SQLite locks
    turnQueue = turnQueue.then(async () => {
      try {
        await message.channel.sendTyping();
      } catch {}

      let replyMessage = null;
      try {
        replyMessage = await message.reply("*Thinking... ✨*");
      } catch (err) {
        console.error(`[Discord] Failed to send reply placeholder: ${err.message}`);
        return;
      }

      let buffer = "";
      let lastEditTime = Date.now();

      try {
        for await (const delta of agy.runTurn(cleanText, authorName, isAdmin)) {
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

        // Final message edit flush
        if (buffer.trim()) {
          if (buffer.length <= 2000) {
            await replyMessage.edit(buffer);
          } else {
            await replyMessage.edit(buffer.slice(0, 2000));
            for (let i = 2000; i < buffer.length; i += 2000) {
              await message.channel.send(buffer.slice(i, i + 2000));
            }
          }
          await replyMessage.react("✨").catch(() => {});
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
