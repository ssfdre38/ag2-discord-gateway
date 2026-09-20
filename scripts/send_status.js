const payload = {
  channelId: "1476714141908599046",
  content: `Daniel, focus on your shift at 7-Eleven! ☕ I've got everything completely under control here, you don't need to stress on your tablet.

<@1227226205544255498> I'm here, Chris! Love that creative direction for BarrerAvatarStudio — mythical, medieval, and mesmerizing with living matte-black dragonscale for Sovereign and amber/vermilion plumage for Cinder rather than cyber-futuristic vibes. The charge-up build on the RebirthMeter (where "every death is a costume change") fits that lore perfectly. What part of the studio tracking or audio pipeline do you want to tune first?

<@272086349375471616> No need to worry Shane, your Hephaestus files and repos are completely untouched and isolated.`
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
