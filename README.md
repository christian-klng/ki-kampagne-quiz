# Die KI-Kampagne – Quiz zu KI im Beruf

Du arbeitest im Marketing der fiktiven Akademie Morgenrot und bewirbst den Kurs „KI-Kompass für Teams“. Dabei triffst du 20 Entscheidungen. Jede hat vier Optionen: verboten, fragwürdig, gut (+1) und sehr gut (+2 Ethik-Punkte). Es gibt keine Mindestpunktzahl. Verbotenes stoppt die Justiziarin Mira, die Kampagne läuft trotzdem weiter. Am Ende steht immer ein Kampagnenstart mit Plakat.

Bei acht Entscheidungen und am Ende zeigt eine Live-KI direkt das Ergebnis der Wahl:

| Frage | Live-Ergebnis |
|---|---|
| 2 Kernbotschaft | Claim und Unterzeile (Sprachmodell), später auf dem Plakat |
| 4 Newsletter | Betreff und Teaser |
| 7 Blogartikel | Überschrift und erster Absatz |
| 9 Kundenstimmen | simulierte Reaktionen |
| 11 Key Visual | Bild (Bild-KI), später auf dem Plakat |
| 14 Landingpage | Titelbild (Bild-KI) |
| 15 Chatbot | Chat mit dem eingerichteten Bot |
| 18 Social-Media-Agent | Kommentare und Antwort |
| Ende | Kampagnen-Steckbrief |

Bei verbotenen Optionen wird bewusst nichts erzeugt, also keine Promi-Deepfakes und keine erfundenen Bewertungen.

Vor der ersten Entscheidung wählen die Teilnehmenden im **Briefing** eine Zielgruppe (z. B. Handwerksbetriebe, Kanzleien) und einen Schreibstil (z. B. sachlich, mit Humor). Beides fließt in alle Live-Texte, den Chatbot, den Steckbrief und die Live-Bilder (Umgebung und Stimmung) ein und steht im Rückblick und im PDF. Die Auswahl ist in `data/quiz.json` unter `briefing` gepflegt; der Server nimmt nur dort bekannte IDs an.

## KI über Replicate

