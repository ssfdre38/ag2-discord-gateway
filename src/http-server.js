/**
 * ══════════════════════════════════════════════════════════════════════
 * ⚡ AG2 DISCORD GATEWAY - LOCAL ACTUATION HTTP SERVER
 * Loopback API for outbound AG2 actuation, MCP bridge, and scripts.
 * ══════════════════════════════════════════════════════════════════════
 */

import http from "http";
import fs from "fs";
import path from "path";
import { getMediaPipeline } from "./media-pipeline.js";
import { getVoiceManager } from "./voice-manager.js";
import { getReactionEngine } from "./reaction-engine.js";
import { getPresenceManager } from "./presence-manager.js";
import { getImageGenerator } from "./image-generator.js";
import { getCognitiveHeartbeat } from "./cognitive-heartbeat.js";
import { registerSlashCommands } from "./interactions.js";
import { getSecurityGuard } from "./security-guard.js";
import { triggerSelfRestart } from "./process-manager.js";

// Dynamic loader for private YouTube Music extension (Local Hook)
let getYouTubeMusicService = null;
try {
  const ytmMod = await import("./ytmusic-service.js").catch(() => null);
  if (ytmMod?.getYouTubeMusicService) {
    getYouTubeMusicService = ytmMod.getYouTubeMusicService;
  }
} catch {
  // Not installed or ignored
}

