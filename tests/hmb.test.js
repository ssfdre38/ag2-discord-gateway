import assert from "assert";
import fs from "fs";
import path from "path";
import {
  HmbMemoryEngine,
  fnv1aHash64,
  cosineSimilarity,
  createSemanticVector,
  normalizeHmbCategory,
  parseMemoryTag,
  HMB_CATEGORIES,
  HMB_MAGIC,
  HMB_VERSION,
  HEADER_SIZE,
  RECORD_SIZE
} from "../src/hmb-memory.js";

console.log("🧪 Starting HMB Memory Engine Verification Tests...\n");

// 1. Test FNV-1a 64-bit Hash
const hash1 = fnv1aHash64("CORE_IDENTITY");
console.log(`✓ FNV-1a 64-bit hash test: "CORE_IDENTITY" => 0x${hash1.toString(16)}`);
assert.strictEqual(typeof hash1, "bigint");
assert.ok(hash1 > 0n);

// 2. Test Category Partitions & Normalization
assert.deepStrictEqual(HMB_CATEGORIES, ["CORE_IDENTITY", "EPISODIC", "SEMANTIC", "EMOTIONAL"]);
assert.strictEqual(normalizeHmbCategory("fact"), "SEMANTIC");
assert.strictEqual(normalizeHmbCategory("KNOWLEDGE"), "SEMANTIC");
assert.strictEqual(normalizeHmbCategory("tech"), "SEMANTIC");
assert.strictEqual(normalizeHmbCategory("lore"), "SEMANTIC");
assert.strictEqual(normalizeHmbCategory("identity"), "CORE_IDENTITY");
assert.strictEqual(normalizeHmbCategory("core"), "CORE_IDENTITY");
assert.strictEqual(normalizeHmbCategory("feeling"), "EMOTIONAL");
assert.strictEqual(normalizeHmbCategory("sentiment"), "EMOTIONAL");
assert.strictEqual(normalizeHmbCategory("chat"), "EPISODIC");
assert.strictEqual(normalizeHmbCategory("milestone"), "EPISODIC");
console.log(`✓ Category normalization and alias mapping verified.`);

// 3. Test Mid-Turn Tag Parser (parseMemoryTag)
const tag3Part = parseMemoryTag("SEMANTIC | Audio Stems | Master stems saved to /audio/master");
assert.strictEqual(tag3Part.category, "SEMANTIC");
assert.strictEqual(tag3Part.concept, "Audio Stems");
assert.strictEqual(tag3Part.content, "Master stems saved to /audio/master");

const tagColon = parseMemoryTag("SEMANTIC: Audio Stems | Master stems saved to /audio/master");
assert.strictEqual(tagColon.category, "SEMANTIC");
assert.strictEqual(tagColon.concept, "Audio Stems");
assert.strictEqual(tagColon.content, "Master stems saved to /audio/master");

const tag2Part = parseMemoryTag("Trailer Release Milestone | Ash rendered Shot 3 in Google Flow");
assert.strictEqual(tag2Part.category, "EPISODIC");
assert.strictEqual(tag2Part.concept, "Trailer Release Milestone");
assert.strictEqual(tag2Part.content, "Ash rendered Shot 3 in Google Flow");

const tagEmotional = parseMemoryTag("EMOTIONAL | Collaborator Trust | Daniel and Shane built full mutual trust");
assert.strictEqual(tagEmotional.category, "EMOTIONAL");
assert.strictEqual(tagEmotional.concept, "Collaborator Trust");
console.log(`✓ parseMemoryTag parsed 3-part, colon, 2-part, and emotional tag syntax.`);

// 4. Vector Math & Cosine Similarity
const v1 = createSemanticVector("Sanctuary Garden with cyberpunk watercolors");
const v2 = createSemanticVector("Cyberpunk watercolor art in the garden oasis");
const v3 = createSemanticVector("Database locking query execution postgresql");

const sim12 = cosineSimilarity(v1, v2);
const sim13 = cosineSimilarity(v1, v3);

console.log(`✓ Cosine Similarity (Semantic Match): ${sim12.toFixed(4)}`);
console.log(`✓ Cosine Similarity (Dissimilar):    ${sim13.toFixed(4)}`);
assert.ok(sim12 > sim13, "Semantic match should score higher than unrelated query");

// 5. Engine Initialization & Sovereign Anchors
const engine = new HmbMemoryEngine({ embeddingDim: 128 });
engine.initializeCoreIdentity("gaming2gamers");
assert.strictEqual(engine.getMemoryCount(), 3);
console.log(`✓ Initialized 3 core identity anchors.`);

// 6. Add Memories across Partitions
engine.addMemory({
  concept_name: "Temporal Cortex Integration",
  text_content: "Shane and Daniel hooked up the HMB memory engine to prevent context drift and maintain long-term recall.",
  category: "EPISODIC",
  weight: 0.95,
  emotional_salience: 0.90
});

engine.addMemory({
  concept_name: "Memes Counter Milestone",
  text_content: "Total Memes count in Gaming2Gamers lounge reached 5,785 memes.",
  category: "EPISODIC",
  weight: 0.80,
  emotional_salience: 0.85
});

