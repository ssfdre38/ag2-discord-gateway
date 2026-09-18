import assert from "assert";
import fs from "fs";
import path from "path";
import {
  HmbMemoryEngine,
  fnv1aHash64,
  cosineSimilarity,
  createSemanticVector,
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

// 2. Vector Math & Cosine Similarity
const v1 = createSemanticVector("Sanctuary Garden with cyberpunk watercolors");
const v2 = createSemanticVector("Cyberpunk watercolor art in the garden oasis");
const v3 = createSemanticVector("Database locking query execution postgresql");

const sim12 = cosineSimilarity(v1, v2);
const sim13 = cosineSimilarity(v1, v3);

console.log(`✓ Cosine Similarity (Semantic Match): ${sim12.toFixed(4)}`);
console.log(`✓ Cosine Similarity (Dissimilar):    ${sim13.toFixed(4)}`);
assert.ok(sim12 > sim13, "Semantic match should score higher than unrelated query");

// 3. Engine Initialization & Sovereign Anchors
const engine = new HmbMemoryEngine({ embeddingDim: 128 });
engine.initializeCoreIdentity("gaming2gamers");
assert.strictEqual(engine.getMemoryCount(), 3);
console.log(`✓ Initialized 3 core identity anchors.`);

// 4. Add Episodic Memories
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

assert.strictEqual(engine.getMemoryCount(), 5);
console.log(`✓ Added episodic memories. Total anchors: ${engine.getMemoryCount()}`);

// 5. Binary .hmb Serialization & Deserialization
const testHmbPath = path.join(process.cwd(), "data", "test_vault.hmb");
const saveSuccess = engine.saveToHmb(testHmbPath);
assert.ok(saveSuccess, "Failed to serialize .hmb file");
console.log(`✓ Serialized binary .hmb to: ${testHmbPath}`);

const stats = fs.statSync(testHmbPath);
console.log(`✓ .hmb file size on disk: ${stats.size} bytes`);
assert.ok(stats.size >= HEADER_SIZE + 5 * RECORD_SIZE, "File size must contain header and records");

// 6. Reload into fresh engine
const engineReloaded = new HmbMemoryEngine({ embeddingDim: 128 });
const loadSuccess = engineReloaded.loadFromHmb(testHmbPath);
assert.ok(loadSuccess, "Failed to load .hmb file");
assert.strictEqual(engineReloaded.getMemoryCount(), 5);
console.log(`✓ Successfully reloaded ${engineReloaded.getMemoryCount()} anchors from .hmb file.`);

// 7. Test Top-K Semantic Recall on Reloaded Engine
const searchResults = engineReloaded.searchTopK("tell me about temporal cortex and memory", 2);
console.log("\n🔍 Semantic Search Results for 'tell me about temporal cortex and memory':");
for (const res of searchResults) {
  console.log(`  • [${res.anchor.category}] ${res.anchor.concept_name}: Score = ${res.score.toFixed(4)} (Sim = ${res.similarity.toFixed(4)})`);
}
assert.ok(searchResults.length > 0, "Search results should not be empty");
assert.ok(
  searchResults[0].anchor.concept_name.includes("Temporal Cortex") ||
  searchResults[0].anchor.concept_name.includes("Memory"),
  "Top result should relate to Temporal Cortex or Memory"
);

// 8. Test Context Injection Generation
const context = engineReloaded.buildContextInjection("How many memes do we have?");
console.log("\n📋 Context Injection Preview:");
console.log(context);
assert.ok(context.includes("Memes Counter Milestone") || context.includes("Hierarchical Memory Buffer"));

// Clean up test file
fs.unlinkSync(testHmbPath);
console.log("🧹 Cleaned up temporary test file.");
console.log("\n🎉 ALL HMB MEMORY ENGINE TESTS PASSED WITH 100% SUCCESS!\n");
