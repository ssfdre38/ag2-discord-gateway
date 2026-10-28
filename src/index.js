import { config } from "./config.js";
import { createDiscordBot } from "./discord-bot.js";

// Process Guard: Prevent unexpected voice socket drops or unhandled rejections from crashing the bot
process.on("unhandledRejection", (reason, promise) => {
  console.warn("[Process Guard] Caught unhandledRejection:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process Guard] Caught uncaughtException:", err?.stack || err);
});

if (!config.discordToken) {
  console.error("❌ ERROR: DISCORD_TOKEN is missing!");
  console.error("Please copy example.env (or .env.example) to .env and provide your Discord Bot Token.");
  process.exit(1);
}

const bot = createDiscordBot();

bot.login(config.discordToken).catch((err) => {
  console.error(`❌ Failed to login to Discord: ${err.message}`);
  process.exit(1);
});
