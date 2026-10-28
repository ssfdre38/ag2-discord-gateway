import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { AudioGenerator, getAudioGenerator } from "../src/audio-generator.js";

describe("AudioGenerator", () => {
  test("instantiates cleanly and ensures output directory exists", () => {
    const gen = getAudioGenerator();
    assert.ok(gen instanceof AudioGenerator);
    assert.ok(fs.existsSync(gen.outputDir));
  });

  test("generates valid 44.1kHz 16-bit PCM WAV header", () => {
    const gen = getAudioGenerator();
    const header = gen.createWavHeader(44100, 44100);
    assert.strictEqual(header.length, 44);
    assert.strictEqual(header.toString("ascii", 0, 4), "RIFF");
    assert.strictEqual(header.toString("ascii", 8, 12), "WAVE");
    assert.strictEqual(header.toString("ascii", 12, 16), "fmt ");
    assert.strictEqual(header.toString("ascii", 36, 40), "data");
  });

  test("extracts audio directives cleanly from text", () => {
    const gen = getAudioGenerator();
    const input = "Here is Sovereign's heart [AUDIO: 2400 K thermal heartbeat pulse | 4] and [SFX: sword clash | 3] ready.";
    const { cleanText, directives } = gen.extractAudioDirectives(input);
    assert.strictEqual(cleanText, "Here is Sovereign's heart  and  ready.");
    assert.strictEqual(directives.length, 2);
    assert.strictEqual(directives[0].type, "AUDIO");
    assert.strictEqual(directives[0].prompt, "2400 K thermal heartbeat pulse");
    assert.strictEqual(directives[0].duration, 4);
    assert.strictEqual(directives[1].type, "SFX");
    assert.strictEqual(directives[1].prompt, "sword clash");
    assert.strictEqual(directives[1].duration, 3);
  });

  test("synthesizes procedural audio file to disk", async () => {
    const gen = getAudioGenerator();
    const res = await gen.generateAudio("2400 K cardiovascular heartbeat pulse", { duration: 2 });
    assert.ok(res.audioPath);
    assert.ok(fs.existsSync(res.audioPath));
    assert.strictEqual(res.engine, "thermal_heartbeat");
    const stat = fs.statSync(res.audioPath);
    assert.ok(stat.size > 44);
    // Cleanup generated test file
    fs.unlinkSync(res.audioPath);
  });
});
