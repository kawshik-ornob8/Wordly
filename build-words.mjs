import { readFile, writeFile } from "node:fs/promises";

const SOURCE_FILE = new URL("word-data.csv", import.meta.url);
const OUTPUT_FILE = new URL("words.json", import.meta.url);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const source = await readFile(SOURCE_FILE, "utf8");
const [headers, ...sourceRows] = parseCSV(source);
const column = name => headers.indexOf(name);
const wordColumn = column("word");
const definitionColumn = column("definition");
const partColumn = column("part of speech");
const exampleColumn = column("example");

if ([wordColumn, definitionColumn, partColumn, exampleColumn].includes(-1)) {
  throw new Error("word-data.csv is missing one or more required columns.");
}

const words = sourceRows
  .map(row => [
    row[wordColumn]?.trim() || "",
    row[partColumn]?.trim().toLowerCase() || "",
    row[definitionColumn]?.trim() || "",
    row[exampleColumn]?.trim() || ""
  ])
  .filter(([word, part, definition]) => word && part && definition);

const payload = {
  version: 1,
  schema: ["word", "part", "definition", "example"],
  words
};

await writeFile(OUTPUT_FILE, JSON.stringify(payload), "utf8");

const uniqueWords = new Set(words.map(([word]) => word.toLowerCase())).size;
const missingExamples = words.filter(([, , , example]) => !example).length;
console.log(`Generated words.json with ${words.length} rows (${uniqueWords} unique words, ${missingExamples} missing examples).`);
