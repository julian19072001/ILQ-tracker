require("dotenv").config();

const API_URL = process.env.API_URL;
const BEARER_TOKEN = process.env.BEARER_TOKEN;

async function fetchGuild() {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`
    }
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

module.exports = { fetchGuild };