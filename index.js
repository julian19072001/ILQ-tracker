require("dotenv").config();
const mysql = require("mysql2/promise");

// =====================
// CONFIG
// =====================
const API_URL = process.env.API_URL;
const USER_API_URL = process.env.USER_API_URL; 
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const DISCORD_WEBHOOK_RAID = process.env.DISCORD_WEBHOOK_RAID;

// =====================
// RAID CONFIG
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
    connectionLimit: 10
  });
}

// =====================
// FETCH MAIN API
// =====================
async function fetchMainData() {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`
    }
  });

  if (!res.ok) throw new Error(`Main API error: ${res.status}`);
  return await res.json();
}

// =====================
// FETCH USER API
// =====================
async function fetchUserData(uuid) {
  try {
    const res = await fetch(`${USER_API_URL}/${uuid}`, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`
      }
    });

    if (!res.ok) throw new Error();

    return await res.json();
  } catch {
    return null;
  }
}

// =====================
// MERGE DATA (future-proof)
// =====================
async function getFullUserData(user) {
  const userApi = await fetchUserData(user.uuid);

  // If API fails, fallback
  if (!userApi) {
    return {
      wars: 0,
      playtime: 0,
      raids: {},
      totalRaids: 0
    };
  }

  return {
    wars: userApi?.globalData?.wars ?? 0,
    playtime: userApi?.playtime ?? 0,
    raids: userApi?.globalData?.guildRaids?.list || {},
    totalRaids: userApi?.globalData?.guildRaids?.total ?? 0
  };
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
      all.push({
        uuid,
        guild_rank: role, // ✅ THIS is the fix
        ...members[role][uuid]
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
// CREATE TABLE
// =====================
async function createUserTable(db, tableName) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      time_inserted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      username VARCHAR(255),
      online BOOLEAN,
      server VARCHAR(255),

      guild_rank VARCHAR(20),

      contributed BIGINT,
      wars INT DEFAULT 0,
      playtime FLOAT DEFAULT 0,

      guild_raids_total INT DEFAULT 0,

      canyon_colossus INT DEFAULT 0,
      orphion INT DEFAULT 0,
      grootslangs INT DEFAULT 0,
      anomaly INT DEFAULT 0
    )
  `);
}

// =====================
// GET LAST ROW
// =====================
async function getLastRow(db, tableName) {
  const [rows] = await db.execute(
    `SELECT * FROM \`${tableName}\` ORDER BY id DESC LIMIT 1`
  );
  return rows[0];
}

// =====================
// TIME CHECK
// =====================
function isOlderThan1Day(timestamp) {
  if (!timestamp) return true;
  return (Date.now() - new Date(timestamp).getTime()) > 86400000;
}

// =====================
// DISCORD WEBHOOK
// =====================
async function sendWebhook(username, raidName, imageUrl) {
  await fetch(DISCORD_WEBHOOK_RAID, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `${username} has completed a guild raid:`,
          description: `# ${raidName}`,
          color: 5814783,
          thumbnail: { url: imageUrl }
        }
      ]
    })
  });
}

// =====================
// INSERT USER
// =====================
async function insertUser(db, user) {
  const tableName = getTableName(user.uuid);

  await createUserTable(db, tableName);

  const last = await getLastRow(db, tableName);

  // 👇 fetch second API
  const extra = await getFullUserData(user);

  // First time → no webhook
  if (!last) {
    await insertRow(db, tableName, user, extra);
    return;
  }

  // Older than 1 day → no webhook
  if (isOlderThan1Day(last.time_inserted)) {
    await insertRow(db, tableName, user, extra);
    return;
  }

  const totalDiff = extra.totalRaids - (last.guild_raids_total || 0);

  // Skip spam
  if (totalDiff > 3) {
    await insertRow(db, tableName, user, extra);
    return;
  }

  // RAID DIFF
  for (const raidName in RAID_DATA) {
    const key = RAID_DATA[raidName].key;

    const oldVal = last[key] || 0;
    const newVal = extra.raids[raidName] || 0;

    const diff = newVal - oldVal;

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

  await insertRow(db, tableName, user, extra);
}

// =====================
// INSERT ROW
// =====================
async function insertRow(db, tableName, user, extra) {
  await db.execute(
    `
    INSERT INTO \`${tableName}\`
    (username, online, server, contributed, guild_rank, wars, playtime, guild_raids_total,
     canyon_colossus, orphion, grootslangs, anomaly)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      user.username,
      user.online,
      user.server,
      user.contributed,
      user.guild_rank,
      extra.wars,
      extra.playtime,
      extra.totalRaids,
      extra.raids["The Canyon Colossus"] ?? 0,
      extra.raids["Orphion's Nexus of Light"] ?? 0,
      extra.raids["Nest of the Grootslangs"] ?? 0,
      extra.raids["The Nameless Anomaly"] ?? 0
    ]
  );
}

// =====================
// MAIN LOOP
// =====================
async function processData(db) {
  const data = await fetchMainData();
  const members = getAllMembers(data.members);

  console.log(`Users: ${members.length}`);

  await Promise.all(
    members.map(user => insertUser(db, user))
  );
}

// =====================
// Timer functions
// =====================
let running = false;
let timer = null;

function getNextRunDelay() {
  const now = new Date();

  const next = new Date(now);

  // always round UP to next 10-minute boundary
  next.setMinutes(Math.ceil(now.getMinutes() / 10) * 10);
  next.setSeconds(0);
  next.setMilliseconds(0);

  // handle hour overflow
  if (next.getMinutes() === 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  }

  let delay = next.getTime() - now.getTime();

  // 🔥 SAFETY: prevent negative or too small values
  if (delay < 1000) {
    delay = 10 * 60 * 1000; // fallback 10 min
  }

  return delay;
}

async function runCycle(db) {
  if (running) return;

  running = true;
  try {
    await processData(db);
  } catch (err) {
    console.error("Process error:", err.message);
  }
  running = false;
}

function scheduleNext(db) {
  const delay = getNextRunDelay();

  console.log(`Next run in ${Math.round(delay / 1000)}s`);

  timer = setTimeout(async () => {
    await runCycle(db);
    scheduleNext(db); // schedule ONLY after completion
  }, delay);
}

// =====================
// START
// =====================
(async () => {
  const db = await createDb();

  // prevent accidental double starts (PM2 / reload safety)
  if (global.__schedulerStarted) return;
  global.__schedulerStarted = true;

  console.log("Running initial fetch...");
  await runCycle(db);

  scheduleNext(db);
})();