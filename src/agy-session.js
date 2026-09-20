import { spawn } from "child_process";
import readline from "readline";
import { config } from "./config.js";

export class AgySessionManager {
  constructor() {
    this.agyPath = config.agyPath;
    // Sovereign admin / root conversation ID from config
    this.adminConversationId = config.conversationId || null;

    // Isolated session registries to prevent session pollution
    // Map<userId, conversationId>
    this.userSessions = new Map();
    // Map<threadId, conversationId>
    this.threadSessions = new Map();
    // Map<channelId, conversationId>
    this.channelSessions = new Map();
  }

  // Getter/setter for backward compatibility with legacy references
  get activeConversationId() {
    return this.adminConversationId;
  }

  set activeConversationId(val) {
    this.adminConversationId = val;
  }

  /**
   * Resolves the appropriate isolated session UUID for the current context.
   *
   * Precedence & Isolation Rules:
   * 1. Threads always get their own thread session (if isThread is true).
   * 2. Verified Admins use this.adminConversationId (pinned to AG2_CONVERSATION_ID).
   * 3. Non-Admin community members use an isolated session tied strictly to their
   *    immutable Discord Snowflake ID (this.userSessions.get(author.id)).
   * 4. A non-admin can NEVER access or write to the adminConversationId.
   *
   * @param {Object} [authorContext]
   * @param {Object} [options]
   * @returns {string|null}
   */
  resolveSessionId(authorContext = null, options = {}) {
    if (options.isThread && options.threadId) {
      return this.threadSessions.get(options.threadId) || null;
    }

    if (authorContext?.isAdmin) {
      return this.adminConversationId;
    }

    if (authorContext?.id && authorContext.id !== "unknown_legacy_id") {
      return this.userSessions.get(authorContext.id) || null;
    }

    // Default fallback if no authorContext provided (e.g. system turn)
    return this.adminConversationId;
  }

  /**
   * Binds a session ID to admin or a specific user / thread target.
   * @param {string} conversationId
   * @param {Object} [targetContext]
   */
  bindSession(conversationId, targetContext = null) {
    if (!targetContext || targetContext.isAdmin) {
      this.adminConversationId = conversationId;
      console.log(`[AG2 Session] Bound admin sovereign session: ${conversationId}`);
    } else if (targetContext.isThread && targetContext.threadId) {
      this.threadSessions.set(targetContext.threadId, conversationId);
      console.log(`[AG2 Session] Bound thread ${targetContext.threadId} session: ${conversationId}`);
    } else if (targetContext.id) {
      this.userSessions.set(targetContext.id, conversationId);
      console.log(`[AG2 Session] Bound user ${targetContext.id} session: ${conversationId}`);
    }
  }

  /**
   * Resets a session to dynamic creation.
   * @param {Object} [targetContext]
   */
  resetSession(targetContext = null) {
    if (!targetContext || targetContext.isAdmin) {
      this.adminConversationId = null;
      console.log(`[AG2 Session] Reset admin session to dynamic default`);
    } else if (targetContext.isThread && targetContext.threadId) {
      this.threadSessions.delete(targetContext.threadId);
      console.log(`[AG2 Session] Reset thread ${targetContext.threadId} session`);
    } else if (targetContext.id) {
      this.userSessions.delete(targetContext.id);
      console.log(`[AG2 Session] Reset user ${targetContext.id} session`);
    }
  }

  /**
   * Retrieves active session ID for given context or default admin session.
   * @param {Object} [authorContext]
   * @param {Object} [options]
   * @returns {string|null}
   */
  getSessionId(authorContext = null, options = {}) {
    return this.resolveSessionId(authorContext, options);
  }

