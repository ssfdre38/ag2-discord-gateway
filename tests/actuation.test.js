import assert from "assert";
import { HmbMemoryEngine } from "../src/hmb-memory.js";
import { createHttpActuationServer } from "../src/http-server.js";

console.log("🧪 Starting Outbound Actuation HTTP API Verification Tests...\n");

// 1. Mock Discord Client
const mockChannel = {
  id: "1476714141908599046",
  name: "ash-chat",
  isTextBased: () => true,
  isVoiceBased: () => true,
  guild: null, // will be linked below
  permissionsFor: () => ({ has: () => true }),
  messages: {
    fetch: async (arg) => {
      if (typeof arg === "string") {
        return {
          id: arg,
          content: "Target message for reaction",
          channelId: "1476714141908599046",
          react: async (emoji) => true
        };
      }
      const limit = arg?.limit || 10;
      const map = new Map();
      for (let i = 0; i < limit; i++) {
        map.set(`msg-${i}`, {
          id: `msg-${i}`,
          author: { tag: "User#1234", id: "119510072865980419", bot: false },
          content: `Test message #${i}`,
          createdTimestamp: Date.now() - i * 1000,
          attachments: []
        });
      }
      return map;
    }
  },
  send: async (options) => {
    return {
      id: "mock-message-id-999",
      channelId: "1476714141908599046",
      createdTimestamp: Date.now()
    };
  }
};

const mockGuild = {
  id: "111111111111111111",
  name: "Gaming2Gamers",
  memberCount: 42,
  channels: {
    cache: new Map([["1476714141908599046", mockChannel]])
  },
  emojis: {
    cache: new Map([["g2g-id", { id: "1234567890", name: "g2g" }]])
  }
};

mockChannel.guild = mockGuild;

const mockClient = {
  isReady: () => true,
  user: { tag: "Ash#7132", id: "1476712784602595479" },
  guilds: {
    cache: new Map([["111111111111111111", mockGuild]])
  },
  channels: {
    fetch: async (id) => (id === mockChannel.id ? mockChannel : null)
  }
};

const mockVoiceManager = {
  join: async (chan) => ({ success: true, guildId: mockGuild.id, channelId: chan.id, channelName: chan.name, status: "CONNECTED" }),
  leave: (guildId) => ({ success: true, guildId, status: "DISCONNECTED" }),
  speakText: async (guildId, text, opts) => ({ success: true, guildId, textLength: text.length, voice: opts?.voice || "Zira", status: "PLAYING" }),
  playAudioFile: async (guildId, filePath) => ({ success: true, guildId, filePath, status: "PLAYING" }),
  getStatus: (guildId) => ({ connected: true, state: "ready", playerState: "idle" })
};

const mockReactionEngine = {
  reactToMessage: async (msg, emoji) => true
};

// 2. Setup HMB Engine
const hmb = new HmbMemoryEngine({ embeddingDim: 128 });
hmb.initializeCoreIdentity("Ash");

const testConfig = {
  allowedChannels: ["1476714141908599046"],
  hmbVaultPath: "./data/test_actuation_vault.hmb"
};

const server = createHttpActuationServer(mockClient, hmb, testConfig, mockVoiceManager, mockReactionEngine);
const TEST_PORT = 18899;

