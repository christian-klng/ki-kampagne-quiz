// Die KI-Kampagne – Quiz-Logik (ohne Framework).
// Bildschirme: sprache → start → intro → briefing → frage (20×) → ergebnis → rückblick.
// Alle Texte gibt es auf Deutsch und Englisch: Oberfläche in I18N, Inhalte vom Server (/api/quiz?lang=…).
// Der Fortschritt liegt im localStorage, damit ein Neuladen nichts verliert.

(() => {
  "use strict";

  const app = document.getElementById("app");
  const STORE_KEY = "ki-kampagne-v1";
  const MAX_CHAT_TURNS = 3;

  const POINTS = { verboten: 0, grau: 0, gut: 1, sehrgut: 2 };
  const CLASSES = { verboten: "stop", grau: "grey", gut: "good", sehrgut: "best" };

  // ---------- Oberflächentexte ----------

  const I18N = {
    de: {
      locale: "de-DE",
      docTitle: "Die KI-Kampagne · Quiz",
      types: {
        verboten: { label: "Verboten", title: "Stopp! Mira greift ein" },
        grau: { label: "Fragwürdig", title: "Grauzone – kein Punkt" },
        gut: { label: "Gut · +1", title: "Gut gemacht · +1 Ethik-Punkt" },
        sehrgut: { label: "Sehr gut · +2", title: "Sehr gut · +2 Ethik-Punkte" },
      },
      sources: {
        ai: "Live mit KI erzeugt – Ergebnisse können jedes Mal anders ausfallen.",
        cache: "Dieses Motiv hat die Bild-KI bereits für andere Spielende erzeugt.",
        demo: "Demo-Modus: vorbereitetes Beispiel, keine Live-KI angeschlossen.",
        fallback: "Die Live-KI war nicht erreichbar – hier ein vorbereitetes Beispiel.",
        limit: "Das Tageslimit der Bild-KI ist erreicht – hier die vorbereitete Illustration.",
      },
      course: "KI-Kompass für Teams",
      courseShort: "KI-Kompass",
      academy: "Akademie Morgenrot",
      defaultClaim: "KI sicher im Arbeitsalltag nutzen.",
      error: (status) => `Fehler ${status}`,
      loadError: "Das Quiz konnte nicht geladen werden. Bitte die Seite neu laden.",
      of: "von",
      startKicker: "Quiz · KI im Beruf",
      toResult: "Zum Ergebnis",
      restart: "Neu starten",
      continueAt: (n) => `Weiter bei Entscheidung ${n}`,
      start: "Quiz starten",
      topics: "KI-Verordnung · Datenschutz · Wettbewerbsrecht · Urheberrecht · Recht am eigenen Bild",
      switchLang: "English",
      switchLangLabel: "Switch to English",
      illustration: "Illustration KI-generiert",
      toBriefing: "Weiter zum Briefing",
      audience: "Zielgruppe",
      style: "Schreibstil",
      letsGo: "Los geht’s",
      firstChoice: "erste Wahl",
      pickSafe: "wähle eine rechtssichere Variante",
      toLaunch: "Zum Launch",
      next: "Weiter",
      decide: "Entscheiden",
      chapter: "Kapitel",
      stopCaption: "Mira stoppt diese Variante",
      stopLabel: "Stopp!",
      greyCaption: "Willkommen in der Grauzone",
      greyLabel: "Grauzone",
      liveKicker: "Live-Ergebnis · KI-generiert",
      painting: "Die Bild-KI malt … das kann bis zu einer Minute dauern.",
      writing: "Die KI schreibt …",
      chatLabel: "Deine Frage an den Chatbot",
      chatPlaceholder: "Frag den Chatbot etwas …",
      send: "Senden",
      chatNote: "Deine Eingaben gehen zur Antwort an einen KI-Dienst (Replicate). Bitte keine persönlichen Daten eingeben.",
      typing: "tippt …",
      chatDone: "Genug getestet – weiter geht’s!",
      imageAi: "Bild KI-generiert",
      generatedAlt: "von der Bild-KI erzeugtes Motiv",
      noResult: "Kein Ergebnis.",
      keyVisualAlt: "Key Visual der Kampagne",
      online: "Die Kampagne ist online",
      ethicsPoints: "Ethik-Punkte",
      review: "Rückblick",
      again: "Noch einmal",
      tester: "Test:",
      aiGenerated: "KI-generiert",
      changedTo: "Umentschieden zu",
      reviewTitle: (n) => `Deine ${n} Entscheidungen`,
      reviewText: "Lade deinen Kampagnenplan als PDF herunter und besprich ihn mit Jonas.",
      disclaimer: "Die Rechtsbezüge sind vereinfacht dargestellt und ersetzen keine Rechtsberatung. Stand: November 2026.",
      pdfLabel: "Kampagnenplan als PDF herunterladen",
      pdfButton: "Kampagnenplan",
      pdfBusy: "PDF wird erstellt …",
      pdfFailed: "PDF fehlgeschlagen – noch einmal versuchen",
      pdf: {
        file: "Kampagnenplan-KI-Kompass",
        docTitle: "Kampagnenplan „KI-Kompass für Teams“",
        subject: "Kampagnenplanung aus dem Lernspiel „Die KI-Kampagne“",
        author: "Akademie Morgenrot",
        creator: "Die KI-Kampagne · ai up",
        header: "Akademie Morgenrot · Interne Kampagnenplanung",
        stand: (date) => `Stand ${date} · zur Besprechung mit Jonas`,
        briefing: "Briefing",
        audience: "Zielgruppe: ",
        style: " · Schreibstil: ",
        claim: "Claim",
        summary: "Steckbrief",
        points: "Ethik-Punkte",
        score: (score, max) => `${score} von ${max}`,
        keyVisual: "Key Visual · KI-generiert",
        measure: "Maßnahme: ",
        aiGenerated: "KI-generiert",
        foot: "Lernspiel „Die KI-Kampagne“ von ai up. Keine Rechtsberatung, Stand November 2026. Texte und Bilder mit „KI-generiert“ hat eine KI erstellt.",
        pageFooter: "Kampagnenplan „KI-Kompass für Teams“ · Akademie Morgenrot",
        page: (p, n) => `Seite ${p} von ${n}`,
      },
    },
    en: {
      locale: "en-GB",
      docTitle: "The AI Campaign · Quiz",
      types: {
        verboten: { label: "Prohibited", title: "Stop! Mira steps in" },
        grau: { label: "Questionable", title: "Grey area – no point" },
        gut: { label: "Good · +1", title: "Well done · +1 ethics point" },
        sehrgut: { label: "Very good · +2", title: "Very good · +2 ethics points" },
      },
      sources: {
        ai: "Generated live with AI – results may differ every time.",
        cache: "The image AI already created this visual for other players.",
        demo: "Demo mode: prepared example, no live AI connected.",
        fallback: "The live AI couldn’t be reached – here is a prepared example.",
        limit: "The image AI’s daily limit has been reached – here is the prepared illustration.",
      },
      course: "AI Compass for Teams",
      courseShort: "AI Compass",
      academy: "Morgenrot Academy",
      defaultClaim: "Use AI safely at work.",
      error: (status) => `Error ${status}`,
      loadError: "The quiz could not be loaded. Please reload the page.",
      of: "of",
      startKicker: "Quiz · AI at work",
      toResult: "See result",
      restart: "Start over",
      continueAt: (n) => `Continue at decision ${n}`,
      start: "Start quiz",
      topics: "AI Act · Data protection · Competition law · Copyright · Right to one’s own image",
      switchLang: "Deutsch",
      switchLangLabel: "Auf Deutsch wechseln",
      illustration: "Illustration AI-generated",
      toBriefing: "On to the briefing",
      audience: "Target audience",
      style: "Writing style",
      letsGo: "Let’s go",
      firstChoice: "first choice",
      pickSafe: "choose a legally sound option",
      toLaunch: "To the launch",
      next: "Next",
      decide: "Decide",
      chapter: "Chapter",
      stopCaption: "Mira stops this option",
      stopLabel: "Stop!",
      greyCaption: "Welcome to the grey area",
      greyLabel: "Grey area",
      liveKicker: "Live result · AI-generated",
      painting: "The image AI is painting … this can take up to a minute.",
      writing: "The AI is writing …",
      chatLabel: "Your question for the chatbot",
      chatPlaceholder: "Ask the chatbot something …",
      send: "Send",
      chatNote: "Your messages are sent to an AI service (Replicate) for a reply. Please don’t enter any personal data.",
      typing: "typing …",
      chatDone: "Enough testing – let’s move on!",
      imageAi: "Image AI-generated",
      generatedAlt: "visual created by the image AI",
      noResult: "No result.",
      keyVisualAlt: "Key visual of the campaign",
      online: "The campaign is live",
      ethicsPoints: "ethics points",
      review: "Review",
      again: "Play again",
      tester: "Test:",
      aiGenerated: "AI-generated",
      changedTo: "Changed to",
      reviewTitle: (n) => `Your ${n} decisions`,
      reviewText: "Download your campaign plan as a PDF and discuss it with Jonas.",
      disclaimer: "The legal references are simplified and are not legal advice. As of November 2026.",
      lawKey: "Abbreviations: GDPR = General Data Protection Regulation · AI Act = EU Artificial Intelligence Act · UWG = German Act against Unfair Competition · UrhG = German Copyright Act · KUG = German Art Copyright Act (right to one’s own image) · TDDDG = German Telecommunications Digital Services Data Protection Act · DDG = German Digital Services Act · GG = German Basic Law · BGB = German Civil Code · BetrVG = German Works Constitution Act · EGBGB = Introductory Act to the German Civil Code.",
      pdfLabel: "Download campaign plan as PDF",
      pdfButton: "Campaign plan",
      pdfBusy: "Creating PDF …",
      pdfFailed: "PDF failed – please try again",
      pdf: {
        file: "Campaign-plan-AI-Compass",
        docTitle: "Campaign plan “AI Compass for Teams”",
        subject: "Campaign planning from the learning game “The AI Campaign”",
        author: "Morgenrot Academy",
        creator: "The AI Campaign · ai up",
        header: "Morgenrot Academy · Internal campaign planning",
        stand: (date) => `As of ${date} · for discussion with Jonas`,
        briefing: "Briefing",
        audience: "Target audience: ",
        style: " · Writing style: ",
        claim: "Claim",
        summary: "Campaign summary",
        points: "Ethics points",
        score: (score, max) => `${score} of ${max}`,
        keyVisual: "Key visual · AI-generated",
        measure: "Measure: ",
        aiGenerated: "AI-generated",
        foot: "Learning game “The AI Campaign” by ai up. Not legal advice, as of November 2026. Texts and images marked “AI-generated” were created by an AI.",
        pageFooter: "Campaign plan “AI Compass for Teams” · Morgenrot Academy",
        page: (p, n) => `Page ${p} of ${n}`,
      },
    },
  };
  const LANGS = Object.keys(I18N);
  let T = I18N.de;

  /** Bewertungsstufe in der aktuellen Sprache. */
  const typeOf = (type) => ({ ...T.types[type], points: POINTS[type], cls: CLASSES[type] });

  // Sichtbar „Kampagnenplan ↓“, für Screenreader und Tooltip ausführlich
  const pdfButton = (variant) => `<button type="button" class="button ${variant} is-download" data-action="pdf" aria-label="${T.pdfLabel}" title="${T.pdfLabel}">${T.pdfButton}</button>`;

  let quiz = null;
  const quizzes = {}; // geladene Inhalte je Sprache
  let state = null;
  let selected = null; // gewählte, noch nicht bestätigte Option
  let draft = {}; // Briefing-Auswahl, bevor sie bestätigt ist

  // ---------- Hilfsfunktionen ----------

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // answers: erste Wahl (zählt für die Punkte) · revised: aktuell angezeigte Wahl nach dem Umentscheiden
  // tried: alle schon ausprobierten Optionen · liveCache: Live-Ergebnisse pro Frage und Option
  const freshState = () => ({ screen: "start", lang: null, index: 0, briefing: null, answers: {}, revised: {}, tried: {}, order: {}, live: {}, liveCache: {}, chat: [], summary: null });

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
    const res = await fetch(`${path}?lang=${encodeURIComponent(state?.lang || "de")}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || T.error(res.status));
    return json;
  }

  const optionOf = (q, id) => q.options.find((o) => o.id === id);
  const chosenOption = (q) => optionOf(q, state.answers[q.id]);
  const shownOption = (q) => optionOf(q, state.revised[q.id] || state.answers[q.id]);
  const triedOptions = (q) => state.tried[q.id] || (state.answers[q.id] ? [state.answers[q.id]] : []);

  function points() {
    return quiz.questions.reduce((sum, q) => {
      const o = chosenOption(q);
      return sum + (o ? POINTS[o.type] : 0);
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

  /** Gewählte Zielgruppe und Schreibstil als Klartext, z. B. für Rückblick und PDF. */
  function briefingLabels() {
    const b = state.briefing;
    if (!b) return null;
    const audience = quiz.briefing.audiences.find((a) => a.id === b.audience);
    const style = quiz.briefing.styles.find((x) => x.id === b.style);
    return audience && style ? { audience: audience.label, style: style.label } : null;
  }

  function claimFromState() {
    const live = state.live[2];
    const match = live?.text?.match(/Claim:\s*(.+)/);
    return (match ? match[1] : T.defaultClaim).trim();
  }

  const sublineFromState = () => state.live[2]?.text?.match(/(?:Unterzeile|Subline):\s*(.+)/)?.[1] || "";

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
      <progress class="progress" value="${answered}" max="${q}">${answered} ${T.of} ${q}</progress>
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

  /** Erster Bildschirm: Sprachauswahl, zweisprachig und ohne Quizdaten. */
  function renderLanguage() {
    const button = (lang, label) =>
      `<button type="button" class="button" data-action="lang" data-lang="${lang}" lang="${lang}">${label}</button>`;
    return `<main class="stage layout-title layout-language">
      <div class="content">
        <div class="intro">
          <p class="kicker">Sprache · Language</p>
          <h1><span lang="de">Die KI-Kampagne</span><span class="h1-alt" lang="en">The AI Campaign</span></h1>
          <p class="subtitle"><span lang="de">Wähle deine Sprache.</span> <span lang="en">Choose your language.</span></p>
          <div class="actions">
            ${button("de", "Deutsch")}
            ${button("en", "English")}
          </div>
        </div>
        <img class="title-logo" src="img/ai-up.png" alt="ai up">
      </div>
      <footer><span><span lang="de">KI im Beruf</span> · <span lang="en">AI at work</span></span></footer>
    </main>`;
  }

  function renderStart() {
    const inProgress = Object.keys(state.answers).length > 0 && state.screen !== "result";
    const finished = Object.keys(state.answers).length === quiz.questions.length;
    return `<main class="stage layout-title">
      <div class="content">
        <div class="intro">
          <p class="kicker">${T.startKicker}</p>
          <h1>${esc(quiz.title)}</h1>
          <p class="subtitle">${esc(quiz.subtitle)}</p>
          <p class="meta">${esc(quiz.meta)}</p>
          <div class="actions">
            ${finished
              ? `<button type="button" class="button" data-action="result">${T.toResult}</button>
                 <button type="button" class="button is-secondary" data-action="restart">${T.restart}</button>`
              : inProgress
                ? `<button type="button" class="button" data-action="continue">${T.continueAt(state.index + 1)}</button>
                   <button type="button" class="button is-secondary" data-action="restart">${T.restart}</button>`
                : `<button type="button" class="button" data-action="intro">${T.start}</button>`}
          </div>
          <button type="button" class="lang-switch" data-action="lang" data-lang="${state.lang === "en" ? "de" : "en"}" lang="${state.lang === "en" ? "de" : "en"}" aria-label="${T.switchLangLabel}">${T.switchLang}</button>
        </div>
        <img class="title-logo" src="img/ai-up.png" alt="ai up">
      </div>
      <footer><span>${T.topics}</span></footer>
    </main>`;
  }

  function renderIntro() {
    const i = quiz.intro;
    return `<main class="stage layout-question">
      <div class="content">
        ${figure({ image: i.image, alt: i.imageAlt, caption: T.illustration, label: T.academy })}
        <section class="question mark">
          <p class="kicker">${esc(i.kicker)}</p>
          <h1>${esc(i.title)}</h1>
          <div class="intro-text">${i.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
          <div class="actions">
            <button type="button" class="button" data-action="begin">${T.toBriefing}</button>
          </div>
        </section>
      </div>
      ${footer("Intro")}
    </main>`;
  }

  /** Briefing: Zielgruppe und Schreibstil per Einfachauswahl, steuert alle KI-Inhalte. */
  function renderBriefing() {
    const b = quiz.briefing;
    const group = (name, legend, items) => `<fieldset class="choices">
        <legend>${legend}</legend>
        <div class="choice-list">${items.map((item) => `<label class="choice">
          <input type="radio" name="${name}" value="${esc(item.id)}" ${draft[name] === item.id ? "checked" : ""}>
          <span><strong>${esc(item.label)}</strong><small>${esc(item.desc)}</small></span>
        </label>`).join("")}</div>
      </fieldset>`;
    return `<main class="stage layout-briefing">
      <div class="content">
        <section class="briefing mark">
          <p class="kicker">${esc(b.title)}</p>
          <h1>${esc(b.question)}</h1>
          <p class="muted">${esc(b.text)}</p>
          ${group("audience", `a) ${T.audience}`, b.audiences)}
          ${group("style", `b) ${T.style}`, b.styles)}
          <div class="actions">
            <button type="button" class="button" data-action="briefing-done" ${draft.audience && draft.style ? "" : "disabled"}>${T.letsGo}</button>
          </div>
        </section>
      </div>
      ${footer("Briefing")}
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
      const t = typeOf(o.type);
      const isShown = shown && o.id === shown.id;
      let cls = "answer";
      if (isShown) cls += ` is-chosen v-${t.cls}`;
      else if (shown && tried.includes(o.id)) cls += " is-tried";
      const pressed = shown ? isShown : o.id === selected;
      const label = shown && o.id === first.id && first.id !== shown.id ? `${t.label} · ${T.firstChoice}` : t.label;
      return `<li><button type="button" class="${cls}" data-option="${o.id}" aria-pressed="${pressed}" ${isShown ? "disabled" : ""}>
        <span class="answer-text">${esc(o.text)}</span>
        ${shown && tried.includes(o.id) ? `<span class="verdict v-${t.cls}">${label}</span>` : ""}
      </button></li>`;
    }).join("");

    let below;
    if (shown) {
      const t = typeOf(shown.type);
      const stop = shown.type === "verboten";
      const title = stop ? `${t.title} – ${T.pickSafe}` : t.title;
      const last = state.index === quiz.questions.length - 1;
      below = `<div class="feedback fb-${t.cls}" role="status">
        <div class="box">
          <h2>${title}</h2>
          <p>${esc(shown.feedback)}</p>
          ${shown.law ? `<p class="law">${esc(shown.law)}</p>` : ""}
        </div>
        <button type="button" class="button" data-action="next" ${stop ? "disabled" : ""}>${last ? T.toLaunch : T.next}</button>
      </div>`;
    } else {
      below = `<div class="actions"><button type="button" class="button" data-action="decide" ${selected ? "" : "disabled"}>${T.decide}</button></div>`;
    }

    return `<main class="stage layout-question layout-decision ${state.index % 2 ? "is-image-right" : ""}">
      <div class="content">
        ${renderPanel(q, shown, pad)}
        <section class="question mark">
          <p class="kicker">${T.chapter} ${q.chapter} · ${esc(quiz.chapters[q.chapter - 1])}</p>
          <p class="situation"><strong>${esc(q.title)}.</strong> ${esc(q.situation)}</p>
          <h1>${esc(q.question)}</h1>
          <ol class="answers">${answers}</ol>
          ${below}
        </section>
      </div>
      ${footer(`${state.index + 1} / ${quiz.questions.length}`)}
    </main>`;
  }

  /** Bildspalte: Illustration, Stopp-Bild oder Live-Ergebnis der KI. */
  function renderPanel(q, chosen, pad) {
    const storyFigure = () =>
      figure({ image: q.image, alt: q.imageAlt, caption: T.illustration, label: q.title });

    if (!chosen) return storyFigure();
    if (chosen.type === "verboten") {
      const s = quiz.special.stopp;
      return figure({ image: s.image, alt: s.imageAlt, caption: T.stopCaption, label: T.stopLabel, extraClass: "is-stop" });
    }
    if (!q.live) {
      if (chosen.type === "grau" && quiz.special.grau.image) {
        const s = quiz.special.grau;
        return figure({ image: s.image, alt: s.imageAlt, caption: T.greyCaption, label: T.greyLabel });
      }
      return storyFigure();
    }

    const head = `<p class="live-kicker">${T.liveKicker}</p><h3>${esc(q.live.label)}</h3>`;
    if (q.live.type === "image") {
      return `<figure class="quiz-image live-panel" id="live-panel">
        <div class="live-card live-image">${head}<div class="live-body" id="live-body">${loading(T.painting)}</div>
        <p class="live-note" id="live-note"></p></div>
      </figure>`;
    }
    if (q.live.type === "chat") {
      return `<figure class="quiz-image live-panel" id="live-panel">
        <div class="live-card live-chat">${head}
          <div class="chat-log" id="chat-log"></div>
          <form class="chat-form" id="chat-form">
            <label class="visually-hidden" for="chat-input">${T.chatLabel}</label>
            <input id="chat-input" name="message" maxlength="300" autocomplete="off" placeholder="${T.chatPlaceholder}">
            <button type="submit" class="button no-arrow">${T.send}</button>
          </form>
          <p class="live-note" id="live-note">${T.chatNote}</p>
        </div>
      </figure>`;
    }
    return `<figure class="quiz-image live-panel" id="live-panel">
      <div class="live-card">${head}<div class="live-body" id="live-body">${loading(T.writing)}</div>
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
        const data = await api(q.live.type === "image" ? "/api/image" : "/api/text", { q: q.id, option: chosen.id, briefing: state.briefing });
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
      const caption = chosen.caption || T.imageAi;
      if (result.url) {
        body.innerHTML = `<img class="live-img" src="${esc(result.url)}" alt="${esc(q.live.label)}: ${T.generatedAlt}">
          <p class="live-caption">${esc(caption)}</p>`;
      } else {
        body.innerHTML = q.image
          ? `<img class="live-img" src="${esc(q.image)}" alt="${esc(q.imageAlt)}"><p class="live-caption">${esc(caption)}</p>`
          : placeholder(q.live.label, q.imageAlt);
      }
    } else {
      body.innerHTML = result.text ? formatLiveText(result.text) : `<p>${T.noResult}</p>`;
    }
    note.textContent = T.sources[result.source] || "";
  }

  function renderChat(q, chosen) {
    const log = document.getElementById("chat-log");
    const form = document.getElementById("chat-form");
    if (!log || !form) return;
    const userTurns = state.chat.filter((m) => m.role === "user").length;
    const bubbles = [{ role: "assistant", content: chosen.greeting }, ...state.chat]
      .map((m) => `<p class="bubble ${m.role === "user" ? "from-user" : "from-bot"}">${esc(m.content)}</p>`)
      .join("");
    log.innerHTML = bubbles + (state.chatPending ? `<p class="bubble from-bot">${loading(T.typing)}</p>` : "");
    log.scrollTop = log.scrollHeight;
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const done = userTurns >= MAX_CHAT_TURNS;
    input.disabled = button.disabled = done || Boolean(state.chatPending);
    if (done) input.placeholder = T.chatDone;
  }

  async function sendChat(text) {
    const q = quiz.questions[state.index];
    const chosen = shownOption(q);
    state.chat.push({ role: "user", content: text.slice(0, 300) });
    state.chatPending = true;
    renderChat(q, chosen);
    try {
      const data = await api("/api/chat", { option: chosen.id, messages: state.chat, briefing: state.briefing });
      state.chat.push({ role: "assistant", content: data.text });
      if (data.source !== "ai") document.getElementById("live-note").textContent = T.sources[data.source];
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
    const visual = state.live[11]?.url || quiz.questions[10].image || quiz.special.ende.image;

    return `<main class="stage layout-result layout-final">
      <div class="content">
        <div class="poster">
          ${visual ? `<img src="${esc(visual)}" alt="${T.keyVisualAlt}" data-label="${T.courseShort}">` : placeholder(T.courseShort, "Key Visual")}
          <div class="poster-text">
            <p class="poster-kicker">${T.course}</p>
            <p class="poster-claim">${esc(claimFromState())}</p>
            <p class="poster-sub">${T.academy}</p>
          </div>
          ${visual ? `<span class="poster-badge">${T.imageAi}</span>` : ""}
        </div>
        <div class="text">
          <p class="kicker">${T.online}</p>
          <p class="score">${score}<small> / ${quiz.maxPoints} ${T.ethicsPoints}</small></p>
          <h1 class="mark">${esc(result.title)}</h1>
          <p class="subtitle" id="summary">${esc(state.summary || result.text)}</p>
          <div class="actions">
            <button type="button" class="button" data-action="review">${T.review}</button>
            ${pdfButton("is-secondary")}
            <button type="button" class="button is-secondary no-arrow" data-action="restart">${T.again}</button>
          </div>
        </div>
      </div>
      <footer>
        <button type="button" class="brand" data-action="home">ai up</button>
        <span class="page">${quiz.questions.length} / ${quiz.questions.length}</span>
      </footer>
    </main>`;
  }

  async function fillSummary() {
    if (state.summary) return;
    try {
      const data = await api("/api/summary", { answers: state.answers, briefing: state.briefing });
      state.summary = data.text;
      save();
      const el = document.getElementById("summary");
      if (el) el.textContent = data.text;
    } catch {
      /* Standardtext bleibt stehen */
    }
  }

  /** KI-Ergebnis der zuletzt gewählten Option für den Rückblick (wie im PDF). */
  function reviewLive(q, shown) {
    if (!q.live || shown.type === "verboten") return "";
    const live = state.live[q.id];
    let body = "";
    if (q.live.type === "text" && live?.text) body = formatLiveText(live.text);
    if (q.live.type === "image" && live?.url) {
      body = `<img class="review-live-img" src="${esc(live.url)}" alt="${esc(q.live.label)}: ${T.generatedAlt}" data-label="${esc(q.live.label)}">`;
    }
    if (q.live.type === "chat" && state.chat.length) {
      body = [{ role: "assistant", content: shown.greeting }, ...state.chat]
        .map((m) => `<p><strong>${m.role === "user" ? T.tester : "Chatbot:"}</strong> ${esc(m.content)}</p>`).join("");
    }
    return body ? `<div class="review-live"><p class="review-live-label">${esc(q.live.label)} · ${T.aiGenerated}</p>${body}</div>` : "";
  }

  function renderReview() {
    const items = quiz.questions.map((q) => {
      const o = chosenOption(q);
      if (!o) return "";
      const t = typeOf(o.type);
      const last = shownOption(q);
      const changed = last.id !== o.id;
      return `<li class="review-item">
        <p class="review-head"><span class="review-num">${q.id}</span> <strong>${esc(q.title)}</strong> <span class="verdict v-${t.cls}">${t.label}</span></p>
        <p>${esc(o.text)}</p>
        ${o.law ? `<p class="law">${esc(o.law)}</p>` : ""}
        ${changed ? `<p class="review-best"><strong>${T.changedTo} (${typeOf(last.type).label}):</strong> ${esc(last.text)}</p>` : ""}
        ${reviewLive(q, last)}
      </li>`;
    }).join("");
    return `<main class="stage layout-review">
      <div class="content">
        <div class="review-intro mark">
          <p class="kicker">${T.review}</p>
          <h1>${T.reviewTitle(quiz.questions.length)}</h1>
          <p>${T.reviewText}</p>
          ${briefingLabels() ? `<p class="muted">${T.audience}: ${esc(briefingLabels().audience)} · ${T.style}: ${esc(briefingLabels().style)}</p>` : ""}
          <p class="muted">${T.disclaimer}</p>
          ${T.lawKey ? `<p class="muted law-key">${T.lawKey}</p>` : ""}
          <div class="actions">
            ${pdfButton("")}
            <button type="button" class="button is-secondary" data-action="result">${T.toResult}</button>
          </div>
        </div>
        <ol class="review">${items}</ol>
      </div>
      ${footer(T.review)}
    </main>`;
  }

  // ---------- Kampagnenplan (PDF-Download, gebaut in js/plan-pdf.js) ----------

  /** Inhalt des Kampagnenplans für die Besprechung mit Jonas. */
  function planData() {
    const score = points();
    const result = [...quiz.results].reverse().find((r) => score >= r.min);
    const today = new Date();

    // KI-Text „Label: Inhalt“ wird zu fettem Label plus Text
    const textLines = (text) => String(text).split(/\n+/).filter((l) => l.trim()).map((line) => {
      const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
      return m ? [{ text: `${m[1]}: `, bold: true }, { text: m[2] }] : [{ text: line }];
    });

    const liveOf = (q, shown) => {
      if (!q.live || !shown || shown.type === "verboten") return null;
      const live = state.live[q.id];
      if (q.live.type === "text" && live?.text) return { label: q.live.label, lines: textLines(live.text) };
      if (q.live.type === "image" && live?.url) return { label: q.live.label, lines: shown.caption ? [[{ text: shown.caption }]] : [], image: live.url };
      if (q.live.type === "chat" && state.chat.length) {
        const lines = [{ role: "assistant", content: shown.greeting }, ...state.chat]
          .map((msg) => [{ text: msg.role === "user" ? `${T.tester} ` : "Chatbot: ", bold: true }, { text: msg.content }]);
        return { label: q.live.label, lines };
      }
      return null;
    };

    return {
      t: T.pdf,
      filename: `${T.pdf.file}-${today.toISOString().slice(0, 10)}.pdf`,
      date: today.toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" }),
      briefing: briefingLabels(),
      claim: claimFromState(),
      sub: sublineFromState(),
      summary: state.summary || result.text,
      score,
      max: quiz.maxPoints,
      visual: state.live[11]?.url || null,
      chapters: quiz.chapters.map((name, i) => ({
        title: `${T.chapter} ${i + 1} · ${name}`,
        items: quiz.questions.filter((q) => q.chapter === i + 1 && chosenOption(q)).map((q) => {
          const shown = shownOption(q);
          const t = typeOf(shown.type);
          return { num: q.id, title: q.title, verdict: { label: t.label, cls: t.cls }, measure: shown.text, live: liveOf(q, shown) };
        }),
      })),
    };
  }

  const scripts = {};
  function loadScript(src) {
    scripts[src] ||= new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { delete scripts[src]; reject(new Error(`${src} nicht geladen`)); };
      document.head.append(el);
    });
    return scripts[src];
  }

  let pdfBusy = false;
  async function downloadPlan(button) {
    if (pdfBusy) return;
    pdfBusy = true;
    const setLabel = (text) => { button.setAttribute("aria-label", text); button.title = text; };
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    setLabel(T.pdfBusy);
    try {
      // jsPDF (ca. 400 KB) erst bei Bedarf laden
      await loadScript("vendor/jspdf.umd.min.js");
      await loadScript("js/plan-pdf.js");
      await window.KampagnenPlan.download(planData());
      setLabel(T.pdfLabel);
    } catch (error) {
      console.error(error);
      setLabel(T.pdfFailed);
    } finally {
      button.classList.remove("is-busy");
      button.removeAttribute("aria-busy");
      pdfBusy = false;
    }
  }

  // ---------- Steuerung ----------

  function render() {
    document.documentElement.lang = state.lang || "de";
    document.title = state.lang ? T.docTitle : "Die KI-Kampagne · The AI Campaign";
    if (!state.lang || !quiz) {
      app.innerHTML = renderLanguage();
      return;
    }
    const screens = { start: renderStart, intro: renderIntro, briefing: renderBriefing, question: renderQuestion, result: renderResult, review: renderReview };
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
    const actionEl = event.target.closest("[data-action]");
    const action = actionEl?.dataset.action;
    if (!action) return;
    const q = quiz?.questions[state.index]; // auf dem Sprachbildschirm gibt es noch kein Quiz
    switch (action) {
      case "lang": chooseLanguage(actionEl.dataset.lang); break;
      case "home": go("start"); break;
      case "intro": go("intro"); break;
      case "begin":
        draft = { ...(state.briefing || {}) };
        go("briefing");
        break;
      case "briefing-done":
        if (!draft.audience || !draft.style) return;
        state.briefing = { audience: draft.audience, style: draft.style };
        state.index = 0;
        go("question");
        break;
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
      case "pdf": downloadPlan(actionEl); break;
      case "restart": state = { ...freshState(), lang: state.lang }; go("intro"); break;
    }
  });

  app.addEventListener("change", (event) => {
    const input = event.target;
    if (input.type !== "radio" || !["audience", "style"].includes(input.name)) return;
    draft[input.name] = input.value;
    const done = app.querySelector('[data-action="briefing-done"]');
    if (done) done.disabled = !(draft.audience && draft.style);
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

  /** Lädt die Quizinhalte einer Sprache (einmal pro Sprache) und schaltet die Oberfläche um. */
  async function useLanguage(lang) {
    quizzes[lang] ||= await api("/api/quiz");
    quiz = quizzes[lang];
    T = I18N[lang];
    if (state.index >= quiz.questions.length) state.index = quiz.questions.length - 1;
  }

  async function chooseLanguage(lang) {
    if (!LANGS.includes(lang)) return;
    const previous = state.lang;
    state.lang = lang;
    try {
      await useLanguage(lang);
    } catch {
      state.lang = previous;
      const subtitle = app.querySelector(".subtitle");
      if (subtitle) subtitle.textContent = I18N[lang].loadError;
      return;
    }
    if (previous && previous !== lang) {
      // KI-Texte, Chat und Steckbrief sind in der alten Sprache: neu erzeugen lassen. Bilder bleiben.
      const keepImages = (entries) => Object.fromEntries(Object.entries(entries).filter(([, r]) => r?.url));
      state.live = keepImages(state.live);
      state.liveCache = keepImages(state.liveCache);
      state.chat = [];
      state.summary = null;
    }
    go("start");
  }

  async function init() {
    state = loadState();
    state.chatPending = false;
    if (!LANGS.includes(state.lang)) state.lang = null;
    // Nach dem Neuladen auf der Startseite beginnen, Fortschritt bleibt erhalten
    if (state.screen !== "result" && state.screen !== "review") state.screen = "start";
    if (state.lang) {
      try {
        await useLanguage(state.lang);
      } catch {
        app.querySelector(".subtitle").textContent = I18N[state.lang].loadError;
        return;
      }
    }
    render();
  }

  init();
})();
