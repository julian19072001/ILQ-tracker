require("dotenv").config();

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_RAID;

const RAID_DATA = {
  "The Canyon Colossus": {
    key: "canyon_colossus",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/colossus_completion.webp"
  },
  "Orphion's Nexus of Light": {
    key: "orphion",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/orphion_completion.webp"
  },
  "Nest of the Grootslang": {
    key: "grootslangs",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/grootslang_completion.webp"
  },
  "The Nameless Anomaly": {
    key: "anomaly",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/nameless_completion.webp"
  },
  "The Wartorn Palace": {
    key: "wartorn",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/fruma_completion.webp"
  }
};

async function sendWebhook(username, raidName, imageUrl) {
  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `${username} completed a raid`,
        description: `# ${raidName}`,
        color: 5814783,
        thumbnail: { url: imageUrl }
      }]
    })
  });
}

async function handleRaids(user, last, raids) {
  for (const raidName in RAID_DATA) {
    const data = RAID_DATA[raidName];

    const oldVal = last?.[data.key] || 0;
    const newVal = raids?.[raidName] || 0;

    const diff = newVal - oldVal;

    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        await sendWebhook(user.username, raidName, data.image);
      }
    }
  }
}

module.exports = { handleRaids };