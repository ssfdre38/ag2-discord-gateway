/**
 * ══════════════════════════════════════════════════════════════════════
 * 🗣️ AG2 DISCORD GATEWAY - SPEECH SANITIZER & FORMATTER
 * Cleans text for text-to-speech (TTS) synthesis by removing markdown,
 * URLs, code blocks, Discord mentions, and internal tags, ensuring natural,
 * human-like speech output through speech_helper.exe.
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * Strips code blocks, URLs, markdown, mentions, emojis, and internal gateway tags,
 * producing clean prose suitable for voice synthesis.
 * 
 * @param {string} text - Raw input text from chat or model response
 * @param {number} [maxChars=250] - Maximum characters before clean word truncation
 * @returns {string} Sanitized string ready for TTS
 */
export function cleanTextForSpeech(text, maxChars = 250) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text
    // 1. Remove Discord custom emojis: <:name:id> or <a:name:id>
    .replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, "")
    // 2. Remove Discord mentions: <@123>, <@!123>, <#123>, <@&123>
    .replace(/<[@#][!&]?[0-9]+>/g, "")
    // 3. Remove URLs
    .replace(/https?:\/\/\S+/gi, "")
    // 4. Remove code blocks (replace with friendly speech placeholder)
    .replace(/```[\s\S]*?```/g, " code block ")
    // 5. Remove inline code ticks
    .replace(/`([^`]+)`/g, "$1")
    // 6. Remove internal tags like [ATTACH: ...], [ARTIFACT: ...], [REMEMBER: ...], [MEMORY: ...], [REACT: ...], [AUDIO: ...], [STATUS: ...]
    .replace(/\[(?:ATTACH|ATTACHMENT|ARTIFACT|REMEMBER|MEMORY|REACT|AUDIO|MUSIC|SFX|HEARTBEAT|SOUND|IMAGE_SD|STATUS|ACTIVITY):[^\]]*\]/gi, "")
    // 6b. Remove standalone silence and directive tokens
    .replace(/\[(?:SILENT|NO_REPLY|PASS|SHH|IGNORE)\]/gi, "")
    // 7. Remove markdown headers (#, ##, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // 8. Remove markdown formatting characters (*, _, ~, >, #)
    .replace(/[*_~>#]/g, " ")
    // 9. Normalize multiple spaces, tabs, and newlines into single spaces
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  // Truncate at word boundary if exceeding maxChars
  if (cleaned.length > maxChars) {
    const slice = cleaned.slice(0, maxChars);
    const lastSpace = slice.lastIndexOf(" ");
    cleaned = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + "...";
  }

  return cleaned;
}

/**
 * Formats an incoming Discord message into a natural spoken announcement snippet.
 * E.g., "Daniel says: Are you ready for the game?"
 * 
 * @param {string} authorName - Display name of the message author
 * @param {string} messageText - Message body
 * @param {number} [maxChars=200] - Character cap for speech
 * @returns {string} Formatted speech snippet or empty string if no spoken content
 */
export function formatSpeakerSnippet(authorName, messageText, maxChars = 200) {
  const cleanBody = cleanTextForSpeech(messageText, maxChars);
  if (!cleanBody) return "";

  const name = (authorName || "Someone").replace(/[^\w\s-]/g, "").trim() || "Someone";
  return `${name} says: ${cleanBody}`;
}
