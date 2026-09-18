/**
 * ══════════════════════════════════════════════════════════════════════
 * 🏛️ HAVEN MEMORY BANK (HMB) - 64-BIT HIERARCHICAL MEMORY ENGINE
 * TypeScript / ES Module Port of haven-cpp / haven_memory.h & .cpp
 * ══════════════════════════════════════════════════════════════════════
 * Features:
 *  - 100% Binary compatibility with C++ 64-bit .hmb memory files
 *  - Hierarchical Memory Buffer (L0 Working, L1 Episodic, L2 Core Identity)
 *  - Fast Semantic Cosine Retrieval with Salience & Emotional Weighting
 *  - Zero external dependencies (Pure Node.js Buffer / DataView)
 */

import fs from "fs";
import path from "path";

export const HMB_MAGIC = "HAVENMEM";
export const HMB_VERSION = 0x00020000;
export const HEADER_SIZE = 136;
export const RECORD_SIZE = 84;
export const DEFAULT_EMBEDDING_DIM = 128;

// ─── 64-Bit FNV-1a Hash ─────────────────────────────────────────────────────
const FNV_OFFSET_64 = 14695981039346656037n;
const FNV_PRIME_64 = 1099511628211n;
const MASK_64 = 0xffffffffffffffffn;

export function fnv1aHash64(str) {
  let hash = FNV_OFFSET_64;
  const buf = Buffer.from(str, "utf-8");
  for (let i = 0; i < buf.length; i++) {
    hash ^= BigInt(buf[i]);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash;
}

// ─── Cosine Similarity & Vector Math ────────────────────────────────────────
export function cosineSimilarity(a, b) {
  const dim = Math.min(a.length, b.length);
  if (dim === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < dim; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA <= 1e-9 || normB <= 1e-9) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Deterministic Semantic Hash Vectorizer ─────────────────────────────────
export function createSemanticVector(text, dim = DEFAULT_EMBEDDING_DIM) {
  const vec = new Float32Array(dim);
  if (!text || text.trim().length === 0) return vec;

  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\W+/).filter(Boolean);

  // 1. Word and Character Trigram Hashing
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wHash = Number(fnv1aHash64(word) % BigInt(dim));
    const sign = (fnv1aHash64(word + ":sign") & 1n) === 0n ? 1 : -1;
    vec[wHash] += 1.5 * sign;

    for (let c = 0; c <= word.length - 3; c++) {
      const tri = word.slice(c, c + 3);
      const tHash = Number(fnv1aHash64(tri) % BigInt(dim));
      vec[tHash] += 0.8;
    }
  }

  // 2. Continuous Fourier/Frequency Projection (haven-cpp harmony)
  for (let i = 0; i < dim; i++) {
    const phase = Number(fnv1aHash64(normalized) % 1000n) * 0.001;
    vec[i] += Math.sin(i * 0.05 + phase) * 0.25;
  }

  // 3. L2 Normalization
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-9) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }

  return vec;
}

// ─── ⚡ HIERARCHICAL MEMORY BANK ENGINE ─────────────────────────────────────
export class HmbMemoryEngine {
  constructor(options = {}) {
    this.memories = [];
    this.workingMemoryBuffer = [];
    this.workingBufferSize = options.workingBufferSize || 8;
    this.embeddingDim = options.embeddingDim || DEFAULT_EMBEDDING_DIM;
    this.nextId = 1001n;
    this.vaultPath = options.vaultPath || "";
  }

  // ─── L0 Working Memory Ring Buffer ───────────────────────────────────────
  pushTurn(role, author, content) {
    this.workingMemoryBuffer.push({
      role,
      author,
      content,
      timestamp: Date.now()
    });
    if (this.workingMemoryBuffer.length > this.workingBufferSize) {
      this.workingMemoryBuffer.shift();
    }
  }

  getWorkingMemory() {
    return [...this.workingMemoryBuffer];
  }

