/**
 * ══════════════════════════════════════════════════════════════════════
 * 🧪 GATEWAY FEATURES TEST SUITE
 * Unit and integration tests for:
 * 1. ReactionEngine (tag extraction, sentiment analysis, custom emojis)
 * 2. Interactive Components & Slash Commands (/vitals, /memory, /voice)
 * 3. VoiceManager interface and status reporting
 * ══════════════════════════════════════════════════════════════════════
 */

import assert from "assert";
import { ReactionEngine } from "../src/reaction-engine.js";
import {
  createInteractiveButtons,
  getSlashCommandDefinitions
} from "../src/interactions.js";
import { VoiceManager } from "../src/voice-manager.js";

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
  it("createInteractiveButtons builds 3 action row buttons with valid customIds", () => {
    const row = createInteractiveButtons();
    assert.strictEqual(row.components.length, 3);

    const ids = row.components.map(c => c.data.custom_id);
    assert.deepStrictEqual(ids, ["btn_save_vault", "btn_explain_more", "btn_vitals"]);

    assert.strictEqual(row.components[0].data.label, "Save to Vault");
    assert.strictEqual(row.components[1].data.label, "Explain More");
    assert.strictEqual(row.components[2].data.label, "Vitals");
  });

  it("getSlashCommandDefinitions generates valid JSON schemas for Discord API", () => {
    const defs = getSlashCommandDefinitions();
    assert.strictEqual(defs.length, 4);

    const names = defs.map(d => d.name);
    assert.deepStrictEqual(names, ["vitals", "memory", "voice", "thread"]);

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

    const threadCmd = defs.find(d => d.name === "thread");
    const threadJson = threadCmd.toJSON();
    assert.strictEqual(threadJson.options[0].name, "task");
    assert.strictEqual(threadJson.options[0].required, true);
  });

  // ─── 3. VOICE MANAGER INTERFACE TESTS ──────────────────────────────────
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
