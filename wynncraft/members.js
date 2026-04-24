function getAllMembers(members) {
  const roles = ["owner", "chief", "strategist", "captain", "recruiter", "recruit"];
  const all = [];

  for (const role of roles) {
    if (!members[role]) continue;

    for (const uuid in members[role]) {
      all.push({
        uuid,
        guild_rank: role,
        ...members[role][uuid]
      });
    }
  }

  return all;
}

module.exports = { getAllMembers };