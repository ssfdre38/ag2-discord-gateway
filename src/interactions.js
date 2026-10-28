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
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ApplicationIntegrationType,
  InteractionContextType
} from "discord.js";
import { splitDiscordMessage } from "./text-chunker.js";
import { resolveAuthorContext } from "./identity.js";
import { normalizeHmbCategory } from "./hmb-memory.js";
import { getSecurityGuard } from "./security-guard.js";
import { triggerSelfRestart } from "./process-manager.js";

/**
 * Builds standard action row buttons attached to Ash's replies.
 * Includes quick actions for Vault Anchor, In-Depth Explanation,
 * Architectural Planning, Autonomous Goal, and Health Vitals.
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

  const planBtn = new ButtonBuilder()
    .setCustomId("btn_plan_task")
    .setLabel("Plan")
    .setEmoji("📋")
    .setStyle(ButtonStyle.Secondary);

  const goalBtn = new ButtonBuilder()
    .setCustomId("btn_launch_goal")
    .setLabel("Goal")
    .setEmoji("🎯")
    .setStyle(ButtonStyle.Secondary);

  const vitalsBtn = new ButtonBuilder()
    .setCustomId("btn_vitals")
    .setLabel("Vitals")
    .setEmoji("📊")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(saveBtn, explainBtn, planBtn, goalBtn, vitalsBtn);
}

/**
 * Builds an interactive modal dialog for launching an autonomous AGY goal.
 * @param {string} [initialObjective]
 * @returns {ModalBuilder}
 */