server.listen(TEST_PORT, "127.0.0.1", async () => {
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  try {
    // 3. Test /api/status
    const statusRes = await fetch(`${baseUrl}/api/status`);
    const statusData = await statusRes.json();
    console.log(`✓ GET /api/status: botTag="${statusData.botTag}", anchors=${statusData.hmbAnchors}`);
    assert.strictEqual(statusData.ok, true);
    assert.strictEqual(statusData.botTag, "Ash#7132");
    assert.strictEqual(statusData.hmbAnchors, 3);

    // 4. Test /api/channels
    const channelsRes = await fetch(`${baseUrl}/api/channels`);
    const channelsData = await channelsRes.json();
    console.log(`✓ GET /api/channels: found ${channelsData.channels.length} text channels`);
    assert.strictEqual(channelsData.ok, true);
    assert.strictEqual(channelsData.channels[0].name, "ash-chat");

    // 5. Test POST /api/send
    const sendRes = await fetch(`${baseUrl}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hello from Outbound AG2 Actuator!" })
    });
    const sendData = await sendRes.json();
    console.log(`✓ POST /api/send: messageId="${sendData.messageId}" channel="${sendData.channelName}"`);
    assert.strictEqual(sendData.ok, true);
    assert.strictEqual(sendData.messageId, "mock-message-id-999");

    // 6. Test GET /api/history
    const histRes = await fetch(`${baseUrl}/api/history?limit=5`);
    const histData = await histRes.json();
    console.log(`✓ GET /api/history: retrieved ${histData.messages.length} messages`);
    assert.strictEqual(histData.ok, true);
    assert.strictEqual(histData.messages.length, 5);

    // 7. Test POST /api/remember
    const remRes = await fetch(`${baseUrl}/api/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concept: "Outbound Actuation Deployed",
        content: "AG2 can now proactively send Discord messages and read history via loopback HTTP and MCP."
      })
    });
    const remData = await remRes.json();
    console.log(`✓ POST /api/remember: created anchor #${remData.anchor.id}, total=${remData.totalAnchors}`);
    assert.strictEqual(remData.ok, true);
    assert.strictEqual(remData.totalAnchors, 4);

    // 8. Test GET /api/recall
    const recRes = await fetch(`${baseUrl}/api/recall?query=actuation+and+discord`);
    const recData = await recRes.json();
    console.log(`✓ GET /api/recall: matched ${recData.results.length} memories`);
    assert.strictEqual(recData.ok, true);
    assert.ok(recData.results.length > 0);

    // 9. Test POST /api/react
    const reactRes = await fetch(`${baseUrl}/api/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: "1476714141908599046",
        messageId: "msg-0",
        emoji: "🔥"
      })
    });
    const reactData = await reactRes.json();
    console.log(`✓ POST /api/react: reacted with "${reactData.emoji}" ok=${reactData.ok}`);
    assert.strictEqual(reactData.ok, true);
    assert.strictEqual(reactData.emoji, "🔥");

    // 10. Test POST /api/voice/join
    const voiceJoinRes = await fetch(`${baseUrl}/api/voice/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: "1476714141908599046"
      })
    });
    const voiceJoinData = await voiceJoinRes.json();
    console.log(`✓ POST /api/voice/join: status="${voiceJoinData.status}" channel="${voiceJoinData.channelName}"`);
    assert.strictEqual(voiceJoinData.ok, true);
    assert.strictEqual(voiceJoinData.status, "CONNECTED");

    // 11. Test POST /api/voice/speak
    const voiceSpeakRes = await fetch(`${baseUrl}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "111111111111111111",
        text: "Hello Gaming2Gamers! Ash is online and speaking live into the voice channel."
      })
    });
    const voiceSpeakData = await voiceSpeakRes.json();
    console.log(`✓ POST /api/voice/speak: status="${voiceSpeakData.status}" length=${voiceSpeakData.textLength}`);
    assert.strictEqual(voiceSpeakData.ok, true);
    assert.strictEqual(voiceSpeakData.status, "PLAYING");

    // 12. Test GET /api/voice/status
    const voiceStatRes = await fetch(`${baseUrl}/api/voice/status?guildId=111111111111111111`);
    const voiceStatData = await voiceStatRes.json();
    console.log(`✓ GET /api/voice/status: connected=${voiceStatData.connected} state="${voiceStatData.state}"`);
    assert.strictEqual(voiceStatData.ok, true);
    assert.strictEqual(voiceStatData.connected, true);

    // 13. Test POST /api/voice/leave
    const voiceLeaveRes = await fetch(`${baseUrl}/api/voice/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "111111111111111111"
      })
    });
    const voiceLeaveData = await voiceLeaveRes.json();
    console.log(`✓ POST /api/voice/leave: status="${voiceLeaveData.status}"`);
    assert.strictEqual(voiceLeaveData.ok, true);
    assert.strictEqual(voiceLeaveData.status, "DISCONNECTED");

    console.log("\n🎉 ALL OUTBOUND ACTUATION & VOICE/REACTION API TESTS PASSED!\n");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});


