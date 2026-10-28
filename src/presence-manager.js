/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎭 AG2 DISCORD GATEWAY - DYNAMIC RICH PRESENCE MANAGER
 * Real-time Discord status and custom activity management for Ash Bot.
 * Reflects in-flight task progress, active tools, and custom status directives.
 *
 * Supported Statuses:
 * - "online"     (Active / Available)
 * - "idle"       (Away / Inactive / AFK / Snooze)
 * - "dnd"        (Do Not Disturb / Busy)
 * - "invisible"  (Offline / Hidden)
 *
 * Supported Activity Types:
 * - "playing", "listening", "watching", "competing", "streaming", "custom"
 * ══════════════════════════════════════════════════════════════════════
 */

import { ActivityType } from "discord.js";

export class PresenceManager {
  constructor(client, options = {}) {
    this.client = client;
    this.defaultActivity = options.defaultActivity || "with AG2 🚀";
    this.defaultType = options.defaultType || "playing";
    this.defaultStatus = options.defaultStatus || "online";

    this.baselinePresence = {
      activity: this.defaultActivity,
      type: this.defaultType,
      status: this.defaultStatus
    };

    this.currentPresence = {
      activity: this.defaultActivity,
      type: this.defaultType,
      status: this.defaultStatus,
      updatedAt: Date.now()
    };
  }

  normalizeStatus(statusStr) {
    if (!statusStr) return null;
    const clean = String(statusStr).toLowerCase().trim().replace(/[-_ ]+/g, "");
    if (["dnd", "donotdisturb", "busy", "disturb"].includes(clean)) return "dnd";
    if (["idle", "away", "afk", "inactive", "snooze"].includes(clean)) return "idle";
    if (["invisible", "offline", "hidden"].includes(clean)) return "invisible";
    if (["online", "active", "available"].includes(clean)) return "online";
    return null;
  }

  resolveActivityType(typeStr) {
    if (typeof typeStr === "number") return typeStr;
    const lower = String(typeStr || "").toLowerCase().trim();
    if (lower === "watching" || lower === "watch") return ActivityType.Watching;
    if (lower === "listening" || lower === "listen") return ActivityType.Listening;
    if (lower === "competing" || lower === "compete") return ActivityType.Competing;
    if (lower === "streaming" || lower === "stream") return ActivityType.Streaming;
    if (lower === "custom") return ActivityType.Custom;
    return ActivityType.Playing;
  }

  /**
   * Set Discord presence status and activity string in real-time.
   * Updates the persistent baseline presence by default.
   *
   * @param {string} [activityText] - Activity name / custom status
   * @param {"online"|"idle"|"dnd"|"invisible"|string} [status] - Presence status or alias
   * @param {"playing"|"watching"|"listening"|"competing"|"custom"|string} [typeStr] - Activity type
   * @param {boolean} [isWorkingStatus=false] - If true, does not overwrite the persistent baseline
   * @returns {boolean} Success status
   */
  setPresence(activityText, status = "online", typeStr = "playing", isWorkingStatus = false) {
    if (!this.client?.user) return false;

    const normStatus = this.normalizeStatus(status) || "online";
    const activity = activityText !== undefined && activityText !== null
      ? String(activityText).trim()
      : (this.currentPresence.activity || this.defaultActivity);
    const type = this.resolveActivityType(typeStr);

    try {
      this.client.user.setPresence({
        activities: activity ? [{ name: activity, type }] : [],
        status: normStatus
      });

      this.currentPresence = {
        activity,
        type: typeStr || "playing",
        status: normStatus,
        updatedAt: Date.now()
      };

      if (!isWorkingStatus) {
        this.baselinePresence = {
          activity,
          type: typeStr || "playing",
          status: normStatus
        };
      }

      return true;
    } catch (err) {
      console.warn(`[PresenceManager] Error updating presence: ${err.message}`);
      return false;
    }
  }

  /**
   * Set a temporary operational progress presence (e.g. while executing a tool or thinking).
   * Does NOT overwrite the persistent baseline presence.
   */
  setWorkingProgress(activityText, status = "online", typeStr = "playing") {
    return this.setPresence(activityText, status, typeStr, true);
  }

  /**
   * Restores the persistent baseline presence after a working progress task finishes.
   */
  restoreBaseline() {
    const target = this.baselinePresence || {
      activity: this.defaultActivity,
      status: this.defaultStatus,
      type: this.defaultType
    };
    return this.setPresence(target.activity, target.status, target.type, false);
  }

  /**
   * Reset Discord presence back to sovereign default status.
   * Completely resets both active presence and persistent baseline.
   */
  resetToDefault() {
    this.baselinePresence = {
      activity: this.defaultActivity,
      status: this.defaultStatus,
      type: this.defaultType
    };
    return this.setPresence(this.defaultActivity, this.defaultStatus, this.defaultType, false);
  }

  /**
   * Get current presence state and baseline.
   */
  getPresence() {
    return {
      ...this.currentPresence,
      baseline: { ...this.baselinePresence }
    };
  }

  /**
   * Extract inline [STATUS: <activity> | <status> | <type>] tags from model response.
   * Supports:
   * - [STATUS: dnd]
   * - [STATUS: away]
   * - [STATUS: Compiling MicaNT | dnd]
   * - [STATUS: dnd | Compiling MicaNT]
   * - [STATUS: Synthesizing visuals | online | watching]
   *
   * @param {string} text
   * @returns {{ cleanText: string, statusDirective: Object|null }}
   */
  extractStatusTags(text) {
    if (!text || typeof text !== "string") return { cleanText: text || "", statusDirective: null };

    const statusRegex = /\[(?:STATUS|ACTIVITY|PRESENCE):\s*([^\]]+)\]/i;
    const match = statusRegex.exec(text);

    let statusDirective = null;
    if (match) {
      const parts = match[1].split("|").map(p => p.trim());
      if (parts.length === 1) {
        const norm = this.normalizeStatus(parts[0]);
        if (norm) {
          // Status-only change, keep current baseline activity
          statusDirective = {
            activity: this.baselinePresence.activity || this.defaultActivity,
            status: norm,
            type: this.baselinePresence.type || "playing"
          };
        } else {
          // Activity-only change, keep current baseline status
          statusDirective = {
            activity: parts[0],
            status: this.baselinePresence.status || "online",
            type: "playing"
          };
        }
      } else if (parts.length === 2) {
        const p0Norm = this.normalizeStatus(parts[0]);
        const p1Norm = this.normalizeStatus(parts[1]);

        if (p0Norm && !p1Norm) {
          // [STATUS: dnd | Compiling MicaNT]
          statusDirective = {
            status: p0Norm,
            activity: parts[1],
            type: "playing"
          };
        } else {
          // [STATUS: Compiling MicaNT | dnd]
          statusDirective = {
            activity: parts[0],
            status: p1Norm || "online",
            type: "playing"
          };
        }
      } else {
        // [STATUS: Activity | Status | Type]
        statusDirective = {
          activity: parts[0],
          status: this.normalizeStatus(parts[1]) || "online",
          type: parts[2] || "playing"
        };
      }
    }

    const cleanText = text
      .replace(statusRegex, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return { cleanText, statusDirective };
  }
}

let instance = null;
export function getPresenceManager(client, options = {}) {
  if (!instance && client) {
    instance = new PresenceManager(client, options);
  }
  return instance;
}
