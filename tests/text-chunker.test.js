import assert from "assert";
import { splitDiscordMessage, splitSentencesForSpeech } from "../src/text-chunker.js";

console.log("=======================================================");
console.log("   🧪 AG2 DISCORD GATEWAY // TEXT CHUNKER TEST");
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

function run() {
  it("returns empty array for empty or whitespace text", () => {
    assert.deepStrictEqual(splitDiscordMessage(""), []);
    assert.deepStrictEqual(splitDiscordMessage("   \n\t  "), []);
    assert.deepStrictEqual(splitDiscordMessage(null), []);
  });

  it("returns single chunk when text length <= maxLength", () => {
    const text = "Hello world! This is a concise Discord message.";
    const chunks = splitDiscordMessage(text, 100);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0], text);
  });

  it("splits cleanly at paragraph boundary (\\n\\n)", () => {
    const p1 = "Paragraph 1: " + "A".repeat(40);
    const p2 = "Paragraph 2: " + "B".repeat(40);
    const full = `${p1}\n\n${p2}`;

    const chunks = splitDiscordMessage(full, 65);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0], p1);
    assert.strictEqual(chunks[1], p2);
  });

  it("splits cleanly at sentence boundary when no paragraph break exists", () => {
    const s1 = "This is the first sentence that is fairly long and complete.";
    const s2 = "This is the second sentence that follows right behind it.";
    const full = `${s1} ${s2}`;

    const chunks = splitDiscordMessage(full, 70);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0], s1);
    assert.strictEqual(chunks[1], s2);
  });

  it("balances and preserves markdown code fences across split chunks", () => {
    const codeLines = [
      "def calculate_metrics():",
      "    total = 0",
      "    for i in range(100):",
      "        total += i",
      "    return total"
    ].join("\n");
    const full = "Here is the code:\n```python\n" + codeLines + "\n```\nAll done!";

    // Choose maxLength so it splits inside the python code block
    const chunks = splitDiscordMessage(full, 60);
    assert.strictEqual(chunks.length > 1, true);

    // First chunk must end with closed fence ```
    assert.ok(chunks[0].endsWith("```"), "Chunk 0 should close fence");
    // Second chunk must start with re-opened python fence ```python
    assert.ok(chunks[1].startsWith("```python\n"), "Chunk 1 should reopen python fence");
    // All chunks must be <= maxLength + headroom
    for (const c of chunks) {
      const fences = (c.match(/```/g) || []).length;
      assert.strictEqual(fences % 2, 0, "Each chunk must have balanced code fences");
    }
  });

  it("never exceeds maxLength for arbitrary long texts without spaces", () => {
    const giantWord = "X".repeat(500);
    const chunks = splitDiscordMessage(giantWord, 100);
    assert.strictEqual(chunks.length, 5);
    for (const c of chunks) {
      assert.ok(c.length <= 100);
    }
  });

  it("splitSentencesForSpeech splits clean prose into natural sentence chunks", () => {
    const s1 = "Honestly, Harper feels remarkably natural to me—grounded, sharp, and expressive without sounding robotic.";
    const s2 = "We can always dial in the EQ warmth or pacing if you notice anything off, but as a core identity, this baseline feels just right.";
    const full = `${s1} ${s2}`;

    const chunks = splitSentencesForSpeech(full, 140, 25);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0], s1);
    assert.strictEqual(chunks[1], s2);
  });

  it("splitSentencesForSpeech merges micro-sentences under minChars", () => {
    const text = "Yes. That works well. Let's do it right now.";
    const chunks = splitSentencesForSpeech(text, 140, 25);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0], text);
  });

  console.log("\n=======================================================");
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${total - passed} FAILED)`);
  console.log("=======================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

run();
