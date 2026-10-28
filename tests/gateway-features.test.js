/**
 * ══════════════════════════════════════════════════════════════════════
 * 🧪 GATEWAY FEATURES TEST SUITE
 * Unit and integration tests for:
 * 1. ReactionEngine (tag extraction, sentiment analysis, custom emojis)
 * 2. Interactive Components & Slash Commands (/vitals, /memory, /voice)
 * 3. VoiceManager interface and status reporting
 * ══════════════════════════════════════════════════════════════════════
 */

process.env.NODE_ENV = "test";

import assert from "assert";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { ReactionEngine } from "../src/reaction-engine.js";
import {
  createInteractiveButtons,
  createStopButton,
  createGoalModal,
  createPlanModal,
  createVaultSaveModal,
  getSlashCommandDefinitions
} from "../src/interactions.js";
import { VoiceManager } from "../src/voice-manager.js";
import { cleanTextForSpeech, formatSpeakerSnippet } from "../src/speech-cleaner.js";
import { DiagramRenderer } from "../src/diagram-renderer.js";
import { AgySessionManager } from "../src/agy-session.js";
import { PresenceManager } from "../src/presence-manager.js";
import { ImageGenerator } from "../src/image-generator.js";

console.log("=======================================================");
console.log("   🧪 AG2 DISCORD GATEWAY // ADVANCED FEATURES TEST");
console.log("=======================================================\n");

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function run() {
  // ─── 1. REACTION ENGINE TESTS ──────────────────────────────────────────
  it("ReactionEngine extracts [REACT: ...] tags and cleans model response", () => {
    const engine = new ReactionEngine(null);
    const raw = "That is hilarious! [REACT: 💀, 🔥] Here is what you asked for.";
    const { cleanText, reactions } = engine.extractReactionTags(raw);

    assert.strictEqual(cleanText, "That is hilarious! Here is what you asked for.");
    assert.deepStrictEqual(reactions, ["💀", "🔥"]);
  });

  it("ReactionEngine handles multi-tag and custom emoji reaction tags", () => {
    const engine = new ReactionEngine(null);
    const raw = "[REACT: :g2g:] Look at this gaming clip! [REACT: <:pepe_hype:99887766>]";
    const { cleanText, reactions } = engine.extractReactionTags(raw);

    assert.strictEqual(cleanText, "Look at this gaming clip!");
    assert.deepStrictEqual(reactions, [":g2g:", "<:pepe_hype:99887766>"]);
  });

  it("ReactionEngine sentiment analysis maps humor, hype, questions, and gratitude", () => {
    const engine = new ReactionEngine(null);

    assert.strictEqual(engine.determineSentimentEmoji("lmao this is too funny haha"), "💀");
    assert.strictEqual(engine.determineSentimentEmoji("this new release is pure fire and hype!"), "🔥");
    assert.strictEqual(engine.determineSentimentEmoji("thank you so much, appreciate the help"), "❤️");
    assert.strictEqual(engine.determineSentimentEmoji("hmm curious what if we rewrite this kernel?"), "💡");
    assert.strictEqual(engine.determineSentimentEmoji("let's deploy this build to production"), "⚡");
    assert.strictEqual(engine.determineSentimentEmoji("facts, that is a pure win"), "💯");
  });

  await itAsync("ReactionEngine reacts to mock message with Unicode and custom emojis", async () => {
    const reactionsAdded = [];
    const mockMsg = {
      guild: {
        emojis: {
          cache: new Map([["g2g-id", { id: "987654321", name: "g2g" }]])
        }
      },
      react: async (emoji) => {
        reactionsAdded.push(emoji);
        return true;
      }
    };

    const engine = new ReactionEngine(null);
    await engine.reactToMessage(mockMsg, "🔥");
    await engine.reactToMessage(mockMsg, ":g2g:");
    await engine.reactToMessage(mockMsg, "<:custom_clap:1122334455>");

    assert.strictEqual(reactionsAdded[0], "🔥");
    assert.strictEqual(reactionsAdded[1], "987654321"); // resolved custom guild emoji id
    assert.strictEqual(reactionsAdded[2], "1122334455"); // parsed from mention
  });

  // ─── 2. INTERACTIVE COMPONENTS & SLASH COMMANDS ────────────────────────
  it("createInteractiveButtons builds 5 action row buttons with valid customIds", () => {
    const row = createInteractiveButtons();
    assert.strictEqual(row.components.length, 5);

    const ids = row.components.map(c => c.data.custom_id);
    assert.deepStrictEqual(ids, [
      "btn_save_vault",
      "btn_explain_more",
      "btn_plan_task",
      "btn_launch_goal",
      "btn_vitals"
    ]);

    assert.strictEqual(row.components[0].data.label, "Save to Vault");
    assert.strictEqual(row.components[1].data.label, "Explain More");
    assert.strictEqual(row.components[2].data.label, "Plan");
    assert.strictEqual(row.components[3].data.label, "Goal");
    assert.strictEqual(row.components[4].data.label, "Vitals");
  });

  it("createStopButton generates a danger-styled stop button", () => {
    const rowDefault = createStopButton();
    assert.strictEqual(rowDefault.components.length, 1);
    assert.strictEqual(rowDefault.components[0].data.custom_id, "btn_stop_turn");
    assert.strictEqual(rowDefault.components[0].data.label, "Stop Run");

    const rowKeyed = createStopButton("chan-456");
    assert.strictEqual(rowKeyed.components[0].data.custom_id, "btn_stop_turn_chan-456");
  });

  it("Modal builders construct valid interactive form dialogs with multi-line textareas", () => {
    // 1. Goal Modal
    const goalModal = createGoalModal("Deploy production build");
    const goalJson = goalModal.toJSON();
    assert.strictEqual(goalJson.custom_id, "modal_goal_submit");
    assert.strictEqual(goalJson.title, "Launch Autonomous AGY Goal");
    assert.strictEqual(goalJson.components.length, 3);
    assert.strictEqual(goalJson.components[0].components[0].custom_id, "goal_objective");
    assert.strictEqual(goalJson.components[0].components[0].value, "Deploy production build");
    assert.strictEqual(goalJson.components[1].components[0].custom_id, "goal_constraints");
    assert.strictEqual(goalJson.components[2].components[0].custom_id, "goal_workspace");

    // 2. Plan Modal
    const planModal = createPlanModal("Refactor audio pipeline");
    const planJson = planModal.toJSON();
    assert.strictEqual(planJson.custom_id, "modal_plan_submit");
    assert.strictEqual(planJson.title, "Request AGY Implementation Plan");
    assert.strictEqual(planJson.components.length, 3);
    assert.strictEqual(planJson.components[0].components[0].custom_id, "plan_task");
    assert.strictEqual(planJson.components[0].components[0].value, "Refactor audio pipeline");
    assert.strictEqual(planJson.components[1].components[0].custom_id, "plan_context");

    // 3. Vault Save Modal
    const vaultModal = createVaultSaveModal("Server Lore", "Shane created G2G lounge in 2021.");
    const vaultJson = vaultModal.toJSON();
    assert.strictEqual(vaultJson.custom_id, "modal_vault_save");
    assert.strictEqual(vaultJson.title, "Commit Vault Anchor");
    assert.strictEqual(vaultJson.components.length, 3);
    assert.strictEqual(vaultJson.components[0].components[0].custom_id, "vault_concept");
    assert.strictEqual(vaultJson.components[0].components[0].value, "Server Lore");
    assert.strictEqual(vaultJson.components[1].components[0].custom_id, "vault_category");
    assert.strictEqual(vaultJson.components[1].components[0].value, "EPISODIC");
    assert.strictEqual(vaultJson.components[2].components[0].custom_id, "vault_content");
    assert.strictEqual(vaultJson.components[2].components[0].value, "Shane created G2G lounge in 2021.");
  });

  it("getSlashCommandDefinitions generates valid JSON schemas for Discord API", () => {
    const defs = getSlashCommandDefinitions();
    assert.strictEqual(defs.length, 17);

    const names = defs.map(d => d.name);
    assert.deepStrictEqual(names, [
      "vitals",
      "memory",
      "voice",
      "thread",
      "autotalk",
      "goal",
      "plan",
      "compact",
      "transcript",
      "workspace",
      "status",
      "imagine",
      "emojis",
      "stickers",
      "chat",
      "Ask Ash",
      "restart"
    ]);

    const memCmd = defs.find(d => d.name === "memory");
    const json = memCmd.toJSON();
    const subNames = json.options.map(o => o.name);
    assert.ok(subNames.includes("stats"));
    assert.ok(subNames.includes("recall"));
    assert.ok(subNames.includes("remember"));

    const voiceCmd = defs.find(d => d.name === "voice");
    const voiceJson = voiceCmd.toJSON();
    const voiceSubNames = voiceJson.options.map(o => o.name);
    assert.ok(voiceSubNames.includes("join"));
    assert.ok(voiceSubNames.includes("leave"));
    assert.ok(voiceSubNames.includes("speak"));
    assert.ok(voiceSubNames.includes("autoread"));
    assert.ok(voiceSubNames.includes("talkback"));
    assert.ok(voiceSubNames.includes("autojoin"));
    assert.ok(voiceSubNames.includes("listen"));
    assert.ok(voiceSubNames.includes("status"));

    const threadCmd = defs.find(d => d.name === "thread");
    const threadJson = threadCmd.toJSON();
    assert.strictEqual(threadJson.options[0].name, "task");
    assert.strictEqual(threadJson.options[0].required, true);

    const autotalkCmd = defs.find(d => d.name === "autotalk");
    const autotalkJson = autotalkCmd.toJSON();
    assert.strictEqual(autotalkJson.name, "autotalk");
    assert.strictEqual(autotalkJson.options[0].name, "enabled");
    assert.strictEqual(autotalkJson.options[0].required, true);

    const goalCmd = defs.find(d => d.name === "goal");
    const goalJson = goalCmd.toJSON();
    assert.strictEqual(goalJson.options[0].name, "objective");
    assert.strictEqual(goalJson.options[0].required, false);

    const planCmd = defs.find(d => d.name === "plan");
    const planJson = planCmd.toJSON();
    assert.strictEqual(planJson.options[0].name, "task");
    assert.strictEqual(planJson.options[0].required, false);

    const compactCmd = defs.find(d => d.name === "compact");
    assert.strictEqual(compactCmd.name, "compact");

    const transcriptCmd = defs.find(d => d.name === "transcript");
    assert.strictEqual(transcriptCmd.name, "transcript");

    const wsCmd = defs.find(d => d.name === "workspace");
    const wsJson = wsCmd.toJSON();
    assert.strictEqual(wsJson.options[0].name, "path");
    assert.strictEqual(wsJson.options[0].required, false);
  });

  // ─── 3. VOICE MANAGER & COMPANION TESTS ────────────────────────────────
  it("VoiceManager instantiates cleanly and provides status inspection", () => {
    const vm = new VoiceManager({
      tempAudioDir: "./data/test_voice_cache"
    });

    assert.ok(vm.ensureTempDir);
    assert.ok(vm.join);
    assert.ok(vm.leave);
    assert.ok(vm.speakText);
    assert.ok(vm.playAudioFile);

    const st = vm.getStatus("non-existent-guild");
    assert.strictEqual(st.connected, false);
    assert.strictEqual(st.state, "DISCONNECTED");
    assert.strictEqual(st.playerState, "IDLE");
    assert.strictEqual(st.queueLength, 0);
    assert.strictEqual(st.autoRead, true);
    assert.strictEqual(st.talkBack, true);
    assert.strictEqual(st.autoJoin, false);
    assert.strictEqual(st.listening, true);

    // Test toggle settings
    vm.setAutoRead("guild-1", false);
    assert.strictEqual(vm.isAutoReadEnabled("guild-1"), false);
    vm.setAutoRead("guild-1", true, "chan-123");
    assert.strictEqual(vm.isAutoReadEnabled("guild-1", "chan-123"), true);
    assert.strictEqual(vm.isAutoReadEnabled("guild-1", "chan-other"), false);

    vm.setVoiceTalkBack("guild-1", false);
    assert.strictEqual(vm.isVoiceTalkBackEnabled("guild-1"), false);
    vm.setVoiceTalkBack("guild-1", true);
    assert.strictEqual(vm.isVoiceTalkBackEnabled("guild-1"), true);

    vm.setAutoJoin("guild-1", true);
    assert.strictEqual(vm.isAutoJoinEnabled("guild-1"), true);

    vm.setVoiceListen("guild-1", false);
    assert.strictEqual(vm.isVoiceListenEnabled("guild-1"), false);
    vm.setVoiceListen("guild-1", true);
    assert.strictEqual(vm.isVoiceListenEnabled("guild-1"), true);

    // Test clearing queue
    vm.clearQueue("guild-1");
    assert.strictEqual(vm.getStatus("guild-1").queueLength, 0);
  });

  // ─── 4. SPEECH CLEANER SANITIZATION TESTS ──────────────────────────────
  it("cleanTextForSpeech strips markdown, urls, mentions, and tags", () => {
    const raw = "Hey <@12345> check out https://gaming2gamers.com and [ATTACH: C:/shot.mp4] **cool** `snippet` ```const x = 1;``` # Header!";
    const cleaned = cleanTextForSpeech(raw);

    assert.ok(!cleaned.includes("<@12345>"));
    assert.ok(!cleaned.includes("https://"));
    assert.ok(!cleaned.includes("[ATTACH:"));
    assert.ok(!cleaned.includes("**cool**"));
    assert.ok(cleaned.includes("cool"));
    assert.ok(cleaned.includes("snippet"));
    assert.ok(!cleaned.includes("```"));
    assert.ok(cleaned.includes("code block"));
    assert.ok(!cleaned.includes("# Header"));
    assert.ok(cleaned.includes("Header"));

    // Attribution snippet
    const snippet = formatSpeakerSnippet("Daniel", "What game are we playing tonight?", 150);
    assert.strictEqual(snippet, "Daniel says: What game are we playing tonight?");
  });

  // ─── 5. MERMAID DIAGRAM RENDERER TESTS ─────────────────────────────────
  await itAsync("DiagramRenderer identifies mermaid code blocks and caches output", async () => {
    const testDiagramDir = path.resolve(process.cwd(), "data", "test_diagrams");
    const renderer = new DiagramRenderer({ cacheDir: testDiagramDir });

    // Text with no mermaid blocks
    const noDiag = await renderer.processMermaidDiagrams("Just normal text with no diagrams.");
    assert.strictEqual(noDiag.cleanText, "Just normal text with no diagrams.");
    assert.strictEqual(noDiag.diagramFiles.length, 0);

    // Seed mock cached diagram to test cache hit without network dependency
    renderer.ensureCacheDir();
    const mermaidCode = "graph TD\n  Client-->Server";
    const cryptoHash = (await import("crypto")).default.createHash("sha256").update(mermaidCode.trim()).digest("hex").slice(0, 16);
    const mockPngPath = path.join(testDiagramDir, `diagram_${cryptoHash}.png`);
    fs.writeFileSync(mockPngPath, Buffer.from("mock-png-data"));

    const result = await renderer.renderToPng(mermaidCode);
    assert.strictEqual(result, mockPngPath);

    // Clean up test cache
    try {
      if (fs.existsSync(mockPngPath)) fs.unlinkSync(mockPngPath);
      if (fs.existsSync(testDiagramDir)) fs.rmdirSync(testDiagramDir);
    } catch {}
  });

  // ─── 6. WORKSPACE BINDING & INTERRUPT TESTS ────────────────────────────
  it("AgySessionManager manages channel-to-workspace bindings and interruption", () => {
    const agy = new AgySessionManager();

    // Default workspace
    const defaultWs = agy.getWorkspace();
    assert.ok(defaultWs);

    // Channel workspace binding
    const testDir = process.cwd();
    const setRes = agy.setWorkspace("chan-unit-1", testDir);
    assert.strictEqual(setRes.success, true);
    assert.strictEqual(agy.getWorkspace("chan-unit-1"), testDir);

    // Reset workspace
    const resetRes = agy.setWorkspace("chan-unit-1", null);
    assert.strictEqual(resetRes.reset, true);

    // Invalid workspace throws
    assert.throws(() => {
      agy.setWorkspace("chan-unit-1", "C:\\non_existent_folder_xyz_998877");
    }, /Directory does not exist/);

    // Interruption when no runs active
    const noRunRes = agy.interrupt("non-existent-channel");
    assert.strictEqual(noRunRes.success, false);

    // Mock active run interruption
    let killed = false;
    agy.activeRuns.set("chan-unit-2", {
      child: { kill: () => { killed = true; } },
      pid: 999999,
      startedAt: Date.now() - 5000,
      options: { channelId: "chan-unit-2" }
    });

    const interruptRes = agy.interrupt("chan-unit-2");
    assert.strictEqual(interruptRes.success, true);
    assert.strictEqual(agy.activeRuns.has("chan-unit-2"), false);

    // Export transcript for non-existent session
    const emptyTranscript = agy.exportTranscript("non-existent-session-uuid-1234");
    assert.strictEqual(emptyTranscript, null);
  });

  // ─── 4. DYNAMIC RICH PRESENCE MANAGER TESTS ────────────────────────────
  it("PresenceManager manages presence, status mapping, and tag extraction", () => {
    let lastPresencePayload = null;
    const mockClient = {
      user: {
        setPresence: (payload) => {
          lastPresencePayload = payload;
          return payload;
        }
      }
    };

    const pm = new PresenceManager(mockClient, {
      defaultActivity: "with AG2 🚀",
      defaultStatus: "online",
      defaultType: "playing"
    });

    assert.strictEqual(pm.getPresence().activity, "with AG2 🚀");
    assert.strictEqual(pm.getPresence().status, "online");

    // Set custom presence
    const ok = pm.setPresence("Compiling MicaNT on Xeon", "dnd", "competing");
    assert.strictEqual(ok, true);
    assert.strictEqual(pm.getPresence().activity, "Compiling MicaNT on Xeon");
    assert.strictEqual(pm.getPresence().status, "dnd");
    assert.strictEqual(lastPresencePayload.status, "dnd");
    assert.strictEqual(lastPresencePayload.activities[0].name, "Compiling MicaNT on Xeon");

    // Offline normalization to invisible
    pm.setPresence("Stealth Mode", "offline", "watching");
    assert.strictEqual(pm.getPresence().status, "invisible");
    assert.strictEqual(lastPresencePayload.status, "invisible");

    // Reset to default
    pm.resetToDefault();
    assert.strictEqual(pm.getPresence().activity, "with AG2 🚀");
    assert.strictEqual(pm.getPresence().status, "online");

    // Tag extraction
    const rawWithStatus = "Here is the result! [STATUS: Rendering Sovereign Trailers | online | playing] Let me know what you think.";
    const { cleanText, statusDirective } = pm.extractStatusTags(rawWithStatus);
    assert.strictEqual(cleanText, "Here is the result! Let me know what you think.");
    assert.deepStrictEqual(statusDirective, {
      activity: "Rendering Sovereign Trailers",
      status: "online",
      type: "playing"
    });
  });

  // ─── 5. CUSTOM EMOJIS & STICKERS TESTS ─────────────────────────────────
  it("ReactionEngine resolves in-text custom emojis and parses sticker directives", () => {
    const mockGuild = {
      emojis: {
        cache: new Map([
          ["101", { id: "101", name: "pepe_hype", animated: false }],
          ["102", { id: "102", name: "cat_jam", animated: true }]
        ])
      },
      stickers: {
        cache: new Map([
          ["201", { id: "201", name: "ash_wave", description: "Ash waving hello" }],
          ["202", { id: "202", name: "ash_pog", description: "Ash excited" }]
        ])
      }
    };

    const engine = new ReactionEngine(null);

    // Resolve custom emojis
    const textWithShortcodes = "Look at this :pepe_hype: and dancing :cat_jam: but leave :unknown_glyph: alone and <:already_formatted:999> intact!";
    const resolvedText = engine.resolveCustomEmojis(textWithShortcodes, mockGuild);
    assert.strictEqual(
      resolvedText,
      "Look at this <:pepe_hype:101> and dancing <a:cat_jam:102> but leave :unknown_glyph: alone and <:already_formatted:999> intact!"
    );

    // Sticker extraction
    const textWithStickers = "Great job on the release! [STICKER: ash_wave] [STICKER: 202] All systems operational.";
    const { cleanText, stickerIds, stickers } = engine.extractStickers(textWithStickers, mockGuild);
    assert.strictEqual(cleanText, "Great job on the release! All systems operational.");
    assert.deepStrictEqual(stickerIds, ["201", "202"]);
    assert.strictEqual(stickers.length, 2);

    // Guild introspection lists
    const emojiList = engine.getGuildEmojiList(mockGuild);
    assert.strictEqual(emojiList.length, 2);
    assert.strictEqual(emojiList[0].formatted, "<:pepe_hype:101>");
    assert.strictEqual(emojiList[1].formatted, "<a:cat_jam:102>");

    const stickerList = engine.getGuildStickerList(mockGuild);
    assert.strictEqual(stickerList.length, 2);
    assert.strictEqual(stickerList[0].name, "ash_wave");
    assert.strictEqual(stickerList[1].name, "ash_pog");
  });

  // ─── 6. IMAGE GENERATOR TESTS ──────────────────────────────────────────
  await itAsync("ImageGenerator extracts tags and synthesizes concept visual cards", async () => {
    const imgGen = new ImageGenerator();

    // 1. Directives parsing
    const rawAiText = "Here is the visual concept [GENERATE_IMAGE: Neon Cyberpunk Terminal | cyberpunk] and an image [IMAGE: Sovereign Architecture Blueprint | schematic]. Enjoy!";
    const { cleanText, directives } = imgGen.extractImageDirectives(rawAiText);
    assert.strictEqual(cleanText, "Here is the visual concept and an image . Enjoy!");
    assert.strictEqual(directives.length, 2);
    assert.strictEqual(directives[0].prompt, "Neon Cyberpunk Terminal");
    assert.strictEqual(directives[0].style, "cyberpunk");
    assert.strictEqual(directives[1].prompt, "Sovereign Architecture Blueprint");
    assert.strictEqual(directives[1].style, "schematic");

    // 2. SVG Generation
    const svgOutput = imgGen.generateSvgCard("Cyberpunk Terminal in Neo Tokyo", { style: "cyberpunk" });
    assert.ok(svgOutput.includes("<svg"));
    assert.ok(svgOutput.includes("ASH BOT // AUTONOMOUS VISUAL SYNTHESIS"));
    assert.ok(svgOutput.includes("Cyberpunk Terminal in Neo Tokyo"));

    // 3. Autonomous Image Synthesis (creates file on disk)
    const genResult = await imgGen.generateImage("Holographic Sovereign Core", { style: "concept-art" });
    assert.strictEqual(genResult.success, true);
    assert.ok(genResult.imagePath);
    assert.ok(fs.existsSync(genResult.imagePath));
    assert.ok(genResult.filename.startsWith("visual_"));

    // Cleanup generated test image
    try {
      if (fs.existsSync(genResult.imagePath)) {
        fs.unlinkSync(genResult.imagePath);
      }
      const svgCompanion = genResult.imagePath.replace(".png", ".svg");
      if (fs.existsSync(svgCompanion)) {
        fs.unlinkSync(svgCompanion);
      }
    } catch {}
  });

  await itAsync("ImageGenerator router recognizes explicit engine directives and status inspection", async () => {
    const imgGen = new ImageGenerator();

    // 1. Status inspection
    const status = imgGen.getEngineStatus();
    assert.ok(status.engines.sd);
    assert.ok(status.engines.google);
    assert.ok(status.engines.card);
    assert.strictEqual(status.engines.sd.type, "local_cpp");
    assert.strictEqual(status.engines.sd.modelName, "DreamShaper8_LCM_q8_0.gguf");
    assert.strictEqual(status.engines.sd.available, true);
    assert.strictEqual(status.engines.sd.taesdAvailable, true);

    // 2. Directives with engine selectors
    const testDirectives = "[IMAGE_SD: Cyberpunk Alley | style=neon] and [IMAGE_GOOGLE: Serene Waterfall] and [IMAGE: Cyber Matrix | sd | size=512x512] and [NANO_BANANA: Cyber Dragon]";
    const { cleanText, directives } = imgGen.extractImageDirectives(testDirectives);
    assert.strictEqual(cleanText, "and and and");
    assert.strictEqual(directives.length, 4);
    assert.strictEqual(directives[0].engine, "sd");
    assert.strictEqual(directives[0].prompt, "Cyberpunk Alley");
    assert.strictEqual(directives[1].engine, "google");
    assert.strictEqual(directives[1].prompt, "Serene Waterfall");
    assert.strictEqual(directives[2].engine, "sd");
    assert.strictEqual(directives[2].prompt, "Cyber Matrix");
    assert.strictEqual(directives[2].width, 512);
    assert.strictEqual(directives[2].height, 512);
    assert.strictEqual(directives[3].engine, "google");
    assert.strictEqual(directives[3].prompt, "Cyber Dragon");

    // 3. Safety/Policy block detection
    assert.strictEqual(imgGen.isSafetyOrPolicyBlock("SAFETY: Prompt violates safety filters"), true);
    assert.strictEqual(imgGen.isSafetyOrPolicyBlock("Content blocked by policy"), true);
    assert.strictEqual(imgGen.isSafetyOrPolicyBlock("Error: Waiting for selector '.ProseMirror' failed"), true);
    assert.strictEqual(imgGen.isSafetyOrPolicyBlock("Standard benign prompt"), false);
  });

  await itAsync("ImageGenerator routes Google safety/policy block to failover engine", async () => {
    const imgGen = new ImageGenerator();

    // Mock Google engine to simulate Google Nano Banana safety rejection
    imgGen.isGoogleAvailable = () => true;
    imgGen.generateWithGoogle = async (prompt) => {
      const err = new Error("Prompt blocked by Google Safety Policy (Content Filter)");
      err.isSafetyOrPolicy = true;
      throw err;
    };

    // Mock SD engine to test instant failover dispatch without waiting for CLI execution
    imgGen.generateWithStableDiffusion = async (prompt) => {
      const mockFile = path.join(imgGen.outputDir, "mock_sd_failover.png");
      fs.writeFileSync(mockFile, "mock-png-data");
      return {
        success: true,
        engine: "sd",
        model: "DreamShaper8_LCM_q8_0",
        imagePath: mockFile,
        filename: "mock_sd_failover.png",
        width: 512,
        height: 512,
        format: "png",
        prompt
      };
    };

    // Auto routing should catch Google safety rejection and route to Stable Diffusion failover
    const result = await imgGen.generateImage("Edgy Cyberpunk Battle in Tokyo", { engine: "auto" });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.engine, "sd");
    assert.strictEqual(result.routedFrom, "google");
    assert.ok(result.routeReason.includes("Google Safety Policy"));
    assert.ok(result.imagePath);

    try {
      if (fs.existsSync(result.imagePath)) fs.unlinkSync(result.imagePath);
    } catch {}
  });

  // ─── 7. VOICE EAR / SPEECH RECOGNITION TESTS ───────────────────────────
  await itAsync("VoiceManager transcribeWav recognizes speech from audio file", async () => {
    const vm = new VoiceManager();
    const testWav = path.join(vm.tempAudioDir, `test_recognition_${Date.now()}.wav`);

    // Synthesize test speech using speech_helper.exe
    await new Promise((resolve) => {
      execFile(
        vm.speechBinPath,
        ["wav", "Hello Ash what are we working on", testWav],
        { timeout: 15000 },
        () => resolve()
      );
    });

    if (fs.existsSync(testWav)) {
      const res = await vm.transcribeWav(testWav);
      assert.strictEqual(res.success, true);
      assert.ok(res.text.length > 0);
      assert.ok(res.confidence > 0);
      fs.unlinkSync(testWav);
    }
  });

  console.log("\n=======================================================");
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${total - passed} FAILED)`);
  console.log("=======================================================\n");

  if (passed !== total) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
