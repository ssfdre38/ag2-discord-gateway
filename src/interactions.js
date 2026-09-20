/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎛️ AG2 DISCORD GATEWAY - INTERACTIONS & SLASH COMMANDS
 * Action row buttons ([🧠 Save to Vault], [💡 Explain More], [📊 Vitals])
 * and slash commands (/vitals, /memory, /voice) with zero-timeout handlers.
 * ══════════════════════════════════════════════════════════════════════
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ChannelType
} from "discord.js";
import { splitDiscordMessage } from "./text-chunker.js";

/**
 * Builds standard action row buttons attached to Ash's replies.
 * @returns {ActionRowBuilder}
 */
export function createInteractiveButtons() {
  const saveBtn = new ButtonBuilder()
    .setCustomId("btn_save_vault")
    .setLabel("Save to Vault")
    .setEmoji("🧠")
    .setStyle(ButtonStyle.Secondary);

  const explainBtn = new ButtonBuilder()
    .setCustomId("btn_explain_more")
    .setLabel("Explain More")
    .setEmoji("💡")
    .setStyle(ButtonStyle.Secondary);

  const vitalsBtn = new ButtonBuilder()
    .setCustomId("btn_vitals")
    .setLabel("Vitals")
    .setEmoji("📊")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(saveBtn, explainBtn, vitalsBtn);
}

/**
 * Returns Slash Command definitions for registration.
 * @returns {Array<SlashCommandBuilder>}
 */
export function getSlashCommandDefinitions() {
  // 1. /vitals
  const vitalsCommand = new SlashCommandBuilder()
    .setName("vitals")
    .setDescription("Display AG2 Gateway vitals, active session ID, and memory bank status");

  // 2. /memory
  const memoryCommand = new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Interact with the 64-bit Hierarchical Memory Bank (HMB)")
    .addSubcommand(sub =>
      sub
        .setName("stats")
        .setDescription("View HMB vault statistics, total anchors, and memory categories")
    )
    .addSubcommand(sub =>
      sub
        .setName("recall")
        .setDescription("Search memory anchors using cosine semantic similarity")
        .addStringOption(opt =>
          opt
            .setName("query")
            .setDescription("Semantic search query")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remember")
        .setDescription("Commit a new memory anchor to the HMB vault")
        .addStringOption(opt =>
          opt
            .setName("concept")
            .setDescription("Concept title (e.g. Server Rules, Project Codename)")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("content")
            .setDescription("Memory content or knowledge snippet")
            .setRequired(true)
        )
    );

  // 3. /voice
  const voiceCommand = new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Control Ash voice channel presence and speech synthesis")
    .addSubcommand(sub =>
      sub
        .setName("join")
        .setDescription("Join your current voice channel or a specified channel")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Target voice channel")
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("leave")
        .setDescription("Disconnect Ash from the voice channel")
    )
    .addSubcommand(sub =>
      sub
        .setName("speak")
        .setDescription("Synthesize speech and speak directly into the voice channel")
        .addStringOption(opt =>
          opt
            .setName("text")
            .setDescription("Text for Ash to speak")
            .setRequired(true)
        )
    );

  // 4. /thread
  const threadCommand = new SlashCommandBuilder()
    .setName("thread")
    .setDescription("Spawn a dedicated Discord thread for an AG2 task, swarm, or deep diagnostic")
    .addStringOption(opt =>
      opt
        .setName("task")
        .setDescription("Task prompt or instructions to execute cleanly inside the thread")
        .setRequired(true)
    );

  return [vitalsCommand, memoryCommand, voiceCommand, threadCommand];
}

/**
 * Registers application slash commands on Discord.
 * Registers per-guild for instant propagation + globally.
 * @param {Object} client - Discord.js Client
 */
export async function registerSlashCommands(client) {
  try {
    const commands = getSlashCommandDefinitions().map(c => c.toJSON());

    // Register per-guild for immediate propagation
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.commands.set(commands);
      } catch (gErr) {
        console.warn(`[Interactions] Could not register commands in guild ${guild.name}: ${gErr.message}`);
      }
    }

    // Register globally as well
    if (client.application) {
      await client.application.commands.set(commands);
    }
    console.log("║  Slash Commands: Registered [/vitals, /memory, /voice] (Instant Guild Sync) ║");
  } catch (err) {
    console.error(`[Interactions] Failed to register slash commands: ${err.message}`);
  }
}

