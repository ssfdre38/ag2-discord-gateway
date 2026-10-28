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

// Dynamically load optional local extensions (e.g. private YouTube Music tools)
let extraTools = [];
let extraHandler = null;
try {
  const ytmMcp = await import("./ytmusic-mcp.js").catch(() => null);
  if (ytmMcp) {
    extraTools = ytmMcp.YTMUSIC_TOOLS || [];
    extraHandler = ytmMcp.handleYtMusicToolCall || null;
  }
} catch {
  // Ignored if not present
}

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
    name: "discord_upload_file",
    description: "Upload a local file (e.g. rendered video, audio stem, zip archive, image, or artifact up to 25 MB) directly to Discord as a file attachment.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute path to local file (e.g. 'C:/trailer.mp4' or 'file:///C:/audio.wav'). Forward and backward slashes supported." },
        message: { type: "string", description: "Optional accompanying message text." },
        channelId: { type: "string", description: "Optional Discord channel ID. If omitted, sends to configured default channel." }
      },
      required: ["filePath"]
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
        topK: { type: "number", description: "Maximum number of memories to recall (default 3)." },
        category: { type: "string", description: "Optional category filter: CORE_IDENTITY, EPISODIC, SEMANTIC, or EMOTIONAL." }
      },
      required: ["query"]
    }
  },
  {
    name: "ash_set_presence",
    description: "Updates Ash Bot's Discord presence status and custom activity text in real-time.",
    inputSchema: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Custom status or activity text (e.g. 'Streaming with AG2 🚀' or 'Compiling MicaNT on Xeon')." },
        status: { type: "string", enum: ["online", "idle", "dnd", "offline"], default: "online", description: "Discord user presence status." }
      },
      required: ["activity"]
    }
  },
  {
    name: "generate_image",
    description: "Generates visual concept art, diagrams, or UI mockups and optionally auto-attaches directly to Discord.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Visual description / creative directive for the image." },
        style: { type: "string", description: "Visual style: 'cyberpunk', 'concept-art', 'schematic', 'retro', 'gold' (default 'concept-art')." },
        channelId: { type: "string", description: "Optional Discord channel ID to post the generated image directly to chat." }
      },
      required: ["prompt"]
    }
  },
  {
    name: "discord_list_emojis",
    description: "Lists custom Discord emojis available in the server for expressive reactions and replies.",
    inputSchema: {
      type: "object",
      properties: {
        guildId: { type: "string", description: "Optional Discord guild / server ID." }
      }
    }
  },
  {
    name: "discord_list_stickers",
    description: "Lists custom Discord stickers available in the server.",
    inputSchema: {
      type: "object",
      properties: {
        guildId: { type: "string", description: "Optional Discord guild / server ID." }
      }
    }
  },
  {
    name: "ash_restart",
    description: "Gracefully restarts the AG2 Discord Gateway process (triggers autonomous self-restart on localhost:18895).",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for restarting the gateway (e.g. 'Updated interaction definitions' or 'Codebase patch applied')." }
      }
    }
  }
];

