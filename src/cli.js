#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 * ⚡ AG2 DISCORD GATEWAY - COMMAND LINE ACTUATION INTERFACE
 * Allows instant Discord sending, history reading, and HMB recall from CLI.
 * ══════════════════════════════════════════════════════════════════════
 */

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "18895", 10);
const HTTP_HOST = process.env.HTTP_HOST || "127.0.0.1";
const BASE_URL = `http://${HTTP_HOST}:${HTTP_PORT}`;

async function api(endpoint, method = "GET", body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(url, options);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`❌ Connection failed to ${BASE_URL}: ${err.message}`);
    console.error("Please make sure 'ag2-discord-gateway' is running (npm start).");
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(`
⚡ AG2 Discord Gateway CLI ⚡
Usage:
  node src/cli.js status                       Check gateway & bot connection status
  node src/cli.js send "message" [--channel ID] Post a message to Discord
  node src/cli.js history [--channel ID] [--limit N] Read recent messages
  node src/cli.js channels                     List all accessible text channels
  node src/cli.js remember "concept" "content" Store a memory anchor into HMB vault
  node src/cli.js recall "query" [--k N]       Perform semantic search against HMB
    `);
    return;
  }

  // 1. Status
  if (command === "status") {
    const data = await api("/api/status");
    console.log("\n⚡ [Gateway Status]:");
    console.log(`• Bot: ${data.botTag} (ID: ${data.botId})`);
    console.log(`• Status: ${data.status.toUpperCase()}`);
    console.log(`• Guilds: ${data.guilds.map(g => `${g.name} (${g.memberCount} members)`).join(", ")}`);
    console.log(`• Allowed Channels: ${data.allowedChannels?.join(", ") || "All Channels"}`);
    console.log(`• HMB 64-Bit Anchors: ${data.hmbAnchors}`);
    console.log(`• Vault Path: ${data.vaultPath}\n`);
    return;
  }

  // 2. Channels
  if (command === "channels") {
    const data = await api("/api/channels");
    console.log(`\n📋 [Accessible Discord Channels] (${data.channels?.length || 0} total):`);
    for (const c of data.channels || []) {
      console.log(`• #${c.name.padEnd(20)} [ID: ${c.id}] (Guild: ${c.guildName})`);
    }
    console.log("");
    return;
  }

  // 3. Send
  if (command === "send") {
    let channelId = null;
    let messageText = "";

    for (let i = 1; i < args.length; i++) {
      if ((args[i] === "--channel" || args[i] === "-c") && args[i + 1]) {
        channelId = args[i + 1];
        i++;
      } else {
        messageText += (messageText ? " " : "") + args[i];
      }
    }

    if (!messageText.trim()) {
      console.error("❌ Error: Message text is required. Example: node src/cli.js send \"Hello Discord!\"");
      process.exit(1);
    }

    const data = await api("/api/send", "POST", { content: messageText, channelId });
    if (data.ok) {
      console.log(`✅ Posted to Discord #${data.channelName || data.channelId} (Msg ID: ${data.messageId})`);
    } else {
      console.error(`❌ Failed: ${data.error}`);
    }
    return;
  }

  // 4. History
  if (command === "history") {
    let channelId = null;
    let limit = 10;

    for (let i = 1; i < args.length; i++) {
      if ((args[i] === "--channel" || args[i] === "-c") && args[i + 1]) {
        channelId = args[i + 1];
        i++;
      } else if ((args[i] === "--limit" || args[i] === "-l" && args[i + 1])) {
        limit = parseInt(args[i + 1], 10);
        i++;
      }
    }

    const qs = new URLSearchParams();
    if (channelId) qs.append("channelId", channelId);
    if (limit) qs.append("limit", limit.toString());

    const data = await api(`/api/history?${qs.toString()}`);
    if (data.ok) {
      console.log(`\n📜 [Recent Messages in #${data.channelName}] (${data.messages.length} fetched):\n`);
      for (const m of data.messages.reverse()) {
        const time = new Date(m.timestamp).toLocaleTimeString();
        console.log(`[${time}] ${m.authorName}: ${m.content}`);
      }
      console.log("");
    } else {
      console.error(`❌ Failed: ${data.error}`);
    }
    return;
  }

  // 5. Remember
  if (command === "remember") {
    const concept = args[1];
    const content = args.slice(2).join(" ");

    if (!concept || !content) {
      console.error("❌ Usage: node src/cli.js remember \"Concept\" \"Content\"");
      process.exit(1);
    }

    const data = await api("/api/remember", "POST", { concept, content, category: "EPISODIC" });
    if (data.ok) {
      console.log(`🧠 Anchor #${data.anchor.id} committed to HMB vault. Total: ${data.totalAnchors}`);
    } else {
      console.error(`❌ Failed: ${data.error}`);
    }
    return;
  }

  // 6. Recall
  if (command === "recall") {
    const query = args.slice(1).join(" ");
    if (!query) {
      console.error("❌ Usage: node src/cli.js recall \"query\"");
      process.exit(1);
    }

    const data = await api(`/api/recall?query=${encodeURIComponent(query)}`);
    if (data.ok) {
      console.log(`\n🔍 [HMB Semantic Recall for: "${query}"]`);
      for (const r of data.results) {
        console.log(`• [${r.category}] ${r.concept}: ${r.content} (Score: ${r.score.toFixed(3)})`);
      }
      console.log("");
    } else {
      console.error(`❌ Failed: ${data.error}`);
    }
    return;
  }

  console.error(`❌ Unknown command: ${command}. Run 'node src/cli.js help' for usage.`);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
