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

  client.once("ready", () => {
    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log(`║  ⚡ [AG2 Discord Gateway] Online as: ${client.user.tag.padEnd(25)} ║`);
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Bot User ID  : ${client.user.id}`);
    console.log(`║  AG2 CLI Path : ${config.agyPath}`);
    console.log(`║  Session ID   : ${config.conversationId || "Auto-Resume Most Recent (-c)"}`);
    console.log(`║  Require @    : ${config.requireMention ? "Enabled (@Mention, Reply, or DM)" : "Disabled (All messages)"}`);
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    client.user.setPresence({
      activities: [{ name: "with AG2 🚀", type: ActivityType.Playing }],
      status: "online"
    });
  });

  client.on("messageCreate", async (message) => {
    // 1. Ignore bots
    if (message.author.bot) return;

    const isDM = message.channel.isDMBased();

    // 2. Filter allowed channels if configured
    if (!isDM && config.allowedChannels.length > 0) {
      if (!config.allowedChannels.includes(message.channelId)) return;
    }

    // 3. Invocation detection (Mentions, Replies, Nicknames, DMs)
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

    // 4. Clean user prompt
    let cleanText = message.content;
    cleanText = cleanText.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();

    for (const nick of config.nicknames) {
      const nickRegex = new RegExp(`^${nick}[,:\\s]+`, "i");
      cleanText = cleanText.replace(nickRegex, "").trim();
    }

    if (!cleanText && (isMentioned || isReplyToBot)) {
      cleanText = "Hello!";
    }

    const authorName = message.member?.displayName || message.author.displayName || message.author.username;
    const promptWithAuthor = `[User: ${authorName}]: ${cleanText}`;

    console.log(`\n💬 [Inbound Discord Message]`);
    console.log(`  Channel : #${message.channel.name || "DM"}`);
    console.log(`  Author  : ${authorName}`);
    console.log(`  Prompt  : "${cleanText}"`);

    // 5. Send initial placeholder and begin streaming
    try {
      await message.channel.sendTyping();
    } catch {}

    let replyMessage = null;
    try {
      replyMessage = await message.reply("*Thinking... ✨*");
    } catch (err) {
      console.error(`[Discord] Failed to send initial reply placeholder: ${err.message}`);
      return;
    }

    let buffer = "";
    let lastEditTime = Date.now();

    try {
      for await (const delta of agy.runTurn(promptWithAuthor)) {
        buffer += delta;

        const now = Date.now();
        if (now - lastEditTime >= config.throttleMs) {
          const textToDisplay = buffer.length > 2000 ? buffer.slice(-1990) + "..." : buffer;
          try {
            await replyMessage.edit(textToDisplay);
            lastEditTime = now;
          } catch (editErr) {
            // Ignore temporary rate limits
          }
        }
      }

      // Final edit to flush complete buffer
      if (buffer.trim()) {
        if (buffer.length <= 2000) {
          await replyMessage.edit(buffer);
        } else {
          // If response exceeds 2000 chars, edit first block and send remaining blocks
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
  });

  return client;
}
