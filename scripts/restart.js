#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 * 🔄 AG2 DISCORD GATEWAY - CLI RESTART SCRIPT
 * Triggers autonomous self-restart via local HTTP Actuation API
 * and waits for the replacement instance to report healthy.
 * ══════════════════════════════════════════════════════════════════════
 */

import { config } from "../src/config.js";

const host = config.httpHost || "127.0.0.1";
const port = config.httpPort || 18895;
const baseUrl = `http://${host}:${port}`;
const reason = process.argv.slice(2).join(" ") || "CLI triggered update restart";

const headers = {
  "Content-Type": "application/json"
};

if (config.httpApiKey) {
  headers["Authorization"] = `Bearer ${config.httpApiKey}`;
}

async function run() {
  console.log(`📡 Connecting to Gateway actuation API at ${baseUrl}...`);

  try {
    const res = await fetch(`${baseUrl}/api/restart`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason, delayMs: 800 })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Restart rejected (HTTP ${res.status}): ${errText}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`🔄 ${data.message} (Previous PID: ${data.pid})`);
    console.log(`⏳ Waiting for replacement gateway instance to initialize...`);

    // Poll until replacement instance is up
    const startTime = Date.now();
    let reconnected = false;

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const check = await fetch(`${baseUrl}/api/status`, { headers });
        if (check.ok) {
          const statusData = await check.json();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`\n🎉 Gateway back online in ${elapsed}s!`);
          console.log(`• Identity: ${statusData.botTag} (${statusData.status})`);
          console.log(`• Anchors : ${statusData.hmbAnchors} in 64-bit vault`);
          reconnected = true;
          break;
        }
      } catch {}
      process.stdout.write(".");
    }

    if (!reconnected) {
      console.warn(`\n⚠️ Replacement instance didn't respond within 20s. Check terminal logs if running under non-standard environment.`);
    }
  } catch (err) {
    console.error(`❌ Could not connect to gateway: ${err.message}`);
    process.exit(1);
  }
}

run();
