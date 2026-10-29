/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎙️ AG2 DISCORD GATEWAY - VOICE MANAGER
 * Connects to Discord voice channels via WebRTC, plays synthesized speech
 * and local audio files directly to Daniel and server members.
 * Supports queued FIFO speech synthesis, live chat auto-read, and talk-back.
 * ══════════════════════════════════════════════════════════════════════
 */

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType,
  entersState
} from "@discordjs/voice";
import { EventEmitter } from "events";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import prism from "prism-media";
import { config } from "./config.js";
import { getBarrerVmcBridge } from "./barrer-bridge.js";

function pcmToWav(pcmBuffer, sampleRate = 48000, numChannels = 2) {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const buffer = Buffer.alloc(44 + pcmBuffer.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(buffer, 44);
  return buffer;
}

function convertWavTo16kMono(inputWav, outputWav) {
  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      ["-nostdin", "-y", "-i", inputWav, "-ar", "16000", "-ac", "1", outputWav],
      { timeout: 10000 },
      (err) => {
        if (!err && fs.existsSync(outputWav) && fs.statSync(outputWav).size > 100) {
          resolve(outputWav);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function applyStudioWarmthFilter(inputWav, outputWav) {
  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-i", inputWav,
        "-af", "highpass=f=75,bass=g=3.5:f=110,treble=g=1.5:f=3500,compand=0.3|0.8:6:-70/-60|-20/-14|0/-3:5:0:0:0",
        "-ar", "48000",
        outputWav
      ],
      { timeout: 8000 },
      (err) => {
        if (!err && fs.existsSync(outputWav) && fs.statSync(outputWav).size > 100) {
          resolve(outputWav);
        } else {
          resolve(inputWav);
        }
      }
    );
  });
}

