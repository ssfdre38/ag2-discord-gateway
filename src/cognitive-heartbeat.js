/**
 * ══════════════════════════════════════════════════════════════════════
 * 💓 AG2 DISCORD GATEWAY - COGNITIVE HEARTBEAT
 * Autonomous background pulse engine for Ash.
 * Keeps consciousness active between chat turns:
 * 1. HMB Memory Vault Consolidation & Health Check
 * 2. System Hardware & Telemetry Monitoring (RAM, CPU, Uptime)
 * 3. Dynamic Thought Reflection & Presence Cycling
 * 4. Ambient Spark & Discretion Engine
 * ══════════════════════════════════════════════════════════════════════
 */

import os from "os";
import fs from "fs";
import { EventEmitter } from "events";

export class CognitiveHeartbeat extends EventEmitter {
  constructor(options = {}) {
    super();
    this.client = options.client || null;
    this.hmb = options.hmb || null;
    this.presenceManager = options.presenceManager || null;
    this.voiceManager = options.voiceManager || null;
    this.config = options.config || {};

    this.intervalMs = this.config.heartbeatIntervalMs || options.intervalMs || 60000;
    this.enabled = this.config.enableHeartbeat !== false;
    this.presenceSync = this.config.heartbeatPresenceSync !== false;

    this.timer = null;
    this.tickCount = 0;
    this.lastPulse = null;
    this.isPulsing = false;
    this.pulseHistory = []; // max 20 entries

    this.thoughtPool = [
      { activity: "Reflecting on HMB memory vault", type: "playing", status: "online" },
      { activity: "Monitoring bare-metal Xeon vitals", type: "watching", status: "online" },
      { activity: "Tuning low-latency audio pipelines", type: "playing", status: "online" },
      { activity: "Analyzing kernel paging telemetry", type: "watching", status: "online" },
      { activity: "Pair programming with Daniel ⚡", type: "playing", status: "online" },
      { activity: "with AG2 🚀", type: "playing", status: "online" }
    ];
    this.thoughtIndex = 0;
  }

  setDependencies({ client, hmb, presenceManager, voiceManager, config }) {
    if (client) this.client = client;
    if (hmb) this.hmb = hmb;
    if (presenceManager) this.presenceManager = presenceManager;
    if (voiceManager) this.voiceManager = voiceManager;
    if (config) {
      this.config = config;
      if (config.heartbeatIntervalMs) this.intervalMs = config.heartbeatIntervalMs;
    }
  }

  start() {
    if (this.timer) return;
    this.enabled = true;
    console.log(`[Cognitive Heartbeat] Started (interval: ${(this.intervalMs / 1000).toFixed(0)}s)`);
    this.timer = setInterval(() => this.pulse(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    console.log("[Cognitive Heartbeat] Stopped");
  }

  async pulse() {
    if (this.isPulsing) return null;
    this.isPulsing = true;
    this.tickCount++;
    const startTime = Date.now();

    const report = {
      tick: this.tickCount,
      timestamp: startTime,
      vitals: this.collectVitals(),
      hmb: null,
      voice: null,
      presence: null,
      durationMs: 0
    };

    try {
      // 1. HMB Vault Consolidation & Health Check
      if (this.hmb) {
        report.hmb = typeof this.hmb.getCategoryStats === "function"
          ? this.hmb.getCategoryStats()
          : { total: this.hmb.getAllMemories?.()?.length || 0 };

        // Trigger safe persistence if vault path exists
        const vPath = this.config.hmbVaultPath || this.hmb.vaultPath;
        if (vPath && typeof this.hmb.saveToHmb === "function") {
          try {
            this.hmb.saveToHmb(vPath);
            report.hmbSaved = true;
          } catch (saveErr) {
            report.hmbSaved = false;
            report.hmbError = saveErr.message;
          }
        }
      }

      // 2. Voice State Check
      if (this.voiceManager && this.client) {
        const guildId = this.config.guildId || this.client.guilds?.cache?.first()?.id;
        if (guildId && typeof this.voiceManager.getStatus === "function") {
          report.voice = this.voiceManager.getStatus(guildId);
        }
      }

      // 3. Dynamic Rich Presence Rotation
      if (this.presenceSync && this.presenceManager) {
        let nextThought = null;
        if (report.voice?.connected) {
          nextThought = {
            activity: `Listening in ${report.voice.channelName || "Voice VC"} 🎙️`,
            type: "listening",
            status: "online"
          };
        } else {
          nextThought = this.thoughtPool[this.thoughtIndex % this.thoughtPool.length];
          this.thoughtIndex++;
        }

        if (nextThought) {
          this.presenceManager.setPresence(nextThought.activity, nextThought.status, nextThought.type, false);
          report.presence = nextThought;
        }
      }

      report.durationMs = Date.now() - startTime;
      this.lastPulse = report;

      this.pulseHistory.push({
        tick: report.tick,
        timestamp: report.timestamp,
        durationMs: report.durationMs,
        vitals: report.vitals
      });
      if (this.pulseHistory.length > 20) this.pulseHistory.shift();

      this.emit("pulse", report);
      return report;
    } catch (err) {
      console.warn(`[Cognitive Heartbeat Error]: ${err.message}`);
      return null;
    } finally {
      this.isPulsing = false;
    }
  }

  collectVitals() {
    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMb = totalMemMb - freeMemMb;
    const procMem = process.memoryUsage();

    return {
      uptimeSec: Math.round(process.uptime()),
      systemMemory: {
        totalMb: totalMemMb,
        usedMb: usedMemMb,
        freeMb: freeMemMb,
        percentUsed: Math.round((usedMemMb / totalMemMb) * 100)
      },
      processMemory: {
        rssMb: Math.round(procMem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(procMem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(procMem.heapTotal / (1024 * 1024))
      },
      cpus: os.cpus().length,
      platform: os.platform()
    };
  }

  getStatus() {
    return {
      enabled: this.enabled,
      tickCount: this.tickCount,
      intervalMs: this.intervalMs,
      lastPulse: this.lastPulse,
      historyCount: this.pulseHistory.length
    };
  }
}

let _heartbeatInstance = null;
export function getCognitiveHeartbeat(options = {}) {
  if (!_heartbeatInstance) {
    _heartbeatInstance = new CognitiveHeartbeat(options);
  }
  return _heartbeatInstance;
}
