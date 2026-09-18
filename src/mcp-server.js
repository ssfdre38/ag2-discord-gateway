#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 * ⚡ AG2 DISCORD GATEWAY - MODEL CONTEXT PROTOCOL (MCP) STDIO SERVER
 * Provides AG2 agents with native tools to actuate Discord and HMB memory.
 * ══════════════════════════════════════════════════════════════════════
 */

import readline from "readline";

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "18895", 10);
const HTTP_HOST = process.env.HTTP_HOST || "127.0.0.1";
const BASE_URL = `http://${HTTP_HOST}:${HTTP_PORT}`;

const TOOLS = [
  {
    name: "discord_post_message",
    description: "Send an outbound message directly to Discord (e.g. to #lounge or configured default channel).",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message text to send to Discord." },
        channelId: { type: "string", description: "Optional Discord channel ID. If omitted, sends to configured default channel." }
      },
      required: ["message"]
    }
  },
  {
    name: "discord_read_recent",
    description: "Read recent messages from a Discord channel.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of messages to retrieve (1-50, default 10)." },
        channelId: { type: "string", description: "Optional Discord text channel ID." }
      }
    }
  },
  {
    name: "discord_get_status",
    description: "Get the live status of the AG2 Discord Gateway, bot user tag, connected guilds, and memory count.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "hmb_store_memory",
    description: "Store a persistent memory anchor into the 64-bit Haven Memory Bank (.hmb) vault.",
    inputSchema: {
      type: "object",
      properties: {
        concept: { type: "string", description: "Title / concept headline for the memory anchor." },
        content: { type: "string", description: "Detailed content to commit to long-term memory." },
        category: { type: "string", description: "Category: CORE_IDENTITY, EPISODIC, SEMANTIC, or EMOTIONAL." }
      },
      required: ["concept", "content"]
    }
  },
  {
    name: "hmb_query_memory",
    description: "Query the 64-bit Haven Memory Bank (.hmb) using semantic cosine similarity.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query to search memories for." },
        topK: { type: "number", description: "Maximum number of memories to recall (default 3)." }
      },
      required: ["query"]
    }
  }
];

async function callGateway(endpoint, method = "GET", body = null) {
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
    throw new Error(
      `Gateway connection failed at ${BASE_URL} (${err.message}). Is the ag2-discord-gateway running?`
    );
  }
}

async function handleToolCall(name, args) {
  switch (name) {
    case "discord_post_message": {
      const res = await callGateway("/api/send", "POST", {
        content: args.message,
        channelId: args.channelId
      });
      if (!res.ok) throw new Error(res.error || "Failed to send message to Discord");
      return `✅ Successfully posted to Discord #${res.channelName || res.channelId} (Message ID: ${res.messageId})`;
    }

    case "discord_read_recent": {
      const qs = new URLSearchParams();
      if (args.limit) qs.append("limit", args.limit.toString());
      if (args.channelId) qs.append("channelId", args.channelId);
      const res = await callGateway(`/api/history?${qs.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to fetch history");

      let formatted = `📜 **Recent Messages in #${res.channelName}** (${res.messages.length} fetched):\n`;
      for (const m of res.messages.reverse()) {
        const time = new Date(m.timestamp).toLocaleTimeString();
        formatted += `[${time}] ${m.authorName}: ${m.content}\n`;
      }
      return formatted;
    }

    case "discord_get_status": {
      const res = await callGateway("/api/status");
      if (!res.ok) throw new Error(res.error || "Failed to get gateway status");
      return (
        `⚡ **AG2 Discord Gateway Status**:\n` +
        `• Bot: ${res.botTag} (ID: ${res.botId})\n` +
        `• Status: ${res.status}\n` +
        `• Guilds: ${res.guilds.map(g => `${g.name} (${g.memberCount} members)`).join(", ")}\n` +
        `• HMB Anchors: ${res.hmbAnchors} stored in 64-bit vault`
      );
    }

    case "hmb_store_memory": {
      const res = await callGateway("/api/remember", "POST", {
        concept: args.concept,
        content: args.content,
        category: args.category || "EPISODIC"
      });
      if (!res.ok) throw new Error(res.error || "Failed to store memory anchor");
      return `🧠 Memory Anchor #${res.anchor.id} committed to HMB 64-bit vault. Total anchors: ${res.totalAnchors}`;
    }

    case "hmb_query_memory": {
      const qs = new URLSearchParams({ query: args.query });
      if (args.topK) qs.append("k", args.topK.toString());
      const res = await callGateway(`/api/recall?${qs.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to recall memories");

      if (res.results.length === 0) return `No memories found matching query: "${args.query}"`;
      let text = `🔍 **HMB Recall Results for "${args.query}"**:\n`;
      for (const r of res.results) {
        text += `• [${r.category}] ${r.concept}: ${r.content} (Score: ${r.score.toFixed(3)})\n`;
      }
      return text;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Stdio JSON-RPC MCP Server Loop ─────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error = null) {
  const resp = { jsonrpc: "2.0", id };
  if (error) {
    resp.error = { code: -32603, message: error.message || String(error) };
  } else {
    resp.result = result;
  }
  process.stdout.write(JSON.stringify(resp) + "\n");
}

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === "initialize") {
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "ag2-discord-gateway",
          version: "1.0.0"
        }
      });
      return;
    }

    if (method === "notifications/initialized") {
      // No-op for initialization notification
      return;
    }

    if (method === "ping") {
      sendResponse(id, {});
      return;
    }

    if (method === "tools/list") {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const textResult = await handleToolCall(toolName, toolArgs);
        sendResponse(id, {
          content: [{ type: "text", text: textResult }]
        });
      } catch (toolErr) {
        sendResponse(id, {
          content: [{ type: "text", text: `⚠️ Error: ${toolErr.message}` }],
          isError: true
        });
      }
      return;
    }

    // Unhandled method
    if (id !== undefined) {
      sendResponse(id, null, { message: `Method '${method}' not supported.` });
    }
  } catch (err) {
    // Bad JSON
    process.stderr.write(`[MCP Error] Parse error: ${err.message}\n`);
  }
});
