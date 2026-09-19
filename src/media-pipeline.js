/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎨 AG2 DISCORD GATEWAY - MEDIA & IMAGE PIPELINE
 * Inbound image, GIF, and video processing, ffmpeg keyframe & storyboard extraction,
 * WinRT OCR pre-grounding, and outbound Discord attachment upload.
 * ══════════════════════════════════════════════════════════════════════
 */

import fs from "fs";
import path from "path";
import { execFile } from "child_process";

export class MediaPipeline {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.resolve(process.cwd(), "data", "media_cache");
    this.ocrBinPath = options.ocrBinPath || "C:\\Users\\admin\\source\\gemini-super-system\\tools\\ocr_helper.exe";
    this.maxAgeMs = options.maxAgeMs || 24 * 60 * 60 * 1000; // 24 hours
    this.ensureCacheDir();
    this.cleanStaleCache();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error(`[MediaPipeline] Failed to create cache dir: ${err.message}`);
      }
    }
  }

  cleanStaleCache() {
    try {
      if (!fs.existsSync(this.cacheDir)) return;
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > this.maxAgeMs) {
            fs.unlinkSync(filePath);
          }
        } catch {}
      }
    } catch {}
  }

  /**
   * Extract all media items (attachments, embeds, stickers, URLs) from a Discord message.
   * @param {Object} message - Discord.js Message
   * @returns {Array<Object>} List of candidate media items to download
   */
  extractMediaItems(message) {
    const items = [];

    // 1. Discord Attachments (Uploads)
    if (message.attachments && message.attachments.size > 0) {
      for (const att of message.attachments.values()) {
        const contentType = (att.contentType || "").toLowerCase();
        const ext = path.extname(att.name || "").toLowerCase();

        let kind = "image";
        if (contentType.includes("gif") || ext === ".gif") {
          kind = "gif";
        } else if (contentType.startsWith("video/") || [".mp4", ".webm", ".mov"].includes(ext)) {
          kind = "video";
        } else if (contentType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext)) {
          kind = "image";
        }

        items.push({
          kind,
          url: att.url,
          name: att.name || `attachment_${Date.now()}`,
          contentType: att.contentType,
          size: att.size,
          width: att.width,
          height: att.height
        });
      }
    }

    // 2. Discord Embeds (Tenor, Giphy, direct media embeds)
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        let mediaUrl = null;
        let kind = "image";

        if (embed.type === "gifv" || embed.video) {
          mediaUrl = embed.video?.url || embed.image?.url || embed.thumbnail?.url;
          kind = "gif";
        } else if (embed.image) {
          mediaUrl = embed.image.url;
          kind = (mediaUrl.toLowerCase().includes(".gif") || embed.type === "gifv") ? "gif" : "image";
        } else if (embed.thumbnail && embed.type !== "article") {
          mediaUrl = embed.thumbnail.url;
          kind = mediaUrl.toLowerCase().includes(".gif") ? "gif" : "image";
        }

        if (mediaUrl) {
          // Avoid duplicate URLs already captured by attachments
          if (!items.some(it => it.url === mediaUrl)) {
            items.push({
              kind,
              url: mediaUrl,
              name: `embed_${Date.now()}`,
              provider: embed.provider?.name || "Embed"
            });
          }
        }
      }
    }

    // 3. Stickers
    if (message.stickers && message.stickers.size > 0) {
      for (const sticker of message.stickers.values()) {
        items.push({
          kind: "sticker",
          url: sticker.url,
          name: sticker.name || "Sticker"
        });
      }
    }

    // 4. Raw Links in Text (Tenor, Giphy, direct image/gif links)
    const content = message.content || "";
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = content.match(urlRegex) || [];

    for (const rawUrl of matches) {
      const lower = rawUrl.toLowerCase();
      if (lower.includes("tenor.com/view/")) {
        if (!items.some(it => it.rawUrl === rawUrl)) {
          items.push({
            kind: "tenor_page",
            rawUrl,
            url: rawUrl,
            name: "tenor_gif"
          });
        }
      } else if (/\.(png|jpg|jpeg|gif|webp|mp4|webm)(\?[^\s]*)?$/i.test(rawUrl)) {
        if (!items.some(it => it.url === rawUrl)) {
          const isGif = lower.includes(".gif");
          const isVideo = lower.includes(".mp4") || lower.includes(".webm");
          items.push({
            kind: isGif ? "gif" : (isVideo ? "video" : "image"),
            url: rawUrl,
            name: `url_media_${Date.now()}`
          });
        }
      }
    }

    return items;
  }

  /**
   * Resolves a raw Tenor page URL to its direct animated media URL.
   * @param {string} tenorUrl
   * @returns {Promise<string|null>} Direct media URL
   */
  async resolveTenorMedia(tenorUrl) {
    try {
      const res = await fetch(tenorUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return null;
      const html = await res.text();

      // Check og:video (MP4/WebM) or og:image (GIF)
      const videoMatch = html.match(/<meta property=["']og:video["'] content=["']([^"']+)["']/i);
      if (videoMatch && videoMatch[1]) return videoMatch[1];

      const imageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
      if (imageMatch && imageMatch[1]) return imageMatch[1];

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download a media file from a URL to the local cache.
   * @param {string} url
   * @param {string} preferredExt
   * @returns {Promise<string|null>} Local file path
   */
  async downloadMedia(url, preferredExt = ".png") {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) return null;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) return null;

      let ext = preferredExt;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("gif")) ext = ".gif";
      else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
      else if (contentType.includes("png")) ext = ".png";
      else if (contentType.includes("webp")) ext = ".webp";
      else if (contentType.includes("mp4")) ext = ".mp4";

      const filename = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const localPath = path.join(this.cacheDir, filename);

      fs.writeFileSync(localPath, buffer);
      return localPath;
    } catch (err) {
      console.warn(`[MediaPipeline] Download failed for ${url}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract a static keyframe snapshot from an animated GIF or video via ffmpeg.
   * @param {string} inputPath
   * @returns {Promise<string|null>} Path to extracted keyframe PNG
   */
  async extractKeyframe(inputPath) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, "_frame.png");

    return new Promise((resolve) => {
      execFile(
        "ffmpeg",
        ["-nostdin", "-y", "-i", inputPath, "-vframes", "1", "-q:v", "2", "-update", "1", outputPath],
        { timeout: 30000 },
        (err) => {
          if (!err && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Extract a 3-frame storyboard contact sheet from an animated GIF or video via ffmpeg.
   * @param {string} inputPath
   * @returns {Promise<string|null>} Path to extracted storyboard PNG
   */
  async extractStoryboard(inputPath) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, "_storyboard.png");

    return new Promise((resolve) => {
      // Scales to 320px width and tiles 3 frames horizontally
      execFile(
        "ffmpeg",
        ["-nostdin", "-y", "-i", inputPath, "-vf", "scale=320:-1,tile=3x1", "-frames:v", "1", "-update", "1", outputPath],
        { timeout: 30000 },
        (err) => {
          if (!err && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Run local WinRT OCR on an image to extract text lines in sub-50ms.
   * @param {string} imagePath
   * @returns {Promise<string|null>} Recognized text
   */
  async runOcr(imagePath) {
    if (!fs.existsSync(this.ocrBinPath) || !fs.existsSync(imagePath)) return null;

    return new Promise((resolve) => {
      execFile(
        this.ocrBinPath,
        ["json", path.normalize(path.resolve(imagePath))],
        { timeout: 8000, maxBuffer: 5 * 1024 * 1024 },
        (err, stdout) => {
          if (stdout && stdout.trim()) {
            try {
              const data = JSON.parse(stdout.trim());
              if (Array.isArray(data.lines) && data.lines.length > 0) {
                const combined = data.lines
                  .map(l => (l.text || "").trim())
                  .filter(Boolean)
                  .join(" ");
                return resolve(combined || null);
              }
            } catch {}
          }
          resolve(null);
        }
      );
    });
  }

  /**
   * Process all media in a message, downloading files, extracting keyframes, and running OCR.
   * @param {Object} message - Discord.js Message
   * @returns {Promise<Array<Object>>} Processed media records
   */
  async processInboundMedia(message) {
    const items = this.extractMediaItems(message);
    if (items.length === 0) return [];

    const results = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let targetUrl = item.url;

      // Handle Tenor page resolution
      if (item.kind === "tenor_page") {
        const resolved = await this.resolveTenorMedia(item.rawUrl);
        if (resolved) {
          targetUrl = resolved;
          item.kind = "gif";
        } else {
          continue;
        }
      }

      if (!targetUrl) continue;

      const preferredExt = item.kind === "gif" ? ".gif" : (item.kind === "video" ? ".mp4" : ".png");
      const localPath = await this.downloadMedia(targetUrl, preferredExt);
      if (!localPath || !fs.existsSync(localPath)) continue;

      const record = {
        kind: item.kind,
        originalName: item.name,
        localPath,
        url: targetUrl,
        sizeBytes: fs.statSync(localPath).size
      };

      // Process GIFs and Videos with ffmpeg
      if (item.kind === "gif" || item.kind === "video") {
        const [frame, storyboard] = await Promise.all([
          this.extractKeyframe(localPath),
          this.extractStoryboard(localPath)
        ]);
        if (frame) record.keyframePath = frame;
        if (storyboard) record.storyboardPath = storyboard;
      }

      // OCR Text Detection on main image or extracted keyframe
      const ocrTarget = record.keyframePath || localPath;
      if (record.kind === "image" || record.keyframePath) {
        const detectedText = await this.runOcr(ocrTarget);
        if (detectedText) record.ocrText = detectedText;
      }

      results.push(record);
    }

    return results;
  }

  /**
   * Format processed media items into a clean Markdown block for AG2 / Gemini prompt injection.
   * @param {Array<Object>} mediaRecords
   * @returns {string} Markdown prompt block
   */
  formatPromptInjection(mediaRecords) {
    if (!mediaRecords || mediaRecords.length === 0) return "";

    let block = "\n\n[ATTACHED MEDIA FROM DISCORD]:\n";
    for (const m of mediaRecords) {
      if (m.kind === "gif") {
        block += `• 🎞️ Animated GIF: ${m.localPath} (${(m.sizeBytes / 1024).toFixed(1)} KB)\n`;
        if (m.keyframePath) {
          block += `  → Keyframe Snapshot: ${m.keyframePath}\n`;
        }
        if (m.storyboardPath) {
          block += `  → 3-Frame Movement Progression: ${m.storyboardPath}\n`;
        }
        if (m.ocrText) {
          block += `  → OCR Text in GIF: "${m.ocrText}"\n`;
        }
        block += `  → Note: View the keyframe or storyboard using \`view_file\` to analyze the action, reaction, or emotion.\n`;
      } else if (m.kind === "video") {
        block += `• 🎥 Video: ${m.localPath} (${(m.sizeBytes / 1024).toFixed(1)} KB)\n`;
        if (m.keyframePath) {
          block += `  → Video Keyframe: ${m.keyframePath}\n`;
        }
        block += `  → Note: View the keyframe with \`view_file\` to inspect the video scene.\n`;
      } else {
        block += `• 🖼️ Image: ${m.localPath} (${(m.sizeBytes / 1024).toFixed(1)} KB)\n`;
        if (m.ocrText) {
          block += `  → OCR Text Detected: "${m.ocrText}"\n`;
        }
        block += `  → Note: View this image directly using \`view_file\` to analyze what is shown.\n`;
      }
    }

    return block;
  }

  /**
   * Scans an AI response text for generated or referenced images/gifs to upload as Discord attachments.
   * @param {string} text - AI response text
   * @returns {Object} { cleanText, filesToAttach: Array<string> }
   */
  extractOutgoingMedia(text) {
    if (!text || typeof text !== "string") return { cleanText: text, filesToAttach: [] };

    const filesToAttach = [];
    const seen = new Set();

    // Pattern 1: Markdown image ![alt](path or file:///path)
    const mdRegex = /!\[.*?\]\((?:file:\/\/\/)?([a-zA-Z]:[^\)\s]+\.(?:png|jpg|jpeg|gif|webp|mp4))\)/gi;
    let match;
    while ((match = mdRegex.exec(text)) !== null) {
      const candidate = path.normalize(match[1]);
      if (fs.existsSync(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        filesToAttach.push(candidate);
      }
    }

    // Pattern 2: Standalone Windows absolute path ending in image extension
    const pathRegex = /(?:file:\/\/\/)?([a-zA-Z]:\\[^\s<>"'`]+\.(?:png|jpg|jpeg|gif|webp|mp4))/gi;
    while ((match = pathRegex.exec(text)) !== null) {
      const candidate = path.normalize(match[1]);
      if (fs.existsSync(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        filesToAttach.push(candidate);
      }
    }

    return {
      cleanText: text,
      filesToAttach
    };
  }
}

let instance = null;
export function getMediaPipeline(options = {}) {
  if (!instance) instance = new MediaPipeline(options);
  return instance;
}