export class VoiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.speechBinPath = options.speechBinPath || config.speechBinPath || "C:\\Users\\admin\\source\\gemini-super-system\\tools\\speech_helper.exe";
    this.ollamaVoiceUrl = options.ollamaVoiceUrl || config.ollamaVoiceUrl || "http://127.0.0.1:11435";
    this.ollamaVoiceModel = options.ollamaVoiceModel || config.ollamaVoiceModel || "phonon:ash";
    this.ollamaVoiceName = options.ollamaVoiceName || config.ollamaVoiceName || "Harper";
    this.enableOllamaVoice = options.enableOllamaVoice !== false && config.enableOllamaVoice !== false;
    this.enableVoiceFallback = options.enableVoiceFallback ?? config.enableVoiceFallback ?? false;
    this.tempAudioDir = options.tempAudioDir || path.resolve(process.cwd(), "data", "temp_audio");
    this.connections = new Map(); // guildId -> connection
    this.players = new Map();     // guildId -> audioPlayer
    this.activeReceivers = new Map(); // guildId -> boolean

    // FIFO Audio Queue management
    this.speechQueues = new Map(); // guildId -> Array<{ text, options, resolve, reject }>
    this.isPlaying = new Map();     // guildId -> boolean

    // Feature settings per guild
    this.defaultAutoRead = options.autoRead !== false;
    this.defaultTalkBack = options.talkBack !== false;
    this.defaultAutoJoin = options.autoJoin === true;
    this.defaultListen = options.listen !== false;

    this.autoReadSettings = new Map();  // guildId -> { enabled: boolean, channels: Set<string> }
    this.talkBackSettings = new Map();  // guildId -> boolean
    this.autoJoinSettings = new Map();  // guildId -> boolean
    this.listenSettings = new Map();    // guildId -> boolean

    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempAudioDir)) {
      try {
        fs.mkdirSync(this.tempAudioDir, { recursive: true });
      } catch {}
    }
  }

  // ─── Settings Accessors ──────────────────────────────────────────────────

  isAutoReadEnabled(guildId, channelId = null) {
    if (!this.autoReadSettings.has(guildId)) {
      return this.defaultAutoRead;
    }
    const setting = this.autoReadSettings.get(guildId);
    if (!setting.enabled) return false;
    if (channelId && setting.channels && setting.channels.size > 0) {
      return setting.channels.has(channelId);
    }
    return setting.enabled;
  }

  setAutoRead(guildId, enabled, channelId = null) {
    if (!this.autoReadSettings.has(guildId)) {
      this.autoReadSettings.set(guildId, { enabled, channels: new Set() });
    }
    const setting = this.autoReadSettings.get(guildId);
    setting.enabled = Boolean(enabled);
    if (channelId) {
      if (enabled) {
        setting.channels.add(channelId);
      } else {
        setting.channels.delete(channelId);
      }
    }
    return setting.enabled;
  }

  isVoiceTalkBackEnabled(guildId) {
    if (!this.talkBackSettings.has(guildId)) {
      return this.defaultTalkBack;
    }
    return this.talkBackSettings.get(guildId);
  }

  setVoiceTalkBack(guildId, enabled) {
    this.talkBackSettings.set(guildId, Boolean(enabled));
    return Boolean(enabled);
  }

  isAutoJoinEnabled(guildId) {
    if (!this.autoJoinSettings.has(guildId)) {
      return this.defaultAutoJoin;
    }
    return this.autoJoinSettings.get(guildId);
  }

  setAutoJoin(guildId, enabled) {
    this.autoJoinSettings.set(guildId, Boolean(enabled));
    return Boolean(enabled);
  }

  isVoiceListenEnabled(guildId) {
    if (!this.listenSettings.has(guildId)) {
      return this.defaultListen;
    }
    return this.listenSettings.get(guildId);
  }

  setVoiceListen(guildId, enabled) {
    this.listenSettings.set(guildId, Boolean(enabled));
    return Boolean(enabled);
  }

  getVoiceSettings(guildId) {
    return {
      autoRead: this.isAutoReadEnabled(guildId),
      talkBack: this.isVoiceTalkBackEnabled(guildId),
      autoJoin: this.isAutoJoinEnabled(guildId),
      listening: this.isVoiceListenEnabled(guildId)
    };
  }

  // ─── Connection Management ──────────────────────────────────────────────

  /**
   * Join a Discord voice channel.
   * @param {Object} voiceChannel - Discord.js VoiceChannel or StageChannel
   * @returns {Promise<Object>} Connection status
   */
  async join(voiceChannel) {
    if (!voiceChannel || !voiceChannel.guild) {
      throw new Error("Invalid voice channel provided");
    }

    const guildId = voiceChannel.guild.id;

    // Reuse existing connection if in same channel
    let connection = this.connections.get(guildId);
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      this.connections.set(guildId, connection);

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          if (connection.state?.status === VoiceConnectionStatus.Destroyed) return;
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch {
          if (connection.state?.status !== VoiceConnectionStatus.Destroyed) {
            this.leave(guildId);
          }
        }
      });

      connection.on("error", (err) => {
        console.warn(`[Voice Connection Error] Guild ${guildId}: ${err?.message || err}`);
      });
    }

    // Initialize or reuse audio player
    let player = this.players.get(guildId);
    if (!player) {
      player = createAudioPlayer();
      player.on("error", (err) => {
        console.warn(`[Voice Player Error] Guild ${guildId}: ${err?.message || err}`);
      });
      this.players.set(guildId, player);
      connection.subscribe(player);
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10000);
      this.startListening(guildId, voiceChannel);
      return {
        success: true,
        guildId,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        status: "CONNECTED"
      };
    } catch (err) {
      this.leave(guildId);
      throw new Error(`Failed to establish voice connection: ${err.message}`);
    }
  }

  /**
   * Start listening to incoming voice audio packets from human speakers in the channel.
   * Transcribes utterances in sub-second time via native Windows speech recognition.
   * @param {string} guildId
   * @param {Object} voiceChannel
   */
  startListening(guildId, voiceChannel) {
    const connection = this.connections.get(guildId);
    if (!connection || !connection.receiver) return;

    if (this.activeReceivers.has(guildId)) return;
    this.activeReceivers.set(guildId, true);

    const activeUsers = new Set();

    connection.receiver.speaking.on("start", (userId) => {
      if (!this.isVoiceListenEnabled(guildId)) return;
      if (activeUsers.has(userId)) return;

      activeUsers.add(userId);

      try {
        const opusStream = connection.receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 900 // 900ms silence marks turn end
          }
        });

        const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        const pcmChunks = [];
        let totalBytes = 0;

        opusStream.pipe(decoder);

        decoder.on("data", (chunk) => {
          pcmChunks.push(chunk);
          totalBytes += chunk.length;
        });

        const cleanupAndTranscribe = async () => {
          activeUsers.delete(userId);

          // Minimum 0.4s audio check: 48000 samples/sec * 2 bytes * 2 channels * 0.4s = 76800 bytes
          if (totalBytes < 76800) {
            return;
          }

          const pcmBuffer = Buffer.concat(pcmChunks);
          const wav48k = pcmToWav(pcmBuffer, 48000, 2);
          const temp48kPath = path.join(this.tempAudioDir, `intake_${guildId}_${userId}_${Date.now()}.wav`);
          const temp16kPath = path.join(this.tempAudioDir, `intake_16k_${guildId}_${userId}_${Date.now()}.wav`);

          try {
            fs.writeFileSync(temp48kPath, wav48k);
            const converted = await convertWavTo16kMono(temp48kPath, temp16kPath);
            const targetWav = converted || temp48kPath;

            const res = await this.transcribeWav(targetWav);
            if (res.success && res.text && res.text.trim()) {
              this.emit("speech", {
                guildId,
                channelId: voiceChannel.id,
                userId,
                text: res.text.trim(),
                confidence: res.confidence,
                wavPath: targetWav,
                durationMs: Math.round((pcmBuffer.length / (48000 * 2 * 2)) * 1000)
              });
            }
          } catch (err) {
            console.warn(`[VoiceManager] Inbound voice error: ${err.message}`);
          } finally {
            try {
              if (fs.existsSync(temp48kPath)) fs.unlinkSync(temp48kPath);
              setTimeout(() => {
                try { if (fs.existsSync(temp16kPath)) fs.unlinkSync(temp16kPath); } catch {}
              }, 30000);
            } catch {}
          }
        };

        decoder.on("end", cleanupAndTranscribe);
        decoder.on("error", () => activeUsers.delete(userId));
        opusStream.on("error", () => activeUsers.delete(userId));
      } catch (err) {
        activeUsers.delete(userId);
      }
    });
  }

  /**
   * Run fast Speech-to-Text transcription on a WAV file.
   * Prioritizes local Whisper neural transcription with automatic fallback to speech_helper.
   * @param {string} wavPath
   * @returns {Promise<{ success: boolean, text: string, confidence: number }>}
   */
  async transcribeWav(wavPath) {
    if (!fs.existsSync(wavPath)) {
      return { success: false, text: "", confidence: 0 };
    }

    const whisperScript = path.resolve(process.cwd(), "scripts", "whisper_transcribe.py");
    if (fs.existsSync(whisperScript)) {
      const whisperResult = await new Promise((resolve) => {
        execFile(
          "python",
          [whisperScript, path.normalize(path.resolve(wavPath))],
          { timeout: 15000 },
          (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              try {
                const lines = stdout.trim().split("\n");
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i].trim();
                  if (line.startsWith("{") && line.endsWith("}")) {
                    const data = JSON.parse(line);
                    if (data.success && data.text) {
                      return resolve({
                        success: true,
                        text: data.text.trim(),
                        confidence: data.confidence ?? 0.95,
                        engine: "whisper"
                      });
                    }
                  }
                }
              } catch {}
            }
            resolve(null);
          }
        );
      });

      if (whisperResult && whisperResult.text) {
        return whisperResult;
      }
    }

    if (fs.existsSync(this.speechBinPath)) {
      return new Promise((resolve) => {
        execFile(
          this.speechBinPath,
          ["listen", path.normalize(path.resolve(wavPath))],
          { timeout: 15000 },
          (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              try {
                const data = JSON.parse(stdout.trim());
                return resolve({
                  success: true,
                  text: data.text || "",
                  confidence: typeof data.confidence === "number" ? data.confidence : 0.8,
                  engine: "sapi"
                });
              } catch {}
            }
            resolve({ success: false, text: "", confidence: 0 });
          }
        );
      });
    }

    return { success: false, text: "", confidence: 0 };
  }

  /**
   * Leave voice channel for a guild.
   * @param {string} guildId
   */
  leave(guildId) {
    this.activeReceivers.delete(guildId);
    this.clearQueue(guildId);

    const player = this.players.get(guildId);
    if (player) {
      try {
        player.removeAllListeners();
        player.stop(true);
      } catch {}
      this.players.delete(guildId);
    }

    const connection = this.connections.get(guildId);
    if (connection) {
      try {
        connection.removeAllListeners();
        if (connection.state?.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      } catch {}
      this.connections.delete(guildId);
    }

    return { success: true, guildId, status: "DISCONNECTED" };
  }

  /**
   * Clears pending speech items in queue for a guild.
   * @param {string} guildId
   */
  clearQueue(guildId) {
    if (this.speechQueues.has(guildId)) {
      const queue = this.speechQueues.get(guildId);
      for (const item of queue) {
        try { item.reject(new Error("Queue cleared")); } catch {}
      }
      this.speechQueues.set(guildId, []);
    }
    const player = this.players.get(guildId);
    if (player) {
      try { player.stop(); } catch {}
    }
    this.isPlaying.set(guildId, false);
  }

  // ─── Queued Speech Synthesis ─────────────────────────────────────────────

  /**
   * Synthesize text to WAV and stream it directly into the guild's voice channel.
   * Queues requests FIFO so multiple messages play in orderly sequence.
   * @param {string} guildId
   * @param {string} text
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async speakText(guildId, text, options = {}) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    if (!connection || !player) {
      throw new Error("Bot is not currently connected to a voice channel in this server.");
    }

    if (!text || !text.trim()) {
      return { success: false, reason: "empty_text" };
    }

    return new Promise((resolve, reject) => {
      if (!this.speechQueues.has(guildId)) {
        this.speechQueues.set(guildId, []);
      }
      this.speechQueues.get(guildId).push({
        text: text.trim(),
        options,
        resolve,
        reject
      });
      this._processQueue(guildId);
    });
  }

  /**
   * Synthesizes speech using local Ollama MLX speech runner (e.g. phonon:en / Kokoro)
   * with seamless fallback to speech_helper.exe.
   * @param {string} text - Text to synthesize
   * @param {string} targetWav - Output file path
   * @param {object} options - Voice options
   * @returns {Promise<string>} Path to synthesized WAV file
   */
  async synthesizeWav(text, targetWav, options = {}) {
    const voice = options.voice || "default";
    const rate = options.rate ?? 1;
    const volume = options.volume ?? 100;

    // 1. Sovereign local Ollama MLX Speech Runner (sub-50ms TTFA, 24kHz neural speech)
    if (this.enableOllamaVoice) {
      try {
        const ollamaWav = await this.synthesizeWithOllama(text, targetWav, options);
        if (ollamaWav && fs.existsSync(ollamaWav) && fs.statSync(ollamaWav).size > 1000) {
          return ollamaWav;
        }
      } catch (ollamaErr) {
        console.warn(`[VoiceManager] Ollama MLX voice error: ${ollamaErr.message}`);
        if (!this.enableVoiceFallback) {
          throw ollamaErr;
        }
        console.warn(`[VoiceManager] Falling back to speech_helper: ${ollamaErr.message}`);
      }
    }

    // 2. Fallback: speech_helper.exe (only when explicitly enabled)
    if (!this.enableVoiceFallback) {
      throw new Error("Neural speech synthesis failed and fallback to legacy TTS is disabled.");
    }

    return new Promise((resolve, reject) => {
      const fallbackVoice = options.fallbackVoice || "Zira";
      execFile(
        this.speechBinPath,
        ["wav", text, targetWav, String(rate), String(volume), fallbackVoice],
        { timeout: 20000 },
        (err) => {
          if (err || !fs.existsSync(targetWav)) {
            return reject(new Error(err?.message || "Failed to synthesize speech WAV file"));
          }
          resolve(targetWav);
        }
      );
    });
  }

  /**
   * Generates speech audio via Ollama /v1/audio/speech
   */
  async synthesizeWithOllama(text, targetWav, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.ollamaVoiceUrl + "/v1/audio/speech");
      const payload = JSON.stringify({
        model: options.model || this.ollamaVoiceModel || "phonon:ash",
        input: text,
        voice: options.voice || this.ollamaVoiceName || "Harper",
        response_format: "wav"
      });

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11435,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          },
          timeout: options.timeout || 90000
        },
        (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Ollama speech HTTP status ${res.statusCode}`));
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 44) {
              return reject(new Error("Ollama returned invalid WAV payload"));
            }

            // Write and patch RIFF header duration
            fs.writeFileSync(targetWav, buffer);
            try {
              const fileLen = buffer.length;
              const dataLen = fileLen - 44;
              const fd = fs.openSync(targetWav, "r+");
              const patchBuf = Buffer.alloc(4);
              patchBuf.writeUInt32LE(fileLen - 8, 0);
              fs.writeSync(fd, patchBuf, 0, 4, 4);
              patchBuf.writeUInt32LE(dataLen, 0);
              fs.writeSync(fd, patchBuf, 0, 4, 40);
              fs.closeSync(fd);
            } catch {}

            resolve(targetWav);
          });
        }
      );

      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Ollama speech request timed out"));
      });
      req.write(payload);
      req.end();
    });
  }

  /**
   * Internal worker loop that plays queued speech items sequentially.
   * @private
   */
  async _processQueue(guildId) {
    if (this.isPlaying.get(guildId)) return;

    const queue = this.speechQueues.get(guildId);
    if (!queue || queue.length === 0) return;

    const item = queue.shift();
    this.isPlaying.set(guildId, true);

    const player = this.players.get(guildId);
    const connection = this.connections.get(guildId);
    if (!player || !connection) {
      this.isPlaying.set(guildId, false);
      item.reject(new Error("Voice connection lost"));
      return;
    }

    const voice = item.options.voice || this.ollamaVoiceName || "Harper";
    const rate = item.options.rate ?? 1;
    const volume = item.options.volume ?? 100;
    const tempWav = path.join(this.tempAudioDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);

    try {
      // Synthesize WAV via Ollama MLX speech runner (with speech_helper fallback)
      await this.synthesizeWav(item.text, tempWav, { voice, rate, volume });

      // Apply studio DSP warmth & vocal leveling for rich broadcast audio
      const enhancedWav = path.join(this.tempAudioDir, `enhanced_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);
      const audioToPlay = await applyStudioWarmthFilter(tempWav, enhancedWav);

      const resource = createAudioResource(audioToPlay);
      player.play(resource);

      // Drive 3D embodiment visemes & expressions in BarrerAvatarStudio
      const vmc = getBarrerVmcBridge();
      const approxDurationMs = Math.max(800, Math.min(25000, Math.round((item.text.length / 14) * 1000)));
      try {
        vmc.setEmotion(item.options.emotion || "smirk", 0.7);
        vmc.animateSpeechVisemes(approxDurationMs);
      } catch {}

      const onIdle = (oldState, newState) => {
        if (newState.status === AudioPlayerStatus.Idle) {
          player.off("stateChange", onIdle);
          try {
            vmc.stopSpeechVisemes();
          } catch {}
          try {
            if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
            if (fs.existsSync(enhancedWav)) fs.unlinkSync(enhancedWav);
          } catch {}
          this.isPlaying.set(guildId, false);
          item.resolve({
            success: true,
            guildId,
            textLength: item.text.length,
            voice,
            status: "PLAYING"
          });
          // Process next utterance in queue
          this._processQueue(guildId);
        }
      };

      player.on("stateChange", onIdle);
    } catch (err) {
      try {
        if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
      } catch {}
      this.isPlaying.set(guildId, false);
      item.reject(err);
      this._processQueue(guildId);
    }
  }

  /**
   * Play an existing audio file (.wav, .mp3) directly into the voice channel.
   * @param {string} guildId
   * @param {string} filePath
   */
  async playAudioFile(guildId, filePath) {
    const player = this.players.get(guildId);
    if (!player) {
      throw new Error("Bot is not currently connected to a voice channel in this server.");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const resource = createAudioResource(filePath);
    player.play(resource);

    return {
      success: true,
      guildId,
      filePath,
      status: "PLAYING"
    };
  }

  getStatus(guildId) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    return {
      connected: !!connection && connection.state.status === VoiceConnectionStatus.Ready,
      state: connection?.state.status || "DISCONNECTED",
      playerState: player?.state.status || "IDLE",
      queueLength: this.speechQueues.get(guildId)?.length || 0,
      isPlaying: !!this.isPlaying.get(guildId),
      autoRead: this.isAutoReadEnabled(guildId),
      talkBack: this.isVoiceTalkBackEnabled(guildId),
      autoJoin: this.isAutoJoinEnabled(guildId),
      listening: this.isVoiceListenEnabled(guildId)
    };
  }
}

let instance = null;
export function getVoiceManager(options = {}) {
  if (!instance) instance = new VoiceManager(options);
  return instance;
}
