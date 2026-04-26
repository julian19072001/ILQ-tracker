require("dotenv").config();

const { fetchGuild } = require("./wynncraft/api");
const { getAllMembers } = require("./wynncraft/members");
const { createDb, getTableName, createTable, getLastRow, insertRow, cleanupUsers } = require("./db/mysql");
const { handleRaids } = require("./discord/raids");

let running = false;

async function runCycle(db) {
  try {
    await processData(db);
  } catch (e) {
    console.error(e);
  }
}

function getNextRunDelay() {
  const now = new Date();
  const next = new Date(now);

  next.setMinutes(Math.ceil(now.getMinutes() / 10) * 10);
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (next.getMinutes() === 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  }

  let delay = next - now;
  if (delay < 1000) delay = 10 * 60 * 1000;

  return delay;
}

function scheduleNext(db, runCycle) {
  const delay = getNextRunDelay();

  console.log(`Next run in ${Math.round(delay / 1000)}s`);

  setTimeout(async () => {
    await runCycle(db);   
    scheduleNext(db, runCycle);
  }, delay);
}

async function processData(db) {
  const data = await fetchGuild();
  const members = getAllMembers(data.members);

  const apiUUIDs = new Set(members.map(u => u.uuid));

  await cleanupUsers(db, apiUUIDs);

  console.log(`Users: ${members.length}`);

  for (const user of members) {
    const table = getTableName(user.uuid);

    await createTable(db, table);
    const last = await getLastRow(db, table);

    await handleRaids(user, last);
    await insertRow(db, table, user);
  }
}

(async () => {
  const db = await createDb();

  async function runCycle(db) {
    try {
      await processData(db);
    } catch (e) {
      console.error(e);
    }
  }

  console.log("Initial run...");
  await runCycle(db);

  scheduleNext(db, runCycle);
})();