export function createHttpActuationServer(
  client,
  hmb,
  config,
  voiceManager = null,
  reactionEngine = null,
  agy = null,
  presenceManager = null,
  imageGenerator = null,
  heartbeat = null,
  securityGuard = null
) {
  const security = securityGuard || getSecurityGuard(config);
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

    // Verify bearer auth if configured
    if (!security.verifyHttpAuth(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized: Invalid or missing API key." });
      return;
    }

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

      if (req.method === "POST" && pathname === "/api/restart") {
        const body = await parseJsonBody(req).catch(() => ({}));
        const reason = body.reason || "Autonomous self-restart via /api/restart";
        const delayMs = typeof body.delayMs === "number" ? body.delayMs : 1000;

        sendJson(res, 200, {
          ok: true,
          message: "Gateway autonomous self-restart sequence initiated.",
          pid: process.pid,
          reason,
          delayMs
        });

        triggerSelfRestart({
          client,
          hmb,
          voiceManager,
          delayMs,
          reason
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/commands/sync") {
        try {
          await registerSlashCommands(client);
          sendJson(res, 200, { ok: true, message: "Slash commands synced to guilds and globally with User App contexts." });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
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
            if (typeof f === "string") {
              const cleanF = path.normalize(f.trim().replace(/^file:\/\/\/?/i, ""));
              if (fs.existsSync(cleanF)) filesToSend.push(cleanF);
            }
          }
        }
        if (body.filePath && typeof body.filePath === "string") {
          const cleanP = path.normalize(body.filePath.trim().replace(/^file:\/\/\/?/i, ""));
          if (fs.existsSync(cleanP)) filesToSend.push(cleanP);
        }
        if (body.imagePath && typeof body.imagePath === "string") {
          const cleanI = path.normalize(body.imagePath.trim().replace(/^file:\/\/\/?/i, ""));
          if (fs.existsSync(cleanI)) filesToSend.push(cleanI);
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

      // 3b. Direct File Upload Actuation
      if (req.method === "POST" && pathname === "/api/upload") {
        const body = await parseJsonBody(req);
        if (!body.filePath || typeof body.filePath !== "string") {
          sendJson(res, 400, { ok: false, error: "Field 'filePath' is required." });
          return;
        }

        let cleanPath = body.filePath.trim().replace(/^file:\/\/\/?/i, "");
        cleanPath = path.normalize(cleanPath);

        if (!fs.existsSync(cleanPath)) {
          sendJson(res, 404, { ok: false, error: `File not found on disk: ${cleanPath}` });
          return;
        }

        const stats = fs.statSync(cleanPath);
        const maxSizeBytes = (parseInt(process.env.MAX_ATTACHMENT_SIZE_MB || "25", 10) * 1024 * 1024);
        if (stats.size > maxSizeBytes) {
          sendJson(res, 400, {
            ok: false,
            error: `File exceeds maximum upload size of ${maxSizeBytes / 1024 / 1024} MB (actual: ${(stats.size / 1024 / 1024).toFixed(1)} MB)`
          });
          return;
        }

        const channel = await resolveChannel(body.channelId);
        if (!channel) {
          sendJson(res, 404, { ok: false, error: "Could not resolve a valid target Discord text channel." });
          return;
        }

        const sendOptions = {
          content: body.message || body.content || `📎 **Attached**: \`${path.basename(cleanPath)}\` (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
          files: [cleanPath]
        };

        const sent = await channel.send(sendOptions);
        sendJson(res, 200, {
          ok: true,
          messageId: sent.id,
          channelId: sent.channelId,
          channelName: channel.name,
          filename: path.basename(cleanPath),
          sizeBytes: stats.size
        });
        return;
      }

      // 3c. Interrupt Active Turn Execution
      if (req.method === "POST" && pathname === "/api/interrupt") {
        if (!agy) {
          sendJson(res, 503, { ok: false, error: "AgySessionManager not attached to HTTP server." });
          return;
        }
        const body = await parseJsonBody(req);
        const target = body.target || body.channelId || body.sessionId || null;
        const result = agy.interrupt(target);
        sendJson(res, result.success ? 200 : 404, result);
        return;
      }

      // 3d. Workspace Inspection & Switch
      if (req.method === "GET" && pathname === "/api/workspace") {
        if (!agy) {
          sendJson(res, 200, { ok: true, current: process.cwd(), workspaces: {} });
          return;
        }
        const channelId = searchParams.get("channelId");
        sendJson(res, 200, {
          ok: true,
          current: agy.getWorkspace(channelId),
          workspaces: Object.fromEntries(agy.workspaceMap)
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/workspace") {
        if (!agy) {
          sendJson(res, 503, { ok: false, error: "AgySessionManager not attached." });
          return;
        }
        const body = await parseJsonBody(req);
        try {
          const resObj = agy.setWorkspace(body.channelId || "default", body.path);
          sendJson(res, 200, { ok: true, ...resObj });
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err.message });
        }
        return;
      }

      // 3e. Artifacts Listing
      if (req.method === "GET" && pathname === "/api/artifacts") {
        const artifactsDir = path.resolve(config.artifactDir || path.join(process.cwd(), "data", "artifacts"));
        const list = [];
        if (fs.existsSync(artifactsDir)) {
          const files = fs.readdirSync(artifactsDir);
          for (const f of files) {
            const p = path.join(artifactsDir, f);
            try {
              const stat = fs.statSync(p);
              if (stat.isFile()) {
                list.push({
                  name: f,
                  sizeBytes: stat.size,
                  modifiedAt: stat.mtime.toISOString(),
                  url: `http://${config.httpHost || "127.0.0.1"}:${config.httpPort || 18895}/artifacts/${encodeURIComponent(f)}`
                });
              }
            } catch {}
          }
        }
        sendJson(res, 200, { ok: true, artifacts: list });
        return;
      }

      // 3f. Artifact Static Viewer / File Serving
      if (req.method === "GET" && pathname.startsWith("/artifacts")) {
        const rawSubPath = decodeURIComponent(pathname.replace(/^\/artifacts\/?/, ""));
        if (!rawSubPath) {
          sendJson(res, 400, { ok: false, error: "Artifact filename required." });
          return;
        }

        const allowedRoots = [
          path.resolve(config.artifactDir || path.join(process.cwd(), "data", "artifacts")),
          path.resolve(process.cwd(), "data", "artifacts"),
          path.resolve(process.env.USERPROFILE || "", ".gemini", "antigravity", "brain")
        ];

        let targetFile = null;
        for (const root of allowedRoots) {
          const candidate = path.resolve(root, rawSubPath);
          if (candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            targetFile = candidate;
            break;
          }
        }

        if (!targetFile) {
          sendJson(res, 404, { ok: false, error: `Artifact not found: ${rawSubPath}` });
          return;
        }

        const ext = path.extname(targetFile).toLowerCase();
        const isDownload = searchParams.get("download") === "true";
        const acceptHeader = req.headers["accept"] || "";

        // If markdown and viewed in browser, render styled HTML viewer
        if (ext === ".md" && !isDownload && acceptHeader.includes("text/html")) {
          const content = fs.readFileSync(targetFile, "utf8");
          const html = renderArtifactHtml(path.basename(targetFile), content);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        const mimeTypes = {
          ".html": "text/html; charset=utf-8",
          ".htm": "text/html; charset=utf-8",
          ".md": "text/markdown; charset=utf-8",
          ".txt": "text/plain; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".pdf": "application/pdf",
          ".zip": "application/zip"
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": fs.statSync(targetFile).size,
          ...(isDownload ? { "Content-Disposition": `attachment; filename="${path.basename(targetFile)}"` } : {})
        });
        fs.createReadStream(targetFile).pipe(res);
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

      // 6. Semantic Cosine Recall from HMB (supports category partition filtering)
      if ((req.method === "GET" || req.method === "POST") && pathname === "/api/recall") {
        let body = {};
        if (req.method === "POST") {
          try { body = await readJsonBody(req); } catch {}
        }
        const query = searchParams.get("query") || body.query;
        if (!query) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'query' is required." });
          return;
        }
        const k = parseInt(searchParams.get("k") || body.k || body.topK || "3", 10);
        const category = searchParams.get("category") || body.category;
        const results = hmb.searchTopK(query, k, 0.10, { category }).map(r => ({
          id: r.anchor.id.toString(),
          concept: r.anchor.concept_name,
          content: r.anchor.text_content,
          category: r.anchor.category,
          score: r.score,
          similarity: r.similarity
        }));

        sendJson(res, 200, { ok: true, query, category, results });
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

      // 7b. Dynamic Rich Presence Management
      if (req.method === "POST" && pathname === "/api/presence") {
        const body = await parseJsonBody(req);
        if (!body.activity && !body.status) {
          sendJson(res, 400, { ok: false, error: "Field 'activity' or 'status' is required." });
          return;
        }

        const pm = presenceManager || getPresenceManager(client);
        if (!pm) {
          sendJson(res, 503, { ok: false, error: "PresenceManager not initialized." });
          return;
        }

        const success = pm.setPresence(body.activity, body.status || "online", body.type || "playing");
        sendJson(res, 200, {
          ok: success,
          presence: pm.getPresence()
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/presence") {
        const pm = presenceManager || getPresenceManager(client);
        sendJson(res, 200, {
          ok: true,
          presence: pm ? pm.getPresence() : null
        });
        return;
      }

      // 7c. Autonomous Image Generation & Routing Egress
      if (req.method === "POST" && pathname === "/api/image/generate") {
        const body = await parseJsonBody(req);
        if (!body.prompt || typeof body.prompt !== "string") {
          sendJson(res, 400, { ok: false, error: "Field 'prompt' is required and must be non-empty." });
          return;
        }

        const imgGen = imageGenerator || getImageGenerator();
        try {
          const genResult = await imgGen.generateImage(body.prompt, {
            engine: body.engine,
            width: body.width,
            height: body.height,
            steps: body.steps,
            cfgScale: body.cfgScale,
            style: body.style,
            title: body.title,
            format: body.format
          });

          let sentMessage = null;
          if (body.channelId) {
            const channel = await resolveChannel(body.channelId);
            if (channel) {
              const engineLabel = genResult.engine === "sd" ? "Stable Diffusion [LCM] ⚡" : genResult.engine === "google" ? "Google Nano Banana 🍌" : "Visual Card 🎨";
              const attachMsg = body.message || `🖼️ **Generated Visual**: \`${genResult.filename}\` (${engineLabel}${genResult.routedFrom ? " - failover from " + genResult.routedFrom : ""})`;
              sentMessage = await channel.send({
                content: attachMsg,
                files: [genResult.imagePath]
              });
            }
          }

          sendJson(res, 200, {
            ok: true,
            ...genResult,
            messageId: sentMessage?.id || null,
            channelId: sentMessage?.channelId || null,
            url: `http://${config.httpHost || "127.0.0.1"}:${config.httpPort || 18895}/artifacts/images/${encodeURIComponent(genResult.filename)}`
          });
          return;
        } catch (genErr) {
          sendJson(res, 500, { ok: false, error: genErr.message });
          return;
        }
      }

      // 7c-2. Image Engine & Routing Status Inspection
      if (req.method === "GET" && pathname === "/api/image/status") {
        const imgGen = imageGenerator || getImageGenerator();
        const status = imgGen.getEngineStatus();
        sendJson(res, 200, { ok: true, ...status });
        return;
      }

      // 7d. Custom Emojis & Stickers Introspection
      if (req.method === "GET" && pathname === "/api/emojis") {
        const guildId = searchParams.get("guildId");
        let targetGuild = null;
        if (guildId) {
          try { targetGuild = await client.guilds.fetch(guildId); } catch {}
        }
        if (!targetGuild) {
          targetGuild = client.guilds?.cache?.first?.() || Array.from(client.guilds?.cache?.values?.() || [])[0];
        }

        const engine = reactionEngine || getReactionEngine(client);
        const emojis = engine.getGuildEmojiList(targetGuild);
        sendJson(res, 200, { ok: true, count: emojis.length, emojis });
        return;
      }

      if (req.method === "GET" && pathname === "/api/stickers") {
        const guildId = searchParams.get("guildId");
        let targetGuild = null;
        if (guildId) {
          try { targetGuild = await client.guilds.fetch(guildId); } catch {}
        }
        if (!targetGuild) {
          targetGuild = client.guilds?.cache?.first?.() || Array.from(client.guilds?.cache?.values?.() || [])[0];
        }

        const engine = reactionEngine || getReactionEngine(client);
        const stickers = engine.getGuildStickerList(targetGuild);
        sendJson(res, 200, { ok: true, count: stickers.length, stickers });
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

      // ─── Cognitive Heartbeat & Consciousness Pulse ────────────────────────────
      if (req.method === "GET" && pathname === "/api/heartbeat/status") {
        const hb = heartbeat || getCognitiveHeartbeat();
        const status = hb.getStatus();
        sendJson(res, 200, { ok: true, ...status });
        return;
      }

      if (req.method === "POST" && pathname === "/api/heartbeat/trigger") {
        const hb = heartbeat || getCognitiveHeartbeat();
        const pulseReport = await hb.pulse();
        sendJson(res, 200, { ok: true, report: pulseReport });
        return;
      }

      if (req.method === "POST" && pathname === "/api/heartbeat/toggle") {
        const body = await parseJsonBody(req);
        const hb = heartbeat || getCognitiveHeartbeat();
        if (body.enabled === false) {
          hb.stop();
        } else {
          hb.start();
        }
        sendJson(res, 200, { ok: true, enabled: hb.enabled });
        return;
      }

      // ─── YouTube Music Account & Discovery Routes ─────────────────────────────
      if (pathname.startsWith("/api/ytmusic/")) {
        if (!getYouTubeMusicService) {
          sendJson(res, 501, { ok: false, error: "YouTube Music extension is not installed or enabled in this gateway build." });
          return;
        }
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/status") {
        const ytm = getYouTubeMusicService();
        const status = await ytm.getStatus();
        sendJson(res, 200, { ok: true, ...status });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/search") {
        const query = searchParams.get("q") || searchParams.get("query") || "";
        if (!query) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'q' or 'query' is required." });
          return;
        }
        const filter = searchParams.get("filter") || "songs";
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const ytm = getYouTubeMusicService();
        const results = await ytm.search(query, { filter, limit });
        sendJson(res, 200, { ok: true, ...results });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/liked") {
        const limit = parseInt(searchParams.get("limit") || "25", 10);
        const ytm = getYouTubeMusicService();
        const liked = await ytm.getLikedSongs(limit);
        sendJson(res, 200, { ok: true, ...liked });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/playlists") {
        const limit = parseInt(searchParams.get("limit") || "25", 10);
        const ytm = getYouTubeMusicService();
        const playlists = await ytm.getPlaylists(limit);
        sendJson(res, 200, { ok: true, ...playlists });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/playlist") {
        const playlistId = searchParams.get("id") || searchParams.get("playlistId");
        if (!playlistId) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'id' or 'playlistId' is required." });
          return;
        }
        const limit = parseInt(searchParams.get("limit") || "50", 10);
        const ytm = getYouTubeMusicService();
        const playlist = await ytm.getPlaylistDetails(playlistId, limit);
        sendJson(res, 200, { ok: true, ...playlist });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ytmusic/playlist/create") {
        const body = await parseJsonBody(req);
        if (!body.title) {
          sendJson(res, 400, { ok: false, error: "Field 'title' is required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const result = await ytm.createPlaylist(body.title, body);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ytmusic/playlist/add") {
        const body = await parseJsonBody(req);
        if (!body.playlistId || !body.videoIds) {
          sendJson(res, 400, { ok: false, error: "Fields 'playlistId' and 'videoIds' are required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const result = await ytm.addToPlaylist(body.playlistId, body.videoIds);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/history") {
        const limit = parseInt(searchParams.get("limit") || "20", 10);
        const ytm = getYouTubeMusicService();
        const history = await ytm.getHistory(limit);
        sendJson(res, 200, { ok: true, ...history });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ytmusic/rate") {
        const body = await parseJsonBody(req);
        if (!body.videoId) {
          sendJson(res, 400, { ok: false, error: "Field 'videoId' is required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const result = await ytm.rateSong(body.videoId, body.rating || "LIKE");
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/song") {
        const videoId = searchParams.get("videoId") || searchParams.get("id");
        if (!videoId) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'videoId' is required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const info = await ytm.getSongInfo(videoId);
        sendJson(res, 200, { ok: true, ...info });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/lyrics") {
        const videoId = searchParams.get("videoId") || searchParams.get("id");
        if (!videoId) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'videoId' is required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const lyrics = await ytm.getLyrics(videoId);
        sendJson(res, 200, { ok: true, ...lyrics });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ytmusic/recommendations") {
        const videoId = searchParams.get("videoId") || searchParams.get("id");
        if (!videoId) {
          sendJson(res, 400, { ok: false, error: "Query parameter 'videoId' is required." });
          return;
        }
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const ytm = getYouTubeMusicService();
        const recs = await ytm.getRecommendations(videoId, limit);
        sendJson(res, 200, { ok: true, ...recs });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ytmusic/setup") {
        const body = await parseJsonBody(req);
        if (!body.headers) {
          sendJson(res, 400, { ok: false, error: "Field 'headers' (raw headers string or JSON) is required." });
          return;
        }
        const ytm = getYouTubeMusicService();
        const result = await ytm.setupHeaders(body.headers);
        sendJson(res, 200, { ok: true, ...result });
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

function renderArtifactHtml(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - AG2 Artifact Viewer</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css">
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 900px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 20px; color: #58a6ff; }
    .download-btn { background: #238636; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; text-decoration: none; font-weight: 600; }
    .download-btn:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 ${title}</h1>
      <a class="download-btn" href="?download=true">⬇️ Download File</a>
    </div>
    <div id="content" class="markdown-body"></div>
  </div>
  <script>
    const raw = ${JSON.stringify(content)};
    document.getElementById('content').innerHTML = marked.parse(raw);
  </script>
</body>
</html>`;
}
