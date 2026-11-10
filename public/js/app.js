// Die KI-Kampagne – Quiz-Logik (ohne Framework).
// Bildschirme: start → intro → frage (20×) → ergebnis → rückblick.
// Der Fortschritt liegt im localStorage, damit ein Neuladen nichts verliert.

(() => {
  "use strict";

  const app = document.getElementById("app");
  const STORE_KEY = "ki-kampagne-v1";
  const MAX_CHAT_TURNS = 3;

  const TYPES = {
    verboten: { label: "Verboten", points: 0, title: "Stopp! Mira greift ein", cls: "stop" },
    grau: { label: "Fragwürdig", points: 0, title: "Grauzone – kein Punkt", cls: "grey" },
    gut: { label: "Gut · +1", points: 1, title: "Gut gemacht · +1 Ethik-Punkt", cls: "good" },
    sehrgut: { label: "Sehr gut · +2", points: 2, title: "Sehr gut · +2 Ethik-Punkte", cls: "best" },
  };

  const SOURCE_NOTES = {
    ai: "Live mit KI erzeugt – Ergebnisse können jedes Mal anders ausfallen.",
    cache: "Dieses Motiv hat die Bild-KI bereits für andere Spielende erzeugt.",
    demo: "Demo-Modus: vorbereitetes Beispiel, keine Live-KI angeschlossen.",
    fallback: "Die Live-KI war nicht erreichbar – hier ein vorbereitetes Beispiel.",
    limit: "Das Tageslimit der Bild-KI ist erreicht – hier die vorbereitete Illustration.",
  };

  let quiz = null;
  let state = null;
  let selected = null; // gewählte, noch nicht bestätigte Option

  // ---------- Hilfsfunktionen ----------

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // answers: erste Wahl (zählt für die Punkte) · revised: aktuell angezeigte Wahl nach dem Umentscheiden
  // tried: alle schon ausprobierten Optionen · liveCache: Live-Ergebnisse pro Frage und Option
  const freshState = () => ({ screen: "start", index: 0, answers: {}, revised: {}, tried: {}, order: {}, live: {}, liveCache: {}, chat: [], summary: null });

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      return saved && typeof saved === "object" ? { ...freshState(), ...saved } : freshState();
    } catch {
      return freshState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* privater Modus o. Ä.: dann eben ohne Speichern */
    }
  }

  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Fehler ${res.status}`);
    return json;
  }

  const optionOf = (q, id) => q.options.find((o) => o.id === id);
  const chosenOption = (q) => optionOf(q, state.answers[q.id]);
  const shownOption = (q) => optionOf(q, state.revised[q.id] || state.answers[q.id]);
  const triedOptions = (q) => state.tried[q.id] || (state.answers[q.id] ? [state.answers[q.id]] : []);

  function points() {
    return quiz.questions.reduce((sum, q) => {
      const o = chosenOption(q);
      return sum + (o ? TYPES[o.type].points : 0);
    }, 0);
  }

  /** Mehrzeiliger KI-Text: „Label: Inhalt“ wird zu fettem Label. */
  function formatLiveText(text) {
    return String(text)
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line) => {
        const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
        return m ? `<p><strong>${esc(m[1])}</strong> ${esc(m[2])}</p>` : `<p>${esc(line)}</p>`;
      })
      .join("");
  }

  function claimFromState() {
    const live = state.live[2];
    const match = live?.text?.match(/Claim:\s*(.+)/);
    return (match ? match[1] : "KI sicher im Arbeitsalltag nutzen.").trim();
  }

  // ---------- Bausteine ----------

  function figure({ image, alt, caption, label, extraClass = "" }) {
    const media = image
      ? `<img src="${esc(image)}" alt="${esc(alt)}" data-label="${esc(label)}">`
      : placeholder(label, alt);
    const showCaption = caption && image;
    return `<figure class="quiz-image ${extraClass}">${media}${showCaption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
  }

  function placeholder(label, alt) {
    return `<div class="illu-placeholder" role="img" aria-label="${esc(alt || label)}"><span>${esc(label)}</span></div>`;
  }

  function footer(page) {
    const q = quiz.questions.length;
    const answered = Object.keys(state.answers).length;
    return `<footer>
      <button type="button" class="brand" data-action="home">ai up</button>
      <progress class="progress" value="${answered}" max="${q}">${answered} von ${q}</progress>
      <span class="page">${page}</span>
    </footer>`;
  }

  function bindImageFallbacks() {
    app.querySelectorAll("img[data-label]").forEach((img) => {
      img.addEventListener("error", () => {
        img.outerHTML = placeholder(img.dataset.label, img.alt);
      }, { once: true });
    });
  }

  // ---------- Bildschirme ----------

  function renderStart() {
    const inProgress = Object.keys(state.answers).length > 0 && state.screen !== "result";
    const finished = Object.keys(state.answers).length === quiz.questions.length;
    return `<main class="stage layout-title">
      <div class="content">
        <div class="intro">
          <p class="kicker">Quiz · KI im Beruf</p>
          <h1>${esc(quiz.title)}</h1>
          <p class="subtitle">${esc(quiz.subtitle)}</p>
          <p class="meta">${esc(quiz.meta)}</p>
          <div class="actions">
            ${finished
              ? `<button type="button" class="button" data-action="result">Zum Ergebnis</button>
                 <button type="button" class="button is-secondary" data-action="restart">Neu starten</button>`
              : inProgress
                ? `<button type="button" class="button" data-action="continue">Weiter bei Entscheidung ${state.index + 1}</button>
                   <button type="button" class="button is-secondary" data-action="restart">Neu starten</button>`
                : `<button type="button" class="button" data-action="intro">Quiz starten</button>`}
          </div>
        </div>
        <img class="title-logo" src="img/ai-up.png" alt="ai up">
      </div>
      <footer><span>KI-Verordnung · DSGVO · UWG · Urheberrecht · KUG</span></footer>
    </main>`;
  }

  function renderIntro() {
    const i = quiz.intro;
    return `<main class="stage layout-question">
      <div class="content">
        ${figure({ image: i.image, alt: i.imageAlt, caption: "Illustration KI-generiert", label: "Akademie Morgenrot" })}
        <section class="question mark">
          <p class="kicker">${esc(i.kicker)}</p>
          <h1>${esc(i.title)}</h1>
          <div class="intro-text">${i.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
          <div class="actions">
            <button type="button" class="button" data-action="begin">Los geht’s</button>
          </div>
        </section>
      </div>
      ${footer("Intro")}
    </main>`;
  }

  function renderQuestion() {
    const q = quiz.questions[state.index];
    if (!state.order[q.id]) {
      state.order[q.id] = shuffle(q.options.map((o) => o.id));
      save();
    }
    const first = chosenOption(q);
    const shown = shownOption(q);
    const tried = triedOptions(q);
    const options = state.order[q.id].map((id) => optionOf(q, id));
    const pad = String(q.id).padStart(2, "0");

    // Nach der Entscheidung bleiben alle Optionen wählbar. Bewertet sind nur die schon ausprobierten.
    const answers = options.map((o) => {
      const t = TYPES[o.type];
      const isShown = shown && o.id === shown.id;
      let cls = "answer";
      if (isShown) cls += ` is-chosen v-${t.cls}`;
      else if (shown && tried.includes(o.id)) cls += " is-tried";
      const pressed = shown ? isShown : o.id === selected;
      const label = shown && o.id === first.id && first.id !== shown.id ? `${t.label} · erste Wahl` : t.label;
      return `<li><button type="button" class="${cls}" data-option="${o.id}" aria-pressed="${pressed}" ${isShown ? "disabled" : ""}>
        <span class="answer-text">${esc(o.text)}</span>
        ${shown && tried.includes(o.id) ? `<span class="verdict v-${t.cls}">${label}</span>` : ""}
      </button></li>`;
    }).join("");

    let below;
    if (shown) {
      const t = TYPES[shown.type];
      const stop = shown.type === "verboten";
      const title = stop ? `${t.title} – wähle eine rechtssichere Variante` : t.title;
      // Bei „verboten“ sagt es schon der Titel, bei „sehr gut“ gibt es nichts Besseres
      const hint = stop || shown.type === "sehrgut" ? "" : "Umentscheiden? Klick oben eine andere Option an.";
      const last = state.index === quiz.questions.length - 1;
      below = `<div class="feedback fb-${t.cls}" role="status">
        <div class="box">
          <h2>${title}</h2>
          <p>${esc(shown.feedback)}</p>
          ${shown.law || hint ? `<p class="fb-meta">${shown.law ? `<span class="law">${esc(shown.law)}</span>` : ""}${hint ? `<span class="fb-hint">${esc(hint)}</span>` : ""}</p>` : ""}
        </div>
        <button type="button" class="button" data-action="next" ${stop ? "disabled" : ""}>${last ? "Zum Launch" : "Weiter"}</button>
      </div>`;
    } else {
      below = `<div class="actions"><button type="button" class="button" data-action="decide" ${selected ? "" : "disabled"}>Entscheiden</button></div>`;
    }

    return `<main class="stage layout-question layout-decision ${state.index % 2 ? "is-image-right" : ""}">
      <div class="content">
        ${renderPanel(q, shown, pad)}
        <section class="question mark">
          <p class="kicker">Kapitel ${q.chapter} · ${esc(quiz.chapters[q.chapter - 1])}</p>
          <p class="situation"><strong>${esc(q.title)}.</strong> ${esc(q.situation)}</p>
          <h1>${esc(q.question)}</h1>
          <ol class="answers">${answers}</ol>
          ${below}
        </section>
      </div>
      ${footer(`${state.index + 1} / ${quiz.questions.length} · ${points()} Ethik-Punkte`)}
    </main>`;
  }

  /** Bildspalte: Illustration, Stopp-Bild oder Live-Ergebnis der KI. */
  function renderPanel(q, chosen, pad) {
    const storyFigure = () =>
      figure({ image: q.image, alt: q.imageAlt, caption: "Illustration KI-generiert", label: q.title });

    if (!chosen) return storyFigure();
    if (chosen.type === "verboten") {
      const s = quiz.special.stopp;
      return figure({ image: s.image, alt: s.imageAlt, caption: "Mira stoppt diese Variante", label: "Stopp!", extraClass: "is-stop" });
    }
    if (!q.live) {
      if (chosen.type === "grau" && quiz.special.grau.image) {
        const s = quiz.special.grau;
        return figure({ image: s.image, alt: s.imageAlt, caption: "Willkommen in der Grauzone", label: "Grauzone" });
      }
      return storyFigure();
    }

    const head = `<p class="live-kicker">Live-Ergebnis · KI-generiert</p><h3>${esc(q.live.label)}</h3>`;
    if (q.live.type === "image") {
      return `<figure class="quiz-image live-panel" id="live-panel">
        <div class="live-card live-image">${head}<div class="live-body" id="live-body">${loading("Die Bild-KI malt … das kann bis zu einer Minute dauern.")}</div>
        <p class="live-note" id="live-note"></p></div>
      </figure>`;
    }
    if (q.live.type === "chat") {
      return `<figure class="quiz-image live-panel" id="live-panel">
        <div class="live-card live-chat">${head}
          <div class="chat-log" id="chat-log"></div>
          <form class="chat-form" id="chat-form">
            <label class="visually-hidden" for="chat-input">Deine Frage an den Chatbot</label>
            <input id="chat-input" name="message" maxlength="300" autocomplete="off" placeholder="Frag den Chatbot etwas …">
            <button type="submit" class="button no-arrow">Senden</button>
          </form>
          <p class="live-note" id="live-note">Deine Eingaben gehen zur Antwort an einen KI-Dienst (Replicate). Bitte keine persönlichen Daten eingeben.</p>
        </div>
      </figure>`;
    }
    return `<figure class="quiz-image live-panel" id="live-panel">
      <div class="live-card">${head}<div class="live-body" id="live-body">${loading("Die KI schreibt …")}</div>
      <p class="live-note" id="live-note"></p></div>
    </figure>`;
  }

  const loading = (text) => `<div class="live-loading"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(text)}</span></div>`;

  /** Lädt (einmal pro Frage) das Live-Ergebnis und füllt das Panel. */
  async function fillLive(q) {
    const chosen = shownOption(q);
    if (!q.live || !chosen || chosen.type === "verboten") return;
    if (q.live.type === "chat") return renderChat(q, chosen);

    const body = document.getElementById("live-body");
    const note = document.getElementById("live-note");
    const key = `${q.id}:${chosen.id}`;
    let result = state.liveCache[key] || (state.live[q.id]?.option === chosen.id ? state.live[q.id] : null);
    if (!result) {
      try {
        const data = await api(q.live.type === "image" ? "/api/image" : "/api/text", { q: q.id, option: chosen.id });
        result = { option: chosen.id, ...data };
      } catch (error) {
        result = { option: chosen.id, text: null, url: null, source: "fallback", error: error.message };
      }
      state.liveCache[key] = result;
    }
    // Die Kampagne (Plakat, Claim) nutzt das Ergebnis der aktuell gewählten Option,
    // sofern der Spieler nicht inzwischen schon wieder umentschieden hat
    if (shownOption(q)?.id === chosen.id) state.live[q.id] = result;
    save();
    if (shownOption(q)?.id !== chosen.id) return;
    // Panel könnte inzwischen weg sein (Spieler war schneller)
    if (!document.body.contains(body)) return;

    if (q.live.type === "image") {
      const caption = chosen.caption || "Bild KI-generiert";
      if (result.url) {
        body.innerHTML = `<img class="live-img" src="${esc(result.url)}" alt="${esc(q.live.label)}: von der Bild-KI erzeugtes Motiv">
          <p class="live-caption">${esc(caption)}</p>`;
      } else {
        body.innerHTML = q.image
          ? `<img class="live-img" src="${esc(q.image)}" alt="${esc(q.imageAlt)}"><p class="live-caption">${esc(caption)}</p>`
          : placeholder(q.live.label, q.imageAlt);
      }
    } else {
      body.innerHTML = result.text ? formatLiveText(result.text) : "<p>Kein Ergebnis.</p>";
    }
    note.textContent = SOURCE_NOTES[result.source] || "";
  }

  function renderChat(q, chosen) {
    const log = document.getElementById("chat-log");
    const form = document.getElementById("chat-form");
    if (!log || !form) return;
    const userTurns = state.chat.filter((m) => m.role === "user").length;
    const bubbles = [{ role: "assistant", content: chosen.greeting }, ...state.chat]
      .map((m) => `<p class="bubble ${m.role === "user" ? "from-user" : "from-bot"}">${esc(m.content)}</p>`)
      .join("");
    log.innerHTML = bubbles + (state.chatPending ? `<p class="bubble from-bot">${loading("tippt …")}</p>` : "");
    log.scrollTop = log.scrollHeight;
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const done = userTurns >= MAX_CHAT_TURNS;
    input.disabled = button.disabled = done || Boolean(state.chatPending);
    if (done) input.placeholder = "Genug getestet – weiter geht’s!";
  }

  async function sendChat(text) {
    const q = quiz.questions[state.index];
    const chosen = shownOption(q);
    state.chat.push({ role: "user", content: text.slice(0, 300) });
    state.chatPending = true;
    renderChat(q, chosen);
    try {
      const data = await api("/api/chat", { option: chosen.id, messages: state.chat });
      state.chat.push({ role: "assistant", content: data.text });
      if (data.source !== "ai") document.getElementById("live-note").textContent = SOURCE_NOTES[data.source];
    } catch (error) {
      state.chat.pop();
      document.getElementById("live-note").textContent = error.message;
    }
    state.chatPending = false;
    save();
    renderChat(q, chosen);
  }

  function renderResult() {
    const score = points();
    const result = [...quiz.results].reverse().find((r) => score >= r.min);
    const counts = { verboten: 0, grau: 0, gut: 0, sehrgut: 0 };
    quiz.questions.forEach((q) => { const o = chosenOption(q); if (o) counts[o.type] += 1; });
    const visual = state.live[11]?.url || quiz.questions[10].image || quiz.special.ende.image;

    return `<main class="stage layout-result layout-final">
      <div class="content">
        <div class="poster">
          ${visual ? `<img src="${esc(visual)}" alt="Key Visual der Kampagne" data-label="KI-Kompass">` : placeholder("KI-Kompass", "Key Visual")}
          <div class="poster-text">
            <p class="poster-kicker">KI-Kompass für Teams</p>
            <p class="poster-claim">${esc(claimFromState())}</p>
            <p class="poster-sub">Akademie Morgenrot</p>
          </div>
          ${visual ? '<span class="poster-badge">Bild KI-generiert</span>' : ""}
        </div>
        <div class="text">
          <p class="kicker">Die Kampagne ist online</p>
          <p class="score">${score}<small> / ${quiz.maxPoints} Ethik-Punkte</small></p>
          <h1 class="mark">${esc(result.title)}</h1>
          <p class="subtitle" id="summary">${esc(state.summary || result.text)}</p>
          <ul class="stats">
            <li class="v-best">${counts.sehrgut}× sehr gut</li>
            <li class="v-good">${counts.gut}× gut</li>
            <li class="v-grey">${counts.grau}× Grauzone</li>
            <li class="v-stop">${counts.verboten}× gestoppt</li>
          </ul>
          <div class="actions">
            <button type="button" class="button" data-action="review">Rückblick</button>
            <button type="button" class="button is-secondary" data-action="restart">Noch einmal</button>
          </div>
        </div>
      </div>
      <footer>
        <button type="button" class="brand" data-action="home">ai up</button>
        <span>Akademie Morgenrot und alle Personen sind frei erfunden.</span>
        <span class="page">${quiz.questions.length} / ${quiz.questions.length}</span>
      </footer>
    </main>`;
  }

  async function fillSummary() {
    if (state.summary) return;
    try {
      const data = await api("/api/summary", { answers: state.answers });
      state.summary = data.text;
      save();
      const el = document.getElementById("summary");
      if (el) el.textContent = data.text;
    } catch {
      /* Standardtext bleibt stehen */
    }
  }

  function renderReview() {
    const items = quiz.questions.map((q) => {
      const o = chosenOption(q);
      if (!o) return "";
      const t = TYPES[o.type];
      const last = shownOption(q);
      const changed = last.id !== o.id;
      const best = q.options.find((x) => x.type === "sehrgut");
      return `<li class="review-item">
        <p class="review-head"><span class="review-num">${q.id}</span> <strong>${esc(q.title)}</strong> <span class="verdict v-${t.cls}">${t.label}</span></p>
        <p>${esc(o.text)}</p>
        ${o.law ? `<p class="law">${esc(o.law)}</p>` : ""}
        ${changed ? `<p class="review-best"><strong>Umentschieden zu (${TYPES[last.type].label}):</strong> ${esc(last.text)}</p>` : ""}
        ${o.type !== "sehrgut" && last.type !== "sehrgut" ? `<p class="review-best"><strong>Sehr gut wäre:</strong> ${esc(best.text)}</p>` : ""}
      </li>`;
    }).join("");
    return `<main class="stage layout-review">
      <div class="content">
        <div class="review-intro mark">
          <p class="kicker">Rückblick</p>
          <h1>Deine 20 Entscheidungen</h1>
          <p class="muted">Die Rechtsbezüge sind vereinfacht dargestellt und ersetzen keine Rechtsberatung. Stand: November 2026.</p>
          <div class="actions">
            <button type="button" class="button" data-action="result">Zum Ergebnis</button>
          </div>
        </div>
        <ol class="review">${items}</ol>
      </div>
      ${footer("Rückblick")}
    </main>`;
  }

  // ---------- Steuerung ----------

  function render() {
    const screens = { start: renderStart, intro: renderIntro, question: renderQuestion, result: renderResult, review: renderReview };
    app.innerHTML = (screens[state.screen] || renderStart)();
    document.querySelector('meta[name="theme-color"]').content = state.screen === "result" ? "#121217" : "#ffffff";
    bindImageFallbacks();
    if (state.screen === "question") fillLive(quiz.questions[state.index]);
    if (state.screen === "result") fillSummary();
  }

  function go(screen) {
    state.screen = screen;
    selected = null;
    save();
    render();
    window.scrollTo(0, 0);
  }

  app.addEventListener("click", (event) => {
    const optionButton = event.target.closest("[data-option]");
    if (optionButton && !optionButton.disabled) {
      const q = quiz.questions[state.index];
      if (state.answers[q.id]) {
        // Umentscheiden nach der Rückmeldung: sofort neue Rückmeldung zeigen
        const id = optionButton.dataset.option;
        state.revised[q.id] = id;
        state.tried[q.id] = [...new Set([...triedOptions(q), id])];
        if (q.live?.type === "chat") state.chat = [];
        save();
        render();
        app.querySelector(".feedback")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      selected = optionButton.dataset.option;
      app.querySelectorAll("[data-option]").forEach((b) => b.setAttribute("aria-pressed", String(b === optionButton)));
      const decide = app.querySelector('[data-action="decide"]');
      if (decide) decide.disabled = false;
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const q = quiz.questions[state.index];
    switch (action) {
      case "home": go("start"); break;
      case "intro": go("intro"); break;
      case "begin": state.index = 0; go("question"); break;
      case "continue": go("question"); break;
      case "decide":
        if (!selected) return;
        state.answers[q.id] = selected;
        state.tried[q.id] = [selected];
        delete state.revised[q.id];
        if (q.live?.type === "chat") state.chat = [];
        selected = null;
        save();
        render();
        // Rückmeldung sichtbar machen (Handy: Seite scrollt, Desktop: Fragenspalte scrollt)
        app.querySelector(".feedback")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        break;
      case "next":
        if (shownOption(q)?.type === "verboten") return;
        if (state.index < quiz.questions.length - 1) {
          state.index += 1;
          go("question");
        } else {
          go("result");
        }
        break;
      case "result": go("result"); break;
      case "review": go("review"); break;
      case "restart": state = freshState(); go("intro"); break;
    }
  });

  app.addEventListener("submit", (event) => {
    if (event.target.id !== "chat-form") return;
    event.preventDefault();
    const input = event.target.querySelector("input");
    const text = input.value.trim();
    if (!text || state.chatPending) return;
    input.value = "";
    sendChat(text);
  });

  async function init() {
    try {
      quiz = await api("/api/quiz");
    } catch {
      app.querySelector(".subtitle").textContent = "Das Quiz konnte nicht geladen werden. Bitte die Seite neu laden.";
      return;
    }
    state = loadState();
    state.chatPending = false;
    if (state.index >= quiz.questions.length) state.index = quiz.questions.length - 1;
    // Nach dem Neuladen auf der Startseite beginnen, Fortschritt bleibt erhalten
    if (state.screen !== "result" && state.screen !== "review") state.screen = "start";
    render();
  }

  init();
})();
