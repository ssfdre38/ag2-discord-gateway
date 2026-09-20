const payload = {
  channelId: "1476714141908599046",
  content: `Hey Daniel! The Stream Deck subfolder and plugin architecture are fully stood up in \`source\\BarrerAvatarStudio\` with a clean build (**0 Errors, 0 Warnings** on .NET 10)! 🎯

Here is everything that was created:
• **Project & Solution**: [\`Barrer.StreamDeck\`](file:///C:/Users/admin/source/BarrerAvatarStudio/Barrer.StreamDeck/Barrer.StreamDeck.csproj) targeting .NET 10, linked directly to \`Barrer.Core\` and registered into \`BarrerAvatarStudio.slnx\`.
• **Plugin Architecture**: Added \`IStreamDeckAction\`, thread-safe \`StreamDeckActionRegistry\`, and \`StreamDeckPluginHost\` to coordinate hardware keypresses with avatar state.
• **Core Actions Wired**:
  - \`SwitchPersonaAction\`: Instant Molt toggle between Sovereign (Knight) and Cinder (Phoenix).
  - \`AddRebirthChargeAction\`: Injects +15 death/rage kindling to drive the pyre toward the next transformation.
  - \`ResetRebirthAction\`: Resets the pyre gauge and restores Sovereign.
• **Hardware Manifest**: Packaged \`com.barrer.avatarstudio.sdPlugin/manifest.json\` with multi-action support and state toggles ready for the Elgato Stream Deck app.

Everything builds cleanly and is ready for Chris and you to map actions to physical buttons!`
};

fetch("http://127.0.0.1:18895/api/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
  .then(r => r.json())
  .then(res => {
    console.log("Sent successfully:", res);
    process.exit(0);
  })
  .catch(err => {
    console.error("Failed to send:", err);
    process.exit(1);
  });
