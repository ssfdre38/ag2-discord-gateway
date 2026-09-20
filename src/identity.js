import { config } from "./config.js";

/**
 * Resolves a verified, tamper-proof user identity context from Discord.
 *
 * Grounding Rules:
 * 1. The immutable source of truth is Discord's 64-bit Snowflake UUID (user.id).
 * 2. The global account handle (user.username) is unique and canonical.
 * 3. The server nickname / display name (member.displayName) is cosmetic and can be spoofed.
 *
 * @param {import("discord.js").User} user
 * @param {import("discord.js").GuildMember} [member]
 * @returns {AuthorContext}
 */
export function resolveAuthorContext(user, member = null) {
  const userId = user.id;
  const username = user.username || "unknown_user";
  const displayName = member?.displayName || user.displayName || username;

  // 1. Immutable Owner & Administrator verification
  const isOwner = config.adminUsers.length > 0 && config.adminUsers[0] === userId;
  const isAdmin = isOwner || (config.adminUsers.length === 0 ? true : config.adminUsers.includes(userId));

  // 2. Anti-Impersonation & Nickname Spoof Detection
  // Protected names that represent the bot creator, owner, or system admins
  const protectedNames = ["daniel", "ssfdre", "admin", "owner", "ash", "gaming2gamers"];
  const lowerDisplay = displayName.trim().toLowerCase();
  const lowerUser = username.trim().toLowerCase();

  // A user is impersonating if they are NOT an admin, but their display nickname mimics a protected admin/owner name
  const isImpersonating = !isAdmin && protectedNames.some((name) => {
    return (
      lowerDisplay === name ||
      lowerDisplay.startsWith(`${name} `) ||
      lowerDisplay.endsWith(` ${name}`) ||
      lowerDisplay.includes(`[${name}]`) ||
      lowerDisplay.includes(`(${name})`) ||
      (name === "daniel" && /\bdaniel\b/i.test(lowerDisplay)) ||
      (name === "ssfdre" && /\bssfdre\b/i.test(lowerDisplay))
    );
  });

  return {
    id: userId,
    username,
    displayName,
    isAdmin,
    isOwner,
    isImpersonating,
    canonicalTag: `@${username}`,
    fullTag: `@${username} (${userId})`,
    memoryAuthorTag: `@${username}#${userId}`,
    formattedName: isImpersonating
      ? `@${username} (⚠️ Spoofed Nickname: "${displayName}")`
      : `@${username}${displayName !== username ? ` ("${displayName}")` : ""}`
  };
}
