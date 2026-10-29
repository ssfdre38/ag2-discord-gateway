/**
 * ══════════════════════════════════════════════════════════════════════
 * 🧩 AG2 DISCORD GATEWAY - SMART TEXT CHUNKER
 * Splits text into Discord-safe messages (< maxLength chars) respecting
 * paragraphs, newlines, sentence ends, and balanced markdown code fences.
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * Splits a long text string into clean Discord-friendly chunks.
 * Prevents mid-word and mid-markdown splitting.
 *
 * @param {string} text - Raw message text
 * @param {number} maxLength - Maximum characters per chunk (default 1950)
 * @returns {Array<string>} Array of message chunks
 */
export function splitDiscordMessage(text, maxLength = 1950) {
  if (!text || typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLength) return [trimmed];

  const chunks = [];
  let remaining = trimmed;
  let openCodeFenceLang = null;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      if (openCodeFenceLang) {
        remaining = `\`\`\`${openCodeFenceLang}\n${remaining}`;
        openCodeFenceLang = null;
      }
      chunks.push(remaining);
      break;
    }

    const candidate = remaining.slice(0, maxLength);
    let splitIndex = -1;

    // 1. Try paragraph break (\n\n) - prefer splitting near the end of the chunk budget
    const lastParagraph = candidate.lastIndexOf("\n\n");
    if (lastParagraph > maxLength * 0.60) {
      splitIndex = lastParagraph;
    } else {
      // 2. Try single newline (\n)
      const lastNewline = candidate.lastIndexOf("\n");
      if (lastNewline > maxLength * 0.65) {
        splitIndex = lastNewline;
      } else {
        // 3. Try sentence boundary (. , ! , ? followed by space or newline)
        let lastSentenceEnd = -1;
        const sentenceRegex = /[.!?](\s+|$)/g;
        let match;
        while ((match = sentenceRegex.exec(candidate)) !== null) {
          if (match.index > maxLength * 0.55) {
            lastSentenceEnd = match.index + 1; // include the punctuation
          }
        }
        if (lastSentenceEnd > -1) {
          splitIndex = lastSentenceEnd;
        } else {
          // 4. Try word boundary (space)
          const lastSpace = candidate.lastIndexOf(" ");
          if (lastSpace > maxLength * 0.50) {
            splitIndex = lastSpace;
          } else {
            // Hard cut if no whitespace in range
            splitIndex = maxLength;
          }
        }
      }
    }

    let currentChunk = remaining.slice(0, splitIndex).trimEnd();
    remaining = remaining.slice(splitIndex).trimStart();

    // Preserve and balance markdown code fences across chunks
    if (openCodeFenceLang) {
      currentChunk = `\`\`\`${openCodeFenceLang}\n${currentChunk}`;
      openCodeFenceLang = null;
    }

    // Check if code fence is unclosed in currentChunk
    const fenceMatches = currentChunk.match(/```/g) || [];
    if (fenceMatches.length % 2 !== 0) {
      // Find language of unclosed fence
      const lastFenceIdx = currentChunk.lastIndexOf("```");
      const afterFence = currentChunk.slice(lastFenceIdx + 3);
      const langMatch = afterFence.match(/^([a-zA-Z0-9_-]+)/);
      openCodeFenceLang = langMatch ? langMatch[1] : "";
      currentChunk = `${currentChunk}\n\`\`\``;
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk);
    }
  }

  return chunks;
}

/**
 * Splits text into natural sentence-level utterances for pipelined TTS playback.
 * Sentences under minChars are merged with adjacent text to avoid choppy micro-clips.
 * 
 * @param {string} text - Clean speech text
 * @param {number} [maxCharsPerChunk=140] - Target max chunk length
 * @param {number} [minCharsPerChunk=25] - Minimum chunk length before merging
 * @returns {Array<string>} Array of sentence chunks ready for queued TTS
 */
export function splitSentencesForSpeech(text, maxCharsPerChunk = 140, minCharsPerChunk = 25) {
  if (!text || typeof text !== "string") return [];
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxCharsPerChunk) return [clean];

  const rawSentences = clean.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buffer = "";

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;

    if (!buffer) {
      buffer = trimmed;
    } else if ((buffer.length + 1 + trimmed.length) <= maxCharsPerChunk) {
      buffer += " " + trimmed;
    } else {
      if (buffer.length >= minCharsPerChunk) {
        chunks.push(buffer);
        buffer = trimmed;
      } else {
        buffer += " " + trimmed;
      }
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks.length > 0 ? chunks : [clean];
}

