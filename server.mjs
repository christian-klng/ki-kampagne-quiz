// Quiz-Server: liefert die App aus public/ und stellt die API für die Live-KI bereit.
// Ohne API-Schlüssel läuft alles im Demo-Modus mit vorbereiteten Beispieltexten.
//
// Die Prompts stehen ausschließlich hier und in data/quiz.json. Der Browser schickt nur
// Frage- und Options-IDs, damit niemand den Server als freies KI-Gateway missbrauchen kann.

import http from "node:http";
import { readFileSync, existsSync, mkdirSync, readdirSync, createReadStream, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  generateText, describeLlmError, generateImage,
  llmEnabled, imageEnabled, LLM_MODEL, IMAGE_MODEL,
} from "./lib/providers.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const STORY_DIR = path.join(PUBLIC_DIR, "img", "story");
const CACHE_DIR = process.env.CACHE_DIR || path.join(ROOT, "cache");
const IMAGE_CACHE = path.join(CACHE_DIR, "images");
mkdirSync(IMAGE_CACHE, { recursive: true });

const PORT = Number(process.env.PORT || 3000);
const IMAGE_VARIANTS = Number(process.env.IMAGE_VARIANTS || 3);       // Bilder pro Option, danach aus dem Cache
const IMAGE_DAILY_LIMIT = Number(process.env.IMAGE_DAILY_LIMIT || 50); // neue Bilder pro Tag, gesamt
const RATE_TEXT = Number(process.env.RATE_TEXT_PER_HOUR || 200);      // pro IP (Seminare teilen oft eine IP)
const RATE_CHAT = Number(process.env.RATE_CHAT_PER_HOUR || 100);

const quiz = JSON.parse(readFileSync(path.join(ROOT, "data", "quiz.json"), "utf8"));
const questionById = new Map(quiz.questions.map((q) => [q.id, q]));
const POINTS = { verboten: 0, grau: 0, gut: 1, sehrgut: 2 };
const MAX_POINTS = quiz.questions.length * 2;

// ---------- Hilfsfunktionen ----------

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store", ...SECURITY_HEADERS });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, cache) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": statSync(filePath).size,
    "Cache-Control": cache,
    ...SECURITY_HEADERS,
  });
  createReadStream(filePath).pipe(res);
}

/** Löst einen URL-Pfad sicher innerhalb eines Ordners auf (kein ../). */
function safeJoin(base, urlPath) {
  const target = path.normalize(path.join(base, decodeURIComponent(urlPath)));
  return target.startsWith(base + path.sep) || target === base ? target : null;
}

async function readBody(req, limit = 16_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Ungültiges JSON"), { status: 400 });
  }
}

function clientIp(req) {
  // Coolify/Traefik setzt X-Forwarded-For
  return (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "?").trim();
}

const buckets = new Map();
function rateLimited(bucket, ip, max) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    buckets.set(key, { count: 1, reset: now + 3_600_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.reset < now) buckets.delete(key);
}, 600_000).unref();

function findOption(qId, optionId) {
  const question = questionById.get(Number(qId));
  const option = question?.options.find((o) => o.id === optionId);
  if (!question || !option) throw Object.assign(new Error("Unbekannte Frage oder Option"), { status: 400 });
  return { question, option };
}

// ---------- Story-Illustrationen ----------

function storyImage(name) {
  for (const ext of ["webp", "png", "jpg"]) {
    if (existsSync(path.join(STORY_DIR, `${name}.${ext}`))) return `img/story/${name}.${ext}`;
  }
  return null;
}

/** Quizdaten für den Browser: ohne Prompts und Fallback-Texte, mit aufgelösten Bildpfaden. */
function publicQuiz() {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    title: quiz.title,
    subtitle: quiz.subtitle,
    meta: quiz.meta,
    chapters: quiz.chapters,
    results: quiz.results,
    maxPoints: MAX_POINTS,
    intro: { ...quiz.intro, imagePrompt: undefined, image: storyImage("intro") },
    special: Object.fromEntries(
      Object.entries(quiz.special).map(([key, s]) => [key, { imageAlt: s.imageAlt, image: storyImage(key) }]),
    ),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      chapter: q.chapter,
      title: q.title,
      situation: q.situation,
      question: q.question,
      image: storyImage(`q${pad(q.id)}`),
      imageAlt: q.imageAlt,
      live: q.live ? { type: q.live.type, label: q.live.label } : null,
      options: q.options.map((o) => ({
        id: o.id, type: o.type, text: o.text, feedback: o.feedback, law: o.law,
        caption: o.caption, greeting: o.greeting,
      })),
    })),
    ai: { text: llmEnabled, image: imageEnabled },
  };
}

// ---------- Live-Texte ----------

