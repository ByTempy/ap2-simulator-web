// Training: Lernen und Prüfen im Originalheft, aufgebaut nach dem Vorbild des „APT 2 Prüfungstrainers“.
// Lernen: Teilaufgabe als Ausschnitt der Originalseite, direkt hineinschreiben, Lösung aufdecken, selbst einschätzen (sitzt, unsicher, noch nicht).
// Prüfen: Simulation Seite für Seite im Heft auf Zeit, Claude bewertet, korrigiertes Heft mit Punkten am Rand, Auswertung mit Fazit.
// Eigener Speicher ap2.train = { r: { key: { v, at } }, ans: { key: Antwort }, plan: { date, keys }, fazit: { sid: Text } }, key = Prüfung|Teil|Teilaufgabe
(() => {
  const A = () => window.AP2App;
  const TS = 'ap2.train';
  const tload = () => { const t = A().store.get(TS, {}); t.r = t.r || {}; t.ans = t.ans || {}; t.fazit = t.fazit || {}; return t; };
  const tsave = (t) => A().store.set(TS, t);
  const RATE = [[1, 'Sitzt', 'ok'], [2, 'Unsicher', 'warn'], [3, 'Noch nicht', 'bad']];
  const SIM_KINDS = { Teil1: 'Teil 1', Teil2: 'Teil 2', WiSo: 'WiSo' };
  const app = () => document.getElementById('app');
  const today = () => new Date().toISOString().slice(0, 10);
  const daysLeft = () => { const d = (A().store.get('ap2.settings', {}) || {}).examDate; return d ? Math.ceil((Date.parse(d + 'T00:00') - Date.now()) / 864e5) : null; };
  const dayWord = (d) => d === null ? 'Prüfungstermin auf der Startseite eintragen' : d > 1 ? `Noch ${d} Tage bis zur Prüfung` : d === 1 ? 'Morgen ist Prüfung' : d === 0 ? 'Heute ist Prüfung' : 'Prüfung vorbei';

  // ---------- Daten: alle ITSE-Originalprüfungen mit Teil 1, Teil 2 und WiSo ----------
  let cache = null;
  async function data() {
    if (cache) return cache;
    const list = (await A().api('/api/exams')).filter((e) => /^itse-\d{4}-(sommer|winter)$/.test(e.id)).sort((a, b) => (b.year - a.year) || (b.season || '').localeCompare(a.season || ''));
    const exams = await Promise.all(list.map((e) => A().api(`/api/exams/${e.id}`)));
    const items = [];
    exams.forEach((ex) => ex.parts.forEach((part) => part.tasks.forEach((t) => t.items.forEach((it) => items.push({ key: `${ex.id}|${part.id}|${it.id}`, ex, part, t, it })))));
    const byKey = Object.fromEntries(items.map((o) => [o.key, o]));
    cache = { exams, items, byKey };
    return cache;
  }
  const learnable = (o) => o.part.kind === 'Teil1' || o.part.kind === 'Teil2';
  const itemName = (o) => o.part.kind === 'WiSo' ? `Aufgabe ${o.t.number}` : `${o.t.number} ${o.it.label || ''}`.trim();
  const examShort = (ex) => ex.title.replace(/^Abschlussprüfung\s*/i, '').replace(/\s*[-–]\s*IT-System.*$/i, '').trim() || ex.title;

  // Stapel-Balken: sitzt, unsicher, noch nicht, offen
  function rateBar(list, t) {
    const n = list.length || 1, c = [0, 0, 0, 0]; list.forEach((o) => { const r = t.r[o.key]; c[r ? r.v - 1 : 3]++; });
    return `<div class="tr-bar" role="img" aria-label="${c[0]} sitzen, ${c[1]} unsicher, ${c[2]} noch nicht, ${c[3]} offen">${['ok', 'warn', 'bad'].map((k, i) => c[i] ? `<i class="${k}" style="width:${c[i] / n * 100}%"></i>` : '').join('')}</div>
      <p class="small muted">${c[0]} sitzen, ${c[1]} unsicher, ${c[2]} noch nicht, ${c[3]} offen</p>`;
  }
  const head = (title, lede, crumbs) => `<div class="page-head"><div>${crumbs ? `<p class="small muted">${crumbs}</p>` : ''}<h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div></div>`;
  const back = '<a href="#/training">Training</a>';

  // ---------- Tagesplan: fällige Wiederholungen und neue Teilaufgaben, verteilt bis zum Prüfungstag ----------
  const isDue = (r) => { if (!r || r.v === 1) return false; const age = (Date.now() - Date.parse(r.at)) / 864e5; return r.at.slice(0, 10) < today() && (r.v === 3 || age >= 2); };
  function plan(d, t) {
    if (t.plan && t.plan.date === today()) return t.plan.keys.filter((k) => d.byKey[k]);
    const L = d.items.filter(learnable), due = L.filter((o) => isDue(t.r[o.key])).sort((a, b) => t.r[b.key].v - t.r[a.key].v);
    const open = L.filter((o) => !t.r[o.key]);
    // Teil 2 zuerst: muss mindestens ausreichend sein
    open.sort((a, b) => (a.part.kind === 'Teil2' ? 0 : 1) - (b.part.kind === 'Teil2' ? 0 : 1));
    const days = Math.max(1, daysLeft() || 7), n = Math.min(60, Math.max(10, Math.ceil(open.length / days)));
    const keys = [...due.slice(0, 40), ...open.slice(0, n)].map((o) => o.key);
    t.plan = { date: today(), keys }; tsave(t);
    return keys;
  }
  const queueKeys = (d, t, q) => {
    if (!q) return null;
    if (q === 'heute') return plan(d, t);
    if (q === 'wdh') return d.items.filter((o) => learnable(o) && t.r[o.key] && t.r[o.key].v > 1).sort((a, b) => t.r[b.key].v - t.r[a.key].v || t.r[a.key].at.localeCompare(t.r[b.key].at)).map((o) => o.key);
    if (q === 'zeichnen') return d.items.filter((o) => learnable(o) && (o.it.answer_type === 'sketch' || o.it.needs_figure)).map((o) => o.key);
    if (q.startsWith('thema:')) { const th = q.slice(6); return d.items.filter((o) => learnable(o) && (o.it.topics || []).includes(th)).map((o) => o.key); }
    return null;
  };
  const QNAME = { heute: 'Tagesplan', wdh: 'Wiederholen', zeichnen: 'Zeichnen üben' };
  const qName = (q) => QNAME[q] || (q && q.startsWith('thema:') ? `Thema ${q.slice(6)}` : '');
  const itemHref = (key, q) => `#/training/a/${encodeURIComponent(key)}${q ? `?q=${encodeURIComponent(q)}` : ''}`;

  // ---------- Start ----------
  async function startView() {
    A().setNav('train');
    const d = await data(), t = tload(), L = d.items.filter(learnable), dl = daysLeft();
    const pk = plan(d, t), done = pk.filter((k) => t.r[k] && t.r[k].at.slice(0, 10) === today()).length;
    const wdh = queueKeys(d, t, 'wdh').length;
    const sessions = (await A().api('/api/sessions')).filter((s) => s.source === 'train');
    const simDay = dl !== null && dl >= 0 && dl % 3 === 0;
    const card = (href, title, sub) => `<a class="wiki-card" href="${href}"><span class="wc-title">${title}</span><span class="small muted">${sub}</span></a>`;
    app().innerHTML = `${head('Training', `${dayWord(dl)}. Lernen im Originalheft: Teilaufgabe ansehen, hineinschreiben, Lösung aufdecken und ehrlich einschätzen. Prüfen wie am Prüfungstag: auf Zeit im Heft, Claude bewertet.`)}
      <section class="section"><div class="split"><div class="sheet">
        <p class="small muted">Tagesplan ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2>${pk.length ? done >= pk.length ? 'Für heute geschafft' : `Heute: ${pk.length} Teilaufgaben` : 'Nichts mehr offen'}</h2>
        ${pk.length ? `<div class="tr-bar" role="img" aria-label="${done} von ${pk.length} erledigt"><i class="ok" style="width:${done / pk.length * 100}%"></i></div><p class="small muted">${done} von ${pk.length} erledigt. Erledigt ist eine Teilaufgabe, sobald du sie heute eingeschätzt hast.</p>` : ''}
        <div class="actions" style="margin-top:var(--space-sm)"><a class="btn primary" href="#/training/heute">${done ? 'Weitermachen' : 'Tagesplan öffnen'}</a>${wdh ? `<a class="btn" href="${itemHref(queueKeys(d, t, 'wdh')[0], 'wdh')}">Wiederholen (${wdh})</a>` : ''}</div>
        ${simDay ? '<div class="panel"><p><strong>Heute ist eine Simulation dran.</strong> Alle drei Tage eine ganze Prüfung auf Zeit, damit du das Tempo übst.</p><p class="actions"><a class="btn sm" href="#/training/sim">Simulation starten</a></p></div>' : ''}
      </div><div>
        <h3>Stand</h3>
        ${['Teil2', 'Teil1'].map((k) => { const l = L.filter((o) => o.part.kind === k); return `<p style="margin-top:var(--space-sm)"><strong>${A().kindLabel(k)}</strong></p>${rateBar(l, t)}`; }).join('')}
      </div></div></section>
      <section class="section"><h2>Lernen</h2><div class="wiki-grid">
        ${card('#/training/lernen', 'Prüfungen', `${d.exams.length} Originalprüfungen, jede Teilaufgabe einzeln`)}
        ${card('#/training/heute', 'Tagesplan', 'Was heute dran ist, bis zur Prüfung verteilt')}
        ${card('#/training/wdh', 'Wiederholen', wdh ? `${wdh} Teilaufgaben sitzen noch nicht` : 'Alles, was unsicher oder noch nicht sitzt')}
        ${card('#/training/themen', 'Nach Themen', 'Alle Teilaufgaben eines Themas hintereinander')}
        ${card('#/training/zeichnen', 'Zeichnen üben', 'Skizzen, Schaltungen und Aufbauten')}
        ${card('#/training/merk', 'Merkzettel', 'Die wichtigsten Merksätze je Thema auf einer Seite')}
      </div></section>
      <section class="section"><h2>Prüfen</h2><div class="wiki-grid">
        ${card('#/training/sim', 'Simulation', 'Ein Prüfungsteil im Originalheft auf Zeit, 90 Minuten')}
        ${card('#/training/sim?art=aufgabe', 'Eine Aufgabe auf Zeit', '0,9 Minuten je Punkt, für zwischendurch')}
        ${card('#/training/sim?art=tag', 'Prüfungstag', 'Teil 1, Teil 2 und WiSo eines Termins hintereinander')}
      </div>
      ${sessions.length ? `<h3 style="margin-top:var(--space-lg)">Deine Simulationen</h3><div class="doc-rows">${sessions.slice(0, 12).map((s) => `<div class="doc-row"><p class="doc-name">${A().esc(s.exam_title)} <span class="small muted">${A().fmtDate(s.created_at)}${s.task !== undefined && s.task !== null ? `, Aufgabe ${s.task}` : s.part_order.length > 1 ? ', Prüfungstag' : ''}</span></p><div class="actions">${s.finished ? `<span class="small">${A().fmtPts(Math.round(s.total_points * 2) / 2)} von ${s.total_max} Punkten</span><a class="btn sm" href="#/training/ergebnis/${s.id}">Auswertung</a>` : `<a class="btn sm primary" href="#/training/sim/${s.id}">Fortsetzen</a>`}</div></div>`).join('')}</div>` : ''}
      </section>`;
  }

  // ---------- Prüfungen zum Lernen ----------
  async function lernenView() {
    A().setNav('train');
    const d = await data(), t = tload();
    app().innerHTML = `${head('Prüfungen', 'Wähle einen Prüfungsteil. Du arbeitest Teilaufgabe für Teilaufgabe im Ausschnitt des Originalhefts.', back)}
      <div class="wiki-grid">${d.exams.map((ex) => `<div class="wiki-card"><span class="wc-title">${A().esc(examShort(ex))}</span>
        ${ex.parts.filter((p) => p.kind !== 'WiSo').map((p) => { const l = d.items.filter((o) => o.ex === ex && o.part === p); const nx = l.find((o) => !t.r[o.key]) || l[0];
          return `<a href="${itemHref(nx.key)}" style="text-decoration:none;color:inherit"><span class="small"><strong>${A().esc(A().kindLabel(p.kind))}</strong>, ${l.length} Teilaufgaben, ${p.max_points} Punkte</span>${rateBar(l, t)}</a>`; }).join('')}</div>`).join('')}</div>`;
  }

  // ---------- Listen: Tagesplan, Wiederholen, Themen, Zeichnen ----------
  function listRows(d, t, keys, q) {
    return keys.length ? `<div class="doc-rows">${keys.map((k) => { const o = d.byKey[k], r = t.r[k]; return `<div class="doc-row"><p class="doc-name">${A().esc(examShort(o.ex))}, ${A().esc(SIM_KINDS[o.part.kind])} ${A().esc(itemName(o))} <span class="small muted">${A().esc(String(o.it.text || '').slice(0, 110))}</span></p><div class="actions">${r ? `<span class="tag ${RATE[r.v - 1][2]}">${RATE[r.v - 1][1]}${r.at.slice(0, 10) === today() ? ', heute' : ''}</span>` : '<span class="tag">neu</span>'}<a class="btn sm" href="${itemHref(k, q)}">Öffnen</a></div></div>`; }).join('')}</div>` : '<p class="empty">Hier ist gerade nichts.</p>';
  }
  async function queueView(q) {
    A().setNav('train');
    const d = await data(), t = tload(), keys = queueKeys(d, t, q);
    const first = keys.find((k) => !(t.r[k] && t.r[k].at.slice(0, 10) === today())) || keys[0];
    const lede = { heute: `Zuerst fällige Wiederholungen, dann neue Teilaufgaben. Die Menge ist so berechnet, dass bis zur Prüfung jede Teilaufgabe einmal drankommt (${dayWord(daysLeft())}).`, wdh: 'Alles, was du als unsicher oder noch nicht eingeschätzt hast, das Schwächste zuerst.', zeichnen: 'Skizzen, Schaltpläne und Aufbauten. Zeichne mit dem Stift direkt in den Ausschnitt.' }[q] || 'Alle Teilaufgaben zu diesem Thema aus allen Prüfungen.';
    app().innerHTML = `${head(A().esc(qName(q)), lede, back)}${first ? `<p class="actions" style="margin-bottom:var(--space-md)"><a class="btn primary" href="${itemHref(first, q)}">Starten</a></p>` : ''}${listRows(d, t, keys, q)}`;
  }
  async function themenView() {
    A().setNav('train');
    const d = await data(), t = tload(), th = {};
    d.items.filter(learnable).forEach((o) => (o.it.topics || []).slice(0, 2).forEach((x) => { (th[x] || (th[x] = { n: 0, p: 0, ok: 0, kind: o.part.kind })).n++; th[x].p += o.it.points; if (t.r[o.key] && t.r[o.key].v === 1) th[x].ok++; }));
    const all = Object.entries(th).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].p - a[1].p);
    app().innerHTML = `${head('Nach Themen', 'Sortiert nach Punkten in allen Prüfungen. Je Thema alle Teilaufgaben hintereinander.', back)}
      ${['Teil2', 'Teil1'].map((k) => `<section class="section"><h2>${A().esc(A().kindLabel(k))}</h2><div class="wiki-grid">${all.filter(([, v]) => v.kind === k).map(([name, v]) => `<a class="wiki-card" href="#/training/q/${encodeURIComponent('thema:' + name)}"><span class="wc-title">${A().esc(name)}</span><span class="small muted">${v.n} Teilaufgaben, ${v.p} Punkte, ${v.ok} sitzen</span></a>`).join('')}</div></section>`).join('')}`;
  }
  async function merkView() {
    A().setNav('train');
    const { $, $$, esc } = A();
    const topics = await A().loadTopics();
    const groups = [['Teil1', 'Teil 1: Installation und Service', 't1'], ['Teil2', 'Teil 2: Stromversorgung', 't2'], ['WiSo', 'WiSo: Wirtschafts- und Sozialkunde', 'wiso']];
    const st = A().store.get('ap2.settings', {}), cfg = Object.assign({ parts: ['Teil2', 'Teil1', 'WiSo'], kurz: false }, st.merk || {});
    const of = (k) => topics.filter((x) => x.part === k && (x.key_points || []).length);
    const pts = (x) => (cfg.kurz ? x.key_points.slice(0, 3) : x.key_points);
    // „Begriff: Erklärung“ – den Begriff hervorheben, damit das Auge beim Wiederholen Halt findet
    const point = (p) => { const m = String(p).match(/^([^:]{2,48}):\s(.+)$/s); return m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(p); };
    app().innerHTML = `${head('Merkzettel', 'Die Merksätze aller Themen. „PDF zum Drucken“ setzt alles dicht in drei Spalten auf A4, ohne Kopf- und Fußzeilen des Browsers, kein Thema wird über eine Seite getrennt. Das PDF öffnen und beidseitig drucken.', back)}
      <div class="tr-merk-opts actions">${groups.map(([k, h]) => `<label class="check"><input type="checkbox" data-mp="${k}"${cfg.parts.includes(k) ? ' checked' : ''}><span>${esc(h)} <span class="small muted">${of(k).length} Themen</span></span></label>`).join('')}
        <label class="check"><input type="checkbox" id="m-kurz"${cfg.kurz ? ' checked' : ''}><span>Kurzfassung: 3 Merksätze je Thema</span></label>
        <button type="button" class="btn primary" id="m-pdf">PDF zum Drucken</button><span class="small muted" id="m-pages"></span></div>
      <div class="tr-merk-doc" id="m-doc"></div>`;
    const draw = () => {
      const sel = groups.filter(([k]) => cfg.parts.includes(k));
      $('#m-doc').innerHTML = `<p class="tr-merk-title">Merkzettel AP2 IT-System-Elektroniker${cfg.kurz ? ', Kurzfassung' : ''}, Stand ${new Date().toLocaleDateString('de-DE')}</p>
        ${sel.map(([k, h, c]) => `<section class="tr-merk-g ${c}"><h2>${h} <span>${of(k).length} Themen</span></h2><div class="tr-merk">${of(k).map((x) => `<div class="tr-merk-t"><h3>${esc(x.name)}</h3><ul>${pts(x).map((p) => `<li>${point(p)}</li>`).join('')}</ul></div>`).join('')}</div></section>`).join('') || '<p class="empty">Keinen Bereich gewählt.</p>'}`;
      // shortcut: grobe Seitenzahl aus den Zeichen (gemessen im PDF etwa 9 000 Zeichen je Seite, weil kein Thema geteilt wird)
      const chars = sel.reduce((n, [k]) => n + of(k).reduce((m, x) => m + pts(x).join(' ').length + 60, 0), 0);
      $('#m-pages').textContent = chars ? `etwa ${Math.max(1, Math.round(chars / 9000))} Seiten, beidseitig ${Math.max(1, Math.ceil(chars / 18000))} Blatt` : '';
      const s2 = A().store.get('ap2.settings', {}); s2.merk = cfg; A().store.set('ap2.settings', s2);
    };
    $$('[data-mp]').forEach((c) => c.onchange = () => { cfg.parts = $$('[data-mp]').filter((x) => x.checked).map((x) => x.dataset.mp); draw(); });
    $('#m-kurz').onchange = (ev) => { cfg.kurz = ev.target.checked; draw(); };
    $('#m-pdf').onclick = async (ev) => {
      const b = ev.target; if (b.disabled) return; b.disabled = true; b.textContent = 'PDF wird gesetzt …';
      try {
        const sel = groups.filter(([k]) => cfg.parts.includes(k)).map(([k, h, c]) => ({ title: h, cls: c, topics: of(k).map((x) => ({ name: x.name, points: pts(x) })) }));
        const pdf = await merkPdf(sel, `Merkzettel AP2 IT-System-Elektroniker${cfg.kurz ? ', Kurzfassung' : ''}, Stand ${new Date().toLocaleDateString('de-DE')}`);
        A().saveBlob(new Blob([pdf.data], { type: 'application/pdf' }), `Merkzettel AP2${cfg.kurz ? ' Kurzfassung' : ''}.pdf`);
        A().toast(`PDF mit ${pdf.pages} Seiten heruntergeladen, beidseitig ${Math.ceil(pdf.pages / 2)} Blatt`);
      } catch (e) { A().toast(`PDF konnte nicht erstellt werden: ${e.message}`, true); }
      b.disabled = false; b.textContent = 'PDF zum Drucken';
    };
    draw();
  }

  // ---------- Merkzettel als PDF: selbst gesetzt (Canvas, 200 dpi), drei Spalten, kein Thema über eine Spalte oder Seite getrennt ----------
  // groups = [{ title, cls, topics: [{ name, points }] }]. Liefert { data: Uint8Array, pages }
  async function merkPdf(groups, title) {
    const DPI = 200, K = DPI / 25.4, PT = 0.3528 * K;  // px je mm, px je Punkt
    const W = Math.round(210 * K), H = Math.round(297 * K), M = 8 * K, GAP = 4 * K, COLS = 3, CW = (W - 2 * M - (COLS - 1) * GAP) / COLS, BOTTOM = H - M;
    const css = getComputedStyle(document.documentElement), tok = (n) => css.getPropertyValue(n).trim();
    const FONT = 'Geologica, ui-sans-serif, system-ui, sans-serif';
    await Promise.all(['400', '560', '600'].map((w) => document.fonts.load(`${w} 20px Geologica`).catch(() => null)));
    const ink = tok('--color-print-ink') || '#111', paper = '#ffffff', area = { t1: tok('--color-print-area-t1'), t2: tok('--color-print-area-t2'), wiso: tok('--color-print-area-wiso') };
    const S = { body: 6.6 * PT, h3: 7.2 * PT, band: 8.6 * PT, title: 10 * PT };
    const LH = S.body * 1.2, IND = 2.4 * K;
    const mctx = document.createElement('canvas').getContext('2d');
    const font = (w, px) => `${w} ${px}px ${FONT}`;
    const width = (t, w, px) => { mctx.font = font(w, px); return mctx.measureText(t).width; };
    // Zeilenumbruch mit fettem Begriff am Anfang: runs = [{ t, b }]
    const wrap = (runs, maxW, px) => {
      const words = runs.flatMap((r) => r.t.split(/(\s+)/).filter((x) => x !== '').map((t) => ({ t, b: r.b })));
      const lines = []; let cur = [], cw = 0;
      const push = () => { while (cur.length && /^\s+$/.test(cur[cur.length - 1].t)) cur.pop(); lines.push(cur); cur = []; cw = 0; };
      for (const wd of words) {
        if (/^\s+$/.test(wd.t)) { if (cur.length) { cur.push({ t: ' ', b: wd.b }); cw += width(' ', wd.b ? 560 : 400, px); } continue; }
        let w = width(wd.t, wd.b ? 560 : 400, px);
        if (cw + w > maxW && cur.length) push();
        // sehr lange Wörter (Adressen, Formeln) zeichenweise umbrechen
        let t = wd.t;
        while (w > maxW) { let n = t.length; while (n > 1 && width(t.slice(0, n), wd.b ? 560 : 400, px) > maxW) n--; cur.push({ t: t.slice(0, n), b: wd.b }); push(); t = t.slice(n); w = width(t, wd.b ? 560 : 400, px); }
        cur.push({ t, b: wd.b }); cw += w;
      }
      if (cur.length) push();
      return lines;
    };
    const runsOf = (p) => { const m = String(p).match(/^([^:]{2,48}):\s(.+)$/s); return m ? [{ t: m[1] + ':', b: true }, { t: ' ' + m[2], b: false }] : [{ t: String(p), b: false }]; };
    // Thema vorbereiten: Überschrift und Punkte als Zeilen, Gesamthöhe
    const layout = (tp) => {
      const head = wrap([{ t: tp.name, b: true }], CW, S.h3);
      const items = tp.points.map((p) => wrap(runsOf(p), CW - IND, S.body));
      const h = head.length * S.h3 * 1.18 + 0.5 * K + 0.6 * K + items.reduce((n, l) => n + l.length * LH + 0.25 * K, 0) + 1.8 * K;
      return { tp, head, items, h };
    };
    const pages = []; let g = null, col = 0, colTop = M, ys = [];
    const newPage = (first) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = paper; g.fillRect(0, 0, W, H); g.textBaseline = 'alphabetic';
      pages.push(c); colTop = M; col = 0;
      if (first) { g.fillStyle = ink; g.font = font(600, S.title); g.fillText(title, M, M + S.title); colTop = M + S.title + 1.6 * K; g.fillRect(M, colTop, W - 2 * M, 0.5 * K); colTop += 2.4 * K; }
      ys = Array(COLS).fill(colTop);
    };
    const drawRuns = (line, x, y, px, color) => { let cx = x; line.forEach((r) => { g.font = font(r.b ? 560 : 400, px); g.fillStyle = color; g.fillText(r.t, cx, y); cx += g.measureText(r.t).width; }); };
    const drawTopic = (L, x, y, color) => {
      g.font = font(600, S.h3); g.fillStyle = color;
      L.head.forEach((ln) => { y += S.h3 * 1.18; g.fillText(ln.map((r) => r.t).join(''), x, y - S.h3 * 0.18); });
      y += 0.3 * K; g.fillRect(x, y, CW, 0.35 * K); y += 0.8 * K;
      L.items.forEach((lines) => {
        lines.forEach((ln, i) => {
          y += LH;
          if (!i) { g.fillStyle = color; g.beginPath(); g.arc(x + 0.8 * K, y - S.body * 0.33, 0.45 * K, 0, 7); g.fill(); }
          drawRuns(ln, x + IND, y - LH * 0.18, S.body, ink);
        });
        y += 0.25 * K;
      });
      return y + 1.8 * K;
    };
    newPage(true);
    for (const grp of groups) {
      const color = area[grp.cls] || ink, bandH = S.band * 1.7;
      const Ls = grp.topics.map(layout);
      // Band über die ganze Breite unter dem bisher Belegten; passt danach kein erstes Thema mehr hin: neue Seite
      let yb = Math.max(...ys); if (yb > colTop) yb += 1.2 * K;
      if (yb + bandH + 1.6 * K + (Ls[0] ? Ls[0].h : 0) > BOTTOM) { newPage(false); yb = colTop; }
      g.fillStyle = color; g.beginPath(); g.roundRect(M, yb, W - 2 * M, bandH, 0.8 * K); g.fill();
      g.fillStyle = paper; g.font = font(600, S.band); g.fillText(grp.title, M + 2 * K, yb + bandH * 0.68);
      const cnt = `${grp.topics.length} Themen`; g.font = font(400, S.body); g.fillText(cnt, W - M - 2 * K - g.measureText(cnt).width, yb + bandH * 0.68);
      colTop = yb + bandH + 1.6 * K; ys = Array(COLS).fill(colTop); col = 0;
      for (const L of Ls) {
        // in die aktuelle Spalte, sonst nächste Spalte, sonst neue Seite; nie ein Thema teilen
        while (ys[col] + L.h > BOTTOM) {
          if (col < COLS - 1) col++;
          else if (colTop === M && ys.every((v) => v === M)) break;  // höher als eine ganze Spalte: ausnahmsweise überstehen lassen
          else newPage(false);
        }
        ys[col] = drawTopic(L, M + col * (CW + GAP), ys[col], color);
      }
    }
    const imgs = [];
    for (const c of pages) { const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.72)); imgs.push({ w: c.width, h: c.height, data: new Uint8Array(await blob.arrayBuffer()) }); }
    return { data: A().pdfFromJpegs(imgs), pages: pages.length };
  }

  // ---------- Teilaufgabe lernen ----------
  const chats = new Map();
  async function itemView(rawKey, query) {
    A().setNav('train');
    const { $, $$, esc, nl } = A();
    const d = await data(), t = tload(), key = decodeURIComponent(rawKey), o = d.byKey[key];
    if (!o) { app().innerHTML = A().errorState('Teilaufgabe nicht gefunden', 'Diese Teilaufgabe gibt es nicht mehr.'); return; }
    const q = new URLSearchParams(query || '').get('q') || '';
    const list = queueKeys(d, t, q) || d.items.filter((x) => x.ex === o.ex && x.part === o.part).map((x) => x.key);
    const i = Math.max(0, list.indexOf(key)), prev = list[i - 1], next = list[i + 1];
    const { part, t: task, it } = o, pg = A().origPage(it), r = t.r[key];
    const firstOfTask = task.items[0] === it;
    const beleg = (part.attachments || []).find((a) => a.pages && a.pages.length);
    const getA = () => t.ans[key] || {};
    const src0 = part.page_images && part.page_images[pg - 1];
    document.body.classList.add('tr-wide');
    app().innerHTML = `<div class="tr-work">
      <div class="page-head"><div><p class="small muted">${back} / ${q ? `<a href="#/training/q/${encodeURIComponent(q)}">${esc(qName(q))}</a>` : `<a href="#/training/lernen">Prüfungen</a>`} / ${esc(examShort(o.ex))}, ${esc(SIM_KINDS[part.kind])}</p>
        <h1>Aufgabe ${task.number} ${esc(it.label || '')} <span class="small muted">${esc(task.title || '')}, ${A().ptsLabel(it.points)}</span></h1></div>
        <div class="actions">${beleg ? '<button type="button" class="btn sm" id="i-beleg">Belegsatz</button>' : ''}${(it.figure_pages || []).some((n) => n !== pg) ? '<button type="button" class="btn sm" id="i-fig">Abbildung</button>' : ''}<button type="button" class="btn sm" id="i-page">Ganze Seite</button></div></div>
      <nav class="tr-steps" aria-label="Teilaufgaben">${list.map((k, n) => { const x = d.byKey[k], rr = t.r[k]; return `<a href="${itemHref(k, q)}" class="${rr ? 's' + rr.v : ''}"${k === key ? ' aria-current="true"' : ''} title="${esc(examShort(x.ex))}, ${esc(itemName(x))}">${q ? n + 1 : esc(itemName(x).replace(/\s+/g, ''))}</a>`; }).join('')}</nav>
      ${task.intro ? `<details class="disc"${firstOfTask ? ' open' : ''}><summary>Ausgangslage zu Aufgabe ${task.number}</summary><div class="disc-body prose"><p>${nl(task.intro)}</p></div></details>` : ''}
      <div class="tr-cols"><div class="tr-main"><div class="tr-crop" id="i-crop" aria-label="Ausschnitt aus dem Prüfungsheft"></div></div><div class="tr-side">
      <details class="disc"><summary>Aufgabentext zum Lesen</summary><div class="disc-body prose"><p>${nl(it.text)}</p></div></details>
      <label class="field" style="margin-top:var(--space-sm)"><span>Getippte Antwort</span><textarea class="input" id="i-typed" rows="3">${esc(getA().typed || '')}</textarea></label>
      <div class="actions" style="margin-top:var(--space-md)"><button type="button" class="btn primary" id="i-sol" aria-expanded="false" aria-controls="i-solbox">Lösung zeigen</button>${(part.solution_pages || []).length ? '<button type="button" class="btn" id="i-ihk">IHK-Lösung im Original</button>' : ''}<button type="button" class="btn" id="i-check">Mit Claude prüfen</button></div>
      <div id="i-claude"></div>
      <div class="panel solution" id="i-solbox" hidden>${src0 && it.solution ? `<details><summary>Lösung als Text</summary><p>${nl(it.solution)}</p></details>` : nl(it.solution || 'Zu dieser Teilaufgabe gibt es keinen Lösungstext.')}${it.expected ? `<p><strong>Ergebnis: ${esc(it.expected)} ${esc(it.unit || '')}</strong></p>` : ''}${it.grading ? `<p class="grading">Bewertung: ${esc(it.grading)}</p>` : ''}</div>
      <section class="section"><h2>Wie gut sitzt das?</h2><div class="actions tr-rate">${RATE.map(([v, l, c]) => `<button type="button" class="btn ${c}" data-rate="${v}" aria-pressed="${!!r && r.v === v}">${l} <span class="small muted">${v}</span></button>`).join('')}</div>
        <p class="small muted">Ehrlich einschätzen: Unsicheres kommt in zwei Tagen wieder, was noch nicht sitzt, schon morgen. Tasten 1, 2, 3; Pfeile links und rechts blättern, Pfeil runter zeigt die Lösung.</p></section>
      <details class="disc" id="i-ki"><summary>Lernpartner (KI): erklären, abfragen, Fragen stellen</summary><div class="disc-body" id="i-kibox"></div></details>
      </div></div>
      <div class="tr-foot">${prev ? `<a class="btn" href="${itemHref(prev, q)}">Zurück</a>` : '<span></span>'}<span class="small muted">${i + 1} von ${list.length}</span>${next ? `<a class="btn primary" href="${itemHref(next, q)}">Weiter</a>` : `<a class="btn primary" href="${q ? `#/training/q/${encodeURIComponent(q)}` : '#/training/lernen'}">Fertig</a>`}</div>
    </div>`;
    // Ausschnitt: von unter der vorigen Teilaufgabe auf derselben Seite bis unter die eigenen Felder
    const host = $('#i-crop'), src = part.page_images && part.page_images[pg - 1];
    let pa = null, timer = null, over = null;
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => { const tt = tload(); const cur = Object.assign({}, tt.ans[key] || {}); if (pa) pa.changed().forEach(([, ans]) => Object.assign(cur, ans)); cur.typed = $('#i-typed') ? $('#i-typed').value : cur.typed; tt.ans[key] = cur; tsave(tt); t.ans[key] = cur; }, 400); };
    if (src) {
      const own = (it.fields || []).filter((f) => f.page === pg);
      // Teilaufgaben der Seite in Heftreihenfolge; ohne eigene Felder reicht der Ausschnitt von der vorigen bis zur nächsten Teilaufgabe mit Feldern
      const onPage = part.tasks.flatMap((x) => x.items).filter((x) => A().origPage(x) === pg), k = onPage.indexOf(it);
      const fb = (x) => { const fs = (x.fields || []).filter((f) => f.page === pg); return fs.length ? [Math.min(...fs.map((f) => f.y)), Math.max(...fs.map((f) => f.y + f.h))] : null; };
      const prevB = onPage.slice(0, k).map(fb).filter(Boolean).pop(), nextB = onPage.slice(k + 1).map(fb).find(Boolean);
      let y0 = Math.max(0, (prevB ? prevB[1] : 0.02) - 0.005);
      let y1 = own.length ? Math.min(1, Math.max(...own.map((f) => f.y + f.h)) + 0.015) : nextB ? Math.max(y0 + 0.05, nextB[0] - 0.035) : 1;
      // davor stehen Teilaufgaben ohne Felder: nicht bis zu deren Anfang zurück, nur bis kurz über die eigene Frage
      if (own.length && k > 0 && !fb(onPage[k - 1])) y0 = Math.max(y0, Math.min(...own.map((f) => f.y)) - 0.075);
      if (!own.length) { // mehrere Teilaufgaben ohne Felder hintereinander: die Lücke gleichmäßig aufteilen
        let a = k, b = k; while (a > 0 && !fb(onPage[a - 1])) a--; while (b < onPage.length - 1 && !fb(onPage[b + 1])) b++;
        // nach Punkten gewichtet: mehr Punkte, mehr Antwortlinien
        const run = onPage.slice(a, b + 1), sum = run.reduce((m, x) => m + x.points, 0), span = y1 - y0, before = run.slice(0, k - a).reduce((m, x) => m + x.points, 0);
        y0 += span * before / sum - 0.01; y1 = y0 + span * it.points / sum + 0.015;
      }
      const cropped = y0 > 0.01 || y1 < 0.99;
      pa = A().pageAnswer(host, part, pg, [it], () => getA(), persist, { noFields: true });
      // nur die Seite beschneiden, die Werkzeugleiste darüber bleibt sichtbar
      const mp = $('.mark-page', host);
      // Lösung wie eingetragen: in den Antwortfeldern, eine Zeile je Feld, wenn das aufgeht; sonst im Antwortbereich
      if (mp && it.solution) {
        const lines = String(it.solution).split('\n').filter((x) => x.trim());
        const box = (fs) => ({ x: Math.min(...fs.map((f) => f.x)), y: Math.min(...fs.map((f) => f.y)), r: Math.max(...fs.map((f) => f.x + f.w)), b: Math.max(...fs.map((f) => f.y + f.h)) });
        const zones = own.length > 1 && lines.length === own.length ? own.map((f, n) => [box([f]), lines[n]]) : [[own.length ? box(own) : { x: 0.04, y: y0 + 0.035, r: 0.86, b: y1 }, lines.join('\n')]];
        // Zeilenabstand: auf den gedruckten Antwortlinien (lh) oder je Tabellenzeile eine Lösungszeile
        const lhOf = (z, txt) => it.table && zones.length === 1 && it.table.rows && it.table.rows.length === txt.split('\n').length ? (z.b - z.y) / it.table.rows.length : (own[0] && own[0].lh) || 0;
        over = zones.map(([z, txt]) => { const el = document.createElement('div'); el.className = 'tr-solover'; el.hidden = true; el.textContent = txt; el.dataset.lh = lhOf(z, txt);
          Object.assign(el.style, { left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${(z.r - z.x) * 100}%`, height: `${(z.b - z.y) * 100}%` }); mp.append(el); return el; });
        // Schrift so groß wie möglich, aber der Text muss ins Feld passen
        const fit = () => over.forEach((el) => {
          if (el.hidden) return;
          const u = mp.clientWidth / 100, lh = +el.dataset.lh * mp.clientHeight;
          let f = lh ? Math.min(2.2 * u, lh * 0.72) : 2.2 * u, l = lh || f * 1.3;
          const set = () => { el.style.fontSize = `${f}px`; el.style.lineHeight = `${l}px`; };
          set();
          // passt nicht: Schrift und Zeilenabstand gemeinsam verkleinern
          while (el.scrollHeight > el.clientHeight + 1 && f > 1.1 * u) { f *= 0.94; l = Math.max(f * 1.2, l * 0.94); set(); }
        });
        over.fit = fit; new ResizeObserver(fit).observe(mp);
      }
      if (mp && cropped) {
        const win = document.createElement('div'); win.className = 'tr-cropwin'; mp.before(win); win.append(mp);
        A().loadImg(await window.AP2Local.pageSrc(src)).then((img) => { const ar = img.naturalHeight / img.naturalWidth; win.style.aspectRatio = `1 / ${(y1 - y0) * ar}`; mp.style.marginTop = `${-y0 * ar * 100}%`; }).catch(() => {});
      }
    } else host.innerHTML = `<div class="prose"><p>${nl(it.text)}</p></div>`;
    $('#i-typed').oninput = persist;
    if ($('#i-fig')) $('#i-fig').onclick = () => A().pageViewer(part.page_images, it.figure_pages.find((n) => n !== pg) - 1, `${examShort(o.ex)}, ${SIM_KINDS[part.kind]}`);
    $('#i-page').onclick = () => A().pageViewer(part.page_images, pg - 1, `${examShort(o.ex)}, ${SIM_KINDS[part.kind]}`);
    if ($('#i-beleg')) $('#i-beleg').onclick = () => A().pageViewer(beleg.pages, 0, beleg.title || 'Belegsatz');
    if ($('#i-ihk')) $('#i-ihk').onclick = () => A().pageViewer(part.solution_pages, 0, `IHK-Lösungshinweise ${examShort(o.ex)}, ${SIM_KINDS[part.kind]}`);
    const solBtn = $('#i-sol'), solBox = $('#i-solbox');
    const toggleSol = (show) => { solBox.hidden = show === undefined ? !solBox.hidden : !show;
      if (over) { over.forEach((el) => { el.hidden = solBox.hidden; }); over.fit(); } solBtn.setAttribute('aria-expanded', String(!solBox.hidden)); solBtn.textContent = solBox.hidden ? 'Lösung zeigen' : 'Lösung ausblenden'; };
    solBtn.onclick = () => toggleSol();
    const rate = (v) => { const tt = tload(); tt.r[key] = { v, at: new Date().toISOString() }; tsave(tt); location.hash = next ? itemHref(next, q) : (q ? `#/training/q/${encodeURIComponent(q)}` : '#/training/lernen'); };
    $$('[data-rate]').forEach((b) => b.onclick = () => rate(+b.dataset.rate));
    // Claude prüft die eigene Eintragung wie ein Prüfer
    const cbox = $('#i-claude');
    const showAi = (ai) => { cbox.innerHTML = `<div class="panel ai-grade"><p class="small"><strong>Claude: ${A().fmtPts(ai.points)} von ${A().fmtPts(it.points)} Punkten</strong>${ai.sure ? '' : ' <span class="tag warn">unsicher</span>'}</p><p>${nl(ai.comment)}</p>${ai.read && ai.read !== 'getippt' ? `<p class="small muted">Gelesen: ${esc(ai.read)}</p>` : ''}</div>`; };
    if (getA().ai) showAi(getA().ai);
    $('#i-check').onclick = async () => {
      if (!A().claudeKey()) { cbox.innerHTML = `<div class="panel">${A().claudeKeyHtml()}</div>`; A().bindClaudeKey(cbox, () => $('#i-check').click()); return; }
      clearTimeout(timer); if (pa) { const cur = Object.assign({}, t.ans[key] || {}); pa.changed().forEach(([, ans]) => Object.assign(cur, ans)); cur.typed = $('#i-typed').value; t.ans[key] = cur; }
      const a = Object.assign({}, getA()); a.text = [a.text, a.typed].filter(Boolean).join('\n');
      $('#i-check').disabled = true; $('#i-check').textContent = 'Claude prüft …';
      try { const [res] = await A().claudeTask(part, task, [{ item: it, a }]); if (res) { const tt = tload(); tt.ans[key] = Object.assign({}, t.ans[key], { ai: res.ai }); tsave(tt); t.ans[key] = tt.ans[key]; showAi(res.ai); toggleSol(true); } }
      catch (e) { A().toast(`Claude: ${e.message}`, true); }
      $('#i-check').disabled = false; $('#i-check').textContent = 'Mit Claude prüfen';
    };
    // Lernpartner: der bestehende KI-Reiter mit Claude, Puter oder lokalem Modell
    let kiOn = false;
    $('#i-ki').ontoggle = () => { if (!kiOn && $('#i-ki').open) { kiOn = true; const render = A().aiPanel($('#i-kibox'), () => ({ item: it, answer: () => ({ text: [getA().text, getA().typed].filter(Boolean).join('\n') }) })); render(); } };
    const card0 = host;
    const keys = (ev) => {
      if (!document.contains(card0)) { document.removeEventListener('keydown', keys); return; }
      if (ev.altKey || ev.ctrlKey || ev.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName) || !document.getElementById('modal').hidden) return;
      if (ev.key === 'ArrowRight' && next) location.hash = itemHref(next, q);
      else if (ev.key === 'ArrowLeft' && prev) location.hash = itemHref(prev, q);
      else if (ev.key === 'ArrowDown') toggleSol(true);
      else if (ev.key === 'ArrowUp') toggleSol(false);
      else if (['1', '2', '3'].includes(ev.key)) rate(+ev.key);
      else return;
      ev.preventDefault();
    };
    document.addEventListener('keydown', keys);
    const cur = $('.tr-steps [aria-current]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ---------- Simulation: Auswahl ----------
  async function simStart(query) {
    A().setNav('train');
    const { $, esc } = A();
    const d = await data(), art = new URLSearchParams(query || '').get('art') || 'teil';
    const exOpt = d.exams.map((ex) => `<option value="${ex.id}">${esc(examShort(ex))}</option>`).join('');
    app().innerHTML = `${head(art === 'tag' ? 'Prüfungstag' : art === 'aufgabe' ? 'Eine Aufgabe auf Zeit' : 'Simulation', {
      tag: 'Alle drei schriftlichen Teile eines Termins hintereinander wie am 25.11.: Teil 1 (90 Minuten), Teil 2 (90 Minuten), WiSo (60 Minuten). Danach bewertet Claude und du siehst, ob du nach den Regeln bestanden hättest.',
      aufgabe: 'Eine ganze Aufgabe im Originalheft, 0,9 Minuten je Punkt wie in der Prüfung. Danach bewertet Claude.',
      teil: 'Ein Prüfungsteil im Originalheft auf Zeit. Schreib wie in der Prüfung direkt in die Seiten, mit Stift oder in die Felder getippt. Lösungen gibt es erst nach der Abgabe.' }[art], back)}
      <nav class="tabs" aria-label="Art">${[['teil', 'Ein Prüfungsteil'], ['aufgabe', 'Eine Aufgabe'], ['tag', 'Prüfungstag']].map(([k, l]) => `<a href="#/training/sim${k === 'teil' ? '' : `?art=${k}`}"${k === art ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div class="sheet" style="max-width:40rem"><form id="s-form" class="tr-form">
        <label class="field"><span>Prüfung</span><select class="input" id="s-ex">${exOpt}</select></label>
        ${art === 'tag' ? '' : `<label class="field"><span>Prüfungsteil</span><select class="input" id="s-part"></select></label>`}
        ${art === 'aufgabe' ? '<label class="field"><span>Aufgabe</span><select class="input" id="s-task"></select></label>' : ''}
        <p class="small muted" id="s-info"></p>
        <div class="actions"><button type="submit" class="btn primary">Starten</button></div></form></div>
      <p class="small muted" style="margin-top:var(--space-md)">Die Uhr läuft ab „Starten“ im Heft. Mit Stift oder Apple Pencil schreibst du direkt auf die Seite, mit dem Finger scrollst du. Am Rechner tippst du in die umrandeten Felder.</p>`;
    const exSel = $('#s-ex'), partSel = $('#s-part'), taskSel = $('#s-task');
    const ex = () => d.exams.find((x) => x.id === exSel.value), part = () => partSel && ex().parts.find((p) => p.id === partSel.value);
    const info = () => {
      if (art === 'tag') { $('#s-info').textContent = ex().parts.map((p) => `${SIM_KINDS[p.kind]} ${p.duration_min} Minuten`).join(', '); return; }
      if (art === 'aufgabe') { const tk = part().tasks.find((x) => String(x.number) === taskSel.value); const pts = tk.items.reduce((n, x) => n + x.points, 0); $('#s-info').textContent = `${pts} Punkte, ${Math.ceil(pts * 0.9)} Minuten`; return; }
      $('#s-info').textContent = `${part().max_points} Punkte, ${part().duration_min} Minuten, ${(part().page_images || []).length} Seiten`;
    };
    const fillParts = () => { if (!partSel) return info(); partSel.innerHTML = ex().parts.filter((p) => art !== 'aufgabe' || p.kind !== 'WiSo').map((p) => `<option value="${p.id}">${esc(A().kindLabel(p.kind))}</option>`).join(''); fillTasks(); };
    const fillTasks = () => { if (taskSel) taskSel.innerHTML = part().tasks.map((x) => `<option value="${x.number}">Aufgabe ${x.number}: ${esc(x.title || '')} (${x.items.reduce((n, y) => n + y.points, 0)} Punkte)</option>`).join(''); info(); };
    exSel.onchange = fillParts; if (partSel) partSel.onchange = fillTasks; if (taskSel) taskSel.onchange = info;
    fillParts();
    $('#s-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { exam_id: ex().id, mode: 'exam', source: 'train' };
      if (art !== 'tag') body.parts = [part().id];
      if (art === 'aufgabe') { const tk = part().tasks.find((x) => String(x.number) === taskSel.value); body.task = tk.number; body.minutes = Math.ceil(tk.items.reduce((n, x) => n + x.points, 0) * 0.9); }
      const v = await A().post('/api/sessions', body);
      location.hash = `#/training/sim/${v.session.id}`;
    };
  }

  // ---------- Simulation im Heft ----------
  async function simRun(sid, pgArg) {
    A().setNav('train');
    const { $, $$, esc } = A();
    let view = await A().api(`/api/sessions/${sid}`);
    const s = view.session;
    if (s.finished) { location.hash = `#/training/ergebnis/${sid}`; return; }
    const pid = s.part_order.find((p) => !s.parts.find((x) => x.part_id === p).finished_at);
    const part = view.exam.parts.find((p) => p.id === pid), st = s.parts.find((x) => x.part_id === pid);
    const tasks = s.task === undefined ? part.tasks : part.tasks.filter((t) => t.number === s.task);
    const items = tasks.flatMap((t) => t.items);
    const isWiso = part.kind === 'WiSo' || !items.some((it) => (it.fields || []).length);
    const pages = isWiso ? [1] : s.task === undefined ? (part.page_images || []).map((_, i) => i + 1) : (() => { const ns = items.flatMap((it) => [A().origPage(it), ...(it.figure_pages || [])]).filter(Boolean); const lo = Math.min(...ns), hi = Math.max(...ns); return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k); })();
    const nPart = s.part_order.indexOf(pid) + 1;
    const where = `${esc(examShort(view.exam))}, ${esc(A().kindLabel(part.kind))}${s.task !== undefined ? `, Aufgabe ${s.task}` : ''}${s.part_order.length > 1 ? ` (Teil ${nPart} von ${s.part_order.length} des Prüfungstags)` : ''}`;
    if (!st.started_at) {
      const mins = s.minutes || part.duration_min;
      app().innerHTML = `${head(where, `${mins} Minuten, ${items.reduce((n, x) => n + x.points, 0)} Punkte, ${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'}. Hilfsmittel wie in der Prüfung: Taschenrechner und Belegsatz. Lösungen gibt es erst nach der Abgabe.`, back)}
        <div class="sheet" style="max-width:40rem">${part.situation ? `<h2>Ausgangssituation</h2><div class="prose"><p>${A().nl(String(part.situation))}</p></div>` : ''}
        <div class="actions" style="margin-top:var(--space-md)"><button type="button" class="btn primary" id="s-go">Jetzt starten, die Uhr läuft</button></div></div>`;
      $('#s-go').onclick = async () => { await A().post(`/api/sessions/${sid}/start`, { part: pid }); simRun(sid, 1); };
      return;
    }
    const pg = Math.min(pages.length, Math.max(1, +pgArg || 1)), page = pages[pg - 1];
    const beleg = (part.attachments || []).find((a) => a.pages && a.pages.length);
    const answers = () => view.session.answers;
    const getA = (id) => answers()[A().answerKey(pid, id)] || {};
    const hasInk = (n) => items.some((it) => A().origPage(it) === n && (((getA(it.id).marks || {}).strokes || []).length || (getA(it.id).fields || []).some(Boolean) || !!getA(it.id).value));
    document.body.classList.add('tr-wide');
    app().innerHTML = `<div class="tr-sim">
      <div class="tr-simbar"><div><p class="small muted">${where}</p></div>
        <div class="actions">${beleg ? '<button type="button" class="btn sm" id="s-beleg">Belegsatz</button>' : ''}<button type="button" class="btn sm primary" id="s-end">Abgeben</button></div></div>
      <nav class="tr-steps" aria-label="Seiten"${isWiso ? ' hidden' : ''}>${pages.map((n, k) => `<a href="#/training/sim/${sid}/${k + 1}" class="${hasInk(n) ? 'done' : ''}"${k + 1 === pg ? ' aria-current="true"' : ''}>S. ${n}</a>`).join('')}</nav>
      <div class="${isWiso ? 'tr-wiso' : beleg ? 'tr-simgrid' : ''}"><div id="s-page" class="tr-page"></div>${isWiso ? '<aside class="tr-bogen" aria-label="Antwortbogen"><h2>Antwortbogen</h2><div id="s-bogen"></div></aside>' : beleg ? '<aside class="tr-belside" aria-label="Belegsatz"><div id="s-belside"></div></aside>' : ''}</div>
      <div class="tr-foot">${pg > 1 ? `<a class="btn" href="#/training/sim/${sid}/${pg - 1}">Vorige Seite</a>` : '<span></span>'}<span class="small muted">${isWiso ? 'Antworten rechts im Antwortbogen' : `Seite ${pg} von ${pages.length}`}</span>${pg < pages.length ? `<a class="btn primary" href="#/training/sim/${sid}/${pg + 1}">Nächste Seite</a>` : '<button type="button" class="btn primary" id="s-end2">Abgeben</button>'}</div>
    </div>`;
    // Speichern: geänderte Teilaufgaben nach kurzer Pause an die Sitzung
    let pa = null, saveT = null, saving = Promise.resolve();
    const pending = new Map();
    const flush = () => { clearTimeout(saveT); if (pa) pa.changed().forEach(([id, a]) => pending.set(id, a)); const batch = [...pending]; pending.clear();
      saving = saving.then(() => Promise.all(batch.map(([id, a]) => { answers()[A().answerKey(pid, id)] = a; return A().post(`/api/sessions/${sid}/answer`, { part: pid, item: id, answer: a }).catch((e) => A().toast(e.message, true)); }))); return saving; };
    const changed = () => { clearTimeout(saveT); saveT = setTimeout(flush, 800); };
    if (isWiso) {
      A().docViewer($('#s-page'), (part.page_images || []), { inline: true, zoom: 'width' });
      const bog = $('#s-bogen');
      bog.innerHTML = items.map((it) => `<form class="tr-bq" data-item="${esc(it.id)}"><p><strong>${esc(itemName({ part, t: tasks.find((t) => t.items.includes(it)), it }))}</strong> <span class="small muted">${A().ptsLabel(it.points)}</span></p><p class="small">${esc(String(it.text || '').slice(0, 220))}</p>${A().renderAnswerInput(it, Object.assign({ text: '', value: '', selected: [], cells: [] }, getA(it.id)), false)}</form>`).join('');
      $$('form.tr-bq', bog).forEach((f) => { const it = items.find((x) => x.id === f.dataset.item); f.onsubmit = (ev) => ev.preventDefault(); f.oninput = f.onchange = () => { pending.set(it.id, A().collectAnswer(f, it, getA(it.id))); changed(); }; });
    } else pa = A().pageAnswer($('#s-page'), part, page, items, getA, changed);
    // Belegsatz daneben nur, wenn Platz ist (sonst über den Knopf)
    if (beleg && $('#s-belside') && matchMedia('(min-width: 75rem)').matches) A().docViewer($('#s-belside'), beleg.pages, { inline: true, zoom: 'width', title: 'Belegsatz' });
    // Seitenwechsel erst nach dem Speichern, sonst zeigt die neue Seite einen alten Stand
    $$('.tr-steps a, .tr-foot a').forEach((a) => a.addEventListener('click', async (ev) => { ev.preventDefault(); await flush(); location.hash = a.getAttribute('href'); }));
    if ($('#s-beleg')) $('#s-beleg').onclick = () => A().pageViewer(beleg.pages, 0, beleg.title || 'Belegsatz');
    const finish = async (auto) => {
      if (!auto && !confirm('Diesen Prüfungsteil abgeben? Danach lässt sich nichts mehr ändern.')) return;
      A().stopTimer(); await flush();
      try { await A().post(`/api/sessions/${sid}/finish-part`, { part: pid }); } catch (e) { A().toast(e.message, true); return; }
      const v = await A().api(`/api/sessions/${sid}`);
      if (v.session.finished || v.session.parts.every((x) => x.finished_at)) { if (!v.session.finished) await A().post(`/api/sessions/${sid}/finish`, {}); location.hash = `#/training/ergebnis/${sid}`; }
      else simRun(sid, 1);
    };
    $('#s-end').onclick = () => finish(false); if ($('#s-end2')) $('#s-end2').onclick = () => finish(false);
    // Uhr: Restzeit der Sitzung, bei null automatisch abgeben
    const remaining = view.remaining[pid], loadedAt = Date.now(), box = document.getElementById('timerbox'); let warned = false;
    if (remaining !== null && remaining !== undefined) {
      box.hidden = false;
      A().startTimer(async () => {
        const left = Math.max(0, remaining - Math.floor((Date.now() - loadedAt) / 1000));
        box.innerHTML = `<small>Restzeit</small>${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
        box.className = 'timer' + (left <= 300 ? ' danger' : left <= 900 ? ' warn' : '');
        if (left <= 300 && !warned) { warned = true; A().toast('Noch 5 Minuten'); }
        if (left <= 0) { A().stopTimer(); A().toast('Die Zeit ist um, der Teil wird abgegeben'); await finish(true); }
      });
    }
    window.addEventListener('pagehide', flush, { once: true });
  }

  // ---------- Auswertung ----------
  const FAZIT_SYS = 'Du bist Prüfungscoach für die IHK-Abschlussprüfung Teil 2 der IT-System-Elektroniker. Schreib auf Deutsch in der Du-Form, klar und ermutigend, ohne Floskeln. Gliederung mit kurzen Überschriften: Ergebnis in einem Satz, Stärken, die drei größten Lücken mit konkreter Erklärung, was du bis zur Prüfung genau üben solltest (mit Tagen bis zur Prüfung). Höchstens 300 Wörter. Keine Tabellen.';
  async function ergebnisView(sid) {
    A().setNav('train');
    const { $, esc, nl } = A();
    const view = await A().api(`/api/sessions/${sid}`), s = view.session, exam = view.exam;
    if (!s.finished) { location.hash = `#/training/sim/${sid}`; return; }
    let autoTried = false;
    const render = async () => {
      const r = await A().api(`/api/sessions/${sid}/result`);
      s.answers = (await A().api(`/api/sessions/${sid}`)).session.answers;
      const t = tload();
      const gradable = r.parts.flatMap((p) => { const part = exam.parts.find((x) => x.id === p.part_id); return p.items.filter((ir) => ir.ink || (!ir.auto && ir.answered)).map((ir) => { const tk = part.tasks.find((x) => x.number === ir.task_number); return { part, t: tk, item: tk.items.find((x) => x.id === ir.item_id), ir, a: s.answers[A().answerKey(p.part_id, ir.item_id)] || {} }; }); });
      const open = gradable.filter((g) => !g.a.ai);
      // Bestehen am Prüfungstag mit den Werten aus dem Notenrechner (AP1, Projekt)
      const T = window.AP2Tools, gv = A().store.get('ap2.grades', {}), byKind = (k) => { const p = r.parts.find((x) => x.kind === k); return p ? Math.round(p.points / p.max_points * 100) : null; };
      const tag = s.part_order.length === 3 && s.task === undefined ? T.assess({ ap1: gv.ap1 ?? null, doc: gv.doc ?? null, talk: gv.talk ?? null, t1: byKind('Teil1'), t2: byKind('Teil2'), wiso: byKind('WiSo') }) : null;
      const lost = r.topic_stats.map((x) => ({ ...x, lost: x.max_points - x.points })).filter((x) => x.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 6);
      app().innerHTML = `${head(`Auswertung: ${esc(examShort(exam))}`, `${s.task !== undefined ? `Aufgabe ${s.task}, ` : ''}${A().fmtDate(s.finished_at)}`, back)}
        <div class="split"><div class="sheet">
          <table class="t"><thead><tr><th>Bereich</th><th class="num">Punkte</th><th class="num">Note</th><th class="num">Zeit</th></tr></thead><tbody>
          ${r.parts.map((p) => `<tr><td>${esc(A().kindLabel(p.kind))}</td><td class="num">${A().fmtPts(Math.round(p.points * 2) / 2)} / ${p.max_points}</td><td class="num">${p.grade}</td><td class="num">${p.used_minutes ? Math.round(p.used_minutes) + ' min' : '–'}</td></tr>`).join('')}
          </tbody></table>
          ${tag ? `<p class="verdict ${tag.passed === true ? 'ok' : tag.passed === false ? 'bad' : ''}" style="margin-top:var(--space-sm)">${tag.passed === true ? 'Nach den Regeln bestanden' : tag.passed === false ? 'Nach den Regeln nicht bestanden' : 'Bestehen offen: AP1 und Projekt im Notenrechner eintragen'}</p>${tag.rules ? `<ul class="small">${tag.rules.map((x) => `<li>${esc(x.label)}: ${x.state === 'ok' ? 'erfüllt' : x.state === 'fail' ? 'nicht erfüllt' : 'offen'}</li>`).join('')}</ul>` : ''}` : ''}
          ${open.length ? `<div class="panel warn" role="status"><p><strong>${open.length} ${open.length === 1 ? 'Antwort ist' : 'Antworten sind'} noch nicht von Claude bewertet.</strong> Bis dahin zählen bei Freitext die Stichworte, Handschrift zählt noch nicht.</p><p class="actions"><button type="button" class="btn sm primary" id="e-claude">Mit Claude bewerten</button></p><div id="e-key"></div></div>` : ''}
          <p class="actions" style="margin-top:var(--space-md)"><a class="btn" href="#/training/heft/${sid}">Korrigiertes Heft</a><a class="btn" href="#/result/${sid}">Alle Teilaufgaben im Detail</a></p>
        </div><div>
          <h3>Hier gingen die meisten Punkte verloren</h3>
          ${lost.length ? lost.map((x) => A().meterRow(`<a href="#/training/q/${encodeURIComponent('thema:' + x.topic)}">${esc(x.topic)}</a>`, x.points / x.max_points, `${A().fmtPts(x.lost)} verloren`)).join('') : '<p class="small muted">Nirgends Punkte verloren.</p>'}
        </div></div>
        <section class="section"><h2>Auswertung von Claude</h2><div id="e-fazit">${t.fazit[sid] ? `<div class="prose">${nl(t.fazit[sid])}</div>` : '<p class="small muted">Claude fasst die Simulation zusammen: Stärken, Lücken und was du bis zur Prüfung üben solltest.</p>'}</div>
          <p class="actions"><button type="button" class="btn" id="e-fz">${t.fazit[sid] ? 'Neu schreiben lassen' : 'Auswertung schreiben lassen'}</button></p></section>`;
      const needKey = (box, then) => { box.innerHTML = A().claudeKeyHtml(); A().bindClaudeKey(box, then); };
      const grade = async () => {
        const btn = $('#e-claude'); if (!btn) return;
        if (!A().claudeKey()) { needKey($('#e-key'), grade); return; }
        btn.disabled = true;
        const failed = await A().claudeGrade(sid, open, (done, n) => { btn.textContent = `Claude bewertet (${done} von ${n} Aufgaben)`; });
        if (failed) A().toast(`${failed} Aufgaben konnten nicht bewertet werden`, true);
        await render();
      };
      if ($('#e-claude')) $('#e-claude').onclick = grade;
      if (open.length && A().claudeKey() && !autoTried) { autoTried = true; grade(); }
      $('#e-fz').onclick = async () => {
        if (!A().claudeKey()) { needKey($('#e-fazit'), () => $('#e-fz').click()); return; }
        const b = $('#e-fz'); b.disabled = true; b.textContent = 'Claude schreibt …';
        const lines = r.parts.map((p) => { const part = exam.parts.find((x) => x.id === p.part_id); return `${A().kindLabel(p.kind)}: ${A().fmtPts(p.points)} von ${p.max_points} Punkten, Note ${p.grade}\n` + p.items.map((ir) => { const tk = part.tasks.find((x) => x.number === ir.task_number), it = tk.items.find((x) => x.id === ir.item_id), a = s.answers[A().answerKey(p.part_id, it.id)] || {}; return `- ${tk.number} ${it.label || ''} (${(it.topics || []).slice(0, 2).join(', ')}): ${ir.points === null ? 'nicht bewertet' : `${A().fmtPts(ir.points)}/${it.points}`}${!ir.answered ? ', nicht beantwortet' : ''}${a.ai ? `. ${a.ai.comment}` : ''}`; }).join('\n'); }).join('\n\n');
        try { const txt = await A().claude({ system: FAZIT_SYS, messages: [{ role: 'user', content: `Prüfung: ${exam.title}. ${dayWord(daysLeft())}.\n\n${lines}` }], output_config: { effort: 'medium' } }); const tt = tload(); tt.fazit[sid] = txt.trim(); tsave(tt); await render(); }
        catch (e) { A().toast(`Claude: ${e.message}`, true); b.disabled = false; b.textContent = 'Auswertung schreiben lassen'; }
      };
    };
    await render();
  }

  // ---------- Korrigiertes Heft: Seiten mit deinen Eintragungen, im Korrekturrand die Punkte je Teilaufgabe ----------
  async function heftView(sid) {
    A().setNav('train');
    const { $, esc } = A();
    const view = await A().api(`/api/sessions/${sid}`), s = view.session, exam = view.exam, r = await A().api(`/api/sessions/${sid}/result`);
    document.body.classList.add('tr-wide');
    app().innerHTML = `${head('Korrigiertes Heft', 'Deine Eintragungen auf den Originalseiten. Rechts im Korrekturrand stehen die Punkte je Teilaufgabe.', `${back} / <a href="#/training/ergebnis/${sid}">Auswertung</a>`)}<div id="h-pages" class="tr-heft"></div>`;
    const host = $('#h-pages');
    for (const p of r.parts) {
      const part = exam.parts.find((x) => x.id === p.part_id); if (!part.page_images) continue;
      const irs = new Map(p.items.map((ir) => [ir.item_id, ir]));
      const items = part.tasks.flatMap((t) => t.items.map((it) => ({ t, it }))).filter(({ it }) => irs.has(it.id));
      const pages = [...new Set(items.map(({ it }) => A().origPage(it)).filter(Boolean))].sort((a, b) => a - b);
      const h2 = document.createElement('h2'); h2.textContent = A().kindLabel(part.kind); host.append(h2);
      for (const pg of pages) {
        const fig = document.createElement('figure'); host.append(fig);
        try {
          const img = await A().loadImg(await window.AP2Local.pageSrc(part.page_images[pg - 1])); const W = img.naturalWidth, H = img.naturalHeight;
          const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
          const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
          g.fillStyle = tok('--color-scan'); g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0);
          const here = items.filter(({ it }) => A().origPage(it) === pg);
          const strokes = here.flatMap(({ it }) => ((s.answers[A().answerKey(part.id, it.id)] || {}).marks || {}).strokes || []);
          if (strokes.length) g.drawImage(A().inkLayer(strokes, W, H), 0, 0);
          g.textBaseline = 'top'; let lastY = H * 0.03 - W * 0.03;
          here.forEach(({ t, it }) => {
            const a = s.answers[A().answerKey(part.id, it.id)] || {};
            // getippte Feldinhalte und Texteinträge dort, wo sie stehen
            g.fillStyle = tok('--color-pen'); g.font = `${Math.round(W * 0.014)}px sans-serif`;
            (it.fields || []).forEach((f, k) => { const v = (a.fields || [])[k]; if (v && f.page === pg) String(v).split('\n').forEach((ln, j) => g.fillText(ln, f.x * W + 6, f.y * H + 4 + j * W * 0.018)); });
            ((a.marks || {}).boxes || []).forEach((b) => String(b.t || '').split('\n').forEach((ln, j) => g.fillText(ln, b.x * W, b.y * H + j * W * 0.018)));
            const ir = irs.get(it.id), f0 = (it.fields || []).find((f) => f.page === pg), y = Math.max(f0 ? f0.y * H : 0, lastY + W * 0.03); lastY = y;
            const label = `${t.number}${it.label ? ' ' + it.label : ''} ${ir.points === null ? '?' : A().fmtPts(ir.points)}/${A().fmtPts(it.points)}`;
            const full = ir.points !== null && ir.points >= it.points, none = !ir.points;
            g.font = `bold ${Math.round(W * 0.017)}px sans-serif`; g.fillStyle = tok(full ? '--color-mark-ok' : none ? '--color-mark-bad' : '--color-mark-part');
            g.fillText(label, W * 0.885, y);
          });
          c.style.width = '100%'; c.style.height = 'auto'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Seite ${pg} mit deinen Eintragungen und Punkten`);
          fig.append(c); const cap = document.createElement('figcaption'); cap.className = 'small muted'; cap.textContent = `Seite ${pg}`; fig.append(cap);
        } catch (e) { fig.textContent = `Seite ${pg} konnte nicht geladen werden.`; }
      }
    }
    if (!host.children.length) host.innerHTML = `<p class="empty">${esc('Für diesen Teil gibt es keine Heftseiten.')}</p>`;
  }

  window.AP2Train = {
    routes: [
      [/^#\/training$/, startView],
      [/^#\/training\/lernen$/, lernenView],
      [/^#\/training\/(heute|wdh|zeichnen)$/, queueView],
      [/^#\/training\/q\/([^/?]+)$/, (q) => queueView(decodeURIComponent(q))],
      [/^#\/training\/themen$/, themenView],
      [/^#\/training\/merk$/, merkView],
      [/^#\/training\/a\/([^/?]+)(?:\?(.*))?$/, itemView],
      [/^#\/training\/sim(?:\?(.*))?$/, simStart],
      [/^#\/training\/sim\/([^/?]+)(?:\/(\d+))?$/, simRun],
      [/^#\/training\/ergebnis\/([^/?]+)$/, ergebnisView],
      [/^#\/training\/heft\/([^/?]+)$/, heftView],
    ],
  };
})();
