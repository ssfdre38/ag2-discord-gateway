/**
 * ══════════════════════════════════════════════════════════════════════
 * 🔄 AG2 DISCORD GATEWAY - PROCESS LIFECYCLE & SELF-RESTART MANAGER
 * Autonomous zero-downtime process handoff for hot-updates and self-healing.
 * ══════════════════════════════════════════════════════════════════════
 */

import { spawn } from "child_process";

let isRestarting = false;
let activeTimer = null;

/**
 * Returns true if a restart sequence has already been initiated.
 * @returns {boolean}
 */
export function isRestartInProgress() {
  return isRestarting;
}

/**
 * For testing purposes only: resets restart state and clears active timer.
 */
export function _resetRestartStateForTesting() {
  isRestarting = false;
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
}

/**
 * Initiates an autonomous self-restart of the gateway process.
 * Gracefully preserves state (HMB vault), cleans up network connections,
 * spawns a detached clone of the current Node process, and exits cleanly.
 * 
 * @param {Object} options
 * @param {Object} [options.client] - Discord.js client instance
 * @param {Object} [options.hmb] - HMB Memory engine instance
 * @param {Object} [options.voiceManager] - Voice manager instance
 * @param {number} [options.delayMs=1000] - Delay before unlinking old process
 * @param {string} [options.reason="Self-restart requested"] - Reason for audit logging
 * @returns {boolean} True if restart sequence initiated, false if already in progress
 */
export function triggerSelfRestart(options = {}) {
  const {
    client = null,
    hmb = null,
    voiceManager = null,
    delayMs = 1000,
    reason = "Self-restart requested"
  } = options;

  if (isRestarting) {
    console.warn(`[ProcessManager] Restart already in progress. Ignoring duplicate request: "${reason}"`);
    return false;
  }

  isRestarting = true;
  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  🔄 [ProcessManager] Initiating Autonomous Self-Restart         ║`);
  console.log(`║  Reason : ${reason.padEnd(52)} ║`);
  console.log(`║  Delay  : ${(delayMs + "ms").padEnd(52)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

  // 1. Immediately persist HMB Memory Vault to disk if available
  if (hmb && typeof hmb.saveToHmb === "function") {
    try {
      const savedCount = hmb.getMemoryCount ? hmb.getMemoryCount() : "vault";
      console.log(`[ProcessManager] Persisting ${savedCount} memory anchors before restart...`);
      hmb.saveToHmb();
    } catch (saveErr) {
      console.warn(`[ProcessManager] Warning saving HMB vault: ${saveErr.message}`);
    }
  }

  // 2. Schedule clean shutdown and detached re-spawn
  activeTimer = setTimeout(async () => {
    try {
      // Clean up voice connections
      if (voiceManager && typeof voiceManager.leaveAll === "function") {
        try {
          voiceManager.leaveAll();
        } catch {}
      }

      // Destroy Discord gateway connection
      if (client && typeof client.destroy === "function") {
        try {
          await client.destroy().catch(() => {});
        } catch {}
      }

      // Prepare exact spawn arguments preserving node flags (e.g. --watch) and script
      const nodeBinary = process.execPath;
      const spawnArgs = [...process.execArgv, ...process.argv.slice(1)];

      console.log(`[ProcessManager] Spawning detached replacement process: ${nodeBinary} ${spawnArgs.join(" ")}`);

      const child = spawn(nodeBinary, spawnArgs, {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: "inherit",
        windowsHide: false
      });

      child.unref();

      console.log(`[ProcessManager] Replacement process spawned (PID: ${child.pid}). Exiting current process (PID: ${process.pid})...`);
      process.exit(0);
    } catch (err) {
      console.error(`[ProcessManager] Failed to complete self-restart: ${err.message}`);
      isRestarting = false;
    }
  }, Math.max(100, delayMs));

  return true;
}