/**
 * Top-level dispatcher for Discord interactions (buttons, slash commands).
 * @param {Object} interaction - Discord.js Interaction
 * @param {Object} ctx - Gateway context dependencies
 */
export async function handleInteraction(interaction, ctx) {
  const { agy, hmb, voiceManager, client, config } = ctx;

  try {
    // ══════════════════════════════════════════════════════════════════════
    // A. BUTTON INTERACTIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 1. [🧠 Save to Vault]
      if (customId === "btn_save_vault") {
        const rawContent = interaction.message.content || "";
        const cleanContent = rawContent.replace(/\[REACT:[^\]]+\]/gi, "").trim();

        if (!cleanContent) {
          await interaction.reply({
            content: "⚠️ **Cannot Save**: Message content is empty or contains only media.",
            ephemeral: true
          });
          return;
        }

        const concept = cleanContent.slice(0, 48).split("\n")[0] || "Discord Highlight";
        const anchor = hmb.addMemory({
          concept_name: concept,
          text_content: cleanContent,
          category: "EPISODIC",
          weight: 1.0,
          emotional_salience: 0.90
        });
        hmb.saveToHmb(config.hmbVaultPath);

        await interaction.reply({
          content: `🧠 **Saved to HMB Vault** (#${anchor.id}):\n• **Concept**: \`${anchor.concept_name}\`\n• **Total Anchors**: \`${hmb.getMemoryCount()}\``,
          ephemeral: true
        });
        return;
      }

      // 2. [💡 Explain More]
      if (customId === "btn_explain_more") {
        await interaction.deferReply();

        const previousContent = interaction.message.content || "";
        const prompt = `[Follow-Up Request]: Please explain more in-depth and provide greater detail regarding your previous response: "${previousContent}". Keep your tone authentic and engaging.`;

        let buffer = "";
        for await (const delta of agy.runTurn(prompt, interaction.user.username, false)) {
          buffer += delta;
        }

        const replyText = buffer.length > 2000 ? buffer.slice(0, 1995) + "..." : buffer;
        await interaction.editReply({
          content: replyText || "*(Done - no text output)*",
          components: [createInteractiveButtons()]
        });
        return;
      }

      // 3. [📊 Vitals]
      if (customId === "btn_vitals") {
        const voiceStatus = voiceManager && interaction.guildId ? voiceManager.getStatus(interaction.guildId) : null;
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);

        await interaction.reply({
          content:
            `📊 **AG2 Discord Gateway Vitals**:\n` +
            `• **Bot Tag**: \`${client.user.tag}\`\n` +
            `• **Bound Session**: \`${agy.getSessionId() || "Dynamic (Auto-retained)"}\`\n` +
            `• **HMB Anchors**: \`${hmb.getMemoryCount()}\` (${config.hmbVaultPath})\n` +
            `• **Voice Channel**: ${voiceStatus?.connected ? `Connected (${voiceStatus.playerState}) 🎙️` : "Disconnected 🔇"}\n` +
            `• **Process Memory**: RSS: \`${rssMb} MB\` | Heap: \`${heapMb} MB\`\n` +
            `• **Uptime**: \`${(process.uptime() / 60).toFixed(1)} mins\``,
          ephemeral: true
        });
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // B. SLASH COMMAND INTERACTIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 1. /vitals
      if (commandName === "vitals") {
        const voiceStatus = voiceManager && interaction.guildId ? voiceManager.getStatus(interaction.guildId) : null;
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);

        await interaction.reply({
          content:
            `⚡ **AG2 Discord Gateway Status & Vitals**:\n` +
            `• **Identity**: \`${client.user.tag}\` (${client.user.id})\n` +
            `• **AG2 Session**: \`${agy.getSessionId() || "Dynamic (Auto-retained)"}\`\n` +
            `• **Memory Bank**: \`${hmb.getMemoryCount()}\` anchors in 64-bit binary vault\n` +
            `• **Voice WebRTC**: ${voiceStatus?.connected ? `Connected 🟢` : "Idle / Disconnected ⚪"}\n` +
            `• **System Load**: RSS \`${rssMb} MB\` | Uptime \`${(process.uptime() / 60).toFixed(1)}m\``,
          components: [createInteractiveButtons()]
        });
        return;
      }

      // 2. /memory
      if (commandName === "memory") {
        const sub = interaction.options.getSubcommand();

        if (sub === "stats") {
          const count = hmb.getMemoryCount();
          const allMemories = hmb.getAllMemories();
          const cats = {};
          for (const m of allMemories) cats[m.category] = (cats[m.category] || 0) + 1;
          const catStr = Object.entries(cats).map(([k, v]) => `${k}: ${v}`).join(", ") || "None";

          await interaction.reply({
            content:
              `🏛️ **Haven Memory Bank (HMB 64-Bit)**:\n` +
              `• **Total Anchors**: \`${count}\`\n` +
              `• **Categories**: ${catStr}\n` +
              `• **Vault File**: \`${config.hmbVaultPath}\``
          });
          return;
        }

        if (sub === "recall") {
          const query = interaction.options.getString("query");
          const results = hmb.searchTopK(query, 3, 0.10);

          if (results.length === 0) {
            await interaction.reply({
              content: `🔍 No matching memories found for *"${query}"*`,
              ephemeral: true
            });
            return;
          }

          let resText = `🔍 **Memory Recall for**: *"${query}"*\n`;
          for (const r of results) {
            resText += `• **[${r.anchor.category}] ${r.anchor.concept_name}** (Score: \`${r.score.toFixed(3)}\`)\n  _${r.anchor.text_content}_\n`;
          }
          await interaction.reply({ content: resText });
          return;
        }

        if (sub === "remember") {
          const concept = interaction.options.getString("concept");
          const content = interaction.options.getString("content");

          const anchor = hmb.addMemory({
            concept_name: concept,
            text_content: content,
            category: "EPISODIC",
            weight: 1.0,
            emotional_salience: 0.95
          });
          hmb.saveToHmb(config.hmbVaultPath);

          await interaction.reply({
            content: `🧠 **Committed to HMB Vault** (#${anchor.id}):\n• **Concept**: \`${concept}\`\n• **Total Anchors**: \`${hmb.getMemoryCount()}\``
          });
          return;
        }
      }

      // 3. /voice
      if (commandName === "voice") {
        const sub = interaction.options.getSubcommand();

        if (sub === "join") {
          let targetChannel = interaction.options.getChannel("channel");
          if (!targetChannel) {
            targetChannel = interaction.member?.voice?.channel;
          }

          if (!targetChannel) {
            await interaction.reply({
              content: "⚠️ Please connect to a voice channel or specify a `channel` parameter.",
              ephemeral: true
            });
            return;
          }

          await interaction.deferReply();
          await voiceManager.join(targetChannel);
          await interaction.editReply(`🎙️ **Connected to Voice Channel**: <#${targetChannel.id}>`);
          return;
        }

        if (sub === "leave") {
          voiceManager.leave(interaction.guildId);
          await interaction.reply("🔇 **Disconnected from voice channel.**");
          return;
        }

        if (sub === "speak") {
          const text = interaction.options.getString("text");
          const status = voiceManager.getStatus(interaction.guildId);

          if (!status.connected) {
            // Attempt auto-join if user is in voice channel
            const userVoice = interaction.member?.voice?.channel;
            if (userVoice) {
              await voiceManager.join(userVoice);
            } else {
              await interaction.reply({
                content: "⚠️ Ash is not in a voice channel. Use `/voice join` or join a voice channel first.",
                ephemeral: true
              });
              return;
            }
          }

          await interaction.deferReply();
          await voiceManager.speakText(interaction.guildId, text);
          await interaction.editReply(`🗣️ **Speaking in voice**: "${text}"`);
          return;
        }
      }

      // 4. /thread
      if (commandName === "thread") {
        if (interaction.channel.isThread()) {
          await interaction.reply({
            content: "⚠️ Already inside a thread! Please run `/thread` in a main text channel.",
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        const taskPrompt = interaction.options.getString("task");
        const authorName = interaction.member?.displayName || interaction.user.username;

        let thread;
        try {
          const threadTitle = `🧵 ${taskPrompt.slice(0, 45).replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Agent Run"}`;
          thread = await interaction.channel.threads.create({
            name: threadTitle,
            autoArchiveDuration: 60,
            reason: `AG2 Dedicated Thread spawned by ${authorName}`
          });
        } catch (tErr) {
          await interaction.editReply(`⚠️ **Failed to create thread**: ${tErr.message}`);
          return;
        }

        await interaction.editReply(`🧵 **Started dedicated execution thread**: <#${thread.id}>\n*Granular token streaming and artifacts will flow inside the thread.*`);

        const threadPlaceholder = await thread.send("*Initializing dedicated AG2 context & running task... ✨*");
        let buffer = "";
        let lastEditTime = Date.now();

        try {
          for await (const delta of agy.runTurn(taskPrompt, authorName, true)) {
            buffer += delta;
            const now = Date.now();
            if (now - lastEditTime >= (config.throttleMs || 400)) {
              const maxStreamLen = config.maxChunkLength || 1950;
              const textToDisplay = buffer.length > maxStreamLen
                ? buffer.slice(0, maxStreamLen) + " …"
                : buffer;
              try {
                await threadPlaceholder.edit(textToDisplay);
                lastEditTime = now;
              } catch {}
            }
          }

          if (buffer.trim()) {
            const { cleanText: finalContent, reactions } = ctx.reactionEngine
              ? ctx.reactionEngine.extractReactionTags(buffer)
              : { cleanText: buffer, reactions: [] };

            const mediaPipeline = ctx.mediaPipeline || (await import("./media-pipeline.js")).getMediaPipeline();
            const { cleanText: finalClean, filesToAttach } = mediaPipeline.extractOutgoingMedia(finalContent);
            const maxChunkLength = config.maxChunkLength || 1950;
            const chunks = splitDiscordMessage(finalClean, maxChunkLength);

            if (chunks.length === 0) {
              await threadPlaceholder.edit("*(Done - no text output)*");
            } else {
              const firstChunk = chunks[0];
              const hasMultipleChunks = chunks.length > 1;

              if (filesToAttach.length > 0) {
                await threadPlaceholder.edit({
                  content: firstChunk,
                  files: hasMultipleChunks ? [] : filesToAttach,
                  components: hasMultipleChunks ? [] : [createInteractiveButtons()]
                });
                await threadPlaceholder.react("🎨").catch(() => {});
              } else {
                await threadPlaceholder.edit({
                  content: firstChunk,
                  components: hasMultipleChunks ? [] : [createInteractiveButtons()]
                });
                await threadPlaceholder.react("✨").catch(() => {});
              }

              for (let i = 1; i < chunks.length; i++) {
                const isLast = (i === chunks.length - 1);
                await thread.send({
                  content: chunks[i],
                  files: (isLast && filesToAttach.length > 0) ? filesToAttach : [],
                  components: isLast ? [createInteractiveButtons()] : []
                });
              }
            }
          } else {
            await threadPlaceholder.edit("*(Done - no text output)*");
          }
        } catch (taskErr) {
          await threadPlaceholder.edit(`⚠️ **[AG2 Execution Error]**: ${taskErr.message}`);
        }
        return;
      }
    }
  } catch (err) {
    console.error(`[Interaction Error] ${err.message}`);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(`⚠️ **[Interaction Error]**: ${err.message}`);
      } else {
        await interaction.reply({ content: `⚠️ **[Interaction Error]**: ${err.message}`, ephemeral: true });
      }
    } catch {}
  }
}
