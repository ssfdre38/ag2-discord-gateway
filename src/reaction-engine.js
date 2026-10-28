/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎭 AG2 DISCORD GATEWAY - REACTION ENGINE
 * Expressive reactions, custom server emoji actuation, and autonomous
 * sentiment analysis for Discord messages.
 * ══════════════════════════════════════════════════════════════════════
 */

export class ReactionEngine {
  constructor(client, options = {}) {
    this.client = client;
    this.enableAutonomousReactions = options.enableAutonomousReactions ?? true;
  }

  /**
   * Parse [REACT: <emoji>] tags from model response and return cleaned text + emoji array.
   * Supports Unicode (🔥, 💀) and custom Discord emojis (<:name:id> or :name:).
   * @param {string} text
   * @returns {{ cleanText: string, reactions: Array<string> }}
   */
  extractReactionTags(text) {
    if (!text || typeof text !== "string") {
      return { cleanText: text || "", reactions: [] };
    }

    const reactions = [];
    const reactTagRegex = /\[REACT:\s*([^\]]+)\]/gi;
    let match;

    while ((match = reactTagRegex.exec(text)) !== null) {
      const emojiCandidates = match[1]
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(Boolean);
      for (const e of emojiCandidates) {
        reactions.push(e);
      }
    }

    const cleanText = text
      .replace(reactTagRegex, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return { cleanText, reactions };
  }

  /**
   * React to a Discord message with a specific emoji (Unicode or guild custom).
   * @param {Object} message - Discord.js Message
   * @param {string} emoji - Unicode emoji or custom emoji string (:name:, <:name:id>)
   * @returns {Promise<boolean>}
   */
  async reactToMessage(message, emoji) {
    if (!message || !emoji) return false;

    try {
      // 1. Check if it's already a full Discord custom emoji mention: <:name:id> or <a:name:id>
      const customMatch = emoji.match(/<a?:([a-zA-Z0-9_]+):([0-9]+)>/);
      if (customMatch) {
        await message.react(customMatch[2]);
        return true;
      }

      // 2. Check if it's a shortname custom emoji like :g2g: or g2g
      const nameMatch = emoji.match(/^:?([a-zA-Z0-9_]+):?$/);
      if (nameMatch && message.guild?.emojis?.cache) {
        const emojiName = nameMatch[1].toLowerCase();
        let guildEmoji = null;

        if (typeof message.guild.emojis.cache.find === "function") {
          guildEmoji = message.guild.emojis.cache.find(
            e => e.name && e.name.toLowerCase() === emojiName
          );
        } else {
          for (const e of message.guild.emojis.cache.values()) {
            if (e.name && e.name.toLowerCase() === emojiName) {
              guildEmoji = e;
              break;
            }
          }
        }

        if (guildEmoji) {
          await message.react(guildEmoji.id);
          return true;
        }
      }

      // 3. Fallback to standard Unicode emoji
      await message.react(emoji);
      return true;
    } catch (err) {
      // Common error: reaction blocked or invalid emoji
      return false;
    }
  }