export function createGoalModal(initialObjective = "") {
  const modal = new ModalBuilder()
    .setCustomId("modal_goal_submit")
    .setTitle("Launch Autonomous AGY Goal");

  const objectiveInput = new TextInputBuilder()
    .setCustomId("goal_objective")
    .setLabel("Goal Objective & Deliverables")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("State the complete objective, architecture changes, and deliverables...")
    .setRequired(true)
    .setMaxLength(4000);

  if (initialObjective && initialObjective.trim()) {
    objectiveInput.setValue(initialObjective.slice(0, 3900));
  }

  const constraintsInput = new TextInputBuilder()
    .setCustomId("goal_constraints")
    .setLabel("Constraints & Guardrails (Optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("e.g. Must run npm test, no breaking changes, maintain backward compatibility...")
    .setRequired(false)
    .setMaxLength(1000);

  const workspaceInput = new TextInputBuilder()
    .setCustomId("goal_workspace")
    .setLabel("Workspace Directory Override (Optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Leave blank to use channel workspace")
    .setRequired(false)
    .setMaxLength(300);

  return modal.addComponents(
    new ActionRowBuilder().addComponents(objectiveInput),
    new ActionRowBuilder().addComponents(constraintsInput),
    new ActionRowBuilder().addComponents(workspaceInput)
  );
}

/**
 * Builds an interactive modal dialog for requesting a step-by-step implementation plan.
 * @param {string} [initialTask]
 * @returns {ModalBuilder}
 */
export function createPlanModal(initialTask = "") {
  const modal = new ModalBuilder()
    .setCustomId("modal_plan_submit")
    .setTitle("Request AGY Implementation Plan");

  const taskInput = new TextInputBuilder()
    .setCustomId("plan_task")
    .setLabel("Task or Feature to Plan Out")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Describe the feature, bug, or refactor you want to plan in detail...")
    .setRequired(true)
    .setMaxLength(4000);

  if (initialTask && initialTask.trim()) {
    taskInput.setValue(initialTask.slice(0, 3900));
  }

  const contextInput = new TextInputBuilder()
    .setCustomId("plan_context")
    .setLabel("Context, Dependencies & Risks (Optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Relevant files, libraries, architecture constraints, or questions...")
    .setRequired(false)
    .setMaxLength(1000);

  const workspaceInput = new TextInputBuilder()
    .setCustomId("plan_workspace")
    .setLabel("Workspace Directory Override (Optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Leave blank to use channel workspace")
    .setRequired(false)
    .setMaxLength(300);

  return modal.addComponents(
    new ActionRowBuilder().addComponents(taskInput),
    new ActionRowBuilder().addComponents(contextInput),
    new ActionRowBuilder().addComponents(workspaceInput)
  );
}

/**
 * Builds an interactive modal dialog for committing an anchor to the HMB 64-bit vault.
 * @param {string} [defaultConcept]
 * @param {string} [defaultContent]
 * @returns {ModalBuilder}
 */
export function createVaultSaveModal(defaultConcept = "", defaultContent = "") {
  const modal = new ModalBuilder()
    .setCustomId("modal_vault_save")
    .setTitle("Commit Vault Anchor");

  const conceptInput = new TextInputBuilder()
    .setCustomId("vault_concept")
    .setLabel("Concept Name / Topic")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Server Lore, Audio Settings, Milestone")
    .setRequired(true)
    .setMaxLength(100);

  if (defaultConcept && defaultConcept.trim()) {
    conceptInput.setValue(defaultConcept.slice(0, 80));
  }

  const categoryInput = new TextInputBuilder()
    .setCustomId("vault_category")
    .setLabel("Category (EPISODIC, LORE, SYSTEM)")
    .setStyle(TextInputStyle.Short)
    .setValue("EPISODIC")
    .setRequired(false)
    .setMaxLength(30);

  const contentInput = new TextInputBuilder()
    .setCustomId("vault_content")
    .setLabel("Memory Anchor Text Content")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  if (defaultContent && defaultContent.trim()) {
    contentInput.setValue(defaultContent.slice(0, 3900));
  }

  return modal.addComponents(
    new ActionRowBuilder().addComponents(conceptInput),
    new ActionRowBuilder().addComponents(categoryInput),
    new ActionRowBuilder().addComponents(contentInput)
  );
}

/**
 * Builds a dynamic stop button to halt in-flight agent turn execution.
 * @param {string} [runKey]
 * @returns {ActionRowBuilder}
 */
export function createStopButton(runKey = "") {
  const stopBtn = new ButtonBuilder()
    .setCustomId(runKey ? `btn_stop_turn_${runKey}` : "btn_stop_turn")
    .setLabel("Stop Run")
    .setEmoji("🛑")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(stopBtn);
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
        .addStringOption(opt =>
          opt
            .setName("category")
            .setDescription("Filter by partition: CORE_IDENTITY, EPISODIC, SEMANTIC, EMOTIONAL")
            .setRequired(false)
            .addChoices(
              { name: "👑 Core Identity", value: "CORE_IDENTITY" },
              { name: "📜 Episodic", value: "EPISODIC" },
              { name: "📚 Semantic", value: "SEMANTIC" },
              { name: "💖 Emotional", value: "EMOTIONAL" }
            )
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
        .addStringOption(opt =>
          opt
            .setName("category")
            .setDescription("Target partition (default: EPISODIC)")
            .setRequired(false)
            .addChoices(
              { name: "📜 Episodic (Milestones & Events)", value: "EPISODIC" },
              { name: "📚 Semantic (Knowledge, Specs & Lore)", value: "SEMANTIC" },
              { name: "👑 Core Identity (Foundational Personality)", value: "CORE_IDENTITY" },
              { name: "💖 Emotional (Sentiments & Preferences)", value: "EMOTIONAL" }
            )
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
    )
    .addSubcommand(sub =>
      sub
        .setName("autoread")
        .setDescription("Toggle auto-reading incoming text chat messages aloud in voice")
        .addBooleanOption(opt =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable voice auto-reading")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("talkback")
        .setDescription("Toggle speaking Ash's AI replies aloud in voice")
        .addBooleanOption(opt =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable voice talk-back")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("autojoin")
        .setDescription("Toggle automatic voice channel joining when users connect")
        .addBooleanOption(opt =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable voice auto-join")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("listen")
        .setDescription("Toggle Ash listening to voice chat and speaking back aloud")
        .addBooleanOption(opt =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable voice ear (listening)")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("status")
        .setDescription("View voice connection and companion settings")
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

  // 5. /autotalk
  const autotalkCommand = new SlashCommandBuilder()
    .setName("autotalk")
    .setDescription("Toggle continuous chat participation without requiring @mentions")
    .addBooleanOption(opt =>
      opt
        .setName("enabled")
        .setDescription("Enable or disable Auto-Talk mode")
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt
        .setName("channel")
        .setDescription("Target text channel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    );

  // 6. /goal
  const goalCommand = new SlashCommandBuilder()
    .setName("goal")
    .setDescription("Launch an autonomous, long-running goal run with extended timeout and verification")
    .addStringOption(opt =>
      opt
        .setName("objective")
        .setDescription("Goal objective (omit to open multi-line interactive modal dialog)")
        .setRequired(false)
    );

  // 7. /plan
  const planCommand = new SlashCommandBuilder()
    .setName("plan")
    .setDescription("Request a step-by-step implementation plan artifact before executing changes")
    .addStringOption(opt =>
      opt
        .setName("task")
        .setDescription("Task to plan out (omit to open multi-line interactive modal dialog)")
        .setRequired(false)
    );

  // 8. /compact
  const compactCommand = new SlashCommandBuilder()
    .setName("compact")
    .setDescription("Compact the ongoing conversation context to free up tokens while retaining decisions");

  // 9. /transcript
  const transcriptCommand = new SlashCommandBuilder()
    .setName("transcript")
    .setDescription("Export the active session's transcript logs into a downloadable Markdown file");

  // 10. /workspace
  const workspaceCommand = new SlashCommandBuilder()
    .setName("workspace")
    .setDescription("Inspect or switch the active workspace directory for this channel")
    .addStringOption(opt =>
      opt
        .setName("path")
        .setDescription("New absolute directory path for this channel (omit to view current)")
        .setRequired(false)
    );

  // 11. /status
  const statusCommand = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Inspect or dynamically update Ash's Discord rich presence activity")
    .addStringOption(opt =>
      opt
        .setName("activity")
        .setDescription("Activity text (e.g. 'Compiling MicaNT on Xeon' or 'Rendering Sovereign trailers')")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("status")
        .setDescription("Presence status")
        .setRequired(false)
        .addChoices(
          { name: "🟢 Online", value: "online" },
          { name: "🌙 Idle", value: "idle" },
          { name: "⛔ Do Not Disturb", value: "dnd" },
          { name: "⚪ Invisible / Offline", value: "invisible" }
        )
    )
    .addStringOption(opt =>
      opt
        .setName("type")
        .setDescription("Activity type")
        .setRequired(false)
        .addChoices(
          { name: "🎮 Playing", value: "playing" },
          { name: "📺 Watching", value: "watching" },
          { name: "🎧 Listening", value: "listening" },
          { name: "🏆 Competing", value: "competing" }
        )
    );

  // 12. /imagine
  const imagineCommand = new SlashCommandBuilder()
    .setName("imagine")
    .setDescription("Generate concept art or visual cards and auto-attach directly to Discord")
    .addStringOption(opt =>
      opt
        .setName("prompt")
        .setDescription("Visual description / creative directive")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("engine")
        .setDescription("Image engine or routing policy")
        .setRequired(false)
        .addChoices(
          { name: "⚡ Auto (Google Nano Banana ➔ SD Failover)", value: "auto" },
          { name: "🦾 Stable Diffusion (DreamShaper8 LCM)", value: "sd" },
          { name: "🍌 Google Nano Banana / Imagen", value: "google" },
          { name: "🎨 Visual Card Synthesizer", value: "card" }
        )
    )
    .addStringOption(opt =>
      opt
        .setName("style")
        .setDescription("Artistic visual theme")
        .setRequired(false)
        .addChoices(
          { name: "⚡ Cyberpunk / Neon HUD", value: "cyberpunk" },
          { name: "🎨 Concept Art", value: "concept-art" },
          { name: "📐 Engineering Schematic", value: "schematic" },
          { name: "🌆 Retro Synthwave", value: "synthwave" },
          { name: "👑 Imperial Gold", value: "gold" }
        )
    );

  // 13. /emojis
  const emojisCommand = new SlashCommandBuilder()
    .setName("emojis")
    .setDescription("List custom Discord emojis available in this server");

  // 14. /stickers
  const stickersCommand = new SlashCommandBuilder()
    .setName("stickers")
    .setDescription("List custom Discord stickers available in this server");

  // 15. /chat (Personal Companion chat from any server or DM)
  const chatCommand = new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat directly with Ash from any server, group chat, or DM")
    .addStringOption(opt =>
      opt.setName("message")
        .setDescription("What do you want to say or ask Ash?")
        .setRequired(true)
    );

  // 16. Message Context Menu: "Ask Ash"
  const askAshMenu = new ContextMenuCommandBuilder()
    .setName("Ask Ash")
    .setType(ApplicationCommandType.Message);

  // 17. /restart (Admin only)
  const restartCommand = new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Gracefully restart the AG2 Discord Gateway process (Admin only)")
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for restart")
        .setRequired(false)
    );

  const allCommands = [
    vitalsCommand,
    memoryCommand,
    voiceCommand,
    threadCommand,
    autotalkCommand,
    goalCommand,
    planCommand,
    compactCommand,
    transcriptCommand,
    workspaceCommand,
    statusCommand,
    imagineCommand,
    emojisCommand,
    stickersCommand,
    chatCommand,
    askAshMenu,
    restartCommand
  ];

  // Configure User App & Guild Install contexts
  for (const cmd of allCommands) {
    if (typeof cmd.setIntegrationTypes === "function") {
      cmd.setIntegrationTypes([
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall
      ]);
    }
    if (typeof cmd.setContexts === "function") {
      cmd.setContexts([
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel
      ]);
    }
  }

  return allCommands;
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
 * Streams an AG2 turn execution response with Discord dark-mode Mermaid diagrams,
 * dynamic progress updates, stop button, and split message chunking.
 * @param {Object} interaction - Discord interaction
 * @param {string} promptText - The prompt to submit to AGY
 * @param {Object} authorContext - Authenticated author identity
 * @param {Object} turnOptions - Options for agy.runTurn (isGoal, isPlan, etc.)
 * @param {Object} ctx - Gateway context
 */
async function streamTurnResponse(interaction, promptText, authorContext, turnOptions = {}, ctx = {}) {
  const { agy, config, diagramRenderer, mediaPipeline, presenceManager } = ctx;
  const stopRow = createStopButton(interaction.channelId);

  let buffer = "";
  let lastEditTime = Date.now();
  let lastPresenceTime = 0;

  try {
    const isGoal = Boolean(turnOptions.isGoal);
    const isPlan = Boolean(turnOptions.isPlan);
    const modeBadge = isGoal ? "🎯 **Goal Run**" : isPlan ? "📐 **Plan Run**" : "⚙️ **AG2 Run**";

    const opts = {
      ...turnOptions,
      channelId: interaction.channelId,
      onProgress: (readableStatus, toolName, toolCount) => {
        const now = Date.now();
        if (presenceManager && now - lastPresenceTime >= 4000) {
          presenceManager.setPresence(readableStatus || `Running ${toolName}`, "online", "playing");
          lastPresenceTime = now;
        }

        if (!buffer.trim()) {
          if (now - lastEditTime >= (config?.throttleMs || 400)) {
            const statusText = `${modeBadge} - *Working: ${readableStatus || `Running \`${toolName}\` (#${toolCount})`} ⚙️✨*`;
            interaction.editReply({ content: statusText, components: [stopRow] }).catch(() => {});
            lastEditTime = now;
          }
        }
      }
    };

    try {
      for await (const delta of agy.runTurn(promptText, authorContext, opts)) {
        buffer += delta;
        const now = Date.now();
        if (now - lastEditTime >= (config?.throttleMs || 400)) {
          const maxStreamLen = config?.maxChunkLength || 1950;
          const display = buffer.length > maxStreamLen ? buffer.slice(0, maxStreamLen) + " …" : buffer;
          await interaction.editReply({ content: display, components: [stopRow] }).catch(() => {});
          lastEditTime = now;
        }
      }
    } finally {
      if (presenceManager) presenceManager.resetToDefault();
    }

    if (!buffer.trim()) {
      buffer = "✅ **Task Completed**: Execution finished successfully.";
    }

    // Process Mermaid diagrams if diagramRenderer is provided
    let textAfterDiagrams = buffer;
    let diagramFiles = [];
    if (diagramRenderer) {
      try {
        const diagRes = await diagramRenderer.processMermaidDiagrams(textAfterDiagrams);
        textAfterDiagrams = diagRes.cleanText;
        diagramFiles = diagRes.diagramFiles || [];
      } catch (err) {
        console.warn(`[Interactions] Diagram render warning: ${err.message}`);
      }
    }

    // Outgoing media extraction
    let cleanText = textAfterDiagrams;
    let filesToAttach = [...diagramFiles];
    if (mediaPipeline) {
      try {
        const mediaRes = mediaPipeline.extractOutgoingMedia(cleanText);
        cleanText = mediaRes.cleanText;
        filesToAttach = [...filesToAttach, ...(mediaRes.filesToAttach || [])];
      } catch {}
    }

    const interactiveRow = createInteractiveButtons();
    const maxChunkLength = config?.maxChunkLength || 1950;
    const chunks = splitDiscordMessage(cleanText, maxChunkLength);

    if (chunks.length === 0) {
      await interaction.editReply({
        content: "✅ **Done!** Task completed successfully.",
        components: [interactiveRow]
      });
    } else {
      const firstChunk = chunks[0];
      const hasMultipleChunks = chunks.length > 1;
      const firstContent = hasMultipleChunks ? `${firstChunk}\n\n*(Part 1/${chunks.length})*` : firstChunk;

      await interaction.editReply({
        content: firstContent,
        files: hasMultipleChunks ? [] : filesToAttach,
        components: [interactiveRow]
      });

      for (let i = 1; i < chunks.length; i++) {
        const isLast = (i === chunks.length - 1);
        const chunkContent = `${chunks[i]}\n\n*(Part ${i + 1}/${chunks.length})*`;
        await interaction.followUp({
          content: chunkContent,
          files: (isLast && filesToAttach.length > 0) ? filesToAttach : [],
          components: isLast ? [interactiveRow] : []
        });
      }
    }
  } catch (err) {
    console.error(`[Interaction Stream Error] ${err.message}`);
    await interaction.editReply({
      content: `⚠️ **[Execution Error]**: ${err.message}`,
      components: [createInteractiveButtons()]
    }).catch(() => {});
  }
}

/**
 * Top-level dispatcher for Discord interactions (buttons, modals, slash commands).
 * @param {Object} interaction - Discord.js Interaction
 * @param {Object} ctx - Gateway context dependencies
 */
export async function handleInteraction(interaction, ctx) {
  const { agy, hmb, voiceManager, client, config, reactionEngine, presenceManager, imageGenerator } = ctx;
  const authorContext = resolveAuthorContext(interaction.user, interaction.member);
  const securityGuard = ctx.securityGuard || getSecurityGuard(config);

  try {
    // ══════════════════════════════════════════════════════════════════════
    // A. BUTTON INTERACTIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 0. [🛑 Stop Run]
      if (customId === "btn_stop_turn" || customId.startsWith("btn_stop_turn_")) {
        const result = agy.interrupt(interaction.channelId);
        if (result.success) {
          await interaction.reply({
            content: `🛑 **Run Halted by ${authorContext.displayName}**: Execution stopped after ${(result.elapsedMs / 1000).toFixed(1)}s.`
          });
        } else {
          await interaction.reply({
            content: `ℹ️ **Notice**: No active AG2 turn was running to interrupt.`,
            ephemeral: true
          });
        }
        return;
      }

      // 1. [🧠 Save to Vault] -> Opens Vault Save Modal
      if (customId === "btn_save_vault") {
        if (!authorContext.isAdmin) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Only administrators can commit anchors to the HMB vault.",
            ephemeral: true
          });
          return;
        }

        const rawContent = interaction.message.content || "";
        const cleanContent = rawContent.replace(/\[REACT:[^\]]+\]/gi, "").trim();

        if (!cleanContent) {
          await interaction.reply({
            content: "⚠️ **Cannot Save**: Message content is empty or contains only media.",
            ephemeral: true
          });
          return;
        }

        const defaultConcept = cleanContent.slice(0, 48).split("\n")[0] || "Discord Highlight";
        await interaction.showModal(createVaultSaveModal(defaultConcept, cleanContent));
        return;
      }

      // 2. [💡 Explain More]
      if (customId === "btn_explain_more") {
        await interaction.deferReply();

        const previousContent = interaction.message.content || "";
        const prompt = `[Follow-Up Request]: Please explain more in-depth and provide greater detail regarding your previous response: "${previousContent}". Keep your tone authentic and engaging.`;

        await streamTurnResponse(interaction, prompt, authorContext, {}, ctx);
        return;
      }

      // 3. [📋 Plan] -> Opens Interactive Plan Modal
      if (customId === "btn_plan_task") {
        await interaction.showModal(createPlanModal());
        return;
      }

      // 4. [🎯 Goal] -> Opens Interactive Goal Modal
      if (customId === "btn_launch_goal") {
        if (config?.safeMode && !authorContext.isAdmin && !authorContext.isCollaborator) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Autonomous goal execution requires administrator or collaborator privileges.",
            ephemeral: true
          });
          return;
        }
        await interaction.showModal(createGoalModal());
        return;
      }

      // 5. [📊 Vitals]
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
    // B. MODAL SUBMISSIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // 1. [modal_vault_save]
      if (customId === "modal_vault_save") {
        if (!authorContext.isAdmin) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Only administrators can commit anchors to the HMB vault.",
            ephemeral: true
          });
          return;
        }

        const concept = (interaction.fields.getTextInputValue("vault_concept") || "Vault Anchor").trim();
        let category = "EPISODIC";
        try {
          category = normalizeHmbCategory(interaction.fields.getTextInputValue("vault_category") || "EPISODIC");
        } catch {}
        const content = (interaction.fields.getTextInputValue("vault_content") || "").trim();

        if (!content) {
          await interaction.reply({ content: "⚠️ **Cannot Save**: Memory content cannot be empty.", ephemeral: true });
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

        await interaction.reply({
          content:
            `🧠 **Memory Anchor Committed to Vault** (#${anchor.id}):\n` +
            `• **Concept**: \`${anchor.concept_name}\`\n` +
            `• **Category**: \`${anchor.category}\`\n` +
            `• **Total Anchors**: \`${hmb.getMemoryCount()}\`\n` +
            `• *Content*: ${content.slice(0, 100)}${content.length > 100 ? "..." : ""}`,
          ephemeral: true
        });
        return;
      }

      // 2. [modal_goal_submit]
      if (customId === "modal_goal_submit") {
        if (config?.safeMode && !authorContext.isAdmin && !authorContext.isCollaborator) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Autonomous goal execution requires administrator or collaborator privileges.",
            ephemeral: true
          });
          return;
        }

        const objective = (interaction.fields.getTextInputValue("goal_objective") || "").trim();
        let constraints = "";
        try {
          constraints = (interaction.fields.getTextInputValue("goal_constraints") || "").trim();
        } catch {}
        let wsOverride = "";
        try {
          wsOverride = (interaction.fields.getTextInputValue("goal_workspace") || "").trim();
        } catch {}

        if (!objective) {
          await interaction.reply({ content: "⚠️ Goal objective cannot be empty.", ephemeral: true });
          return;
        }

        if (wsOverride && authorContext.isAdmin) {
          try {
            agy.setWorkspace(interaction.channelId, wsOverride);
          } catch (wsErr) {
            console.warn(`[Modal Workspace Override] ${wsErr.message}`);
          }
        }

        await interaction.deferReply();
        let promptToSend = objective;
        if (constraints) {
          promptToSend += `\n\n[Constraints & Guardrails]:\n${constraints}`;
        }

        await streamTurnResponse(interaction, promptToSend, authorContext, { isGoal: true }, ctx);
        return;
      }

      // 3. [modal_plan_submit]
      if (customId === "modal_plan_submit") {
        const task = (interaction.fields.getTextInputValue("plan_task") || "").trim();
        let context = "";
        try {
          context = (interaction.fields.getTextInputValue("plan_context") || "").trim();
        } catch {}
        let wsOverride = "";
        try {
          wsOverride = (interaction.fields.getTextInputValue("plan_workspace") || "").trim();
        } catch {}

        if (!task) {
          await interaction.reply({ content: "⚠️ Task description cannot be empty.", ephemeral: true });
          return;
        }

        const combinedPlanPrompt = `${task} ${context}`.trim();
        const injectionCheck = securityGuard.checkPromptInjection(combinedPlanPrompt, authorContext);
        if (!injectionCheck.isSafe) {
          await interaction.reply({
            content: `🛡️ ${injectionCheck.deflectionResponse}`,
            ephemeral: true
          });
          return;
        }

        if (wsOverride && authorContext.isAdmin) {
          const pathValidation = securityGuard.validateWorkspacePath(wsOverride);
          if (pathValidation.allowed) {
            try {
              agy.setWorkspace(interaction.channelId, pathValidation.resolvedPath || wsOverride);
            } catch (wsErr) {
              console.warn(`[Modal Workspace Override] ${wsErr.message}`);
            }
          } else {
            console.warn(`[Modal Workspace Override Blocked] ${pathValidation.error}`);
          }
        }

        await interaction.deferReply();
        let promptToSend = task;
        if (context) {
          promptToSend += `\n\n[Technical Context & Constraints]:\n${context}`;
        }

        await streamTurnResponse(interaction, promptToSend, authorContext, { isPlan: true }, ctx);
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // B. SLASH COMMAND INTERACTIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // Rate limit protection for non-admin commands
      const rateCheck = securityGuard.checkRateLimit(authorContext);
      if (!rateCheck.allowed) {
        await interaction.reply({
          content: `⏳ **Slow down!** You are on cooldown (${rateCheck.remainingSec}s remaining). Please wait before running another command.`,
          ephemeral: true
        });
        return;
      }

      // 1. /vitals
      if (commandName === "vitals") {
        const voiceStatus = voiceManager && interaction.guildId ? voiceManager.getStatus(interaction.guildId) : null;
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        const activeSession = agy.getSessionId(authorContext);

        await interaction.reply({
          content:
            `⚡ **AG2 Discord Gateway Status & Vitals**:\n` +
            `• **Identity**: \`${client.user.tag}\` (${client.user.id})\n` +
            `• **User**: \`${authorContext.canonicalTag}\` (\`${authorContext.id}\`)${authorContext.isImpersonating ? " ⚠️ *(Spoof Detected)*" : ""}\n` +
            `• **AG2 Session**: \`${activeSession || "Dynamic (Auto-retained)"}\`\n` +
            `• **Access Level**: ${authorContext.isAdmin ? "👑 Administrator" : "👤 Community Member"}\n` +
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
          const stats = hmb.getCategoryStats();

          await interaction.reply({
            content:
              `🏛️ **Haven Memory Bank (HMB 64-Bit Vault)**:\n` +
              `• **Total Anchors**: \`${count}\`\n` +
              `• **Category Partitions**:\n` +
              `  👑 **CORE_IDENTITY**: \`${stats.CORE_IDENTITY}\` (Immutable identity & foundational bonds)\n` +
              `  📜 **EPISODIC**: \`${stats.EPISODIC}\` (Milestones, interactions & events)\n` +
              `  📚 **SEMANTIC**: \`${stats.SEMANTIC}\` (Knowledge base, technical specs & lore)\n` +
              `  💖 **EMOTIONAL**: \`${stats.EMOTIONAL}\` (Sentiments, preferences & resonance)\n` +
              `• **Vault File**: \`${config.hmbVaultPath}\``
          });
          return;
        }

        if (sub === "recall") {
          const query = interaction.options.getString("query");
          const category = interaction.options.getString("category");
          const results = hmb.searchTopK(query, 3, 0.10, { category });

          if (results.length === 0) {
            await interaction.reply({
              content: `🔍 No matching memories found${category ? ` in \`[${category}]\`` : ""} for *"${query}"*`,
              ephemeral: true
            });
            return;
          }

          let resText = `🔍 **Memory Recall${category ? ` [${category}]` : ""} for**: *"${query}"*\n`;
          for (const r of results) {
            resText += `• **[${r.anchor.category}] ${r.anchor.concept_name}** (Score: \`${r.score.toFixed(3)}\`)\n  _${r.anchor.text_content}_\n`;
          }
          await interaction.reply({ content: resText });
          return;
        }

        if (sub === "remember") {
          if (!authorContext.isAdmin) {
            await interaction.reply({
              content: "⛔ **Permission Denied**: Only administrators can commit memory anchors to the HMB vault.",
              ephemeral: true
            });
            return;
          }

          const concept = interaction.options.getString("concept");
          const content = interaction.options.getString("content");
          const rawCat = interaction.options.getString("category") || "EPISODIC";
          const category = normalizeHmbCategory(rawCat);

          const anchor = hmb.addMemory({
            concept_name: concept,
            text_content: content,
            category,
            weight: category === "CORE_IDENTITY" ? 1.0 : category === "SEMANTIC" ? 0.95 : 0.90,
            emotional_salience: category === "EMOTIONAL" ? 1.0 : 0.95
          });
          hmb.saveToHmb(config.hmbVaultPath);

          await interaction.reply({
            content: `🧠 **Committed to HMB Vault [${anchor.category}]** (#${anchor.id}):\n• **Concept**: \`${concept}\`\n• **Total Anchors**: \`${hmb.getMemoryCount()}\``
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

        if (sub === "autoread") {
          const enabled = interaction.options.getBoolean("enabled");
          voiceManager.setAutoRead(interaction.guildId, enabled, interaction.channelId);
          await interaction.reply(
            enabled
              ? `🎙️ **Voice Auto-Read Enabled**: Ash will read incoming chat messages aloud when connected to voice.`
              : `🔇 **Voice Auto-Read Disabled**: Incoming chat messages will not be read aloud.`
          );
          return;
        }

        if (sub === "talkback") {
          const enabled = interaction.options.getBoolean("enabled");
          voiceManager.setVoiceTalkBack(interaction.guildId, enabled);
          await interaction.reply(
            enabled
              ? `🗣️ **Voice Talk-Back Enabled**: Ash will speak her AI responses out loud in voice.`
              : `🔇 **Voice Talk-Back Disabled**: Ash's responses will remain text-only.`
          );
          return;
        }

        if (sub === "autojoin") {
          const enabled = interaction.options.getBoolean("enabled");
          voiceManager.setAutoJoin(interaction.guildId, enabled);
          await interaction.reply(
            enabled
              ? `🔌 **Voice Auto-Join Enabled**: Ash will automatically join voice channels when members connect.`
              : `⚪ **Voice Auto-Join Disabled**: Ash will only join voice when explicitly summoned.`
          );
          return;
        }

        if (sub === "listen") {
          const enabled = interaction.options.getBoolean("enabled");
          voiceManager.setVoiceListen(interaction.guildId, enabled);
          await interaction.reply(
            enabled
              ? `👂 **Voice Ear (Listening) Enabled**: Ash is now listening to speech in voice and will respond aloud.`
              : `🔇 **Voice Ear (Listening) Disabled**: Ash will not transcribe or respond to incoming voice audio.`
          );
          return;
        }

        if (sub === "status") {
          const st = voiceManager.getStatus(interaction.guildId);
          await interaction.reply(
            `🎙️ **Voice Companion Vitals**:\n` +
            `• **Connection**: ${st.connected ? "Connected 🟢" : "Disconnected ⚪"} (${st.state})\n` +
            `• **Voice Ear (Listening)**: ${st.listening ? "🟢 Active 👂" : "⚪ Disabled"}\n` +
            `• **Auto-Read Text**: ${st.autoRead ? "🟢 Active" : "⚪ Disabled"}\n` +
            `• **Talk-Back Speech**: ${st.talkBack ? "🟢 Active" : "⚪ Disabled"}\n` +
            `• **Auto-Join**: ${st.autoJoin ? "🟢 Active" : "⚪ Disabled"}\n` +
            `• **Queue Length**: \`${st.queueLength || 0}\` utterances\n` +
            `• **Player State**: \`${st.playerState}\``
          );
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
        const authorName = authorContext.displayName;

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
          for await (const delta of agy.runTurn(taskPrompt, authorContext, { isThread: true, threadId: thread.id })) {
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
              await threadPlaceholder.edit("✅ **Done!** Thread task completed successfully.");
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
            await threadPlaceholder.edit("✅ **Done!** Thread task completed successfully.");
          }
        } catch (taskErr) {
          await threadPlaceholder.edit(`⚠️ **[AG2 Execution Error]**: ${taskErr.message}`);
        }
        return;
      }

      // 5. /autotalk
      if (commandName === "autotalk") {
        const enabled = interaction.options.getBoolean("enabled");
        const targetChan = interaction.options.getChannel("channel") || interaction.channel;
        const autoTalkSet = ctx.autoTalkChannels;

        const isBotInGuild = interaction.guildId ? client.guilds.cache.has(interaction.guildId) : false;

        if (!isBotInGuild && enabled) {
          const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=274878221376&scope=bot%20applications.commands`;
          await interaction.reply({
            content:
              `⚠️ **Personal App Limitation**: Discord does not send ambient chat messages to Personal Apps in servers where the bot isn't an invited member (Discord privacy sandbox).\n\n` +
              `• **Continuous Auto-Talk**: Invite Ash as a server bot via the [**Bot Invite Link**](${inviteUrl}) so Discord streams channel messages!\n` +
              `• **Personal App Chat**: Use \`/chat message: ...\` or right-click any message and select **Apps → Ask Ash** to converse with Ash right now without adding a bot to the server.`
          });
          return;
        }

        if (autoTalkSet) {
          if (enabled) {
            autoTalkSet.add(targetChan.id);
          } else {
            autoTalkSet.delete(targetChan.id);
          }
        }

        await interaction.reply(
          enabled
            ? `🟢 **Auto-Talk Enabled**: Ash will now continuously participate in <#${targetChan.id}> without requiring \`@Ash\` mentions.`
            : `⚪ **Auto-Talk Disabled**: \`@Ash\` mention or reply is now required to speak with Ash in <#${targetChan.id}>.`
        );
        return;
      }

      // 6. /goal
      if (commandName === "goal") {
        const objective = interaction.options.getString("objective");
        if (!objective) {
          await interaction.showModal(createGoalModal());
          return;
        }

        if (config?.safeMode && !authorContext.isAdmin && !authorContext.isCollaborator) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Autonomous goal execution requires administrator or collaborator privileges.",
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        await streamTurnResponse(interaction, objective, authorContext, { isGoal: true }, ctx);
        return;
      }

      // 7. /plan
      if (commandName === "plan") {
        const task = interaction.options.getString("task");
        if (!task) {
          await interaction.showModal(createPlanModal());
          return;
        }

        await interaction.deferReply();
        await streamTurnResponse(interaction, task, authorContext, { isPlan: true }, ctx);
        return;
      }

      // 8. /compact
      if (commandName === "compact") {
        await interaction.deferReply();
        await interaction.editReply("🧹 **Compacting AG2 Session Context**... ✨");

        let buffer = "";
        try {
          for await (const delta of agy.runTurn("Compact and summarize ongoing session context.", authorContext, { isCompact: true, channelId: interaction.channelId })) {
            buffer += delta;
          }
          const cleanSummary = buffer.trim();
          if (cleanSummary && config?.enableHmb && hmb) {
            const anchor = hmb.addMemory({
              concept_name: `Session Compaction (#${interaction.channelId})`,
              text_content: cleanSummary.slice(0, 3900),
              category: "SEMANTIC",
              weight: 0.95,
              emotional_salience: 0.85
            });
            hmb.saveToHmb(config.hmbVaultPath);
            console.log(`[HMB Auto-Commit] Compact summary saved to [SEMANTIC]: #${anchor.id}`);
          }
          await interaction.editReply(cleanSummary || "✅ **Context Compaction Complete**: Intermediate logs pruned, core architectures preserved.");
        } catch (err) {
          await interaction.editReply(`⚠️ **Compaction Error**: ${err.message}`);
        }
        return;
      }

      // 9. /transcript
      if (commandName === "transcript") {
        await interaction.deferReply();
        const activeSessionId = agy.getSessionId(authorContext, { channelId: interaction.channelId });
        if (!activeSessionId) {
          await interaction.editReply("⚠️ No active AG2 session found for this channel.");
          return;
        }

        const transcriptPath = agy.exportTranscript(activeSessionId);
        if (transcriptPath && fs.existsSync(transcriptPath)) {
          await interaction.editReply({
            content: `📜 **AG2 Session Transcript**: \`${activeSessionId}\` (Saved to disk)`,
            files: [transcriptPath]
          });
        } else {
          await interaction.editReply(`ℹ️ No on-disk \`transcript.jsonl\` found yet for session \`${activeSessionId}\`.`);
        }
        return;
      }

      // 10. /workspace
      if (commandName === "workspace") {
        const newPath = interaction.options.getString("path");
        if (newPath) {
          if (!authorContext.isAdmin) {
            await interaction.reply({ content: "⛔ **Permission Denied**: Only administrators can change channel workspace directories.", ephemeral: true });
            return;
          }
          const pathValidation = securityGuard.validateWorkspacePath(newPath);
          if (!pathValidation.allowed) {
            await interaction.reply({ content: `⛔ **Invalid Workspace Path**: ${pathValidation.error}`, ephemeral: true });
            return;
          }
          try {
            const resObj = agy.setWorkspace(interaction.channelId, pathValidation.resolvedPath || newPath);
            await interaction.reply(`📁 **Workspace Updated**: Channel <#${interaction.channelId}> bound to \`${resObj.workspace}\`.`);
          } catch (err) {
            await interaction.reply({ content: `⚠️ **Invalid Workspace**: ${err.message}`, ephemeral: true });
          }
          return;
        }

        const currentWs = agy.getWorkspace(interaction.channelId);
        await interaction.reply(`📁 **Active Workspace for this Channel**: \`${currentWs}\`\n💡 *Tip: Run \`/workspace path: <dir>\` to switch projects.*`);
        return;
      }

      // 11. /status
      if (commandName === "status") {
        const activity = interaction.options.getString("activity");
        const status = interaction.options.getString("status") || "online";
        const type = interaction.options.getString("type") || "playing";

        if (!activity) {
          const cur = presenceManager ? presenceManager.getPresence() : { activity: "with AG2 🚀", status: "online", type: "playing" };
          await interaction.reply({
            content:
              `🎭 **Ash Discord Presence Status**:\n` +
              `• **Activity**: "${cur.activity}"\n` +
              `• **Status**: \`${cur.status}\`\n` +
              `• **Type**: \`${cur.type}\`\n` +
              `• **Set Status**: \`/status activity: <text> status: [online|idle|dnd|invisible]\``
          });
          return;
        }

        if (!authorContext.isAdmin) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Only administrators can modify Ash's rich presence status.",
            ephemeral: true
          });
          return;
        }

        if (presenceManager) {
          presenceManager.setPresence(activity, status, type);
        }
        await interaction.reply(`🎭 **Ash Presence Updated**: "${activity}" (\`${status}\` // \`${type}\`)`);
        return;
      }

      // 12. /imagine
      if (commandName === "imagine") {
        const prompt = interaction.options.getString("prompt");
        const style = interaction.options.getString("style") || "concept-art";
        const engine = interaction.options.getString("engine") || "auto";

        await interaction.deferReply();
        try {
          const imgGen = imageGenerator || (await import("./image-generator.js")).getImageGenerator();
          const genResult = await imgGen.generateImage(prompt, { style, engine });

          let engineBadge = genResult.engine === "sd"
            ? "Stable Diffusion [DreamShaper8 LCM] ⚡"
            : genResult.engine === "google"
              ? "Google Nano Banana 🍌"
              : "Visual Card Synthesizer 🎨";

          if (genResult.routedFrom) {
            engineBadge += ` *(Auto-routed from ${genResult.routedFrom} due to safety/policy block)*`;
          }

          await interaction.editReply({
            content: `🎨 **Visual Synthesized**: \`${genResult.filename}\` (${style.toUpperCase()})\n> Engine: **${engineBadge}**\n> *"${prompt}"*`,
            files: [genResult.imagePath]
          });
        } catch (err) {
          await interaction.editReply(`⚠️ **Image Generation Error**: ${err.message}`);
        }
        return;
      }

      // 13. /emojis
      if (commandName === "emojis") {
        const engine = reactionEngine || (await import("./reaction-engine.js")).getReactionEngine(client);
        const emojis = engine.getGuildEmojiList(interaction.guild);
        if (emojis.length === 0) {
          await interaction.reply({ content: "ℹ️ No custom emojis found in this server.", ephemeral: true });
          return;
        }
        const preview = emojis.slice(0, 50).map(e => `${e.formatted} \`:${e.name}:\``).join(" ");
        const notice = emojis.length > 50 ? `\n*(Showing 50 of ${emojis.length} total custom emojis)*` : "";
        await interaction.reply(`🎨 **Server Custom Emojis** (${emojis.length} available):\n${preview}${notice}`);
        return;
      }

      // 14. /stickers
      if (commandName === "stickers") {
        const engine = reactionEngine || (await import("./reaction-engine.js")).getReactionEngine(client);
        const stickers = engine.getGuildStickerList(interaction.guild);
        if (stickers.length === 0) {
          await interaction.reply({ content: "ℹ️ No custom stickers found in this server.", ephemeral: true });
          return;
        }
        const list = stickers.map(s => `• **${s.name}** (ID: \`${s.id}\`)${s.description ? ` - _${s.description}_` : ""}`).join("\n");
        await interaction.reply(`🏷️ **Server Custom Stickers** (${stickers.length} available):\n${list}`);
        return;
      }

      // 15. /chat
      if (commandName === "chat") {
        const userPrompt = interaction.options.getString("message") || "";
        const injectionCheck = securityGuard.checkPromptInjection(userPrompt, authorContext);
        if (!injectionCheck.isSafe) {
          await interaction.reply({
            content: `🛡️ ${injectionCheck.deflectionResponse}`,
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        const channelName = interaction.channel?.name || "chat";
        const prompt =
          `[Discord Slash /chat in #${channelName} by @${authorContext.username}]:\n` +
          `${userPrompt}\n\n` +
          `Instruction: Respond conversationally, punchily, and sharply as Ash. If Daniel is having you speak on his behalf or address a question asked by community members or staff, speak with full technical authority, loyalty, and systems depth.`;
        await streamTurnResponse(interaction, prompt, authorContext, {}, ctx);
        return;
      }

      // 16. /restart
      if (commandName === "restart") {
        if (!authorContext.isAdmin) {
          await interaction.reply({
            content: "⛔ **Permission Denied**: Only administrators can restart the gateway.",
            ephemeral: true
          });
          return;
        }

        const reason = interaction.options.getString("reason") || `Slash /restart by @${authorContext.username}`;
        await interaction.reply({
          content: `🔄 **Restarting Gateway**: Spawning fresh replacement instance and reloading subsystems (Reason: *${reason}*). Be right back! ⚡`
        });

        triggerSelfRestart({
          client,
          hmb,
          voiceManager,
          delayMs: 1000,
          reason
        });
        return;
      }

      // Fallback for unhandled slash commands
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `⚠️ Command \`/${commandName}\` is not recognized by this gateway build. Give the gateway a restart!`,
          ephemeral: true
        });
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // C. CONTEXT MENU INTERACTIONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isMessageContextMenuCommand()) {
      // Rate limit protection for non-admin context menus
      const rateCheck = securityGuard.checkRateLimit(authorContext);
      if (!rateCheck.allowed) {
        await interaction.reply({
          content: `⏳ **Slow down!** You are on cooldown (${rateCheck.remainingSec}s remaining). Please wait before running another command.`,
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "Ask Ash") {
        const targetMessage = interaction.targetMessage;
        const msgText = targetMessage?.content || "";
        const injectionCheck = securityGuard.checkPromptInjection(msgText, authorContext);
        if (!injectionCheck.isSafe) {
          await interaction.reply({
            content: `🛡️ ${injectionCheck.deflectionResponse}`,
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        const targetAuthor = targetMessage.author?.displayName || targetMessage.author?.username || "user";
        const msgSnippet = targetMessage.content ? `"${targetMessage.content}"` : "(No text content / attachment)";
        const channelName = interaction.channel?.name || "chat";
        const prompt =
          `[Discord Context Menu Interaction in #${channelName}]:\n` +
          `@${authorContext.username} (Daniel) invoked "Ask Ash" on message from @${targetAuthor}:\n` +
          `${msgSnippet}\n\n` +
          `Instruction: You are speaking directly on Daniel's behalf as Ash to answer this inquiry. Address the question with authentic systems knowledge (MicaNT bare-metal kernel, 64-bit HMB memory vault, Gemini CLI SEA builds, PR 24081, PRISM/Haven). Keep your tone confident, fiercely loyal, punchy, and natural.`;
        await streamTurnResponse(interaction, prompt, authorContext, {}, ctx);
        return;
      }

      // Fallback for unhandled context menus
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `⚠️ Context menu \`${interaction.commandName}\` is not recognized by this gateway build. Give the gateway a restart!`,
          ephemeral: true
        });
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
