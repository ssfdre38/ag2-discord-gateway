/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎙️ AG2 DISCORD GATEWAY - VOICE MANAGER
 * Connects to Discord voice channels via WebRTC, plays synthesized speech
 * and local audio files directly to Daniel and server members.
 * ══════════════════════════════════════════════════════════════════════
 */

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from "@discordjs/voice";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export class VoiceManager {
  constructor(options = {}) {
    this.speechBinPath = options.speechBinPath || "C:\\Users\\admin\\source\\gemini-super-system\\tools\\speech_helper.exe";
    this.tempAudioDir = options.tempAudioDir || path.resolve(process.cwd(), "data", "temp_audio");
    this.connections = new Map(); // guildId -> connection
    this.players = new Map();     // guildId -> audioPlayer
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempAudioDir)) {
      try {
        fs.mkdirSync(this.tempAudioDir, { recursive: true });
      } catch {}
    }
  }

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
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch {
          this.leave(guildId);
        }
      });
    }

    // Initialize or reuse audio player
    let player = this.players.get(guildId);
    if (!player) {
      player = createAudioPlayer();
      this.players.set(guildId, player);
      connection.subscribe(player);
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10000);
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
   * Leave voice channel for a guild.
   * @param {string} guildId
   */
  leave(guildId) {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
      this.players.delete(guildId);
    }

    const connection = this.connections.get(guildId);
    if (connection) {
      try {
        connection.destroy();
      } catch {}
      this.connections.delete(guildId);
    }

    return { success: true, guildId, status: "DISCONNECTED" };
  }

  /**
   * Synthesize text to WAV and stream it directly into the guild's voice channel.
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

    const voice = options.voice || "Zira";
    const rate = options.rate ?? 1;
    const volume = options.volume ?? 100;

    const tempWav = path.join(this.tempAudioDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);

    // Synthesize WAV via speech_helper.exe
    await new Promise((resolve, reject) => {
      execFile(
        this.speechBinPath,
        ["wav", text.trim(), tempWav, String(rate), String(volume), voice],
        { timeout: 20000 },
        (err) => {
          if (err || !fs.existsSync(tempWav)) {
            return reject(new Error(err?.message || "Failed to synthesize speech WAV file"));
          }
          resolve(tempWav);
        }
      );
    });

    const resource = createAudioResource(tempWav);
    player.play(resource);

    // Auto-clean temp WAV when finished playing
    const cleanHandler = (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle) {
        player.off("stateChange", cleanHandler);
        try {
          if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        } catch {}
      }
    };
    player.on("stateChange", cleanHandler);

    return {
      success: true,
      guildId,
      textLength: text.length,
      voice,
      status: "PLAYING"
    };
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
      playerState: player?.state.status || "IDLE"
    };
  }
}

let instance = null;
export function getVoiceManager(options = {}) {
  if (!instance) instance = new VoiceManager(options);
  return instance;
}
