const mysql = require("mysql2/promise");

async function createDb() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
}

function getTableName(uuid) {
  return `user_${uuid.replace(/-/g, "_")}`;
}

async function createTable(db, table) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`${table}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      time_inserted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      username VARCHAR(255),
      online BOOLEAN,
      server VARCHAR(50),

      guild_rank VARCHAR(20),
      contributed BIGINT,

      wars INT,
      playtime FLOAT,
      guild_raids_total INT,

      canyon_colossus INT,
      orphion INT,
      grootslangs INT,
      anomaly INT,
      wartorn INT,

      weekly_completed BOOLEAN
    )
  `);
}

async function getLastRow(db, table) {
  const [rows] = await db.execute(
    `SELECT * FROM \`${table}\` ORDER BY id DESC LIMIT 1`
  );
  return rows[0];
}

async function insertRow(db, table, user) {
  const g = user.globalData || {};

  await db.execute(`
    INSERT INTO \`${table}\`
    (username, online, server, guild_rank, contributed,
     wars, playtime, guild_raids_total,
     canyon_colossus, orphion, grootslangs, anomaly, wartorn,
     weekly_completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    user.username,
    user.online,
    user.server,
    user.guild_rank,
    user.contributed,

    g.wars ?? 0,
    g.playtime ?? 0,
    g.guildRaids?.total ?? 0,

    g.guildRaids?.list?.["The Canyon Colossus"] ?? 0,
    g.guildRaids?.list?.["Orphion's Nexus of Light"] ?? 0,
    g.guildRaids?.list?.["Nest of the Grootslang"] ?? 0,
    g.guildRaids?.list?.["The Nameless Anomaly"] ?? 0,
    g.guildRaids?.list?.["The Wartorn Palace"] ?? 0,

    user.weekly?.completed ?? false
  ]);

  await db.execute(`
    INSERT INTO setting_additional_info (uuid, username)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE username = VALUES(username)
  `, [
    user.uuid,
    user.username
  ]);
}

module.exports = {
  createDb,
  getTableName,
  createTable,
  getLastRow,
  insertRow
};