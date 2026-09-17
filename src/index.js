import { config } from "./config.js";
import { createDiscordBot } from "./discord-bot.js";

if (!config.discordToken) {
  console.error("❌ ERROR: DISCORD_TOKEN is missing!");
  console.error("Please create a .env file based on .env.example and provide your Discord Bot Token.");
  process.exit(1);
}

const bot = createDiscordBot();

bot.login(config.discordToken).catch((err) => {
  console.error(`❌ Failed to login to Discord: ${err.message}`);
  process.exit(1);
});
