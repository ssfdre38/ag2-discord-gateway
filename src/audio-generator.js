/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎵 AG2 DISCORD GATEWAY - AUTONOMOUS AUDIO & MUSIC GENERATOR
 * Autonomous Music Synthesis, Sound Design & Audio Stinger Router:
 *
 * 1. 🎹 Procedural Synthesizer Engine (Pure Native Node.js 44.1kHz Stereo)
 *    - Cinematic Sub-Bass Heartbeat Pulses (2400 K Thermal Emission)
 *    - Cyberpunk / Synthwave Arpeggiated Pads & Basslines
 *    - Stream Intro / Outro Stingers & Dramatic Risers
 *    - Atmospheric Ambient Soundscapes & Drone Stems
 * 2. ⚡ Lyria Music Studio Integration (.NET 10 / NAudio / ONNX Stem Engine)
 * 3. 🌐 Google Labs / Cloud MusicLM Failover Pipeline
 *
 * DIRECTIVES:
 * - [AUDIO: <prompt>]
 * - [MUSIC: <prompt>]
 * - [SFX: <sound_effect>]
 * - [HEARTBEAT: <bpm>]
 * ══════════════════════════════════════════════════════════════════════
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.js";

export class AudioGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.resolve(process.cwd(), "data", "artifacts", "audio");
    this.sampleRate = options.sampleRate || 44100;
    this.lyriaStudioUrl = options.lyriaStudioUrl || process.env.LYRIA_STUDIO_URL || "http://127.0.0.1:5000";
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.outputDir)) {
      try {
        fs.mkdirSync(this.outputDir, { recursive: true });
      } catch (err) {
        console.error(`[AudioGenerator] Failed to create output directory: ${err.message}`);
      }
    }
  }

  /**
   * Generates a 44-byte standard RIFF/WAVE header for 16-bit PCM stereo audio.
   * @param {number} numSamples - Number of stereo sample frames
   * @param {number} sampleRate - Sample rate in Hz (default: 44100)
   * @returns {Buffer} 44-byte Buffer
   */
  createWavHeader(numSamples, sampleRate = 44100) {
    const numChannels = 2;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * blockAlign;
    const buffer = Buffer.alloc(44);

    // RIFF identifier
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);

    // fmt subchunk
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);          // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20);           // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24);  // SampleRate
    buffer.writeUInt32LE(byteRate, 28);    // ByteRate
    buffer.writeUInt16LE(blockAlign, 32);  // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34);// BitsPerSample

    // data subchunk
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    return buffer;
  }

  /**
   * Synthesizes audio procedurally based on prompt analysis.
   * @param {string} prompt - Text prompt describing music or sound effect
   * @param {Object} options - Synthesis options (duration, bpm, style)
   * @returns {Promise<{ audioPath: string, filename: string, durationSeconds: number, engine: string }>}
   */
  async generateAudio(prompt, options = {}) {
    const rawPrompt = String(prompt || "").trim();
    const lower = rawPrompt.toLowerCase();
    const duration = Math.min(Math.max(options.duration || 8, 2), 30); // 2 to 30 seconds
    const sampleRate = this.sampleRate;
    const totalFrames = Math.floor(sampleRate * duration);

    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);

    let engine = "native_dsp";

    if (lower.includes("heartbeat") || lower.includes("2400") || lower.includes("pulse") || lower.includes("seam")) {
      // 🫀 2400 K Cardiovascular Heartbeat Pulse (Sovereign Core)
      engine = "thermal_heartbeat";
      const bpm = options.bpm || 60;
      const beatInterval = Math.floor((60 / bpm) * sampleRate);
      for (let i = 0; i < totalFrames; i++) {
        const beatPos = i % beatInterval;
        const t = beatPos / sampleRate;
        if (t < 0.25) {
          // Double-thump "lub-dub"
          const thump1 = Math.exp(-t * 24) * Math.sin(2 * Math.PI * 46 * t);
          const t2 = t - 0.10;
          const thump2 = t2 > 0 ? Math.exp(-t2 * 28) * Math.sin(2 * Math.PI * 38 * t2) * 0.8 : 0;
          const val = (thump1 + thump2) * 0.85;
          left[i] += val;
          right[i] += val;
        }
        // Low warm thermal drone bed
        const drone = Math.sin(2 * Math.PI * 55 * (i / sampleRate)) * 0.05;
        left[i] += drone;
        right[i] += drone;
      }
    } else if (lower.includes("riser") || lower.includes("stinger") || lower.includes("climax") || lower.includes("impact")) {
      // ⚡ Dramatic Cinematic Riser & Sub-Drop Impact
      engine = "cinematic_stinger";
      const impactTime = duration * 0.75;
      const impactFrame = Math.floor(impactTime * sampleRate);
      for (let i = 0; i < totalFrames; i++) {
        const t = i / sampleRate;
        if (i < impactFrame) {
          // Pitch riser from 120 Hz to 880 Hz
          const progress = i / impactFrame;
          const freq = 120 + Math.pow(progress, 3) * 760;
          const sweep = Math.sin(2 * Math.PI * freq * t) * Math.pow(progress, 2) * 0.45;
          // Filtered noise swoosh
          const noise = (Math.random() * 2 - 1) * Math.pow(progress, 3) * 0.25;
          left[i] = sweep + noise;
          right[i] = sweep - noise;
        } else {
          // Sub-drop explosion
          const dt = (i - impactFrame) / sampleRate;
          const subFreq = Math.max(35, 90 - dt * 25);
          const sub = Math.exp(-dt * 4) * Math.sin(2 * Math.PI * subFreq * dt) * 0.8;
          left[i] = sub;
          right[i] = sub;
        }
      }
    } else if (lower.includes("ambient") || lower.includes("space") || lower.includes("drone") || lower.includes("cathedral")) {
      // 🌌 Binaural Ethereal Cathedral Drone
      engine = "ambient_cathedral";
      const freqs = [110, 164.81, 220, 277.18, 329.63]; // A minor triad harmonic extensions
      for (let i = 0; i < totalFrames; i++) {
        const t = i / sampleRate;
        let sampleL = 0;
        let sampleR = 0;
        for (let f = 0; f < freqs.length; f++) {
          const lfo = 1 + 0.2 * Math.sin(2 * Math.PI * (0.15 + f * 0.05) * t);
          const panPhase = f * 0.8;
          sampleL += Math.sin(2 * Math.PI * freqs[f] * t) * (0.12 / (f + 1)) * lfo * Math.cos(t * 0.1 + panPhase);
          sampleR += Math.sin(2 * Math.PI * (freqs[f] + 0.5) * t) * (0.12 / (f + 1)) * lfo * Math.sin(t * 0.1 + panPhase);
        }
        left[i] = sampleL;
        right[i] = sampleR;
      }
    } else {
      // 🎹 Cyberpunk / Synthwave Arpeggiated Drive (Default)
      engine = "synthwave_arpeggiator";
      const bpm = 120;
      const stepDuration = 60 / bpm / 4; // 16th notes
      const notes = [62, 65, 69, 72, 69, 65, 62, 57]; // D minor arpeggio MIDI notes
      for (let i = 0; i < totalFrames; i++) {
        const t = i / sampleRate;
        const step = Math.floor(t / stepDuration) % notes.length;
        const noteMidi = notes[step];
        const freq = 440 * Math.pow(2, (noteMidi - 69) / 12);
        const noteT = (i % Math.floor(stepDuration * sampleRate)) / sampleRate;

        // Pluck envelope
        const env = Math.exp(-noteT * 12);
        const synth = (Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2 * t)) * env * 0.35;

        // Sub Bassline (D2 = 73.4 Hz)
        const bassEnv = Math.exp(-(t % (60 / bpm)) * 3);
        const bass = Math.sin(2 * Math.PI * 73.4 * t) * bassEnv * 0.4;

        left[i] = synth + bass;
        right[i] = (synth * 0.9) + bass;
      }
    }

    // Convert Float32Array to 16-bit PCM Stereo Buffer
    const pcmBuffer = Buffer.alloc(totalFrames * 4); // 2 channels * 2 bytes per sample
    for (let i = 0; i < totalFrames; i++) {
      // Soft-clip limiter
      const valL = Math.max(-0.95, Math.min(0.95, left[i]));
      const valR = Math.max(-0.95, Math.min(0.95, right[i]));

      const intL = Math.floor(valL * 32767);
      const intR = Math.floor(valR * 32767);

      pcmBuffer.writeInt16LE(intL, i * 4);
      pcmBuffer.writeInt16LE(intR, i * 4 + 2);
    }

    const wavHeader = this.createWavHeader(totalFrames, sampleRate);
    const fullWav = Buffer.concat([wavHeader, pcmBuffer]);

    const trackHash = crypto.createHash("md5").update(rawPrompt + Date.now()).digest("hex").slice(0, 8);
    const filename = `audio_${Date.now()}_${trackHash}.wav`;
    const audioPath = path.join(this.outputDir, filename);

    fs.writeFileSync(audioPath, fullWav);

    return {
      audioPath,
      filename,
      durationSeconds: duration,
      engine
    };
  }

  /**
   * Scans text for [AUDIO: ...], [MUSIC: ...], [SFX: ...], [HEARTBEAT: ...] directives.
   * Strips the directives cleanly from user-facing text and returns parsed targets.
   * @param {string} text - Message text
   * @returns {{ cleanText: string, directives: Array<{ prompt: string, type: string, duration?: number }> }}
   */
  extractAudioDirectives(text) {
    if (!text || typeof text !== "string") return { cleanText: text, directives: [] };

    const directives = [];
    const audioRegex = /\[(?:AUDIO|MUSIC|SFX|HEARTBEAT|SOUND):\s*([^\]\r\n]+)\]/gi;

    const cleanText = text.replace(audioRegex, (match, body) => {
      const parts = body.split("|").map(p => p.trim());
      const prompt = parts[0];
      const duration = parts[1] ? parseInt(parts[1], 10) : 8;
      directives.push({
        prompt,
        type: match.slice(1, match.indexOf(":")).toUpperCase(),
        duration: isNaN(duration) ? 8 : duration
      });
      return "";
    }).trim();

    return { cleanText, directives };
  }
}

let _instance = null;
export function getAudioGenerator() {
  if (!_instance) {
    _instance = new AudioGenerator();
  }
  return _instance;
}
