/**
 * ══════════════════════════════════════════════════════════════════════
 * ⚡ AG2 DISCORD GATEWAY - LOCAL ACTUATION HTTP SERVER
 * Loopback API for outbound AG2 actuation, MCP bridge, and scripts.
 * ══════════════════════════════════════════════════════════════════════
 */

import http from "http";
import fs from "fs";
import { getMediaPipeline } from "./media-pipeline.js";
import { getVoiceManager } from "./voice-manager.js";
import { getReactionEngine } from "./reaction-engine.js";

export function createHttpActuationServer(client, hmb, config, voiceManager = null, reactionEngine = null) {
  const parseJsonBody = (req) => {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 1e6) {
          req.destroy();
          reject(new Error("Request payload too large (max 1MB)"));
        }
      });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error("Invalid JSON: " + err.message));
        }
      });
      req.on("error", reject);
    });
  };

  const sendJson = (res, statusCode, data) => {
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(data, null, 2));
  };

  const resolveChannel = async (channelId) => {
    let targetId = channelId;
    if (!targetId && config.allowedChannels.length > 0) {
      targetId = config.allowedChannels[0];
    }

    if (targetId) {
      try {
        const chan = await client.channels.fetch(targetId);
        if (chan && chan.isTextBased()) return chan;
      } catch {}
    }

    // Fallback: first accessible text channel in cache
    for (const guild of client.guilds.cache.values()) {
      for (const chan of guild.channels.cache.values()) {
        if (chan.isTextBased() && chan.permissionsFor(client.user)?.has("SendMessages")) {
          return chan;
        }
      }
    }

    return null;
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    const fullUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = fullUrl.pathname;
    const searchParams = fullUrl.searchParams;

    try {
      // 1. Status & Health
      if (req.method === "GET" && (pathname === "/api/status" || pathname === "/health")) {
        const guildList = Array.from(client.guilds.cache.values()).map(g => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount
        }));

        sendJson(res, 200, {
          ok: true,
          status: client.isReady() ? "online" : "initializing",
          botTag: client.user?.tag || null,
          botId: client.user?.id || null,
          guilds: guildList,
          allowedChannels: config.allowedChannels,
          hmbAnchors: hmb.getMemoryCount(),
          vaultPath: config.hmbVaultPath
        });
        return;
      }

      // 2. Channel List
      if (req.method === "GET" && pathname === "/api/channels") {
        const channels = [];
        for (const guild of client.guilds.cache.values()) {
          for (const chan of guild.channels.cache.values()) {
            if (chan.isTextBased() && chan.permissionsFor(client.user)?.has("SendMessages")) {
              channels.push({
                id: chan.id,
                name: chan.name,
                guildId: guild.id,
                guildName: guild.name
              });
            }
          }
        }
        sendJson(res, 200, { ok: true, channels });
        return;
      }

      // 3. Outbound Message Send
      if (req.method === "POST" && pathname === "/api/send") {
        const body = await parseJsonBody(req);
        if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
          sendJson(res, 400, { ok: false, error: "Field 'content' is required and must be non-empty." });
          return;
        }

        const channel = await resolveChannel(body.channelId);
        if (!channel) {
          sendJson(res, 404, { ok: false, error: "Could not resolve a valid target Discord text channel." });
          return;
        }

        const sendOptions = { content: body.content };
        if (body.replyToId) {
          sendOptions.reply = { messageReference: body.replyToId };
        }

        const mediaPipeline = getMediaPipeline();
        const filesToSend = [];
        if (Array.isArray(body.files)) {
          for (const f of body.files) {
            if (typeof f === "string" && fs.existsSync(f)) filesToSend.push(f);
          }
        }
        if (body.filePath && typeof body.filePath === "string" && fs.existsSync(body.filePath)) {
          filesToSend.push(body.filePath);
        }
        if (body.imagePath && typeof body.imagePath === "string" && fs.existsSync(body.imagePath)) {
          filesToSend.push(body.imagePath);
        }
        if (body.imageUrl && typeof body.imageUrl === "string") {
          const dlPath = await mediaPipeline.downloadMedia(body.imageUrl);
          if (dlPath) filesToSend.push(dlPath);
        }

        if (filesToSend.length > 0) {
          sendOptions.files = filesToSend;
        }

        const sent = await channel.send(sendOptions);
        sendJson(res, 200, {
          ok: true,
          messageId: sent.id,
          channelId: sent.channelId,
          channelName: channel.name,
          timestamp: sent.createdTimestamp
        });
        return;
      }

      // 4. Inbound History Inspection
      if (req.method === "GET" && pathname === "/api/history") {
        const channelId = searchParams.get("channelId");
        const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

        const channel = await resolveChannel(channelId);
        if (!channel) {
          sendJson(res, 404, { ok: false, error: "Could not resolve target Discord text channel." });
          return;
        }

        const fetched = await channel.messages.fetch({ limit });
        const messages = Array.from(fetched.values()).map(m => ({
          id: m.id,
          author: m.author.tag,
          authorId: m.author.id,
          authorName: m.member?.displayName || m.author.username,
          content: m.content,
          timestamp: m.createdTimestamp,
          isBot: m.author.bot,
          attachments: m.attachments.map(a => a.url)
        }));

        sendJson(res, 200, {
          ok: true,
          channelId: channel.id,
          channelName: channel.name,
          messages
        });
        return;
      }

      // 5. Commit Memory Anchor to HMB
      if (req.method === "POST" && pathname === "/api/remember") {
        const body = await parseJsonBody(req);
        if (!body.concept || !body.content) {
          sendJson(res, 400, { ok: false, error: "Fields 'concept' and 'content' are required." });
          return;
        }

        const anchor = hmb.addMemory({
          concept_name: body.concept,
          text_content: body.content,
          category: body.category || "EPISODIC",
          weight: typeof body.weight === "number" ? body.weight : 1.0,
          emotional_salience: typeof body.emotionalSalience === "number" ? body.emotionalSalience : 0.95
        });

        hmb.saveToHmb(config.hmbVaultPath);

        sendJson(res, 200, {
          ok: true,
          anchor: {
            id: anchor.id.toString(),
            concept: anchor.concept_name,
            content: anchor.text_content,
            category: anchor.category,
            weight: anchor.weight
          },
          totalAnchors: hmb.getMemoryCount()
        });
        return;
      }

      // 6. Semantic Cosine Recall from HMB
      if (req.method === "GET" && pathname === "/api/recall") {
        const query = searchParams.get("query");
        if (!query) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'query' is required." });
          return;
        }
        const k = parseInt(searchParams.get("k") || "3", 10);
        const results = hmb.searchTopK(query, k, 0.10).map(r => ({
          id: r.anchor.id.toString(),
          concept: r.anchor.concept_name,
          content: r.anchor.text_content,
          category: r.anchor.category,
          score: r.score,
          similarity: r.similarity
        }));

        sendJson(res, 200, { ok: true, query, results });
        return;
      }

      // 7. Expressive Reaction Actuation
      if (req.method === "POST" && pathname === "/api/react") {
        const body = await parseJsonBody(req);
        if (!body.messageId || !body.emoji) {
          sendJson(res, 400, { ok: false, error: "Fields 'messageId' and 'emoji' are required." });
          return;
        }

        const channel = await resolveChannel(body.channelId);
        if (!channel) {
          sendJson(res, 404, { ok: false, error: "Target Discord channel could not be resolved." });
          return;
        }

        let targetMsg;
        try {
          targetMsg = await channel.messages.fetch(body.messageId);
        } catch {
          sendJson(res, 404, { ok: false, error: `Message with ID ${body.messageId} not found in channel.` });
          return;
        }

        const engine = reactionEngine || getReactionEngine(client);
        const success = await engine.reactToMessage(targetMsg, body.emoji);

        sendJson(res, 200, {
          ok: success,
          messageId: body.messageId,
          emoji: body.emoji,
          channelId: channel.id
        });
        return;
      }

      // 8. Voice Channel Presence & Speech Synthesis
      if (req.method === "POST" && pathname === "/api/voice/join") {
        const body = await parseJsonBody(req);
        if (!body.channelId) {
          sendJson(res, 400, { ok: false, error: "Field 'channelId' is required." });
          return;
        }

        let targetChan;
        try {
          targetChan = await client.channels.fetch(body.channelId);
        } catch {}

        if (!targetChan) {
          sendJson(res, 404, { ok: false, error: `Channel ${body.channelId} not found.` });
          return;
        }

        const vm = voiceManager || getVoiceManager();
        const result = await vm.join(targetChan);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/voice/leave") {
        const body = await parseJsonBody(req);
        const guildId = body.guildId || Array.from(client.guilds.cache.keys())[0];
        if (!guildId) {
          sendJson(res, 400, { ok: false, error: "Field 'guildId' is required or could not be determined." });
          return;
        }

        const vm = voiceManager || getVoiceManager();
        const result = vm.leave(guildId);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/voice/speak") {
        const body = await parseJsonBody(req);
        if (!body.text || typeof body.text !== "string") {
          sendJson(res, 400, { ok: false, error: "Field 'text' is required and must be non-empty." });
          return;
        }

        const guildId = body.guildId || Array.from(client.guilds.cache.keys())[0];
        if (!guildId) {
          sendJson(res, 400, { ok: false, error: "Field 'guildId' could not be resolved." });
          return;
        }

        const vm = voiceManager || getVoiceManager();
        const result = await vm.speakText(guildId, body.text, {
          voice: body.voice,
          rate: body.rate,
          volume: body.volume
        });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/voice/play") {
        const body = await parseJsonBody(req);
        if (!body.filePath || typeof body.filePath !== "string") {
          sendJson(res, 400, { ok: false, error: "Field 'filePath' is required." });
          return;
        }

        const guildId = body.guildId || Array.from(client.guilds.cache.keys())[0];
        if (!guildId) {
          sendJson(res, 400, { ok: false, error: "Field 'guildId' could not be resolved." });
          return;
        }

        const vm = voiceManager || getVoiceManager();
        const result = await vm.playAudioFile(guildId, body.filePath);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && pathname === "/api/voice/status") {
        const guildId = searchParams.get("guildId") || Array.from(client.guilds.cache.keys())[0];
        const vm = voiceManager || getVoiceManager();
        const status = vm.getStatus(guildId);
        sendJson(res, 200, { ok: true, guildId, ...status });
        return;
      }

      // 404 Route Not Found
      sendJson(res, 404, { ok: false, error: `Route '${pathname}' not found.` });
    } catch (err) {
      console.error(`[Actuation HTTP Error] ${err.message}`);
      sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  return server;
}
