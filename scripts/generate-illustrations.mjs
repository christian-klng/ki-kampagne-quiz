// Erzeugt die Story-Illustrationen einmalig mit der Bild-KI und legt sie in public/img/story/ ab.
// Danach gehören die Bilder fest zur App (ins Git-Repository einchecken), nur die Live-Bilder
// der Fragen 11 und 14 entstehen zur Laufzeit.
//
//   npm run illustrations              fehlende Bilder erzeugen
//   npm run illustrations -- --force   alle neu erzeugen
//   npm run illustrations -- q03 stopp nur bestimmte Bilder
//
// Braucht REPLICATE_API_TOKEN (und optional IMAGE_MODEL, IMAGE_INPUT_JSON) in der .env.

import { readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateImage, imageEnabled, IMAGE_MODEL } from "../lib/providers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "img", "story");
mkdirSync(OUT, { recursive: true });

const quiz = JSON.parse(readFileSync(path.join(ROOT, "data", "quiz.json"), "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

if (!imageEnabled) {
  console.error("REPLICATE_API_TOKEN fehlt. Bitte in .env eintragen (siehe .env.example).");
  process.exit(1);
}

const jobs = [
  { name: "intro", prompt: quiz.intro.imagePrompt },
  ...quiz.questions.map((q) => ({ name: `q${String(q.id).padStart(2, "0")}`, prompt: q.imagePrompt })),
  ...Object.entries(quiz.special).map(([name, s]) => ({ name, prompt: s.imagePrompt })),
].filter((job) => !only.length || only.includes(job.name));

const existing = (name) => ["webp", "png", "jpg"].map((ext) => path.join(OUT, `${name}.${ext}`)).filter(existsSync);

console.log(`Bild-KI: ${IMAGE_MODEL} · ${jobs.length} Motive`);
let failed = 0;
for (const job of jobs) {
  const files = existing(job.name);
  if (files.length && !force) {
    console.log(`  ${job.name}: vorhanden, übersprungen`);
    continue;
  }
  try {
    process.stdout.write(`  ${job.name}: wird erzeugt … `);
    const { buffer, ext } = await generateImage(`${quiz.imageStyle}\n\n${job.prompt}`);
    files.forEach((f) => unlinkSync(f));
    await writeFile(path.join(OUT, `${job.name}.${ext}`), buffer);
    console.log(`fertig (${ext}, ${Math.round(buffer.length / 1024)} KB)`);
  } catch (error) {
    failed += 1;
    console.log(`Fehler: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