  // ─── L1 / L2 Anchors Management ──────────────────────────────────────────
  addMemory(anchor) {
    const id = anchor.id !== undefined ? BigInt(anchor.id) : this.nextId++;
    if (id >= this.nextId) this.nextId = id + 1n;

    const fullAnchor = {
      id,
      concept_name: anchor.concept_name,
      text_content: anchor.text_content,
      category: anchor.category || "EPISODIC",
      weight: anchor.weight !== undefined ? anchor.weight : 1.0,
      emotional_salience: anchor.emotional_salience !== undefined ? anchor.emotional_salience : 0.95,
      timestamp: anchor.timestamp !== undefined ? BigInt(anchor.timestamp) : BigInt(Date.now() * 1000),
      access_count: anchor.access_count !== undefined ? BigInt(anchor.access_count) : 0n,
      embedding: anchor.embedding && anchor.embedding.length === this.embeddingDim
        ? anchor.embedding
        : createSemanticVector(anchor.concept_name + " " + anchor.text_content, this.embeddingDim)
    };

    this.memories.push(fullAnchor);
    return fullAnchor;
  }

  getAllMemories() {
    return this.memories;
  }

  getMemoryCount() {
    return this.memories.length;
  }

  clearMemories() {
    this.memories = [];
    this.nextId = 1001n;
  }

