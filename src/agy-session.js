import { spawn } from "child_process";
import readline from "readline";
import { config } from "./config.js";

export class AgySessionManager {
  constructor() {
    this.agyPath = config.agyPath;
    this.activeConversationId = config.conversationId || null;
  }

  bindSession(conversationId) {
    this.activeConversationId = conversationId;
    console.log(`[AG2 Session] Bound to session: ${this.activeConversationId}`);
  }

  resetSession() {
    this.activeConversationId = null;
    console.log(`[AG2 Session] Reset session to dynamic default`);
  }

  getSessionId() {
    return this.activeConversationId;
  }

  /**
   * Executes a turn in the AG2 session with user guardrails and streams tokens.
   * @param {string} rawPrompt - The user text from Discord
   * @param {string} authorName - Discord user display name
   * @param {boolean} isAdmin - Whether the user is an authorized admin
   * @returns {AsyncGenerator<string>} Token deltas
   */
  async *runTurn(rawPrompt, authorName, isAdmin = false) {
    const sessionId = this.activeConversationId;

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

    if (!isAdmin) {
      promptParts.push(
        `[SECURITY POLICY]: User "${authorName}" is a standard Discord community member (Non-Admin). ` +
        `You must NOT execute terminal commands, modify local filesystem data, delete resources, ` +
        `or perform raw administrative actions for this user. Provide conversational assistance, guidance, and text responses only.`
      );
    } else {
      promptParts.push(`[ADMIN CONTEXT]: User "${authorName}" is a verified administrator with tool execution privileges.`);
    }

    promptParts.push(`[User: ${authorName}]: ${rawPrompt}`);
    const guardedPrompt = promptParts.join("\n\n");

    const args = [
      "--print", guardedPrompt,
      "--output-format", "stream-json"
    ];

    if (sessionId) {
      args.push("--conversation", sessionId);
    }

    // Apply execution privileges based on user role and safety mode
    if (isAdmin) {
      args.push("--dangerously-skip-permissions");
    } else if (config.safeMode) {
      // Sandbox terminal restrictions for non-admin users
      args.push("--sandbox");
    }

    console.log(`\n[AG2 Session Turn]`);
    console.log(`  Target Session : ${sessionId || "Dynamic Dedicated Session"}`);
    console.log(`  Author         : ${authorName} (Admin: ${isAdmin})`);
    console.log(`  Security Mode  : ${isAdmin ? "Admin Full Access" : "Community Sandboxed (No Raw Tool Exec)"}`);
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
            this.activeConversationId = event.conversation_id;
            console.log(`  Session ID     : ${this.activeConversationId}`);
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
      child.kill();
    }
  }
}
