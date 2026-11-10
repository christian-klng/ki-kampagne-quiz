// Anbindung an Sprachmodell und Bild-KI über Replicate (https://replicate.com).
// Beide laufen über dieselbe Predictions-API und denselben Token. Modelle und Parameter
// werden über Umgebungsvariablen eingestellt, siehe .env.example.

const env = process.env;
const API = "https://api.replicate.com/v1";
// Leerzeichen und versehentlich mitkopierte Anführungszeichen entfernen
const TOKEN = (env.REPLICATE_API_TOKEN || "").trim().replace(/^["']|["']$/g, "");

export const LLM_MODEL = env.LLM_MODEL || "qwen/qwen3-235b-a22b-instruct-2507";
export const IMAGE_MODEL = env.IMAGE_MODEL || "black-forest-labs/flux-2-pro";
export const llmEnabled = Boolean(TOKEN);
export const imageEnabled = Boolean(TOKEN);

const LLM_EFFORT = env.LLM_EFFORT || "low"; // nur für Modelle mit „effort“ (z. B. Claude): wenig Nachdenken, schnelle Antwort
const LLM_TEMPERATURE = Number(env.LLM_TEMPERATURE || 0.7); // etwas Abwechslung für Werbetexte
const LLM_INPUT = parseJson("LLM_INPUT_JSON", {});
const IMAGE_INPUT = parseJson("IMAGE_INPUT_JSON", { aspect_ratio: "1:1", output_format: "webp" });

function parseJson(name, fallback) {
  if (!env[name]) return fallback;
  try {
    return JSON.parse(env[name]);
  } catch {
    console.warn(`${name} ist kein gültiges JSON und wird ignoriert.`);
    return fallback;
  }
}

// ---------- Replicate-Predictions ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function replicateFetch(url, options = {}, attempt = 0) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 429 && attempt < 2) {
    const wait = Number(res.headers.get("retry-after")) || 2;
    await sleep(wait * 1000);
    return replicateFetch(url, options, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(`Replicate ${res.status}: ${json.detail || json.title || res.statusText}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

/**
 * Startet eine Prediction und wartet auf das Ergebnis.
 * Modell als „owner/name“ (aktuelle Version) oder „owner/name:version“ (fest angepinnt).
 */
async function runModel(model, input, { timeoutMs = 180_000 } = {}) {
  if (!TOKEN) throw new Error("REPLICATE_API_TOKEN fehlt");
  const [name, version] = model.split(":");
  const url = version ? `${API}/predictions` : `${API}/models/${name}/predictions`;
  const body = version ? { version, input } : { input };

  // „Prefer: wait“ hält die Verbindung bis zu 60 s offen, danach wird abgefragt
  let prediction = await replicateFetch(url, { method: "POST", headers: { Prefer: "wait=60" }, body: JSON.stringify(body) });
  const deadline = Date.now() + timeoutMs;
  while (["starting", "processing"].includes(prediction.status)) {
    if (Date.now() > deadline) {
      replicateFetch(prediction.urls.cancel, { method: "POST" }).catch(() => {});
      throw new Error("Replicate: Zeitüberschreitung");
    }
    await sleep(1500);
    prediction = await replicateFetch(prediction.urls.get);
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate: ${prediction.status}${prediction.error ? ` – ${String(prediction.error).slice(0, 200)}` : ""}`);
  }
  return prediction.output;
}

// ---------- Sprachmodell ----------

/** Baut aus einem Chatverlauf einen einzelnen Prompt (die Replicate-Modelle erwarten „prompt“). */
function toPrompt(messages) {
  if (messages.length === 1) return messages[0].content;
  const history = messages.slice(0, -1)
    .map((m) => `${m.role === "user" ? "Nutzer" : "Chatbot"}: ${m.content}`)
    .join("\n");
  return `Bisheriger Chatverlauf:\n${history}\n\nNeue Nachricht des Nutzers:\n${messages.at(-1).content}\n\n` +
    "Antworte als Chatbot nur mit deiner nächsten Nachricht, ohne Rollenbezeichnung.";
}

// Welche Eingabefelder ein Modell kennt, steht in seinem Schema. Einmal pro Modell nachsehen.
const schemaCache = new Map();
function modelInputs(model) {
  if (!schemaCache.has(model)) {
    const [name, version] = model.split(":");
    const url = version ? `${API}/models/${name}/versions/${version}` : `${API}/models/${name}`;
    const job = replicateFetch(url)
      .then((data) => {
        const schema = (version ? data : data.latest_version)?.openapi_schema;
        const props = schema?.components?.schemas?.Input?.properties;
        return props ? new Set(Object.keys(props)) : null;
      })
      .catch((error) => {
        schemaCache.delete(model); // beim nächsten Mal erneut versuchen
        console.warn(`Schema von ${model} nicht lesbar: ${error.message}`);
        return null;
      });
    schemaCache.set(model, job);
  }
  return schemaCache.get(model);
}

/** Schickt eine Anfrage an das Sprachmodell und gibt den Antworttext zurück. */
export async function generateText({ system, messages, maxTokens = 4096 }) {
  const fields = await modelInputs(LLM_MODEL); // null = unbekannt, dann alles schicken
  const has = (key) => !fields || fields.has(key);
  const prompt = toPrompt(messages);
  // Modelle ohne eigenes Feld für die Systemanweisung bekommen sie vor den Prompt gestellt
  const input = has("system_prompt")
    ? { prompt, system_prompt: system }
    : { prompt: `${system}\n\n---\n\n${prompt}` };
  if (has("max_tokens")) input.max_tokens = Math.max(1024, maxTokens);
  if (fields?.has("effort")) input.effort = LLM_EFFORT;
  if (fields?.has("temperature")) input.temperature = LLM_TEMPERATURE;
  Object.assign(input, LLM_INPUT);

  const output = await runModel(LLM_MODEL, input, { timeoutMs: 90_000 });
  const text = (Array.isArray(output) ? output.join("") : String(output ?? ""))
    .replace(/<think>[\s\S]*?<\/think>/g, "") // falls ein Modell seine Denkschritte mitschickt
    .trim();
  if (!text) throw new Error("Leere Antwort");
  return text;
}

export function describeLlmError(error) {
  if (error.status === 401) return "Replicate-Token ungültig";
  if (error.status === 402) return "Replicate-Guthaben aufgebraucht";
  if (error.status === 429) return "Replicate-Rate-Limit erreicht";
  return error.message;
}

// ---------- Bild-KI ----------

/** Erzeugt ein Bild und gibt es als Buffer samt Dateiendung zurück. */
export async function generateImage(prompt) {
  const output = await runModel(IMAGE_MODEL, { prompt, ...IMAGE_INPUT });
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== "string" || !url.startsWith("http")) throw new Error("Bild-KI lieferte keine Bild-URL");

  // Dateien unter api.replicate.com brauchen den Token, replicate.delivery nicht
  const headers = new URL(url).hostname === "api.replicate.com" ? { Authorization: `Bearer ${TOKEN}` } : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Bild-Download ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, ext: detectExtension(buffer) };
}

function detectExtension(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "webp";
  return "png";
}