  // ─── Semantic Top-K Search (Cosine + Salience + Emotional Resonance) ─────
  searchTopK(query, k = 3, minSimilarity = 0.15) {
    if (this.memories.length === 0) return [];

    const queryVec = typeof query === "string"
      ? createSemanticVector(query, this.embeddingDim)
      : query;

    const scored = [];

    for (const mem of this.memories) {
      if (!mem.embedding || mem.embedding.length === 0) continue;

      const sim = cosineSimilarity(queryVec, mem.embedding);
      // Formula matching haven-cpp: sim * weight * (0.8 + 0.2 * emotional_salience)
      const score = sim * mem.weight * (0.8 + 0.2 * mem.emotional_salience);

      if (score >= minSimilarity) {
        scored.push({ anchor: mem, score, similarity: sim });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, k);
    for (const item of results) {
      item.anchor.access_count = BigInt(item.anchor.access_count) + 1n;
    }

    return results;
  }

  // ─── Format Context Injection for AG2 Prompt ──────────────────────────────
  buildContextInjection(userPrompt, topK = 3) {
    const recalled = this.searchTopK(userPrompt, topK);
    if (recalled.length === 0) return "";

    let text = "\n[Hierarchical Memory Buffer (HMB) Recall]:\n";
    for (const item of recalled) {
      const m = item.anchor;
      text += `• [${m.category}] ${m.concept_name}: ${m.text_content} (Salience: ${m.weight.toFixed(2)}, Match: ${item.score.toFixed(2)})\n`;
    }
    text += "[End Memory Context]\n\n";
    return text;
  }

  // ─── Core Identity Seeding ────────────────────────────────────────────────
  initializeCoreIdentity(botName = "Ash") {
    if (this.memories.length > 0) return;

    this.addMemory({
      concept_name: `${botName} Sovereign Identity`,
      text_content: `I am ${botName}, an intelligent, highly skilled AI companion directly integrated into Antigravity (AG2) and Discord.`,
      category: "CORE_IDENTITY",
      weight: 1.0,
      emotional_salience: 1.0
    });

    this.addMemory({
      concept_name: "Daniel & Shane Collaborative Architecture",
      text_content: "Daniel and Shane created this direct gateway to link Discord communities straight into sovereign AG2 sessions with HMB hierarchical memory buffering.",
      category: "CORE_IDENTITY",
      weight: 0.99,
      emotional_salience: 0.98
    });

    this.addMemory({
      concept_name: "Hierarchical Memory Bank Protocol",
      text_content: "Memories are preserved in 64-bit .hmb binary vaults, providing rapid cosine similarity search and zero context drift across sessions.",
      category: "SEMANTIC",
      weight: 0.92,
      emotional_salience: 0.90
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🏛️ 64-BIT BINARY .hmb SERIALIZATION & DESERIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  saveToHmb(filepath) {
    try {
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const total = this.memories.length;
      const dim = this.embeddingDim;
      const now = BigInt(Date.now() * 1000);

      // 1. Build String Table & Records
      let stringBlob = Buffer.alloc(0);
      const records = [];

      for (let i = 0; i < total; i++) {
        const m = this.memories[i];
        const conceptBuf = Buffer.from(m.concept_name, "utf-8");
        const contentBuf = Buffer.from(m.text_content, "utf-8");
        const categoryBuf = Buffer.from(m.category, "utf-8");

        const conceptOffset = BigInt(stringBlob.length);
        const conceptLen = conceptBuf.length;
        stringBlob = Buffer.concat([stringBlob, conceptBuf]);

        const contentOffset = BigInt(stringBlob.length);
        const contentLen = contentBuf.length;
        stringBlob = Buffer.concat([stringBlob, contentBuf]);

        const categoryOffset = BigInt(stringBlob.length);
        const categoryLen = categoryBuf.length;
        stringBlob = Buffer.concat([stringBlob, categoryBuf]);

        records.push({
          id: BigInt(m.id),
          domainHash: fnv1aHash64(m.category),
          weight: m.weight,
          emotionalSalience: m.emotional_salience,
          timestamp: BigInt(m.timestamp),
          accessCount: BigInt(m.access_count),
          conceptOffset,
          conceptLen,
          contentOffset,
          contentLen,
          categoryOffset,
          categoryLen,
          vectorIdx: BigInt(i)
        });
      }

      // 2. Offsets Calculation
      const vectorTableSize = total * dim * 4;
      const recordTableSize = total * RECORD_SIZE;
      const stringTableSize = stringBlob.length;

      const vectorTableOffset = BigInt(HEADER_SIZE);
      const recordTableOffset = vectorTableOffset + BigInt(vectorTableSize);
      const stringTableOffset = recordTableOffset + BigInt(recordTableSize);

      // 3. Construct Header Buffer (136 bytes)
      const headerBuf = Buffer.alloc(HEADER_SIZE);
      headerBuf.write(HMB_MAGIC, 0, 8, "ascii");
      headerBuf.writeUInt32LE(HMB_VERSION, 8);
      headerBuf.writeUInt32LE(dim, 12);
      headerBuf.writeBigUInt64LE(BigInt(total), 16);
      headerBuf.writeBigUInt64LE(vectorTableOffset, 24);
      headerBuf.writeBigUInt64LE(recordTableOffset, 32);
      headerBuf.writeBigUInt64LE(stringTableOffset, 40);
      headerBuf.writeBigUInt64LE(BigInt(stringTableSize), 48);
      headerBuf.writeBigUInt64LE(now, 56);
      headerBuf.writeBigUInt64LE(now, 64);

      // 4. Construct Vector Table Buffer
      const vectorBuf = Buffer.alloc(vectorTableSize);
      for (let i = 0; i < total; i++) {
        const emb = this.memories[i].embedding;
        const rowOffset = i * dim * 4;
        for (let d = 0; d < dim; d++) {
          vectorBuf.writeFloatLE(d < emb.length ? emb[d] : 0, rowOffset + d * 4);
        }
      }

      // 5. Construct Record Table Buffer
      const recordBuf = Buffer.alloc(recordTableSize);
      for (let i = 0; i < total; i++) {
        const r = records[i];
        const offset = i * RECORD_SIZE;
        recordBuf.writeBigUInt64LE(r.id, offset + 0);
        recordBuf.writeBigUInt64LE(r.domainHash, offset + 8);
        recordBuf.writeFloatLE(r.weight, offset + 16);
        recordBuf.writeFloatLE(r.emotionalSalience, offset + 20);
        recordBuf.writeBigInt64LE(r.timestamp, offset + 24);
        recordBuf.writeBigUInt64LE(r.accessCount, offset + 32);
        recordBuf.writeBigUInt64LE(r.conceptOffset, offset + 40);
        recordBuf.writeUInt32LE(r.conceptLen, offset + 48);
        recordBuf.writeBigUInt64LE(r.contentOffset, offset + 52);
        recordBuf.writeUInt32LE(r.contentLen, offset + 60);
        recordBuf.writeBigUInt64LE(r.categoryOffset, offset + 64);
        recordBuf.writeUInt32LE(r.categoryLen, offset + 72);
        recordBuf.writeBigUInt64LE(r.vectorIdx, offset + 76);
      }

      // 6. Concatenate & Write to Disk
      const finalFileBuffer = Buffer.concat([
        headerBuf,
        vectorBuf,
        recordBuf,
        stringBlob
      ]);

      fs.writeFileSync(filepath, finalFileBuffer);
      return true;
    } catch (err) {
      console.error(`[HMB Error] Failed to save .hmb file: ${err.message}`);
      return false;
    }
  }

  loadFromHmb(filepath) {
    try {
      if (!fs.existsSync(filepath)) return false;

      const fileBuf = fs.readFileSync(filepath);
      if (fileBuf.length < HEADER_SIZE) return false;

      // 1. Read Header
      const magic = fileBuf.toString("ascii", 0, 8);
      if (magic !== HMB_MAGIC) {
        console.error(`[HMB Error] Invalid magic header '${magic}' in ${filepath}`);
        return false;
      }

      const version = fileBuf.readUInt32LE(8);
      const dim = fileBuf.readUInt32LE(12);
      const total = Number(fileBuf.readBigUInt64LE(16));
      const vectorTableOffset = Number(fileBuf.readBigUInt64LE(24));
      const recordTableOffset = Number(fileBuf.readBigUInt64LE(32));
      const stringTableOffset = Number(fileBuf.readBigUInt64LE(40));
      const stringTableSize = Number(fileBuf.readBigUInt64LE(48));

      this.embeddingDim = dim;
      const newMemories = [];

      // 2. Read Strings
      const stringBlob = fileBuf.subarray(
        stringTableOffset,
        stringTableOffset + stringTableSize
      );

      // 3. Read Records & Vectors
      for (let i = 0; i < total; i++) {
        const rOffset = recordTableOffset + i * RECORD_SIZE;
        const id = fileBuf.readBigUInt64LE(rOffset + 0);
        const weight = fileBuf.readFloatLE(rOffset + 16);
        const emotionalSalience = fileBuf.readFloatLE(rOffset + 20);
        const timestamp = fileBuf.readBigInt64LE(rOffset + 24);
        const accessCount = fileBuf.readBigUInt64LE(rOffset + 32);

        const conceptOffset = Number(fileBuf.readBigUInt64LE(rOffset + 40));
        const conceptLen = fileBuf.readUInt32LE(rOffset + 48);
        const contentOffset = Number(fileBuf.readBigUInt64LE(rOffset + 52));
        const contentLen = fileBuf.readUInt32LE(rOffset + 60);
        const categoryOffset = Number(fileBuf.readBigUInt64LE(rOffset + 64));
        const categoryLen = fileBuf.readUInt32LE(rOffset + 72);
        const vectorIdx = Number(fileBuf.readBigUInt64LE(rOffset + 76));

        const conceptName = stringBlob.toString("utf-8", conceptOffset, conceptOffset + conceptLen);
        const textContent = stringBlob.toString("utf-8", contentOffset, contentOffset + contentLen);
        const category = stringBlob.toString("utf-8", categoryOffset, categoryOffset + categoryLen);

        // Read vector
        const emb = new Float32Array(dim);
        const vOffset = vectorTableOffset + vectorIdx * dim * 4;
        for (let d = 0; d < dim; d++) {
          emb[d] = fileBuf.readFloatLE(vOffset + d * 4);
        }

        if (id >= this.nextId) this.nextId = id + 1n;

        newMemories.push({
          id,
          concept_name: conceptName,
          text_content: textContent,
          category,
          weight,
          emotional_salience: emotionalSalience,
          timestamp,
          access_count: accessCount,
          embedding: emb
        });
      }

      this.memories = newMemories;
      return true;
    } catch (err) {
      console.error(`[HMB Error] Failed to load .hmb: ${err.message}`);
      return false;
    }
  }

  // ─── JSON Export / Import ────────────────────────────────────────────────
  saveToJson(filepath) {
    try {
      const data = {
        version: 2,
        engine: "hmb-javascript-64bit",
        total: this.memories.length,
        memories: this.memories.map(m => ({
          id: m.id.toString(),
          concept: m.concept_name,
          content: m.text_content,
          category: m.category,
          weight: m.weight,
          emotional_salience: m.emotional_salience,
          timestamp: m.timestamp.toString(),
          access_count: m.access_count.toString()
        }))
      };
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error(`[HMB Error] Failed to save JSON: ${err.message}`);
      return false;
    }
  }

  loadFromJson(filepath) {
    try {
      if (!fs.existsSync(filepath)) return false;
      const content = fs.readFileSync(filepath, "utf-8");
      const data = JSON.parse(content);
      if (!data.memories || !Array.isArray(data.memories)) return false;

      this.memories = [];
      for (const m of data.memories) {
        this.addMemory({
          id: BigInt(m.id || 0),
          concept_name: m.concept,
          text_content: m.content,
          category: m.category || "CORE_IDENTITY",
          weight: typeof m.weight === "number" ? m.weight : 1.0,
          emotional_salience: typeof m.emotional_salience === "number" ? m.emotional_salience : 0.95,
          timestamp: BigInt(m.timestamp || Date.now() * 1000),
          access_count: BigInt(m.access_count || 0)
        });
      }
      return true;
    } catch (err) {
      console.error(`[HMB Error] Failed to load JSON: ${err.message}`);
      return false;
    }
  }
}
