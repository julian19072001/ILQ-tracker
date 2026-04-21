require("dotenv").config();
const mysql = require("mysql2/promise");

// =====================
// CONFIG
// =====================
const API_URL = process.env.API_URL;
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const DISCORD_WEBHOOK_RAID = process.env.DISCORD_WEBHOOK_RAID;

// =====================
// LOCAL RAID IMAGES
// =====================
const RAID_DATA = {
  "The Canyon Colossus": {
    key: "canyon_colossus",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/colossus_completion.webp"
  },
  "Orphion's Nexus of Light": {
    key: "orphion",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/orphion_completion.webp"
  },
  "Nest of the Grootslangs": {
    key: "grootslangs",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/grootslang_completion.webp"
  },
  "The Nameless Anomaly": {
    key: "anomaly",
    image: "https://cdn.wynncraft.com/nextgen/leaderboard/icons/nameless_completion.webp"
  }
};

// =====================
// DATABASE
// =====================
async function createDb() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  });
}

// =====================
// FETCH API
// =====================
async function fetchData() {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`
    }
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return await res.json();
}

// =====================
// FLATTEN MEMBERS
// =====================
function getAllMembers(members) {
  const roles = ["owner", "chief", "strategist", "captain", "recruiter", "recruit"];
  const all = [];

  for (const role of roles) {
    if (!members[role]) continue;

    for (const uuid in members[role]) {
      const user = members[role][uuid];

      all.push({
        uuid,
        ...user
      });
    }
  }

  return all;
}

// =====================
// TABLE NAME
// =====================
function getTableName(uuid) {
  return `user_${uuid.replace(/-/g, "_")}`;
}

// =====================
// CREATE USER TABLE
// =====================
async function createUserTable(db, tableName) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      time_inserted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      username VARCHAR(255),
      online BOOLEAN,
      server VARCHAR(255),
      contributed BIGINT,

      canyon_colossus INT DEFAULT 0,
      orphion INT DEFAULT 0,
      grootslangs INT DEFAULT 0,
      anomaly INT DEFAULT 0
    )
  `);
}

// =====================
// GET LAST ENTRY
// =====================
async function getLastRow(db, tableName) {
  const [rows] = await db.execute(
    `SELECT * FROM \`${tableName}\` ORDER BY id DESC LIMIT 1`
  );

  return rows[0];
}

// =====================
// CHECK TIME (1 day)
// =====================
function isOlderThan1Day(timestamp) {
  if (!timestamp) return true;

  return (Date.now() - new Date(timestamp).getTime()) > 24 * 60 * 60 * 1000;
}

// =====================
// DISCORD WEBHOOK
// =====================
async function sendWebhook(username, raidName, imagePath) {
  await fetch(DISCORD_WEBHOOK_RAID, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [
        {
          title: `${username} has completed a guild raid:`,
          description: `# ${raidName}`,
          color: 5814783,
          thumbnail: {
            url: imagePath 
          }
        }
      ]
    })
  });
}

// =====================
// INSERT + COMPARE LOGIC
// =====================
async function insertUser(db, user) {
  const tableName = getTableName(user.uuid);

  await createUserTable(db, tableName);

  const last = await getLastRow(db, tableName);
  const raids = user?.guildRaids?.list || {};

  // First time user → no webhook
  if (!last) {
    await db.execute(
      `INSERT INTO \`${tableName}\`
      (username, online, server, contributed, canyon_colossus, orphion, grootslangs, anomaly)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.username,
        user.online,
        user.server,
        user.contributed,
        raids["The Canyon Colossus"] ?? 0,
        raids["Orphion's Nexus of Light"] ?? 0,
        raids["Nest of the Grootslangs"] ?? 0,
        raids["The Nameless Anomaly"] ?? 0
      ]
    );

    return;
  }

  // Older than 1 day → no webhook
  if (isOlderThan1Day(last.time_inserted)) {
    await db.execute(
      `INSERT INTO \`${tableName}\`
      (username, online, server, contributed, canyon_colossus, orphion, grootslangs, anomaly)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.username,
        user.online,
        user.server,
        user.contributed,
        raids["The Canyon Colossus"] ?? 0,
        raids["Orphion's Nexus of Light"] ?? 0,
        raids["Nest of the Grootslangs"] ?? 0,
        raids["The Nameless Anomaly"] ?? 0
      ]
    );

    return;
  }

  // =====================
  // COMPARE RAIDS
  // =====================
  for (const raidName in RAID_DATA) {
    const key = RAID_DATA[raidName].key;

    const oldValue = last[key] || 0;
    const newValue = raids[raidName] || 0;

    const diff = newValue - oldValue;

    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        await sendWebhook(
          user.username,
          raidName,
          RAID_DATA[raidName].image
        );
      }
    }
  }

  // Insert snapshot AFTER comparison
  await db.execute(
    `INSERT INTO \`${tableName}\`
    (username, online, server, contributed, canyon_colossus, orphion, grootslangs, anomaly)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.username,
      user.online,
      user.server,
      user.contributed,
      raids["The Canyon Colossus"] ?? 0,
      raids["Orphion's Nexus of Light"] ?? 0,
      raids["Nest of the Grootslangs"] ?? 0,
      raids["The Nameless Anomaly"] ?? 0
    ]
  );
}

// =====================
// MAIN LOOP
// =====================
async function processData(db) {
  try {
    const data = await fetchData();
    const members = getAllMembers(data.members);

    console.log(`Users found: ${members.length}`);

    for (const user of members) {
      await insertUser(db, user);
    }

    console.log("Cycle completed");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

// =====================
// START APP
// =====================
(async () => {
  const db = await createDb();

  await processData(db);

  setInterval(() => {
    processData(db);
  }, 10 * 60 * 1000);
})();