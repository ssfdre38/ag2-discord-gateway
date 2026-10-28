import assert from "assert";
import test from "node:test";
import { isRestartInProgress, triggerSelfRestart, _resetRestartStateForTesting } from "../src/process-manager.js";

test("🔄 AG2 DISCORD GATEWAY // PROCESS LIFECYCLE & SELF-RESTART TESTS", async (t) => {
  _resetRestartStateForTesting();

  await t.test("Initial state: isRestartInProgress() returns false", () => {
    assert.strictEqual(isRestartInProgress(), false);
  });

  await t.test("Vault persistence is called on triggerSelfRestart", () => {
    let saved = false;
    const mockHmb = {
      saveToHmb: () => { saved = true; },
      getMemoryCount: () => 10
    };

    const started = triggerSelfRestart({
      hmb: mockHmb,
      delayMs: 600000,
      reason: "Unit test validation"
    });

    assert.strictEqual(started, true);
    assert.strictEqual(saved, true);
    assert.strictEqual(isRestartInProgress(), true);

    // Second attempt should be ignored because restart is already in progress
    const duplicate = triggerSelfRestart({
      hmb: mockHmb,
      delayMs: 600000,
      reason: "Duplicate unit test attempt"
    });
    assert.strictEqual(duplicate, false);

    // Clean up timer so test process finishes immediately
    _resetRestartStateForTesting();
    assert.strictEqual(isRestartInProgress(), false);
  });
});