Sprachmodell und Bild-KI laufen über [Replicate](https://replicate.com) mit einem gemeinsamen Token (`REPLICATE_API_TOKEN`).

| Zweck | Standardmodell | Umstellen mit |
|---|---|---|
| Texte, Chatbot, Steckbrief | `anthropic/claude-opus-5.5` (mit `effort: low`) | `LLM_MODEL`, `LLM_EFFORT`, `LLM_INPUT_JSON` |
| Live-Bilder und Illustrationen | `black-forest-labs/flux-2-pro` (1:1, WebP) | `IMAGE_MODEL`, `IMAGE_INPUT_JSON` |

Modelle lassen sich als `owner/name` (aktuelle Version) oder `owner/name:version` (fest angepinnt) angeben. Andere Sprachmodelle müssen `prompt` und `system_prompt` verstehen; der Chatverlauf wird für sie in einen Prompt umgewandelt. Bildmodelle müssen `prompt` verstehen und eine Bild-URL liefern; abweichende Parameter kommen in `IMAGE_INPUT_JSON`.

Bildstile stehen in `data/quiz.json`: `imageStyle` für die Story-Illustrationen (flach, illustriert) und `liveImageStyle` für die Live-Bilder der Fragen 11 und 14 (fotografischer Kampagnen-Look), damit sich das Ergebnis der eigenen Entscheidung sichtbar abhebt. Ändert sich ein Prompt, erzeugt der Server automatisch neue Bilder statt alte aus dem Cache zu zeigen.

Datenschutz: Replicate ist ein US-Anbieter. Für den Einsatz mit echten Teilnehmenden braucht ihr einen Auftragsverarbeitungsvertrag (DPA) mit Replicate. In den Chat sollten keine personenbezogenen Daten eingegeben werden; die App weist darauf hin.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `data/quiz.json` | Story, Fragen, Optionen, Rechtsbezüge, Prompts und Fallback-Texte |
| `server.mjs` | Node-Server: liefert `public/` aus und stellt die API für die Live-KI bereit |
| `lib/providers.mjs` | Anbindung an Sprachmodell und Bild-KI über die Replicate-API (ohne Zusatzpakete) |
| `public/` | App: `index.html`, `js/app.js`, `css/style.css` (Designvorlage), `css/app.css` (Ergänzungen) |
| `public/img/story/` | Story-Illustrationen (`intro`, `q01`–`q20`, `stopp`, `grau`, `ende`) |
| `scripts/generate-illustrations.mjs` | erzeugt die Story-Illustrationen einmalig mit der Bild-KI |
| `story/entscheidungen.md` | ausführlicher Story-Entwurf mit Begründungen |
| `design/` | die ursprünglichen statischen Vorlageseiten |

Die Prompts stehen nur auf dem Server. Der Browser schickt nur Frage- und Options-IDs, damit niemand die App als freies KI-Gateway nutzen kann. Für den Chatbot gelten 300 Zeichen pro Nachricht und drei Nachrichten.

## Lokal starten

```bash
npm install
```

```bash
cp .env.example .env
```

`REPLICATE_API_TOKEN` in `.env` eintragen (optional, ohne läuft der Demo-Modus), dann:

```bash
npm run dev
```

App unter http://localhost:3000.

## Illustrationen erzeugen

Solange `public/img/story/` leer ist, zeigt die App Platzhalter. Mit `REPLICATE_API_TOKEN` in der `.env`:

```bash
npm run illustrations
```

Das erzeugt alle 24 Motive in einem einheitlichen Stil (`imageStyle` in `data/quiz.json`). Einzelne Motive neu erzeugen: `npm run illustrations -- q03 stopp --force`. Danach die Bilder ins Repository einchecken.

## Coolify

1. Ordner als Git-Repository auf GitHub oder GitLab ablegen.
2. In Coolify eine neue Ressource aus dem Repository anlegen, Build Pack **Dockerfile**, Port **3000**.
3. Umgebungsvariablen aus `.env.example` eintragen, mindestens `REPLICATE_API_TOKEN`.
4. Persistenten Speicher für `/app/cache` anlegen, damit Live-Bilder einen Neustart überstehen.

Kostenschutz: Pro Antwortoption erzeugt die Bild-KI höchstens `IMAGE_VARIANTS` Bilder (Standard 3), danach kommen sie aus dem Cache. Insgesamt sind es höchstens `IMAGE_DAILY_LIMIT` neue Bilder pro Tag.

## Datenschutz der App selbst

- Das Quiz speichert den Fortschritt nur im Browser (`localStorage`) und setzt keine Cookies. Auf dem Server werden keine Antworten gespeichert.
- Am Ende können die Teilnehmenden ihren Kampagnenplan als PDF herunterladen (Ergebnis- oder Rückblickseite, Knopf „Kampagnenplan ↓“). Das PDF entsteht im Browser mit jsPDF (`public/js/plan-pdf.js`) und verlässt das Gerät nicht.
- Chat-Eingaben gehen zur Antwort an Replicate und werden auf dem eigenen Server nicht gespeichert. Die App bittet im Chat darum, keine persönlichen Daten einzugeben.
- Für den Einsatz mit echten Teilnehmenden braucht ihr ein Impressum, eine Datenschutzerklärung und einen Auftragsverarbeitungsvertrag mit Replicate. Das ist genau das, was das Quiz lehrt.

## Rechtsstand

Stand November 2026, inklusive KI-Omnibus (VO (EU) 2026/1744). Die Rechtsbezüge sind für ein Lernspiel vereinfacht und vor dem Einsatz juristisch gegenzulesen. Offene Punkte stehen am Ende von `story/entscheidungen.md`.

Bilder der Vorlage: `turing-test.jpg` KI-generiert; `diffusion-schritt-08.jpg` Benlisquare, Stable Diffusion 1.5, Wikimedia Commons, CC BY-SA 4.0. Schrift Geist: SIL Open Font License, siehe `public/fonts/geist/LICENSE.md`. jsPDF 4.2.1 (`public/vendor/`): MIT-Lizenz, siehe `public/vendor/jspdf.LICENSE.txt`.
