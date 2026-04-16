import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync("/home/user/liqudityservices/scripts/historical.tsv", "utf8");
const lines = raw.trim().split("\n").slice(1); // skip header

function parseNum(s) {
  if (!s || !s.trim()) return "NULL";
  return parseInt(s.replace(/[,\s]/g, ""), 10);
}

function parseDate(s) {
  const [m, d, y] = s.trim().split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const rows = [];
for (const line of lines) {
  const parts = line.split("\t");
  const date = parseDate(parts[0]);
  const time = (parts[1] || "18:00").trim();
  const as = parseNum(parts[2]);
  const gd = parseNum(parts[3]);
  // skip rows with no data at all
  if (as === "NULL" && gd === "NULL") continue;
  rows.push(`('${date}', '${time}', ${as}, ${gd})`);
}

const sql = `INSERT INTO listings (date, timestamp, allsurplus, govdeals) VALUES\n${rows.join(",\n")};\n`;
writeFileSync("/home/user/liqudityservices/scripts/seed.sql", sql);
console.log(`Generated ${rows.length} rows -> scripts/seed.sql`);
