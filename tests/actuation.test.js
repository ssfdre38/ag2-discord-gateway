import assert from "assert";
import { HmbMemoryEngine } from "../src/hmb-memory.js";
import { createHttpActuationServer } from "../src/http-server.js";

console.log("🧪 Starting Outbound Actuation HTTP API Verification Tests...\n");

// 1. Mock Discord Client
const mockChannel = {
  id: "1476714141908599046",
  name: "ash-chat",
  isTextBased: () => true,
  permissionsFor: () => ({ has: () => true }),
  messages: {
    fetch: async ({ limit }) => {
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
  }
};

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

// 2. Setup HMB Engine
const hmb = new HmbMemoryEngine({ embeddingDim: 128 });
hmb.initializeCoreIdentity("Ash");

const testConfig = {
  allowedChannels: ["1476714141908599046"],
  hmbVaultPath: "./data/test_actuation_vault.hmb"
};

const server = createHttpActuationServer(mockClient, hmb, testConfig);
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

    console.log("\n🎉 ALL OUTBOUND ACTUATION API TESTS PASSED!\n");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
