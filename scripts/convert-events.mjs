import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("raw/olympic-events.csv");
const outputDir = path.resolve("public/data");
const outputPath = path.resolve(outputDir, "events.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.map((parsedRow) => parsedRow.map((value) => value.trim()));
}

function toMinutes(hhmm) {
  const [hours, mins] = hhmm.split(":").map(Number);
  return hours * 60 + mins;
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => compactWhitespace(line))
    .join("\n")
    .trim();
}

function extractTime(rawValue) {
  const match = compactWhitespace(rawValue).match(/(\d{1,2}:\d{2})/);

  if (!match) {
    return "";
  }

  const [hours, mins] = match[1].split(":");
  return `${hours.padStart(2, "0")}:${mins}`;
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function main() {
  const raw = await readFile(inputPath, "utf-8");
  const rows = parseCsv(raw).filter((row) => row.some((value) => value.trim() !== ""));
  const [header, ...recordsRows] = rows;

  if (!header) {
    throw new Error("CSV file is empty.");
  }

  const columns = header;
  const required = ["Sport", "Venue", "Zone", "Date", "Games Day", "Start Time", "End Time"];

  for (const col of required) {
    if (!columns.includes(col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  const records = recordsRows.map((values, idx) => {
    const get = (name) => values[columns.indexOf(name)] ?? "";

    const rawStartTime = compactWhitespace(get("Start Time"));
    const rawEndTime = compactWhitespace(get("End Time"));
    const startClock = extractTime(rawStartTime);
    const endClock = extractTime(rawEndTime);
    const startMinutes = startClock ? toMinutes(startClock) : null;
    const endMinutes = endClock ? toMinutes(endClock) : null;

    return {
      id: `ev-${idx + 1}`,
      sport: compactWhitespace(get("Sport")),
      venue: compactWhitespace(get("Venue")),
      zone: compactWhitespace(get("Zone")),
      sessionCode: compactWhitespace(get("Session Code")),
      date: compactWhitespace(get("Date")),
      gamesDay: toNumberOrNull(get("Games Day")),
      sessionType: compactWhitespace(get("Session Type")),
      sessionDescription: normalizeMultilineText(get("Session Description")),
      startTime: rawStartTime,
      endTime: rawEndTime,
      startClock: startClock || null,
      endClock: endClock || null,
      startMinutes,
      endMinutes,
      hasFixedTime: startMinutes !== null && endMinutes !== null
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
