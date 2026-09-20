import assert from "assert";
import fs from "fs";
import path from "path";
import { MediaPipeline } from "../src/media-pipeline.js";

console.log("\n=======================================================");
console.log("   🎨 AG2 DISCORD GATEWAY // MEDIA PIPELINE TEST");
console.log("=======================================================\n");

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

async function run() {
  const pipeline = new MediaPipeline({
    cacheDir: path.resolve(process.cwd(), "data", "test_media_cache")
  });

  it("extractMediaItems identifies attachments, embeds, and Tenor links", () => {
    const mockMessage = {
      content: "Check out this reaction: https://tenor.com/view/cat-vibing-cat-jam-vibe-vibes-gif-18451152 and image https://example.com/photo.png",
      attachments: new Map([
        ["1", { url: "https://cdn.discordapp.com/attachments/123/meme.png", name: "meme.png", contentType: "image/png", size: 1024, width: 800, height: 600 }]
      ]),
      embeds: [
        { type: "gifv", video: { url: "https://media.tenor.com/cat.mp4" }, provider: { name: "Tenor" } }
      ],
      stickers: new Map([
        ["s1", { url: "https://cdn.discordapp.com/stickers/456.png", name: "Wave" }]
      ])
    };

    const items = pipeline.extractMediaItems(mockMessage);
    assert.strictEqual(items.length, 5, `Expected 5 media items, got ${items.length}`);
    assert(items.some(i => i.kind === "image" && i.name === "meme.png"));
    assert(items.some(i => i.kind === "gif" && i.url.includes("cat.mp4")));
    assert(items.some(i => i.kind === "sticker" && i.name === "Wave"));
    assert(items.some(i => i.kind === "tenor_page"));
    assert(items.some(i => i.kind === "image" && i.url.includes("photo.png")));
  });

  it("formatPromptInjection produces rich instructions with view_file hints", () => {
    const mockRecords = [
      {
        kind: "image",
        localPath: "C:\\test\\photo.png",
        sizeBytes: 204800,
        ocrText: "SYSTEM ERROR 404"
      },
      {
        kind: "gif",
        localPath: "C:\\test\\animation.gif",
        sizeBytes: 512000,
        keyframePath: "C:\\test\\animation_frame.png",
        storyboardPath: "C:\\test\\animation_storyboard.png",
        ocrText: "PARTY TIME"
      }
    ];

    const injection = pipeline.formatPromptInjection(mockRecords);
    assert(injection.includes("[ATTACHED MEDIA FROM DISCORD]:"));
    assert(injection.includes("C:\\test\\photo.png"));
    assert(injection.includes("SYSTEM ERROR 404"));
    assert(injection.includes("Keyframe Snapshot: C:\\test\\animation_frame.png"));
    assert(injection.includes("3-Frame Movement Progression: C:\\test\\animation_storyboard.png"));
    assert(injection.includes("view_file"));
  });

  it("extractOutgoingMedia detects local image paths in AI responses", () => {
    // Create temporary image for testing detection
    const testImg = path.resolve(process.cwd(), "data", "test_media_cache", "test_out.png");
    if (!fs.existsSync(path.dirname(testImg))) fs.mkdirSync(path.dirname(testImg), { recursive: true });
    fs.writeFileSync(testImg, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // Minimal PNG header

    const aiResponse = `Here is the system architecture diagram you asked for:\n![Architecture](${testImg})\nLet me know what you think!`;
    const res = pipeline.extractOutgoingMedia(aiResponse);

    assert.strictEqual(res.filesToAttach.length, 1);
    assert.strictEqual(path.normalize(res.filesToAttach[0]), path.normalize(testImg));

    // Cleanup
    if (fs.existsSync(testImg)) fs.unlinkSync(testImg);
  });

  it("extractOutgoingMedia parses [ARTIFACT: ...] tags into file attachments", () => {
    const responseWithTag = "Here is your script:\n[ARTIFACT: deploy_hook.py]\nimport os\nprint('Deploying!')\n[/ARTIFACT]\nAll done!";
    const res = pipeline.extractOutgoingMedia(responseWithTag);

    assert.strictEqual(res.filesToAttach.length, 1);
    assert(res.filesToAttach[0].endsWith("deploy_hook.py"));
    assert(fs.existsSync(res.filesToAttach[0]));
    assert(res.cleanText.includes("📄 **Attached File**: `deploy_hook.py`"));
    assert(!res.cleanText.includes("[ARTIFACT:"));

    // Cleanup
    if (fs.existsSync(res.filesToAttach[0])) fs.unlinkSync(res.filesToAttach[0]);
  });

  it("extractOutgoingMedia egresses large code blocks (>25 lines) as file attachments", () => {
    const longCodeLines = Array.from({ length: 30 }, (_, i) => `console.log("Processing step ${i + 1}");`).join("\n");
    const responseWithLongCode = `Check out this pipeline logic:\n\`\`\`javascript\n${longCodeLines}\n\`\`\`\nHope this helps!`;

    const res = pipeline.extractOutgoingMedia(responseWithLongCode);
    assert.strictEqual(res.filesToAttach.length, 1);
    assert(res.filesToAttach[0].endsWith(".js"));
    assert(fs.existsSync(res.filesToAttach[0]));
    assert(res.cleanText.includes("📄 **Attached File**:"));
    assert(res.cleanText.includes("(30 lines"));
    assert(res.cleanText.includes("omitted — full code attached below"));

    // Cleanup
    if (fs.existsSync(res.filesToAttach[0])) fs.unlinkSync(res.filesToAttach[0]);
  });

  it("extractOutgoingMedia preserves short code blocks inline", () => {
    const shortCode = "```python\nprint('hello')\n```";
    const res = pipeline.extractOutgoingMedia(`Inline test:\n${shortCode}\nDone.`);
    assert.strictEqual(res.filesToAttach.length, 0);
    assert(res.cleanText.includes(shortCode));
  });

  await itAsync("ffmpeg keyframe and storyboard extraction runs on synthetic media", async () => {
    // Generate a tiny 1-second synthetic GIF using ffmpeg testsrc
    const testVideo = path.resolve(process.cwd(), "data", "test_media_cache", "synthetic_test.gif");
    if (!fs.existsSync(path.dirname(testVideo))) {
      fs.mkdirSync(path.dirname(testVideo), { recursive: true });
    }
    const { execFile } = await import("child_process");
    await new Promise((resolve) => {
      execFile("ffmpeg", [
        "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=160x120:rate=10",
        testVideo
      ], { timeout: 5000, windowsHide: true }, () => resolve());
    });

    if (fs.existsSync(testVideo)) {
      const frame = await pipeline.extractKeyframe(testVideo);
      assert(frame !== null, "Expected keyframe extraction to succeed");
      assert(fs.existsSync(frame), "Extracted frame file must exist");

      const storyboard = await pipeline.extractStoryboard(testVideo);
      assert(storyboard !== null, "Expected storyboard extraction to succeed");
      assert(fs.existsSync(storyboard), "Extracted storyboard file must exist");

      // Cleanup
      if (fs.existsSync(testVideo)) fs.unlinkSync(testVideo);
      if (frame && fs.existsSync(frame)) fs.unlinkSync(frame);
      if (storyboard && fs.existsSync(storyboard)) fs.unlinkSync(storyboard);
    }
  });

  // Clean test directory
  const testDir = path.resolve(process.cwd(), "data", "test_media_cache");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

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
