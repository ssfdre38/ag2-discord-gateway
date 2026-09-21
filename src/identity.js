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

  // 1. Immutable Owner & Administrator verification (strictly bound to Discord Snowflake ID)
  const adminList = (config.adminUsers || []).map(u => String(u).trim()).filter(Boolean);
  const isOwner = Boolean(adminList.length > 0 && adminList[0] === String(userId));
  const isAdmin = Boolean(adminList.length > 0 && adminList.includes(String(userId)));

  // 2. Anti-Impersonation & Nickname Spoof Detection
  // Protected names representing bot owner, creator, or system administrators
  const protectedNames = ["daniel", "ssfdre", "admin", "owner", "ash", "gaming2gamers"];
  const lowerDisplay = displayName.trim().toLowerCase();
  const lowerUser = username.trim().toLowerCase();

  // A user is impersonating if their Discord ID is NOT in adminUsers, but their server display name or nickname mimics a protected admin name
  const isImpersonating = !isAdmin && protectedNames.some((name) => {
    return (
      lowerDisplay === name ||
      lowerDisplay.startsWith(`${name} `) ||
      lowerDisplay.startsWith(`${name}[`) ||
      lowerDisplay.startsWith(`${name}(`) ||
      lowerDisplay.endsWith(` ${name}`) ||
      lowerDisplay.includes(`[${name}]`) ||
      lowerDisplay.includes(`(${name})`) ||
      (name === "daniel" && /\bdaniel\b/i.test(lowerDisplay)) ||
      (name === "ssfdre" && /\bssfdre\b/i.test(lowerDisplay))
    );
  });

  // 3. Known Project Collaborators (Explicitly granted by Daniel)
  // Chris (@driver_2_gamer / 1227226205544255498) is authorized to collaborate on BarrerAvatarStudio
  const isCollaborator = String(userId) === "1227226205544255498";
  const collaboratorProjects = isCollaborator ? ["BarrerAvatarStudio"] : [];

  return {
    id: userId,
    username,
    displayName,
    isAdmin,
    isOwner,
    isImpersonating,
    isCollaborator,
    collaboratorProjects,
    canonicalTag: `@${username}`,
    fullTag: `@${username} (${userId})`,
    memoryAuthorTag: `@${username}#${userId}`,
    formattedName: isImpersonating
      ? `@${username} (⚠️ Spoofed Nickname: "${displayName}")`
      : `@${username}${displayName !== username ? ` ("${displayName}")` : ""}`
  };
}
