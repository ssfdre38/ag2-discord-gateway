import { BarrerVmcBridge, getBarrerVmcBridge } from "../src/barrer-bridge.js";
import assert from "assert";
import dgram from "dgram";

console.log("🎭 Starting BarrerAvatarStudio VMC/OSC Bridge Verification Tests...\n");

// 1. Instantiation
const bridge = new BarrerVmcBridge({ port: 39599 });
assert.ok(bridge, "Bridge should instantiate");
assert.strictEqual(bridge.port, 39599);
console.log("✓ BarrerVmcBridge instantiates cleanly with custom port.");

// 2. Set up local UDP listener to verify OSC packet output
const server = dgram.createSocket("udp4");
const receivedPackets = [];

await new Promise((resolve) => {
  server.bind(39599, "127.0.0.1", resolve);
});

server.on("message", (msg) => {
  receivedPackets.push(msg);
});

// 3. Send BlendShape
bridge.setBlendShape("jawopen", 0.75);
bridge.applyBlendShapes();

// 4. Send Emotion
bridge.setEmotion("smirk", 0.8);

// 5. Test speech viseme animator
bridge.animateSpeechVisemes(200);

await new Promise((resolve) => setTimeout(resolve, 300));
bridge.stopSpeechVisemes();

assert.ok(receivedPackets.length >= 3, `Should have received at least 3 OSC packets, got ${receivedPackets.length}`);

// Verify first packet is OSC /VMC/Ext/Blend/Val
const firstStr = receivedPackets[0].toString("utf8");
assert.ok(firstStr.includes("/VMC/Ext/Blend/Val"), "First packet should contain OSC address /VMC/Ext/Blend/Val");
console.log(`✓ OSC UDP Packets received and validated (${receivedPackets.length} packets sent).`);

// Clean up
bridge.close();
server.close();
console.log("✓ UDP sockets closed cleanly.");

console.log("\n🎉 ALL BARRER VMC BRIDGE TESTS PASSED WITH 100% SUCCESS!\n");