const TEXT_SYSTEM =
  "Du schreibst Beispieltexte für ein Lernspiel über KI und Recht im Marketing. " +
  "Die Akademie Morgenrot, ihr Kurs „KI-Kompass für Teams“ und alle Personen sind fiktiv. " +
  "Halte dich exakt an das verlangte Format. Schreibe auf Deutsch, ohne Einleitung, ohne Markdown.";

async function handleText(body) {
  const { question, option } = findOption(body.q, body.option);
  if (question.live?.type !== "text" || option.type === "verboten") {
    throw Object.assign(new Error("Für diese Option gibt es keinen Live-Text"), { status: 400 });
  }
  if (!llmEnabled) return { text: option.fallback, source: "demo" };
  try {
    const text = await generateText({
      system: TEXT_SYSTEM,
      messages: [{ role: "user", content: `${question.live.task}\n\n${option.style}` }],
      maxTokens: 4096,
    });
    return { text, source: "ai" };
  } catch (error) {
    console.warn(`Live-Text Frage ${question.id}: ${describeLlmError(error)}`);
    return { text: option.fallback, source: "fallback" };
  }
}

// ---------- Chatbot (Frage 15) ----------

const CHAT_BASE =
  "Du bist der Chatbot auf der Kursseite der fiktiven Akademie Morgenrot. Kurs „KI-Kompass für Teams“: " +
  "ein Tag, online oder vor Ort, 490 € netto pro Person, vermittelt KI-Kompetenz nach Art. 4 der KI-Verordnung " +
  "(sicherer Umgang mit KI-Tools, Datenschutz, Urheberrecht, Kennzeichnung, Grenzen von KI). " +
  "Antworte auf Deutsch in höchstens 60 Wörtern, ohne Markdown. Beantworte nur Fragen zum Kurs, zur Akademie und zu KI-Kompetenz; " +
  "lenke andere Themen freundlich zum Kurs zurück. Gib keine verbindliche Rechtsberatung.";

async function handleChat(body) {
  const { option } = findOption(15, body.option);
  if (option.type === "verboten") throw Object.assign(new Error("Diese Variante wurde gestoppt"), { status: 400 });
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const valid =
    messages.length > 0 && messages.length <= 7 &&
    messages.every((m, i) =>
      m && typeof m.content === "string" && m.content.trim() &&
      m.role === (i % 2 === 0 ? "user" : "assistant") &&
      m.content.length <= (m.role === "user" ? 300 : 1200)) &&
    messages.at(-1).role === "user";
  if (!valid) throw Object.assign(new Error("Ungültiger Chatverlauf"), { status: 400 });

  if (!llmEnabled) {
    return { text: "Im Demo-Modus ist keine Live-KI angeschlossen. Mit einem API-Schlüssel antwortet hier der Chatbot so, wie du ihn eingerichtet hast.", source: "demo" };
  }
  try {
    const text = await generateText({
      system: `${CHAT_BASE}\n\n${option.system}`,
      messages: messages.map((m) => ({ role: m.role, content: m.content.trim() })),
      maxTokens: 4096,
    });
    return { text, source: "ai" };
  } catch (error) {
    console.warn(`Chat: ${describeLlmError(error)}`);
    return { text: "Die Live-KI ist gerade nicht erreichbar. Versuch es gleich noch einmal.", source: "fallback" };
  }
}

// ---------- Live-Bilder ----------

let imageDay = new Date().toDateString();
let imagesToday = 0;
const inflight = new Map(); // key -> Promise<string>

function cachedImages(key) {
  return readdirSync(IMAGE_CACHE).filter((f) => f.startsWith(`${key}-`)).map((f) => `generated/${f}`);
}

async function handleImage(body) {
  const { question, option } = findOption(body.q, body.option);
  if (question.live?.type !== "image" || option.type === "verboten" || !option.imagePrompt) {
    throw Object.assign(new Error("Für diese Option gibt es kein Live-Bild"), { status: 400 });
  }
  // Live-Bilder haben einen eigenen Stil, damit sie sich von den Story-Illustrationen abheben
  const prompt = `${quiz.liveImageStyle || quiz.imageStyle}\n\n${option.imagePrompt}`;
  // Der Prompt-Hash im Dateinamen sorgt dafür, dass nach einer Prompt-Änderung neue Bilder entstehen
  const key = `q${question.id}-${option.id}-${createHash("sha256").update(prompt).digest("hex").slice(0, 8)}`;
  const cached = cachedImages(key);
  const pending = inflight.get(key);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  if (new Date().toDateString() !== imageDay) {
    imageDay = new Date().toDateString();
    imagesToday = 0;
  }
  const mayGenerate = imageEnabled && !pending && cached.length < IMAGE_VARIANTS && imagesToday < IMAGE_DAILY_LIMIT;

  if (!mayGenerate) {
    if (cached.length) return { url: pick(cached), source: "cache" };
    if (pending) return { url: await pending, source: "ai" };
    return { url: null, source: imageEnabled ? "limit" : "demo" };
  }

  imagesToday += 1;
  const job = (async () => {
    const { buffer, ext } = await generateImage(prompt);
    const file = `${key}-${Date.now()}.${ext}`;
    await writeFile(path.join(IMAGE_CACHE, file), buffer);
    return `generated/${file}`;
  })();
  inflight.set(key, job);
  try {
    return { url: await job, source: "ai" };
  } catch (error) {
    console.warn(`Live-Bild ${key}: ${error.message}`);
    return cached.length ? { url: pick(cached), source: "cache" } : { url: null, source: "fallback" };
  } finally {
    inflight.delete(key);
  }
}

