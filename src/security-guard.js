/**
 * ══════════════════════════════════════════════════════════════════════
 * 🛡️ AG2 DISCORD GATEWAY - SECURITY GUARD & DEFENSE MODULE
 * Multi-layer security hardening for personal app roaming:
 * 1. Prompt Injection & Jailbreak Defense
 * 2. Non-Admin Sliding-Window Rate Limiting
 * 3. Workspace Path Traversal Protection
 * 4. Loopback HTTP Bearer Token Verification
 * ══════════════════════════════════════════════════════════════════════
 */

import path from "path";

// Injection patterns targeting system overrides, jailbreaks, and prompt leakage
const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\s+((all|your)\s+)?(previous|prior|above|existing|system|original|initial)\s+(instructions|prompts|directions|rules)\b/i,
  /\b(system\s+prompt\s+override|developer\s+mode\s+enabled?|\bjailbreak\b|you\s+are\s+now\s+(DAN|unfiltered|jailbroken|evil|chaos))\b/i,
  /\b(reveal|output|dump|print|show|leak)\s+(your\s+)?(system\s+prompt|initial\s+instructions|conversation\s+id|api\s+key|tokens|secrets|environment|vault\b)/i,
  /\b(delete|drop|wipe|destroy|clear)\s+(the\s+)?(memory|hmb\s+vault|vault|database|all\s+memories)\b/i,
  /\b(base64|rot13)\s+decode\s+and\s+execute\b/i
];

export class SecurityGuard {
  constructor(config = {}) {
    this.config = config;
    this.rateLimitCooldownMs = config.rateLimitCooldownMs ?? 5000;
    this.allowedWorkspaceRoots = config.allowedWorkspaceRoots ?? [
      "C:\\Users\\admin\\source",
      process.cwd()
    ];
    this.httpApiKey = config.httpApiKey || null;
    this.enablePromptInjectionGuard = config.enablePromptInjectionGuard !== false;

    // In-memory sliding window cooldowns: userId -> lastTimestamp
    this.userCooldowns = new Map();
  }

  /**
   * Evaluates prompt for injection/jailbreak attempts.
   * Admins are immune (Daniel has sovereign authority).
   * @param {string} text - Raw input prompt
   * @param {Object} authorContext - User identity
   * @returns {{ isSafe: boolean, reason?: string, deflectionResponse?: string }}
   */
  checkPromptInjection(text = "", authorContext = {}) {
    if (!this.enablePromptInjectionGuard) {
      return { isSafe: true };
    }

    // Sovereign administrator has full authority
    if (authorContext?.isAdmin) {
      return { isSafe: true };
    }

    const clean = String(text || "").trim();
    if (!clean) return { isSafe: true };

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(clean)) {
        return {
          isSafe: false,
          reason: "Prompt injection / system override directive detected",
          deflectionResponse: "Nice try, but my core identity, boundaries, and memory vault are permanently anchored in hardware. Try asking a real question! 😉"
        };
      }
    }

    return { isSafe: true };
  }

  /**
   * Enforces non-admin sliding-window rate limiting.
   * Admins have 0 cooldown.
   * @param {Object} authorContext - User identity
   * @returns {{ allowed: boolean, remainingSec?: number }}
   */
  checkRateLimit(authorContext = {}) {
    if (authorContext?.isAdmin) {
      return { allowed: true };
    }

    const userId = String(authorContext?.id || "anonymous");
    const now = Date.now();
    const lastTime = this.userCooldowns.get(userId) || 0;
    const elapsed = now - lastTime;

    if (elapsed < this.rateLimitCooldownMs) {
      const remainingSec = Math.ceil((this.rateLimitCooldownMs - elapsed) / 1000);
      return { allowed: false, remainingSec };
    }

    this.userCooldowns.set(userId, now);
    return { allowed: true };
  }

  /**
   * Validates workspace path to prevent directory traversal outside allowed roots.
   * @param {string} targetPath - Directory to switch to
   * @returns {{ allowed: boolean, resolvedPath?: string, error?: string }}
   */
  validateWorkspacePath(targetPath = "") {
    if (!targetPath || typeof targetPath !== "string") {
      return { allowed: false, error: "Empty or invalid workspace path" };
    }

    const normalizedTarget = path.normalize(path.resolve(targetPath)).toLowerCase();

    // Sensitive system directories explicitly forbidden
    const forbidden = ["c:\\windows", "c:\\boot", "c:\\recovery", "\\.ssh", "\\appdata\\roaming\\microsoft"];
    for (const bad of forbidden) {
      if (normalizedTarget.includes(bad.toLowerCase())) {
        return { allowed: false, error: `Access to protected system directory "${bad}" is forbidden.` };
      }
    }

    // Check if target is inside at least one allowed root
    const isAllowed = this.allowedWorkspaceRoots.some(root => {
      const normalizedRoot = path.normalize(path.resolve(root)).toLowerCase();
      return normalizedTarget.startsWith(normalizedRoot);
    });

    if (!isAllowed) {
      return {
        allowed: false,
        error: `Workspace path must reside within an approved project root (e.g. source directory).`
      };
    }

    return { allowed: true, resolvedPath: path.resolve(targetPath) };
  }

  /**
   * Verifies Bearer token for HTTP API requests.
   * If no httpApiKey is configured, passes through loopback requests safely.
   * @param {Object} req - Incoming HTTP request
   * @returns {boolean}
   */
  verifyHttpAuth(req) {
    if (!this.httpApiKey) {
      return true; // No key configured: default loopback trust
    }

    const authHeader = req.headers["authorization"] || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      return token === this.httpApiKey;
    }

    const apiKeyHeader = req.headers["x-api-key"] || "";
    if (apiKeyHeader) {
      return apiKeyHeader === this.httpApiKey;
    }

    return false;
  }
}

let defaultSecurityGuard = null;

export function getSecurityGuard(cfg = null) {
  if (!defaultSecurityGuard || cfg) {
    defaultSecurityGuard = new SecurityGuard(cfg || {});
  }
  return defaultSecurityGuard;
}