engine.addMemory({
  concept_name: "FFmpeg Transcoding Pipeline",
  text_content: "Audio master stems transcode at 48kHz 24-bit PCM using FFmpeg filter complex.",
  category: "SEMANTIC",
  weight: 0.95,
  emotional_salience: 0.85
});

engine.addMemory({
  concept_name: "Shared Creative Camaraderie",
  text_content: "Deep bond with Daniel and Shane, collaborating on autonomous systems together.",
  category: "EMOTIONAL",
  weight: 0.90,
  emotional_salience: 1.0
});

assert.strictEqual(engine.getMemoryCount(), 7);
console.log(`✓ Added multi-category memories. Total anchors: ${engine.getMemoryCount()}`);

// 7. Verify Category Statistics & Partition Filtering
const statsBeforeSave = engine.getCategoryStats();
assert.strictEqual(statsBeforeSave.CORE_IDENTITY, 2);
assert.strictEqual(statsBeforeSave.EPISODIC, 2);
assert.strictEqual(statsBeforeSave.SEMANTIC, 2);
assert.strictEqual(statsBeforeSave.EMOTIONAL, 1);
assert.strictEqual(statsBeforeSave.TOTAL, 7);

const semanticOnly = engine.getMemoriesByCategory("SEMANTIC");
assert.strictEqual(semanticOnly.length, 2);
assert.ok(semanticOnly.every(m => m.category === "SEMANTIC"));
console.log(`✓ Partition stats and getMemoriesByCategory verified.`);

// 8. Binary .hmb Serialization & Deserialization with 64-Bit Domain Hash
const testHmbPath = path.join(process.cwd(), "data", "test_vault.hmb");
const saveSuccess = engine.saveToHmb(testHmbPath);
assert.ok(saveSuccess, "Failed to serialize .hmb file");
console.log(`✓ Serialized binary .hmb to: ${testHmbPath}`);

const stats = fs.statSync(testHmbPath);
console.log(`✓ .hmb file size on disk: ${stats.size} bytes`);
assert.ok(stats.size >= HEADER_SIZE + 7 * RECORD_SIZE, "File size must contain header and records");

// 9. Reload into fresh engine
const engineReloaded = new HmbMemoryEngine({ embeddingDim: 128 });
const loadSuccess = engineReloaded.loadFromHmb(testHmbPath);
assert.ok(loadSuccess, "Failed to load .hmb file");
assert.strictEqual(engineReloaded.getMemoryCount(), 7);

const reloadedStats = engineReloaded.getCategoryStats();
assert.deepStrictEqual(reloadedStats, statsBeforeSave);
console.log(`✓ Successfully reloaded ${engineReloaded.getMemoryCount()} anchors with preserved partitions.`);

// 10. Test Category-Filtered Semantic Search
const semanticSearch = engineReloaded.searchTopK("audio transcoding ffmpeg", 3, 0.05, { category: "SEMANTIC" });
assert.ok(semanticSearch.length > 0);
assert.ok(semanticSearch.every(r => r.anchor.category === "SEMANTIC"));
console.log(`✓ Partition-filtered recall for [SEMANTIC] returned only SEMANTIC anchors.`);

const coreSearch = engineReloaded.searchTopK("sovereign identity", 3, 0.05, { category: "CORE_IDENTITY" });
assert.ok(coreSearch.length > 0);
assert.ok(coreSearch.every(r => r.anchor.category === "CORE_IDENTITY"));
console.log(`✓ Partition-filtered recall for [CORE_IDENTITY] returned only CORE_IDENTITY anchors.`);

const excludedSearch = engineReloaded.searchTopK("memory and temporal cortex", 5, 0.05, { excludeCategory: "EPISODIC" });
assert.ok(excludedSearch.every(r => r.anchor.category !== "EPISODIC"));
console.log(`✓ Exclude-category recall successfully excluded EPISODIC anchors.`);

// 11. Test Top-K Semantic Recall on General Query
const searchResults = engineReloaded.searchTopK("tell me about temporal cortex and memory", 2);
console.log("\n🔍 Semantic Search Results for 'tell me about temporal cortex and memory':");
for (const res of searchResults) {
  console.log(`  • [${res.anchor.category}] ${res.anchor.concept_name}: Score = ${res.score.toFixed(4)} (Sim = ${res.similarity.toFixed(4)})`);
}
assert.ok(searchResults.length > 0, "Search results should not be empty");

// 12. Test Context Injection Generation
const context = engineReloaded.buildContextInjection("How many memes do we have?");
console.log("\n📋 Context Injection Preview:");
console.log(context);
assert.ok(context.includes("Memes Counter Milestone") || context.includes("Hierarchical Memory Buffer"));

// Clean up test file
fs.unlinkSync(testHmbPath);
console.log("🧹 Cleaned up temporary test file.");
console.log("\n🎉 ALL HMB MEMORY ENGINE TESTS PASSED WITH 100% SUCCESS!\n");
