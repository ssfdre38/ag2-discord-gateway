import { CognitiveHeartbeat } from "../src/cognitive-heartbeat.js";
import assert from "assert";

console.log("💓 Starting Cognitive Heartbeat Engine Verification Tests...\n");

// 1. Instantiation
const heartbeat = new CognitiveHeartbeat({
  intervalMs: 1000,
  config: {
    enableHeartbeat: true,
    heartbeatPresenceSync: false
  }
});

assert.strictEqual(heartbeat.enabled, true);
assert.strictEqual(heartbeat.tickCount, 0);
console.log("✓ CognitiveHeartbeat instantiates cleanly with default configuration.");

// 2. Mock Dependencies
const mockMemories = [
  { id: 1001n, concept_name: "Test", category: "CORE_IDENTITY", weight: 1.0 },
  { id: 1002n, concept_name: "Test 2", category: "EPISODIC", weight: 0.85 }
];

const mockHmb = {
  vaultPath: "data/mock.hmb",
  getAllMemories: () => mockMemories,
  getCategoryStats: () => ({ CORE_IDENTITY: 1, EPISODIC: 1, TOTAL: 2 }),
  saveToHmb: (path) => { return true; }
};

const mockPresence = {
  current: null,
  setPresence: (act, st, tp) => { mockPresence.current = { act, st, tp }; return true; }
};

const mockVoice = {
  getStatus: () => ({ connected: false, state: "DISCONNECTED" })
};

heartbeat.setDependencies({
  hmb: mockHmb,
  presenceManager: mockPresence,
  voiceManager: mockVoice,
  config: { heartbeatPresenceSync: true, hmbVaultPath: "data/mock.hmb" }
});
heartbeat.presenceSync = true;

// 3. Trigger manual pulse
const report = await heartbeat.pulse();
assert.ok(report, "Pulse report should be returned");
assert.strictEqual(report.tick, 1);
assert.strictEqual(report.hmb.TOTAL, 2);
assert.ok(report.vitals.systemMemory.totalMb > 0);
assert.ok(report.presence, "Presence should be updated by pulse");
console.log(`✓ Manual pulse completed in ${report.durationMs}ms with vitals and memory health verified.`);

// 4. Status inspection
const status = heartbeat.getStatus();
assert.strictEqual(status.tickCount, 1);
assert.strictEqual(status.historyCount, 1);
console.log("✓ Heartbeat status and history inspection verified.");

// 5. Timer start & stop
heartbeat.start();
assert.ok(heartbeat.timer, "Timer should be active");
heartbeat.stop();
assert.strictEqual(heartbeat.timer, null, "Timer should be stopped");
console.log("✓ Start and stop timer lifecycle verified.");

console.log("\n🎉 ALL COGNITIVE HEARTBEAT TESTS PASSED WITH 100% SUCCESS!\n");
