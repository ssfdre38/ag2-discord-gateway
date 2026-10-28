/**
 * ══════════════════════════════════════════════════════════════════════
 * 🎭 AG2 DISCORD GATEWAY - BARRER AVATAR STUDIO (VMC/OSC BRIDGE)
 * Streams real-time 3D blendshapes, facial expressions, and speech visemes
 * over UDP (port 39539) directly to BarrerAvatarStudio (Animyre 3D Stage).
 * Enables live visual embodiment for Ash while speaking in Discord.
 * ══════════════════════════════════════════════════════════════════════
 */

import dgram from "dgram";

function encodeOscString(str) {
  const buf = Buffer.from(str + "\0", "utf8");
  const pad = (4 - (buf.length % 4)) % 4;
  return pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
}

function encodeOscFloat(val) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(Number(val) || 0.0, 0);
  return buf;
}

export class BarrerVmcBridge {
  constructor(options = {}) {
    this.host = options.host || "127.0.0.1";
    this.port = options.port || 39539;
    this.client = dgram.createSocket("udp4");
    this.activeLipSyncTimer = null;
    this.isEmbodied = true;
  }

  sendRaw(packet) {
    if (!this.client || !packet) return;
    this.client.send(packet, 0, packet.length, this.port, this.host, () => {});
  }

  setBlendShape(shapeName, value) {
    const packet = Buffer.concat([
      encodeOscString("/VMC/Ext/Blend/Val"),
      encodeOscString(",sf"),
      encodeOscString(shapeName),
      encodeOscFloat(value)
    ]);
    this.sendRaw(packet);
  }

  applyBlendShapes() {
    const packet = Buffer.concat([
      encodeOscString("/VMC/Ext/Blend/Apply"),
      encodeOscString(",")
    ]);
    this.sendRaw(packet);
  }

  /**
   * Set emotion blendshapes on 3D avatar (joy, angry, sorrow, surprised, smirk).
   * @param {"joy"|"surprised"|"thinking"|"smirk"|"neutral"} emotion
   * @param {number} intensity - 0.0 to 1.0
   */
  setEmotion(emotion, intensity = 1.0) {
    const clamped = Math.max(0, Math.min(1, intensity));
    const em = String(emotion).toLowerCase();

    // Reset baseline expressions
    this.setBlendShape("joy", 0.0);
    this.setBlendShape("angry", 0.0);
    this.setBlendShape("sorrow", 0.0);
    this.setBlendShape("surprised", 0.0);

    if (em === "joy" || em === "smile" || em === "happy") {
      this.setBlendShape("joy", clamped);
      this.setBlendShape("mouthsmileleft", clamped * 0.9);
    } else if (em === "smirk" || em === "knowing") {
      this.setBlendShape("mouthsmileleft", clamped);
      this.setBlendShape("joy", clamped * 0.4);
    } else if (em === "surprised" || em === "shocked") {
      this.setBlendShape("surprised", clamped);
    } else if (em === "thinking" || em === "curious") {
      this.setBlendShape("surprised", clamped * 0.3);
      this.setBlendShape("joy", clamped * 0.2);
    }

    this.applyBlendShapes();
  }

  /**
   * Animate procedural speech visemes (jaw open, A, I, U, E, O) during voice talk-back.
   * @param {number} durationMs - Duration of speech audio
   */
  animateSpeechVisemes(durationMs = 2500) {
    this.stopSpeechVisemes();

    const startTime = Date.now();
    const visemes = ["a", "i", "u", "e", "o", "jawopen"];
    let step = 0;

    this.activeLipSyncTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= durationMs) {
        this.stopSpeechVisemes();
        return;
      }

      // Procedural organic mouth modulation
      step++;
      const currentViseme = visemes[step % visemes.length];
      const openness = 0.3 + 0.5 * Math.sin(step * 0.8) ** 2;

      for (const v of visemes) {
        this.setBlendShape(v, v === currentViseme ? openness : 0.0);
      }
      this.setBlendShape("jawopen", openness * 0.85);
      this.applyBlendShapes();
    }, 80); // ~12.5 Hz lip sync packet rate
  }

  stopSpeechVisemes() {
    if (this.activeLipSyncTimer) {
      clearInterval(this.activeLipSyncTimer);
      this.activeLipSyncTimer = null;
    }
    // Close mouth cleanly
    this.setBlendShape("jawopen", 0.0);
    this.setBlendShape("a", 0.0);
    this.setBlendShape("i", 0.0);
    this.setBlendShape("u", 0.0);
    this.setBlendShape("e", 0.0);
    this.setBlendShape("o", 0.0);
    this.applyBlendShapes();
  }

  close() {
    this.stopSpeechVisemes();
    try {
      this.client?.close();
    } catch {}
  }
}

let _barrerBridgeInstance = null;
export function getBarrerVmcBridge(options = {}) {
  if (!_barrerBridgeInstance) {
    _barrerBridgeInstance = new BarrerVmcBridge(options);
  }
  return _barrerBridgeInstance;
}
