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
