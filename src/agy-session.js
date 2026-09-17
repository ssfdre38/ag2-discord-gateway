import { spawn } from "child_process";
import readline from "readline";
import { config } from "./config.js";

export class AgySessionManager {
  constructor() {
    this.agyPath = config.agyPath;
    this.activeConversationId = config.conversationId || null;
  }

  /**
   * Executes a turn in the AG2 session and streams token deltas as they arrive.
   * @param {string} prompt - The user prompt from Discord
   * @param {string} [overrideSessionId] - Optional specific session ID
   * @returns {AsyncGenerator<string>} Token deltas
   */
  async *runTurn(prompt, overrideSessionId = null) {
    const sessionId = overrideSessionId || this.activeConversationId;

    const args = [
      "--print", prompt,
      "--output-format", "stream-json",
      "--dangerously-skip-permissions"
    ];

    if (sessionId) {
      args.push("--conversation", sessionId);
    }
    // If no session specified, agy spawns a dedicated session and reports conversation_id on 'init'

    console.log(`\n[AG2 Session] Spawning agy turn...`);
    console.log(`  Target Session : ${sessionId || "New Dedicated Gateway Session (Will retain ID for thread)"}`);
    console.log(`  Prompt Snippet : "${prompt.slice(0, 80)}..."`);

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

    // Monitor stderr for any critical errors
    child.stderr.on("data", (chunk) => {
      const errText = chunk.toString();
      if (errText.trim()) {
        console.warn(`[AG2 CLI stderr] ${errText.trim()}`);
      }
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line.trim());

          // Track the conversation ID assigned or resumed by AG2
          if (event.event === "init" && event.conversation_id) {
            this.activeConversationId = event.conversation_id;
            console.log(`  Session ID     : ${this.activeConversationId}`);
          }

          // Real-time streaming token delta
          if (event.event === "step_update" && event.step_update) {
            const update = event.step_update;
            if (update.step_type === "agent_response" && update.text_delta) {
              hasYieldedAny = true;
              fullResponse += update.text_delta;
              yield update.text_delta;
            }
          }

          // Final result event (safety check in case no streaming deltas were received)
          if (event.event === "result" && event.result) {
            const finalResp = event.result.response || "";
            if (!hasYieldedAny && finalResp) {
              yield finalResp;
            }
          }
        } catch {
          // Non-JSON output line, ignore or log
        }
      }
    } finally {
      child.kill();
    }
  }
}