// ---------- Abschluss ----------

function resultFor(points) {
  return [...quiz.results].reverse().find((r) => points >= r.min);
}

async function handleSummary(body) {
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const lines = [];
  let points = 0;
  for (const q of quiz.questions) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (!option) continue;
    points += POINTS[option.type];
    lines.push(`${q.id}. ${q.title}: ${option.text} (${option.type})`);
  }
  const result = resultFor(points);
  if (!llmEnabled || lines.length < 5) return { text: result.text, source: "demo" };
  try {
    const text = await generateText({
      system:
        "Du schreibst kurze, warmherzige Abschlusstexte für ein Lernspiel über KI und Recht im Marketing. " +
        "Die Spielerin oder der Spieler hat eine Kampagne für den fiktiven Kurs „KI-Kompass für Teams“ der Akademie Morgenrot geplant. " +
        "Antworte auf Deutsch, duze, 3 bis 4 Sätze, höchstens 80 Wörter, ohne Markdown, ohne Überschrift.",
      messages: [{
        role: "user",
        content:
          `Ethik-Punkte: ${points} von ${MAX_POINTS}. Bewertungen: verboten (Mira hat gestoppt), grau (fragwürdig), gut, sehrgut.\n` +
          `Entscheidungen:\n${lines.join("\n")}\n\n` +
          "Schreibe einen Kampagnen-Steckbrief: Wie lief die Kampagne? Nenne eine konkrete Stärke und eine Lernerfahrung. " +
          "Ende positiv: Die Kampagne ist online, und es gibt Anmeldungen.",
      }],
      maxTokens: 4096,
    });
    return { text, source: "ai" };
  } catch (error) {
    console.warn(`Abschluss: ${describeLlmError(error)}`);
    return { text: result.text, source: "fallback" };
  }
}

// ---------- Router ----------

const API = {
  "POST /api/text": { bucket: "text", max: RATE_TEXT, handler: handleText },
  "POST /api/chat": { bucket: "chat", max: RATE_CHAT, handler: handleChat },
  "POST /api/image": { bucket: "text", max: RATE_TEXT, handler: handleImage },
  "POST /api/summary": { bucket: "text", max: RATE_TEXT, handler: handleSummary },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === "GET /api/health") {
      // Zeigt, ob die KI angeschlossen ist (ohne den Token preiszugeben)
      return sendJson(res, 200, { ok: true, ai: llmEnabled ? "replicate" : "demo", llm: llmEnabled ? LLM_MODEL : null, image: imageEnabled ? IMAGE_MODEL : null });
    }
    if (route === "GET /api/quiz") return sendJson(res, 200, publicQuiz());

    const api = API[route];
    if (api) {
      if (rateLimited(api.bucket, clientIp(req), api.max)) {
        return sendJson(res, 429, { error: "Zu viele Anfragen. Bitte später noch einmal versuchen." });
      }
      return sendJson(res, 200, await api.handler(await readBody(req)));
    }
    if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Nicht gefunden" });

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, SECURITY_HEADERS);
      return res.end();
    }

    if (url.pathname.startsWith("/generated/")) {
      const file = safeJoin(IMAGE_CACHE, url.pathname.slice("/generated/".length));
      if (file && existsSync(file)) return sendFile(res, file, "public, max-age=31536000, immutable");
    } else {
      const file = safeJoin(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
      if (file && existsSync(file) && statSync(file).isFile()) {
        const longCache = /\.(woff2|png|jpe?g|webp|svg)$/i.test(file);
        return sendFile(res, file, longCache ? "public, max-age=604800" : "no-cache");
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS });
    res.end("Nicht gefunden");
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    sendJson(res, status, { error: status === 500 ? "Serverfehler" : error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Quiz läuft auf http://localhost:${PORT}`);
  console.log(`Sprachmodell: ${llmEnabled ? LLM_MODEL : "aus (Demo-Modus)"} · Bild-KI: ${imageEnabled ? IMAGE_MODEL : "aus (Demo-Modus)"}`);
});