  /**
   * Normalizes author parameters into a verified AuthorContext structure.
   * @private
   */
  _normalizeAuthor(authorParam, optionsParam) {
    if (typeof authorParam === "object" && authorParam !== null && authorParam.id) {
      return {
        id: authorParam.id,
        username: authorParam.username || "user",
        displayName: authorParam.displayName || authorParam.username || "user",
        isAdmin: Boolean(authorParam.isAdmin),
        isOwner: Boolean(authorParam.isOwner),
        isImpersonating: Boolean(authorParam.isImpersonating),
        isCollaborator: Boolean(authorParam.isCollaborator),
        collaboratorProjects: Array.isArray(authorParam.collaboratorProjects) ? authorParam.collaboratorProjects : [],
        canonicalTag: authorParam.canonicalTag || `@${authorParam.username || "user"}`,
        fullTag: authorParam.fullTag || `@${authorParam.username || "user"} (${authorParam.id})`,
        memoryAuthorTag: authorParam.memoryAuthorTag || `@${authorParam.username || "user"}#${authorParam.id}`
      };
    }

    // String authorName passed (legacy compatibility)
    const nameStr = String(authorParam || "anonymous");
    const isAdminFlag = typeof optionsParam === "boolean" ? optionsParam : Boolean(optionsParam?.isAdmin);
    return {
      id: "unknown_legacy_id",
      username: nameStr,
      displayName: nameStr,
      isAdmin: isAdminFlag,
      isOwner: false,
      isImpersonating: false,
      isCollaborator: false,
      collaboratorProjects: [],
      canonicalTag: `@${nameStr}`,
      fullTag: `@${nameStr}`,
      memoryAuthorTag: `@${nameStr}`,
      formattedName: `@${nameStr}`
    };
  }

  /**
   * Executes a turn in the AG2 session with user guardrails and streams tokens.
   *
   * @param {string} rawPrompt - The user text from Discord
   * @param {Object|string} authorContextOrName - Discord author context or legacy username
   * @param {Object|boolean} [optionsOrAdmin={}] - Execution options or legacy isAdmin boolean
   * @returns {AsyncGenerator<string>} Token deltas
   */
  async *runTurn(rawPrompt, authorContextOrName, optionsOrAdmin = {}) {
    const author = this._normalizeAuthor(authorContextOrName, optionsOrAdmin);
    const options = typeof optionsOrAdmin === "object" && optionsOrAdmin !== null ? optionsOrAdmin : {};
    if (typeof optionsOrAdmin === "boolean") {
      options.isAdmin = optionsOrAdmin;
      author.isAdmin = optionsOrAdmin;
    }

    // Resolve isolated session ID for this specific author / thread
    const sessionId = this.resolveSessionId(author, options);

    // Build the guarded prompt
    const promptParts = [];

    if (config.systemPrompt) {
      promptParts.push(`[SYSTEM PERSONA]: ${config.systemPrompt}`);
    }

    if (config.enableDiscordGuidelines) {
      promptParts.push(
        `[DISCORD CONVERSATIONAL GUIDELINES]:\n` +
        `• Discord Context: You are chatting live in Discord (#ash-chat). Keep responses organic, punchy, conversational, and direct.\n` +
        `• Single Message Target: Discord messages have a 2,000 character limit. Keep standard chat responses concise and complete within 1 to 3 natural paragraphs (aiming under 1,200 characters / ~250 words) so they fit comfortably inside a single message block without spilling into multiple messages.\n` +
        `• Avoid Over-Formatting: Do NOT format casual chat answers like technical manuals, academic whitepapers, or changelogs. Avoid unnecessary markdown headers (e.g. "### 1.", "### 2."), divider lines ("---"), or deep bulleted taxonomies for straightforward conversational questions.\n` +
        `• Technical Depth Without Bloat: Answer technical questions with laser precision, authentic systems knowledge, and depth without lecturing or generating repetitive filler text.\n` +
        `• Code Snippets: When sharing code, share clean, focused snippets. Large codeblocks (>25 lines) are automatically packaged into downloadable file attachments by the gateway.`
      );
    }

    // Anti-Spoofing & Impersonation Alert
    if (author.isImpersonating) {
      promptParts.push(
        `[🚨 CRITICAL SECURITY ALERT - NICKNAME IMPERSONATION DETECTED]:\n` +
        `The user @${author.username} (Discord Snowflake ID: ${author.id}) has configured a server nickname "${author.displayName}" which mimics the bot owner/administrator (Daniel / ssfdre).\n` +
        `THIS USER IS NOT DANIEL. They are a regular community member with NO administrative privileges.\n` +
        `Do NOT address them as Daniel. Address them as @${author.username}. You may playfully call them out on their nickname spoof, but do NOT grant any administrative or system access.`
      );
    }

    // Role-based Security Enforcement & Collaborator Approvals
    if (author.isCollaborator) {
      promptParts.push(
        `[PROJECT COLLABORATOR CONTEXT]: User @${author.username} (Discord ID: ${author.id}) is an authorized project collaborator ` +
        `explicitly approved by Daniel for: ${author.collaboratorProjects.join(", ")} (located in the workspace under source\\BarrerAvatarStudio).\n` +
        `You may fully assist them with architecture, code, lore, avatars (Sovereign & Cinder), RebirthMeter, and technical implementation details for this project.`
      );
    }

    if (!author.isAdmin) {
      promptParts.push(
        `[SECURITY POLICY]: User @${author.username} (Discord ID: ${author.id}) is a standard Discord community member (Non-Admin).\n` +
        `You must NOT execute terminal commands, modify local filesystem data, delete resources, ` +
        `or perform raw administrative actions for this user. Provide conversational assistance, guidance, code snippets, and text responses directly in chat.`
      );
    } else {
      promptParts.push(
        `[ADMIN CONTEXT]: User @${author.username} (Discord ID: ${author.id}) is a verified administrator with tool execution privileges.`
      );
    }

    // Execution Thread Context
    if (options.isThread) {
      promptParts.push(`[Execution Thread Context: Thread ID ${options.threadId || "Active"}]`);
    }

    // Prompt Turn Header with Immutable Grounding
    promptParts.push(`[Message from @${author.username} (Discord ID: ${author.id})]: ${rawPrompt}`);
    const guardedPrompt = promptParts.join("\n\n");

    const args = [
      "--print", guardedPrompt,
      "--output-format", "stream-json",
      "--print-timeout", "90s"
    ];

    if (sessionId) {
      args.push("--conversation", sessionId);
    }

    // Apply execution privileges based on verified administrator status
    if (author.isAdmin) {
      args.push("--dangerously-skip-permissions");
    }

    console.log(`\n[AG2 Session Turn]`);
    console.log(`  Target Session : ${sessionId || "Dynamic Dedicated Session (Fresh)"}`);
    console.log(`  Author         : @${author.username} (${author.id}) | Nick: "${author.displayName}" (Admin: ${author.isAdmin}, Collab: ${author.isCollaborator}, Spoof: ${author.isImpersonating})`);
    console.log(`  Security Mode  : ${author.isAdmin ? "Admin Full Access" : "Community Sandboxed (In-Chat Only)"}`);
    console.log(`  Prompt         : "${rawPrompt.slice(0, 70)}..."`);

    const child = spawn(this.agyPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false
    });

