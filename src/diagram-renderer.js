/**
 * ══════════════════════════════════════════════════════════════════════
 * 📊 AG2 DISCORD GATEWAY - MERMAID DIAGRAM RENDERER
 * Automatically detects Mermaid architectural diagrams in AI responses,
 * renders them to high-resolution PNGs styled for Discord dark mode,
 * and attaches them as images directly into chat.
 * ══════════════════════════════════════════════════════════════════════
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

export class DiagramRenderer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.resolve(process.cwd(), "data", "artifacts", "diagrams");
    this.timeoutMs = options.timeoutMs || 8000;
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Renders a Mermaid diagram string to a PNG file.
   * @param {string} mermaidCode - Raw Mermaid definition (e.g. "graph TD\n A-->B")
   * @param {string} [customFilename] - Optional filename
   * @returns {Promise<string|null>} Path to saved PNG or null if failed
   */
  async renderToPng(mermaidCode, customFilename = null) {
    if (!mermaidCode || !mermaidCode.trim()) return null;

    const trimmed = mermaidCode.trim();
    const hash = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
    const filename = customFilename || `diagram_${hash}.png`;
    const outputPath = path.join(this.cacheDir, filename);

    // Return cached image if already rendered
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }

    try {
      const b64 = Buffer.from(trimmed).toString("base64");
      // Use Discord dark background #2B2D31
      const url = `https://mermaid.ink/img/${b64}?type=png&bgColor=!2B2D31`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[DiagramRenderer] Mermaid.ink returned HTTP ${res.status}`);
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) return null;

      fs.writeFileSync(outputPath, buffer);
      return outputPath;
    } catch (err) {
      console.warn(`[DiagramRenderer] Failed to render Mermaid diagram: ${err.message}`);
      return null;
    }
  }

  /**
   * Scans text for ```mermaid ... ``` code blocks, renders each to PNG,
   * and replaces the raw block with an inline descriptive badge.
   * 
   * @param {string} text - Message text containing potential mermaid blocks
   * @returns {Promise<{ cleanText: string, diagramFiles: string[] }>}
   */
  async processMermaidDiagrams(text) {
    if (!text || typeof text !== "string") {
      return { cleanText: text || "", diagramFiles: [] };
    }

    const mermaidRegex = /```(?:mermaid|graph|diagram)\s*\n([\s\S]*?)```/gi;
    const diagramFiles = [];
    let match;
    const matches = [];

    while ((match = mermaidRegex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        code: match[1],
        index: match.index
      });
    }

    if (matches.length === 0) {
      return { cleanText: text, diagramFiles: [] };
    }

    let modifiedText = text;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const pngPath = await this.renderToPng(m.code, `diagram_${Date.now()}_${i + 1}.png`);
      if (pngPath && fs.existsSync(pngPath)) {
        diagramFiles.push(pngPath);
        const replacement = `📊 **Rendered Architecture Diagram** *(See attached diagram #${i + 1})*`;
        modifiedText = modifiedText.replace(m.fullMatch, replacement);
      }
    }

    return {
      cleanText: modifiedText,
      diagramFiles
    };
  }
}

let instance = null;
export function getDiagramRenderer(options = {}) {
  if (!instance) instance = new DiagramRenderer(options);
  return instance;
}
