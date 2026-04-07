import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("raw/olympic-events.csv");
const outputDir = path.resolve("public/data");
const outputPath = path.resolve(outputDir, "events.json");

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function toMinutes(hhmm) {
  const [hours, mins] = hhmm.split(":").map(Number);
  return hours * 60 + mins;
}

function normalizeDateLabel(rawDate) {
  return rawDate.replace(/^"|"$/g, "").trim();
}

async function main() {
  const raw = await readFile(inputPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;

  if (!header) {
    throw new Error("CSV file is empty.");
  }

  const columns = splitCsvLine(header);
  const required = ["Zone", "Venue", "Event", "Day", "Date", "Start", "End"];

  for (const col of required) {
    if (!columns.includes(col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  const records = rows.map((line, idx) => {
    const values = splitCsvLine(line);
    const get = (name) => values[columns.indexOf(name)] ?? "";

    const day = Number(get("Day"));
    const start = get("Start");
    const end = get("End");

    return {
      id: `ev-${idx + 1}`,
      zone: get("Zone"),
      venue: get("Venue"),
      event: get("Event"),
      day,
      dateLabel: normalizeDateLabel(get("Date")),
      start,
      end,
      startMinutes: toMinutes(start),
      endMinutes: toMinutes(end),
      medal: get("Medal") || "-"
    };
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf-8");

  console.log(`Wrote ${records.length} events to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
