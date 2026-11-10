// Kampagnenplan als PDF-Datei: wird erst beim Klick auf „Kampagnenplan herunterladen“ geladen
// und baut das Dokument mit jsPDF (public/vendor) direkt im Browser. Nichts davon geht an den Server.
//
// Erwartet die Daten aus app.js (planData) und lädt die Datei mit doc.save() herunter.

(() => {
  "use strict";

  const C = {
    primary: "#ff5722", primarySoft: "#ffeae2", heading: "#121217", text: "#26272b", muted: "#6b7280",
    accent: "#4f46e5", accentSoft: "#e7e6ff", grey: "#9a5b00", greySoft: "#fff1d1", surface: "#f5f5f7", line: "#e4e5ea",
  };
  const VERDICT = {
    stop: [C.primarySoft, C.primary], grey: [C.greySoft, C.grey], good: [C.accentSoft, C.accent], best: [C.accent, "#ffffff"],
  };
  const PT = 0.3528; // Millimeter pro Punkt
  const PAGE = { w: 210, h: 297, margin: 18, top: 18, bottom: 22 };
  const WIDTH = PAGE.w - 2 * PAGE.margin;
  const INDENT = 8; // Spalte für die Nummer der Entscheidung

  // ---------- Laden ----------

  async function fontBase64(url) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  /** Lädt ein Bild und wandelt es in ein JPEG um (jsPDF kann kein WebP). */
  async function imageData(url, max = 1000) {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/jpeg", 0.86), ratio: canvas.height / canvas.width };
    } catch {
      return null; // Bild fehlt: Plan entsteht trotzdem
    }
  }

  // ---------- Satz ----------

  function font(doc, bold, size, color) {
    doc.setFont("Geist", bold ? "bold" : "normal");
    doc.setFontSize(size);
    if (color) doc.setTextColor(color);
  }

  const lineHeight = (size, factor = 1.4) => size * PT * factor;

  /** Bricht Textabschnitte (normal/fett gemischt) auf eine Breite um. */
  function wrap(doc, segments, size, width) {
    const lines = [];
    let line = [];
    let x = 0;
    const push = (text, bold, w) => {
      const last = line.at(-1);
      if (last && last.bold === bold) last.text += text;
      else line.push({ text, bold, x });
      x += w;
    };
    for (const seg of segments) {
      for (const word of String(seg.text).split(/(\s+)/).filter(Boolean)) {
        font(doc, seg.bold, size);
        if (/^\s+$/.test(word)) {
          if (x > 0) push(" ", seg.bold, doc.getTextWidth(" "));
          continue;
        }
        const w = doc.getTextWidth(word);
        if (x > 0 && x + w > width) {
          lines.push(line);
          line = [];
          x = 0;
        }
        push(word, seg.bold, w);
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function drawLines(doc, lines, x, y, size, color, factor) {
    lines.forEach((line, i) => {
      line.forEach((piece) => {
        font(doc, piece.bold, size, color);
        doc.text(piece.text.trimEnd(), x + piece.x, y + i * lineHeight(size, factor), { baseline: "top" });
      });
    });
    return lines.length * lineHeight(size, factor);
  }

  function label(doc, text, x, y, color = C.primary) {
    font(doc, true, 7, color);
    doc.text(text.toUpperCase(), x, y, { baseline: "top", charSpace: 0.25 });
    return 4.4;
  }

  // ---------- Dokument ----------

  async function download(plan) {
    const [regular, semibold, visual, liveImages] = await Promise.all([
      fontBase64("fonts/geist/geist-sans-regular.ttf"),
      fontBase64("fonts/geist/geist-sans-semibold.ttf"),
      plan.visual ? imageData(plan.visual) : null,
      Promise.all(plan.chapters.flatMap((c) => c.items).map((item) => (item.live?.image ? imageData(item.live.image, 700) : null))),
    ]);

    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    doc.addFileToVFS("Geist-Regular.ttf", regular);
    doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    doc.addFileToVFS("Geist-SemiBold.ttf", semibold);
    doc.addFont("Geist-SemiBold.ttf", "Geist", "bold");
    doc.setProperties({
      title: "Kampagnenplan „KI-Kompass für Teams“",
      subject: "Kampagnenplanung aus dem Lernspiel „Die KI-Kampagne“",
      author: "Akademie Morgenrot",
      creator: "Die KI-Kampagne · ai up",
    });

    const m = PAGE.margin;
    let y = PAGE.top;
    const ensure = (h) => {
      if (y + h > PAGE.h - PAGE.bottom) {
        doc.addPage();
        y = PAGE.top;
      }
    };

    // Kopf
    y += label(doc, "Akademie Morgenrot · Interne Kampagnenplanung", m, y) + 0.6;
    y += drawLines(doc, wrap(doc, [{ text: "Kampagnenplan „KI-Kompass für Teams“", bold: true }], 19, WIDTH), m, y, 19, C.heading, 1.2) + 1.2;
    y += drawLines(doc, wrap(doc, [{ text: `Stand ${plan.date} · zur Besprechung mit Jonas` }], 9.5, WIDTH), m, y, 9.5, C.muted);
    y += 3.5;
    doc.setDrawColor(C.primary);
    doc.setLineWidth(0.6);
    doc.line(m, y, m + WIDTH, y);
    y += 7;

    // Auf einen Blick: Key Visual, Claim, Steckbrief, Punkte
    const visualW = 58;
    const colX = visual ? m + visualW + 7 : m;
    const colW = visual ? WIDTH - visualW - 7 : WIDTH;
    let cy = y;
    cy += label(doc, "Claim", colX, cy);
    cy += drawLines(doc, wrap(doc, [{ text: plan.claim, bold: true }], 14, colW), colX, cy, 14, C.heading, 1.25) + 1;
    if (plan.sub) cy += drawLines(doc, wrap(doc, [{ text: plan.sub }], 10, colW), colX, cy, 10, C.text);
    cy += 3.5;
    cy += label(doc, "Steckbrief", colX, cy);
    cy += drawLines(doc, wrap(doc, [{ text: plan.summary }], 10, colW), colX, cy, 10, C.text);
    cy += 3.5;
    cy += label(doc, "Ethik-Punkte", colX, cy);
    cy += drawLines(doc, wrap(doc, [{ text: `${plan.score} von ${plan.max}`, bold: true }], 10, colW), colX, cy, 10, C.heading);
    let vy = y;
    if (visual) {
      const h = visualW * visual.ratio;
      doc.addImage(visual.data, "JPEG", m, y, visualW, h, undefined, "FAST");
      vy = y + h + 3.5;
      label(doc, "Key Visual · KI-generiert", m, vy, C.muted);
      vy += 4.4;
    }
    y = Math.max(cy, vy) + 5;

    // Entscheidungen
    let imageIndex = 0;
    const items = plan.chapters.map((chapter) => chapter.items.map((item) => ({ item, image: liveImages[imageIndex++] })));

    const measureItem = ({ item, image }) => {
      const textW = WIDTH - INDENT;
      const title = wrap(doc, [{ text: item.title, bold: true }], 10.5, textW - 34);
      const measure = wrap(doc, [{ text: "Maßnahme: ", bold: true }, { text: item.measure }], 9.5, textW);
      let liveH = 0;
      let liveLines = [];
      if (item.live) {
        liveLines = item.live.lines.map((segments) => wrap(doc, segments, 9, textW - 8));
        liveH = 3 + 4.4 + liveLines.reduce((sum, l) => sum + l.length * lineHeight(9) + 1, 0) + (image ? 45 * image.ratio + 1.5 : 0) + 2;
      }
      const h = title.length * lineHeight(10.5, 1.25) + 1 + measure.length * lineHeight(9.5) + (liveH ? liveH + 2 : 0) + 4.5;
      return { title, measure, liveLines, liveH, h };
    };

    const drawItem = ({ item, image }, layout) => {
      ensure(Math.min(layout.h, PAGE.h - PAGE.top - PAGE.bottom));
      const x = m + INDENT;
      font(doc, true, 10.5, C.primary);
      doc.text(String(item.num), m, y, { baseline: "top" });
      drawLines(doc, layout.title, x, y, 10.5, C.heading, 1.25);

      // Bewertung als Pille rechts
      const [bg, fg] = VERDICT[item.verdict.cls];
      font(doc, true, 6.8);
      const pill = item.verdict.label.toUpperCase();
      const pw = doc.getTextWidth(pill) + pill.length * 0.2 + 4.4;
      doc.setFillColor(bg);
      doc.roundedRect(m + WIDTH - pw, y - 0.2, pw, 4.4, 2.2, 2.2, "F");
      font(doc, true, 6.8, fg);
      doc.text(pill, m + WIDTH - pw + 2.2, y + 0.75, { baseline: "top", charSpace: 0.2 });

      y += layout.title.length * lineHeight(10.5, 1.25) + 1;
      y += drawLines(doc, layout.measure, x, y, 9.5, C.text);

      if (item.live) {
        y += 2;
        doc.setFillColor(C.surface);
        doc.rect(x, y, WIDTH - INDENT, layout.liveH, "F");
        doc.setFillColor(C.accent);
        doc.rect(x, y, 0.8, layout.liveH, "F");
        let ly = y + 3;
        ly += label(doc, `${item.live.label} · KI-generiert`, x + 4, ly, C.accent);
        layout.liveLines.forEach((lines) => {
          ly += drawLines(doc, lines, x + 4, ly, 9, C.text) + 1;
        });
        if (image) {
          doc.addImage(image.data, "JPEG", x + 4, ly + 0.5, 45, 45 * image.ratio, undefined, "FAST");
        }
        y += layout.liveH;
      }
      y += 4.5;
    };

    plan.chapters.forEach((chapter, ci) => {
      const layouts = items[ci].map(measureItem);
      // Überschrift nie allein am Seitenende
      ensure(12 + (layouts[0]?.h || 0));
      doc.setDrawColor(C.line);
      doc.setLineWidth(0.3);
      doc.line(m, y, m + WIDTH, y);
      y += 4;
      font(doc, true, 12, C.heading);
      doc.text(chapter.title, m, y, { baseline: "top" });
      y += 8;
      items[ci].forEach((entry, i) => drawItem(entry, layouts[i]));
    });

    // Schlussbemerkung
    const foot = wrap(doc, [{ text: "Lernspiel „Die KI-Kampagne“ von ai up. Keine Rechtsberatung, Stand November 2026. Texte und Bilder mit „KI-generiert“ hat eine KI erstellt." }], 8, WIDTH);
    ensure(foot.length * lineHeight(8) + 5);
    doc.setDrawColor(C.line);
    doc.line(m, y, m + WIDTH, y);
    y += 3;
    drawLines(doc, foot, m, y, 8, C.muted);

    // Seitenzahlen
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      font(doc, false, 7.5, C.muted);
      doc.text("Kampagnenplan „KI-Kompass für Teams“ · Akademie Morgenrot", m, PAGE.h - 12, { baseline: "top" });
      doc.text(`Seite ${p} von ${pages}`, m + WIDTH, PAGE.h - 12, { baseline: "top", align: "right" });
    }

    doc.save(plan.filename);
  }

  window.KampagnenPlan = { download };
})();