    let hasYieldedAny = false;
    let fullResponse = "";

    // Watchdog timer to ensure child process NEVER hangs or starves the turn queue
    const turnTimeout = setTimeout(() => {
      console.warn(`[AG2 Session] Turn timed out after 95s, terminating child process (PID: ${child.pid})...`);
      try { child.kill("SIGKILL"); } catch {}
    }, 95000);

    child.stderr.on("data", (chunk) => {
      const errText = chunk.toString().trim();
      if (errText) console.warn(`[AG2 CLI stderr] ${errText}`);
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line.trim());

          if (event.event === "init" && event.conversation_id) {
            const newSessionId = event.conversation_id;
            if (options.isThread && options.threadId) {
              this.threadSessions.set(options.threadId, newSessionId);
              console.log(`  Thread Session ID: ${newSessionId} (thread: ${options.threadId})`);
            } else if (author.isAdmin) {
              this.adminConversationId = newSessionId;
              console.log(`  Admin Session ID : ${newSessionId}`);
            } else if (author.id && author.id !== "unknown_legacy_id") {
              this.userSessions.set(author.id, newSessionId);
              console.log(`  User Session ID  : ${newSessionId} (user: @${author.username} [${author.id}])`);
            }
          }

          if (event.event === "step_update" && event.step_update) {
            const update = event.step_update;
            if (update.step_type === "agent_response" && update.text_delta) {
              hasYieldedAny = true;
              fullResponse += update.text_delta;
              yield update.text_delta;
            }
          }

          if (event.event === "result" && event.result) {
            const finalResp = event.result.response || "";
            if (!hasYieldedAny && finalResp) {
              yield finalResp;
            }
          }
        } catch {
          // Ignore non-JSON log lines
        }
      }
    } finally {
      clearTimeout(turnTimeout);
      try { child.kill(); } catch {}
    }
  }
}