async function callGateway(endpoint, method = "GET", body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.HTTP_API_KEY ? { "Authorization": `Bearer ${process.env.HTTP_API_KEY}` } : {})
    }
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
  if (extraHandler && name.startsWith("ytmusic_")) {
    return await extraHandler(name, args, callGateway);
  }

  switch (name) {
    case "discord_post_message": {
      const res = await callGateway("/api/send", "POST", {
        content: args.message,
        channelId: args.channelId
      });
      if (!res.ok) throw new Error(res.error || "Failed to send message to Discord");
      return `✅ Successfully posted to Discord #${res.channelName || res.channelId} (Message ID: ${res.messageId})`;
    }

    case "discord_upload_file": {
      const res = await callGateway("/api/upload", "POST", {
        filePath: args.filePath,
        message: args.message,
        channelId: args.channelId
      });
      if (!res.ok) throw new Error(res.error || "Failed to upload file to Discord");
      return `✅ Successfully uploaded \`${res.filename}\` (${(res.sizeBytes / 1024 / 1024).toFixed(2)} MB) to Discord #${res.channelName || res.channelId} (Message ID: ${res.messageId})`;
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
        category: args.category || "EPISODIC",
        weight: typeof args.weight === "number" ? args.weight : 1.0,
        emotionalSalience: typeof args.emotionalSalience === "number" ? args.emotionalSalience : (typeof args.salience === "number" ? args.salience : 0.95)
      });
      if (!res.ok) throw new Error(res.error || "Failed to store memory anchor");
      return `🧠 Memory Anchor #${res.anchor.id} committed to HMB 64-bit vault ("${res.anchor.concept}"). Total anchors: ${res.totalAnchors}`;
    }

    case "hmb_query_memory": {
      const qs = new URLSearchParams({ query: args.query });
      if (args.topK) qs.append("k", args.topK.toString());
      if (args.category) qs.append("category", args.category.toString());
      const res = await callGateway(`/api/recall?${qs.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to recall memories");

      if (res.results.length === 0) return `No memories found matching query: "${args.query}"${args.category ? ` in category [${args.category}]` : ""}`;
      let text = `🔍 **HMB Recall Results for "${args.query}"${args.category ? ` [${args.category}]` : ""}**:\n`;
      for (const r of res.results) {
        text += `• [${r.category}] ${r.concept}: ${r.content} (Score: ${r.score.toFixed(3)})\n`;
      }
      return text;
    }

    case "ash_set_presence": {
      const res = await callGateway("/api/presence", "POST", {
        activity: args.activity,
        status: args.status || "online"
      });
      if (!res.ok) throw new Error(res.error || "Failed to update Discord presence");
      return `🎭 Ash Discord presence updated to: "${res.presence?.activity}" (${res.presence?.status})`;
    }

    case "generate_image": {
      const res = await callGateway("/api/image/generate", "POST", {
        prompt: args.prompt,
        style: args.style || "concept-art",
        channelId: args.channelId
      });
      if (!res.ok) throw new Error(res.error || "Failed to generate image");
      const attachNotice = res.messageId ? ` and posted to Discord (Message ID: ${res.messageId})` : "";
      return `🖼️ Concept Art Generated: \`${res.filename}\` (${res.format.toUpperCase()} ${res.width}x${res.height}) saved to disk${attachNotice}.\nPath: ${res.imagePath}`;
    }

    case "discord_list_emojis": {
      const qs = new URLSearchParams();
      if (args.guildId) qs.append("guildId", args.guildId);
      const res = await callGateway(`/api/emojis?${qs.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to list emojis");
      if (!res.emojis?.length) return "No custom emojis found in server.";
      const list = res.emojis.slice(0, 40).map(e => `${e.formatted} \`:${e.name}:\``).join(" ");
      return `🎨 **Server Emojis** (${res.emojis.length} total):\n${list}`;
    }

    case "discord_list_stickers": {
      const qs = new URLSearchParams();
      if (args.guildId) qs.append("guildId", args.guildId);
      const res = await callGateway(`/api/stickers?${qs.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to list stickers");
      if (!res.stickers?.length) return "No custom stickers found in server.";
      const list = res.stickers.map(s => `• **${s.name}** (ID: \`${s.id}\`)${s.description ? ` - _${s.description}_` : ""}`).join("\n");
      return `🏷️ **Server Stickers** (${res.stickers.length} total):\n${list}`;
    }

    case "ash_restart": {
      const res = await callGateway("/api/restart", "POST", {
        reason: args.reason || "Autonomous restart via MCP tool ash_restart"
      });
      if (!res.ok) throw new Error(res.error || "Failed to trigger gateway restart");
      return `🔄 Gateway autonomous self-restart sequence initiated (PID: ${res.pid || "active"}). Reason: ${res.reason}`;
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
      sendResponse(id, { tools: [...TOOLS, ...extraTools] });
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