  /**
   * Autonomous sentiment analysis on text to pick an expressive reaction.
   * @param {string} text
   * @returns {string|null} Chosen emoji or null
   */
  determineSentimentEmoji(text) {
    if (!text || typeof text !== "string") return null;
    const lower = text.toLowerCase();

    // 1. Humor / Laughter
    if (/(lmao|lmfao|haha|hehe|lol|dead|hilarious|dying|skull|💀|😂|🤣)/i.test(lower)) {
      return "💀";
    }

    // 2. Excitement / Hype / Fire
    if (/(hype|fire|insane|awesome|epic|pog|poggers|sheesh|lets go|let's go|lit|🔥|🚀)/i.test(lower)) {
      return "🔥";
    }

    // 3. Love / Heart / Gratitude
    if (/(thank you|thanks|love you|appreciate it|grateful|wholesome|❤️|💖|<3)/i.test(lower)) {
      return "❤️";
    }

    // 4. Thinking / Curiosity / Inquiry
    if (/(hmm|curious|wondering|what if|how come|why does|interesting|🤔|💡)/i.test(lower)) {
      return "💡";
    }

    // 5. Code / Tech / Building
    if (/(build|compiler|git commit|deploy|architecture|kernel|binary|release|💻|⚡)/i.test(lower)) {
      return "⚡";
    }

    // 6. Agreement / Victory
    if (/(agreed|facts|based|true|exactly|w|win|gg|ez|💯|🏆)/i.test(lower)) {
      return "💯";
    }

    return null;
  }

  /**
   * Resolve in-text custom emoji shortcodes (:emoji_name:) into Discord formatted mentions
   * (<:name:id> or <a:name:id> for animated) using guild and client emoji caches.
   * If an emoji is not found in cache, the original shortcode is preserved as-is.
   * Already-formatted Discord mentions are left untouched.
   * 
   * @param {string} text - Message text containing potential :emoji_name: codes
   * @param {Object} [guild] - Discord.js Guild object
   * @returns {string} Text with custom emojis resolved to Discord mentions
   */
  resolveCustomEmojis(text, guild = null) {
    if (!text || typeof text !== "string") return text || "";

    // Build emoji lookup map from guild and client caches
    const emojiMap = new Map(); // lowercase name -> emoji object

    const indexEmojis = (cache) => {
      if (!cache) return;
      const values = typeof cache.values === "function" ? cache.values() : Object.values(cache);
      for (const e of values) {
        if (e && e.name && e.id) {
          const lowerName = e.name.toLowerCase();
          if (!emojiMap.has(lowerName)) {
            emojiMap.set(lowerName, e);
          }
        }
      }
    };

    if (this.client?.emojis?.cache) indexEmojis(this.client.emojis.cache);
    if (guild?.emojis?.cache) indexEmojis(guild.emojis.cache);

    if (emojiMap.size === 0) return text;

    // Matches raw shortcodes :name: not preceded by < or <a: and not followed by digits and >
    const rawEmojiRegex = /(?<!<a?):([a-zA-Z0-9_]{2,32}):(?!\d+>)/g;

    return text.replace(rawEmojiRegex, (fullMatch, emojiName) => {
      const matched = emojiMap.get(emojiName.toLowerCase());
      if (matched) {
        const prefix = matched.animated ? "a" : "";
        return `<${prefix}:${matched.name}:${matched.id}>`;
      }
      return fullMatch;
    });
  }

  /**
   * Parse [STICKER: <name_or_id>] tags from text, resolving them against the guild/client sticker cache.
   * Enforces Discord's maximum limit of 3 stickers per message.
   * 
   * @param {string} text
   * @param {Object} [guild] - Discord.js Guild object
   * @returns {{ cleanText: string, stickerIds: string[], stickers: Object[] }}
   */
  extractStickers(text, guild = null) {
    if (!text || typeof text !== "string") {
      return { cleanText: text || "", stickerIds: [], stickers: [] };
    }

    const stickerMap = new Map(); // id or lowercase name -> sticker object

    const indexStickers = (cache) => {
      if (!cache) return;
      const values = typeof cache.values === "function" ? cache.values() : Object.values(cache);
      for (const s of values) {
        if (s && s.id) {
          stickerMap.set(s.id, s);
          if (s.name) {
            stickerMap.set(s.name.toLowerCase(), s);
          }
        }
      }
    };

    if (this.client?.stickers?.cache) indexStickers(this.client.stickers.cache);
    if (guild?.stickers?.cache) indexStickers(guild.stickers.cache);

    const stickerRegex = /\[(?:STICKER|DISCORD_STICKER):\s*([^\]]+)\]/gi;
    const stickerIds = [];
    const stickers = [];
    const seen = new Set();

    let match;
    while ((match = stickerRegex.exec(text)) !== null) {
      const query = match[1].trim();
      const lowerQuery = query.toLowerCase();

      let targetSticker = stickerMap.get(query) || stickerMap.get(lowerQuery);

      // If snowflake ID directly
      if (!targetSticker && /^\d{17,20}$/.test(query)) {
        targetSticker = { id: query, name: query };
      }

      if (targetSticker && !seen.has(targetSticker.id)) {
        seen.add(targetSticker.id);
        stickerIds.push(targetSticker.id);
        stickers.push(targetSticker);
      }
    }

    const cleanText = text
      .replace(stickerRegex, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return {
      cleanText,
      stickerIds: stickerIds.slice(0, 3), // Discord max 3 stickers
      stickers: stickers.slice(0, 3)
    };
  }

  /**
   * Introspect and list all custom emojis available in a guild.
   * @param {Object} guild - Discord.js Guild
   * @returns {Array<{ id: string, name: string, animated: boolean, formatted: string }>}
   */
  getGuildEmojiList(guild) {
    if (!guild?.emojis?.cache) return [];
    const emojis = [];
    const values = typeof guild.emojis.cache.values === "function"
      ? guild.emojis.cache.values()
      : Object.values(guild.emojis.cache);

    for (const e of values) {
      if (e?.name && e?.id) {
        emojis.push({
          id: e.id,
          name: e.name,
          animated: Boolean(e.animated),
          formatted: `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`
        });
      }
    }
    return emojis;
  }

  /**
   * Introspect and list all custom stickers available in a guild.
   * @param {Object} guild - Discord.js Guild
   * @returns {Array<{ id: string, name: string, description: string }>}
   */
  getGuildStickerList(guild) {
    if (!guild?.stickers?.cache) return [];
    const stickers = [];
    const values = typeof guild.stickers.cache.values === "function"
      ? guild.stickers.cache.values()
      : Object.values(guild.stickers.cache);

    for (const s of values) {
      if (s?.id && s?.name) {
        stickers.push({
          id: s.id,
          name: s.name,
          description: s.description || ""
        });
      }
    }
    return stickers;
  }

  /**
   * Autonomous reaction wrapper that checks sentiment and reacts.
   * @param {Object} message
   * @param {string} text
   */
  async autoReact(message, text) {
    if (!this.enableAutonomousReactions) return false;
    const emoji = this.determineSentimentEmoji(text);
    if (emoji) {
      return await this.reactToMessage(message, emoji);
    }
    return false;
  }
}

let instance = null;
export function getReactionEngine(client, options = {}) {
  if (!instance && client) {
    instance = new ReactionEngine(client, options);
  }
  return instance;
}
