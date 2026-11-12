/* AP2-Simulator – Browser-Backend.
 * Bedient dieselben /api/-Pfade wie früher der Server, aber komplett im Browser:
 * Prüfungsdaten aus data/bundle (optional verschlüsselt), Sitzungen, Statistik und
 * generierte Prüfungen im localStorage des jeweiligen Browsers (also pro Person). */
(() => {
  'use strict';
  const LS = { sessions: 'ap2.sessions', generated: 'ap2.generated', key: 'ap2.key', originals: 'ap2.originals' };
  const B = { data: null, encrypted: false, key: null, keyInfo: null, pageCache: new Map() };

  // ---------- Speicher ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { throw new Error('Der Browser-Speicher ist voll. Lösche alte Sitzungen in der Statistik'); }
    if (k !== LS.key) window.dispatchEvent(new Event('ap2:changed'));
  };
  const sessionsAll = () => load(LS.sessions, {});
  const sessionPut = (s) => { const all = sessionsAll(); all[s.id] = s; save(LS.sessions, all); };
  const nowIso = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const fail = (msg) => { throw new Error(msg); };

  // ---------- Krypto (AES-GCM, Schlüssel per PBKDF2 aus dem Passwort) ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  async function deriveKey(password, info) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(info.salt), iterations: info.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function decrypt(buf, key) {
    const u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12));
  }
  async function gunzip(buf) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).arrayBuffer();
  }
  async function sha16(text) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Daten laden ----------
  async function init() {
    const info = await fetch('data/key.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!info) {
      const r = await fetch('data/bundle.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('Prüfungsdaten nicht gefunden (data/bundle.json)');
      B.data = await r.json();
      return { needsPassword: false };
    }
    B.encrypted = true; B.keyInfo = info;
    const stored = localStorage.getItem(LS.key);
    if (stored) {
      // Schlüssel nur verwerfen, wenn er nicht mehr passt (neues Passwort); bei Lade- oder Netzfehlern behalten
      try { await unlockWithRaw(b64(stored)); return { needsPassword: false }; } catch (e) {
        if (e && e.name === 'OperationError') localStorage.removeItem(LS.key);
        else throw new Error('Die Prüfungsdaten konnten gerade nicht geladen werden. Bitte die Seite neu laden');
      }
    }
    return { needsPassword: true };
  }
  async function unlockWithRaw(raw) {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['decrypt']);
    await openBundle(key);
  }
  async function openBundle(key) {
    const enc = await fetch(`data/bundle.bin?v=${B.keyInfo.version || ''}`).then((r) => { if (!r.ok) throw new Error('Datenpaket fehlt'); return r.arrayBuffer(); });
    const plain = await gunzip(await decrypt(enc, key));
    B.data = JSON.parse(new TextDecoder().decode(plain));
    B.key = key;
  }
  // Hauptpasswort oder eines der weiteren aus key.json (extra: Datenschlüssel, verschlüsselt mit dem Schlüssel aus dem Passwort)
  async function keyFor(password, info) {
    const main = await deriveKey(password, info);
    if (!info.check || await decrypt(b64(info.check), main).then(() => true, () => false)) return main;
    for (const e of info.extra || []) {
      try { return await crypto.subtle.importKey('raw', await decrypt(b64(e.key), await deriveKey(password, e)), 'AES-GCM', true, ['decrypt']); } catch (err) { /* nächstes Passwort */ }
    }
    throw new Error('Das Passwort stimmt nicht');
  }
  // ZIP ohne Bibliothek und ohne Kompression (PDFs mit JPEG lassen sich kaum verkleinern); Dateinamen in UTF-8
  // shortcut: kein ZIP64, also höchstens 4 GB und 65535 Dateien, ein Archivabschnitt liegt weit darunter
  const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  // files: [{ path, crc, size, blob, date? }]
  function zipBlob(files) {
    const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
    const head = (sig, size, fill) => { const v = new DataView(new ArrayBuffer(size)); v.setUint32(0, sig, true); fill(v); return new Uint8Array(v.buffer); };
    const common = (v, p, f) => {
      const t = f.date || new Date(), time = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), date = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
      v.setUint16(p, 20, true); v.setUint16(p + 2, 0x0800, true); v.setUint16(p + 6, time, true); v.setUint16(p + 8, date, true); v.setUint32(p + 10, f.crc, true); v.setUint32(p + 14, f.size, true); v.setUint32(p + 18, f.size, true); v.setUint16(p + 22, f.name.length, true); };
    files.forEach((f) => {
      f.name = enc.encode(f.path);
      parts.push(head(0x04034b50, 30, (v) => common(v, 4, f)), f.name, f.blob);
      dir.push(head(0x02014b50, 46, (v) => { v.setUint16(4, 20, true); common(v, 6, f); v.setUint32(42, off, true); }), f.name);
      off += 30 + f.name.length + f.size;
    });
    const dsize = dir.reduce((n, b) => n + b.length, 0);
    return new Blob([...parts, ...dir, head(0x06054b50, 22, (v) => { v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, dsize, true); v.setUint32(16, off, true); })], { type: 'application/zip' });
  }
  async function unlock(password) {
    const key = await keyFor(password, B.keyInfo);
    try { await openBundle(key); } catch (e) { throw new Error('Das Passwort stimmt nicht'); }
    localStorage.setItem(LS.key, toB64(await crypto.subtle.exportKey('raw', key)));
  }
  function lock() { localStorage.removeItem(LS.key); location.reload(); }

  async function pageSrc(path) {
    if (!B.encrypted) return '/files/' + path.split('/').map(encodeURIComponent).join('/');
    if (B.pageCache.has(path)) return B.pageCache.get(path);
    const name = await sha16(path);
    const r = await fetch(`p/${name.slice(0, 2)}/${name}.bin`);
    if (!r.ok) throw new Error('Seite nicht gefunden');
    const blob = new Blob([await decrypt(await r.arrayBuffer(), B.key)], { type: path.endsWith('.png') ? 'image/png' : 'image/webp' });
    const url = URL.createObjectURL(blob);
    B.pageCache.set(path, url);
    if (B.pageCache.size > 80) { const [k, v] = B.pageCache.entries().next().value; URL.revokeObjectURL(v); B.pageCache.delete(k); }
    return url;
  }

  // ---------- Modellhilfen ----------
  const AUTO = new Set(['number', 'choice', 'multi_choice', 'assignment', 'order']);
  const KIND = { Teil1: { id: 'teil1', title: 'Installation von und Service an IT-Geräten, IT-Systemen und IT-Infrastrukturen', dur: 90 }, Teil2: { id: 'teil2', title: 'Anbindung von Geräten, Systemen und Betriebsmitteln an die Stromversorgung', dur: 90 }, WiSo: { id: 'wiso', title: 'Wirtschafts- und Sozialkunde', dur: 60 } };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const gradeFor = (p) => p >= 92 ? 1 : p >= 81 ? 2 : p >= 67 ? 3 : p >= 50 ? 4 : p >= 30 ? 5 : 6;
  const GRADE = ['', 'sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'];
  const de = (x) => String(+(+x).toFixed(2)).replace('.', ',');

  function generatedAll() { return load(LS.generated, {}); }
  function allExams() {
    const gen = Object.values(generatedAll()).map(buildFromRecipe).filter(Boolean);
    return [...B.data.exams, ...gen];
  }
  function examById(id) {
    const real = B.data.exams.find((e) => e.id === id);
    if (real) return real;
    const r = generatedAll()[id];
    return r ? buildFromRecipe(r) : null;
  }
  function stripped(e) {
    const c = clone(e);
    c.parts.forEach((p) => { p.solution_pages = []; p.tasks.forEach((t) => t.items.forEach((i) => { i.solution = ''; i.grading = ''; i.keywords = []; i.hints = []; i.expected = ''; })); });
    return c;
  }
  function summarize(e) {
    return {
      id: e.id, title: e.title, profession: e.profession, season: e.season, year: e.year, regulation: e.regulation, origin: e.origin,
      official_solutions: e.official_solutions, notes: e.notes,
      parts: e.parts.map((p) => ({ id: p.id, kind: p.kind, title: p.title, duration_min: p.duration_min, max_points: p.max_points, tasks: p.tasks.length, items: p.tasks.reduce((a, t) => a + t.items.length, 0), has_pages: !!(p.page_images && p.page_images.length), auto_items: p.tasks.reduce((a, t) => a + t.items.filter((i) => AUTO.has(i.answer_type)).length, 0) })),
    };
  }

  // ---------- Bewertung (Port von src/grading.rs) ----------
  // „Störung“ und „Stoerung“, „Maß“ und „Mass“ gelten gleich
  const normalize = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, ' ');
  // Tippfehler-Toleranz: Abstand (Einfügen, Löschen, Ersetzen, Vertauschen) bis zu einer Grenze
  const near = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return false;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length] <= max;
  };
  function parseNumber(s) {
    let t = String(s || '').trim().replace(/[^0-9.,+-]/g, '');
    if (!t) return null;
    const hasC = t.includes(','), hasD = t.includes('.');
    let c;
    if (hasC && hasD) c = t.replace(/\./g, '').replace(',', '.');
    else if (hasC) c = t.replace(',', '.');
    else if (hasD) { const p = t.split('.'); c = (p.length > 2 || (p.length === 2 && p[1].length === 3 && p[0].length <= 3 && p[0].length > 0)) ? t.replace(/\./g, '') : t; }
    else c = t;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  }
  const digits = (s) => String(s || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hasInk = (a) => !!(a && a.marks && (a.marks.strokes || []).some((s) => !s.erase));
  const isEmpty = (a) => !a || (!(a.text || '').trim() && !(a.value || '').trim() && !(a.selected || []).length && !(a.cells || []).some((r) => r.some((c) => (c || '').trim())));
  function check(item, a) {
    a = a || {};
    const res = { auto_points: null, correct: null, keywords: [], keyword_ratio: 0, suggested_points: 0, message: '' };
    const t = item.answer_type;
    const exp = String(item.expected || '').trim();
    if (t === 'number' && (exp.match(/\./g) || []).length >= 2 && !exp.includes(',') && exp.length >= 8) {
      const n = (s) => String(s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      const got = (a.value || '').trim() ? a.value : a.text;
      const ok = !!String(got || '').trim() && n(got) === n(exp);
      Object.assign(res, { correct: ok, auto_points: ok ? item.points : 0, message: ok ? 'Richtig.' : `Erwartet: ${exp}` });
    } else if (t === 'number') {
      const e = parseNumber(exp), g = parseNumber((a.value || '').trim() ? a.value : a.text);
      if (e !== null && g !== null) {
        const tol = Math.max(item.tolerance > 0 ? item.tolerance : 0, 0.02);
        const ok = e === 0 ? Math.abs(g) < 0.005 : (Math.abs((g - e) / e) <= tol || Math.abs(g - e) <= 0.01);
        Object.assign(res, { correct: ok, auto_points: ok ? item.points : 0, message: ok ? `Richtig: ${exp} ${item.unit || ''}` : `Erwartet: ${exp} ${item.unit || ''}, deine Eingabe: ${de(g)}` });
      } else if (e !== null) Object.assign(res, { correct: false, auto_points: 0, message: 'Keine Zahl erkannt.' });
      else res.message = 'Keine automatische Prüfung möglich.';
    } else if (t === 'choice') {
      const keys = (item.options || []).map((o) => o.key);
      let got = (a.selected || [])[0] || (a.value || '').trim();
      if (got && !keys.includes(got)) { const k = digits(got).filter((x) => keys.includes(x)); if (k.length === 1) got = k[0]; }
      const ok = !!got && got === exp;
      Object.assign(res, { correct: ok, auto_points: ok ? item.points : 0, message: ok ? 'Richtig.' : `Richtige Lösung: ${exp}` });
    } else if (t === 'multi_choice') {
      const num = (x, y) => x.localeCompare(y, undefined, { numeric: true });
      const got = [...new Set((a.selected || []).length ? a.selected : digits(a.value))].sort(num);
      const e = digits(exp).sort(num);
      const ok = got.join(',') === e.join(',');
      // Teilpunkte wie „je Angabe 1 Punkt“: richtige Kreuze zählen, falsche ziehen ab
      const right = got.filter((x) => e.includes(x)).length, wrong = got.length - right;
      const pts = ok ? item.points : e.length ? Math.max(0, Math.floor(item.points * (right - wrong) / e.length * 2) / 2) : 0;
      Object.assign(res, { correct: ok, auto_points: pts, message: ok ? 'Richtig.' : `Richtige Lösung: ${e.join(', ')}${pts ? ` (${de(pts)} von ${de(item.points)} Punkten)` : ''}` });
    } else if (t === 'assignment' || t === 'order') {
      const got = (a.selected || []).length ? a.selected : digits(a.value);
      const e = digits(exp);
      const ok = got.join(',') === e.join(',');
      const partial = got.length === e.length && e.length ? got.filter((x, i) => x === e[i]).length / e.length : 0;
      Object.assign(res, { correct: ok, auto_points: ok ? item.points : 0, message: ok ? 'Richtig.' : `Richtige Reihenfolge: ${e.join(' ')} (${Math.round(partial * 100)} % der Positionen korrekt)` });
    } else if ((item.fields || []).some((f) => f.tick && f.label) && a.fields) {
      // Ankreuztabelle: je Zeile genau die Spalte, die in der Lösung hinter der Zeilenbezeichnung zuerst genannt ist
      const sq = (x) => normalize(x).replace(/\s+/g, '');
      const sol = sq(item.solution), rows = {};
      item.fields.forEach((f, i) => { if (f.tick && f.label) { const k = f.label.split(': ')[0]; (rows[k] = rows[k] || []).push({ col: f.label.slice(k.length + 2), on: !!a.fields[i] }); } });
      let ok = 0, n = 0;
      Object.entries(rows).forEach(([row, cols]) => {
        const i = sol.indexOf(sq(row)); if (i < 0) return;
        const after = sol.slice(i + sq(row).length);
        const right = cols.map((c) => ({ c, at: after.indexOf(sq(c.col)) })).filter((x) => x.at >= 0).sort((x, y) => x.at - y.at)[0];
        if (!right) return;
        n++; if (cols.every((c) => c.on === (c === right.c))) ok++;
      });
      if (n) {
        res.suggested_points = Math.round(item.points * ok / n * 2) / 2;
        res.message = `${ok} von ${n} Zeilen richtig angekreuzt: ${de(res.suggested_points)} von ${de(item.points)} Punkten`;
      } else res.message = 'Bitte mit der Musterlösung vergleichen und selbst bewerten.';
    } else {
      let text = a.text || '';
      (a.cells || []).forEach((r) => r.forEach((c) => { text += ' ' + (c || ''); }));
      const words = normalize(text).split(/\s+/).filter(Boolean);
      const stem = (kp) => [...kp].slice(0, Math.min(Math.max([...kp].length, 4), 6)).join('');
      const hitStem = (s) => words.some((w) => w.startsWith(s) || (w.length >= 4 && s.startsWith(w)) || (s.length >= 5 && near(s, w.slice(0, s.length), s.length >= 8 ? 2 : 1)));
      let hits = 0;
      (item.keywords || []).forEach((kw) => {
        const parts = normalize(kw).split(/\s+/).filter(Boolean);
        const hit = parts.length > 0 && (parts.every((p) => hitStem(stem(p))) || (parts.length > 1 && hitStem(stem(parts.join('')))));
        if (hit) hits++;
        res.keywords.push({ keyword: kw, hit });
      });
      if ((item.keywords || []).length) {
        res.keyword_ratio = hits / item.keywords.length;
        res.suggested_points = Math.round(res.keyword_ratio * item.points * 2) / 2;
        res.message = `${hits} von ${item.keywords.length} Stichworten gefunden, ${de(res.suggested_points)} von ${de(item.points)} Punkten`;
      } else res.message = 'Bitte mit der Musterlösung vergleichen und selbst bewerten.';
    }
    return res;
  }

  // ---------- Sitzungen (Port von src/session.rs) ----------
  const findItem = (exam, partId, itemId) => {
    const part = exam.parts.find((p) => p.id === partId);
    if (!part) return null;
    for (const t of part.tasks) { const i = t.items.find((x) => x.id === itemId); if (i) return { part, task: t, item: i }; }
    return null;
  };
  const ans = (s, p, i) => s.answers[`${p}/${i}`] || {};
  const partState = (s, pid) => s.parts.find((p) => p.part_id === pid);
  function remaining(s, pid) {
    const st = partState(s, pid);
    if (!st || !st.deadline) return null;
    if (st.finished_at) return 0;
    return Math.max(0, Math.floor((Date.parse(st.deadline) - Date.now()) / 1000));
  }
  function locked(s, pid) {
    const st = partState(s, pid);
    if (!st) return true;
    if (st.finished_at) return true;
    return st.deadline ? Date.now() > Date.parse(st.deadline) + 15000 : false;
  }
  function evaluate(s, exam) {
    const parts = []; const topicMap = {};
    for (const pid of s.part_order) {
      const part = exam.parts.find((p) => p.id === pid);
      if (!part) continue;
      const items = []; let sum = 0, open = 0, unrated = 0;
      for (const t of part.tasks) for (const it of t.items) {
        const a = ans(s, pid, it.id); const ink = hasInk(a); const answered = !isEmpty(a) || ink;
        const ir = { part_id: pid, task_number: t.number, item_id: it.id, label: it.label, max_points: it.points, points: null, auto: AUTO.has(it.answer_type), answered, ink, topics: it.topics || [], check: null };
        // Handschrift: eigene Punkte gehen vor (das Lesen kann irren); ungelesen bleibt sie offen statt 0 Punkte
        if (ink && a.self_points !== null && a.self_points !== undefined) ir.points = Math.max(0, Math.min(it.points, a.self_points));
        else if (ink && isEmpty(a)) unrated++;
        else if (ir.auto) { const c = check(it, a); ir.points = c.auto_points ?? 0; ir.check = c; }
        else if (a.self_points !== null && a.self_points !== undefined) ir.points = Math.max(0, Math.min(it.points, a.self_points));
        else if (!answered) ir.points = 0;
        else { ir.check = check(it, a); ir.points = ir.check.suggested_points || 0; ir.keyword = true; }
        if (ir.points !== null) { sum += ir.points; (it.topics || []).forEach((tp) => { const e = topicMap[tp] || (topicMap[tp] = [0, 0]); e[0] += ir.points; e[1] += it.points; }); }
        items.push(ir);
      }
      const st = partState(s, pid);
      const used = st && st.started_at ? Math.max(0, ((st.finished_at ? Date.parse(st.finished_at) : Date.now()) - Date.parse(st.started_at)) / 60000) : 0;
      const grade = gradeFor(sum / part.max_points * 100);
      parts.push({ part_id: pid, title: part.title, kind: part.kind, max_points: part.max_points, points: sum, open_points: open, unrated_items: unrated, grade, grade_label: GRADE[grade], used_minutes: used, items });
    }
    const total_points = parts.reduce((a, p) => a + p.points, 0);
    const total_max = parts.reduce((a, p) => a + p.max_points, 0);
    const average_grade = parts.length ? parts.reduce((a, p) => a + p.grade, 0) / parts.length : 0;
    // § 15 Abs. 2 ITSEAusbV, auf die schriftlichen Bereiche übertragen: Stromversorgung (Teil2) mindestens ausreichend, höchstens ein weiterer Bereich darunter, keiner ungenügend
    const strom = parts.find((p) => p.kind === 'Teil2');
    const passed = parts.length > 0 && total_max > 0 && total_points / total_max >= 0.5 && (!strom || strom.grade <= 4) && parts.filter((p) => p.grade >= 5).length <= 1 && !parts.some((p) => p.grade === 6);
    const topic_stats = Object.entries(topicMap).map(([topic, [p, m]]) => ({ topic, points: p, max_points: m, ratio: m > 0 ? p / m : 0 })).sort((a, b) => a.ratio - b.ratio);
    return { parts, total_points, total_max, average_grade, passed, topic_stats };
  }
  function viewOf(s) {
    const exam = examById(s.exam_id);
    if (!exam) fail('Die Prüfung zu dieser Sitzung gibt es nicht mehr');
    const r = {}; s.part_order.forEach((p) => { r[p] = remaining(s, p); });
    return { session: s, exam: s.mode === 'exam' && !s.finished ? stripped(exam) : exam, remaining: r, server_time: nowIso() };
  }
  function finalize(s) {
    const exam = examById(s.exam_id);
    s.part_order.forEach((p) => { const st = partState(s, p); if (!st.started_at) st.started_at = nowIso(); if (!st.finished_at) st.finished_at = nowIso(); });
    s.finished = true; s.finished_at = nowIso();
    if (exam) s.result = evaluate(s, exam);
  }
  function getSession(id) { const s = sessionsAll()[id]; if (!s) fail('Sitzung nicht gefunden'); return s; }

  function genericHint(item, level) {
    const op = normalize(item.text);
    const operator = op.includes('berechn') ? 'Rechenaufgabe: Notiere zuerst alle gegebenen Größen mit Einheiten, wähle die passende Formel aus dem Belegsatz und rechne Schritt für Schritt (Rechenweg aufschreiben!).'
      : (op.includes('erlautern') || op.includes('erklaren')) ? 'Erläutern heißt: Begriff nennen UND begründen bzw. den Zusammenhang erklären, zwei Sätze mit „weil“ oder „dadurch“.'
      : op.includes('beschreib') ? 'Beschreiben heißt: in zusammenhängenden Stichworten den Ablauf oder die Funktion darstellen.'
      : op.includes('nennen') ? 'Nennen heißt: nur Stichworte, genau so viele, wie gefordert werden.'
      : 'Lies die Aufgabe nochmals genau: Welcher Operator wird verwendet und wie viele Angaben werden gefordert?';
    if (level === 1) return `Ansatz: Thema ${(item.topics || []).join(', ')}. ${operator}`;
    if (level === 2) return `Konkreter: Überlege, welche Schlüsselbegriffe erwartet werden (${de(item.points)} Punkte, etwa ${Math.ceil(item.points)} Aspekte).`;
    return `Lösungsrichtung: ${item.solution || 'Vergleiche deine Antwort anschließend mit den Lösungshinweisen.'}`;
  }

  // ---------- Generator (Port von src/generator.rs, eigener Zufallsgenerator) ----------
  function rngFrom(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const blockPts = (b) => b.points || Math.round(b.items.reduce((a, i) => a + i.points, 0));
  const bank = (kind) => B.data.banks.find((b) => b.kind === kind);
  function pickBlocks(rnd, bk, exclude) {
    let cand = bk.blocks.filter((b) => b.items.length && !exclude.includes(b.id));
    if (cand.length < 4) cand = bk.blocks.filter((b) => b.items.length);
    if (cand.length < 4) fail(`Fragenpool ${bk.kind} enthält zu wenige Blöcke`);
    let best = null;
    for (let n = 0; n < 400; n++) {
      const pool = shuffle([...cand], rnd); let chosen = []; const clusters = [];
      for (const b of pool) { if (chosen.length === 4) break; if (clusters.includes(b.cluster)) continue; chosen.push(b); clusters.push(b.cluster); }
      if (chosen.length < 4) chosen = pool.slice(0, 4);
      const score = Math.abs(chosen.reduce((a, b) => a + blockPts(b), 0) - 100);
      if (!best || score < best.score) best = { score, blocks: chosen };
      if (score === 0) break;
    }
    return shuffle(best.blocks, rnd).map((b) => b.id);
  }
  function generate(req) {
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const rnd = rngFrom(seed);
    const kinds = (req.parts && req.parts.length ? req.parts : ['teil1', 'teil2', 'wiso']).map((p) => ({ teil1: 'Teil1', teil2: 'Teil2', wiso: 'WiSo' }[p])).filter(Boolean);
    const scen = B.data.scenarios.length ? B.data.scenarios[Math.floor(rnd() * B.data.scenarios.length)] : null;
    const exclude = [];
    if (req.avoid_recent) Object.values(generatedAll()).filter((g) => g.kind === 'gen').sort((a, b) => b.id.localeCompare(a.id)).slice(0, 2).forEach((g) => g.parts.forEach((p) => (p.blocks || []).forEach((id) => exclude.push(id))));
    const parts = kinds.map((kind) => {
      if (kind !== 'WiSo') return { kind, blocks: pickBlocks(rnd, bank(kind), exclude) };
      const bk = bank('WiSo');
      const four = shuffle(bk.items.filter((i) => i.points === 4), rnd), three = shuffle(bk.items.filter((i) => i.points === 3), rnd);
      if (four.length + three.length < 30) fail('WiSo-Pool enthält zu wenige Aufgaben');
      const per = {}; const chosen = [];
      // Inhaltlich gleiche Fragen (gleiche group) höchstens einmal je Prüfung
      const groups = new Set(); const dup = (it) => it.group && groups.has(it.group);
      const pick = (it) => { if (it.group) groups.add(it.group); chosen.push({ id: it.id, points: it.points }); };
      const take = (pool, n) => { let k = 0; const rest = []; for (const it of pool) { if (dup(it)) continue; if (k >= n) { rest.push(it); continue; } const tp = (it.topics || [])[0] || ''; if ((per[tp] || 0) >= 4) { rest.push(it); continue; } per[tp] = (per[tp] || 0) + 1; pick(it); k++; } for (const it of rest) { if (k >= n) break; if (dup(it)) continue; pick(it); k++; } return k; };
      const n4 = take(four, 10); take(three, 30 - n4);
      shuffle(chosen, rnd);
      let sum = chosen.reduce((a, c) => a + c.points, 0);
      for (const c of chosen) { if (sum >= 100) break; if (c.points === 3) { c.points = 4; sum++; } }
      return { kind, wiso: chosen };
    });
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const recipe = { kind: 'gen', id: `gen-${stamp}-${(seed >>> 0).toString(16).padStart(8, '0')}`, title: req.title || `Generierte Prüfung ${d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}${scen ? ` (${scen.company})` : ''}`, seed, scenario: scen ? scen.id : null, created: nowIso(), parts };
    const all = generatedAll(); all[recipe.id] = recipe; save(LS.generated, all);
    return buildFromRecipe(recipe);
  }
  function situationText(scen, kind, tasks) {
    if (!scen) return 'Die Aufgaben 1 bis 4 beziehen sich auf die folgende Ausgangssituation:\n\nSie sind Auszubildende/r in einem IT-Systemhaus und mit der Umsetzung der folgenden Aufträge beauftragt.';
    const bullets = kind === 'Teil1' ? scen.teil1_bullets : scen.teil2_bullets;
    let txt = `Die Aufgaben 1 bis 4 beziehen sich auf die folgende Ausgangssituation:\n\n${scen.description}\n\nSie sind in der Ausbildung bei der ${scen.company} und mit der Umsetzung beauftragt.\n\nDies beinhaltet unter anderem:\n`;
    tasks.forEach((t) => { txt += `– ${t.title}\n`; });
    if (bullets && bullets.length) { txt += '\nRahmenbedingungen:\n'; bullets.forEach((b) => { txt += `– ${b}\n`; }); }
    return txt;
  }
  function buildFromRecipe(r) {
    try {
      if (r.kind === 'topic') return buildTopic(r);
      const scen = B.data.scenarios.find((s) => s.id === r.scenario) || null;
      const parts = r.parts.map((p) => {
        if (p.kind === 'WiSo') {
          const bk = bank('WiSo');
          const tasks = p.wiso.map((c, n) => { const src = bk.items.find((i) => i.id === c.id); const it = clone(src); it.id = `w${String(n + 1).padStart(2, '0')}`; it.label = ''; it.points = c.points; return { number: n + 1, title: (it.topics || [])[0] || '', points: c.points, intro: '', items: [it] }; });
          return { id: 'wiso', kind: 'WiSo', title: KIND.WiSo.title, duration_min: 60, max_points: tasks.reduce((a, t) => a + t.points, 0), situation: '', page_images: [], solution_pages: [], attachments: [], tasks };
        }
        const bk = bank(p.kind);
        const tasks = p.blocks.map((id, n) => { const b = bk.blocks.find((x) => x.id === id); const items = clone(b.items); items.forEach((it) => { const core = (it.label || '').replace(/\)$/, ''); it.id = `${n + 1}${core || it.id}`; it.difficulty = it.difficulty || 2; it.tolerance = it.tolerance || 0.01; }); return { number: n + 1, title: b.title, points: blockPts(b), intro: b.intro || '', items }; });
        const sum = tasks.reduce((a, t) => a + t.items.reduce((x, i) => x + i.points, 0), 0); const diff = 100 - sum;
        if (Math.abs(diff) > 0.01 && Math.abs(diff) <= 4) {
          const tot = (t) => t.items.reduce((x, i) => x + i.points, 0);
          const idx = tasks.reduce((bi, t, i) => (diff > 0 ? tot(t) < tot(tasks[bi]) : tot(t) > tot(tasks[bi])) ? i : bi, 0);
          const last = [...tasks[idx].items].reverse().find((i) => i.points + diff >= 1); if (last) last.points += diff;
        }
        tasks.forEach((t) => { t.points = Math.round(t.items.reduce((x, i) => x + i.points, 0)); });
        return { id: KIND[p.kind].id, kind: p.kind, title: KIND[p.kind].title, duration_min: KIND[p.kind].dur, max_points: tasks.reduce((a, t) => a + t.points, 0), situation: situationText(scen, p.kind, tasks), page_images: [], solution_pages: [], attachments: [], tasks };
      });
      const d = new Date(r.created);
      return { id: r.id, title: r.title, profession: 'ITSE', season: d.getMonth() < 6 ? 'Sommer' : 'Winter', year: d.getFullYear(), regulation: 'AO2020', origin: 'generated', official_solutions: false, sources: [], notes: 'Diese Prüfung wurde nach dem Schema der IHK-Abschlussprüfung Teil 2 aus dem Fragenpool zusammengestellt.', parts };
    } catch (e) { return null; }
  }
  function buildTopic(r) {
    const parts = [];
    let n = 0;
    for (const ref of r.items) {
      const e = B.data.exams.find((x) => x.id === ref.exam); if (!e) continue;
      const f = findItem(e, ref.part, ref.item); if (!f) continue;
      let part = parts.find((p) => p.kind === f.part.kind);
      if (!part) { part = { id: KIND[f.part.kind].id, kind: f.part.kind, title: `${KIND[f.part.kind].title} – Thema ${r.topic}`, duration_min: KIND[f.part.kind].dur, max_points: 0, situation: '', page_images: [], solution_pages: [], attachments: [], tasks: [] }; parts.push(part); }
      n++;
      const it = clone(f.item); it.id = `t${String(n).padStart(3, '0')}`; it.figure_pages = []; it.src = ref;
      const title = f.part.kind === 'WiSo' ? `WiSo ${e.season} ${e.year}, Aufgabe ${f.task.number}` : `${e.season} ${e.year}, ${f.task.number}. Aufgabe ${f.task.title}`;
      part.tasks.push({ number: part.tasks.length + 1, title, points: Math.round(f.item.points), intro: f.part.kind === 'WiSo' ? '' : f.task.intro, items: [it] });
      part.max_points += Math.round(f.item.points);
    }
    return { id: r.id, title: r.title, profession: 'ITSE', season: '', year: new Date(r.created).getFullYear(), regulation: 'AO2020', origin: 'generated', official_solutions: true, sources: [], notes: 'Zusammenstellung von Teilaufgaben zu einem Thema aus den Originalprüfungen (für den Lernmodus).', parts };
  }
  function topicExam(req) {
    const topic = String(req.topic || '').trim(); if (!topic) fail('Thema fehlt');
    const limit = req.limit || 40; const items = [];
    const list = B.data.exams.filter((e) => e.origin === 'real').sort((a, b) => b.year - a.year || b.season.localeCompare(a.season));
    outer: for (const e of list) for (const p of e.parts) for (const t of p.tasks) for (const i of t.items) {
      if (items.length >= limit) break outer;
      if (i.needs_figure || !(i.topics || []).some((x) => x.toLowerCase() === topic.toLowerCase())) continue;
      items.push({ exam: e.id, part: p.id, item: i.id });
    }
    if (!items.length) fail(`Keine Teilaufgaben zum Thema „${topic}“ gefunden`);
    const slug = topic.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const r = { kind: 'topic', id: `thema-${slug}-${Date.now().toString(36)}`, topic, title: `Themen-Training: ${topic} (${items.length} Teilaufgaben aus echten Prüfungen)`, created: nowIso(), items };
    const all = generatedAll(); all[r.id] = r; save(LS.generated, all);
    return buildTopic(r);
  }

  // ---------- Verlauf je Original-Teilaufgabe (Fehlerkorb, Prognose) ----------
  // Letzter bewerteter Versuch je Teilaufgabe aus echten Prüfungen und Themen-Trainings.
  // shortcut: generierte Prüfungen fehlen, weil ihre Aufgaben aus dem Fragenpool stammen; bei Bedarf Pool-IDs mitführen.
  function attempts() {
    const out = [];
    for (const s of Object.values(sessionsAll())) {
      const e = examById(s.exam_id); if (!e || !(e.origin === 'real' || s.exam_id.startsWith('thema-'))) continue;
      const r = evaluate(s, e);
      for (const p of r.parts) {
        const part = e.parts.find((x) => x.id === p.part_id);
        for (const ir of p.items) {
          // Selbst bewertet zählt auch ohne getippte Antwort (Bewertung nach Kriterien); leere Antworten nur in abgeschlossenen Prüfungen
          const own = ans(s, p.part_id, ir.item_id).self_points;
          if (ir.points === null || (!ir.answered && (own === null || own === undefined) && !(s.mode === 'exam' && s.finished))) continue;
          const it = part.tasks.flatMap((t) => t.items).find((x) => x.id === ir.item_id);
          const src = it.src || { exam: e.id, part: p.part_id, item: ir.item_id };
          out.push({ ...src, key: `${src.exam}/${src.part}/${src.item}`, points: ir.points, max: ir.max_points, when: ans(s, p.part_id, ir.item_id).updated_at || s.created_at, kind: p.kind, topics: ir.topics });
        }
      }
    }
    return out.sort((a, b) => a.when.localeCompare(b.when));
  }
  // Wiederholung nach festen Abständen (Leitner wie ap2-lerntool und ap2-tracker): Stufe 0 ist der Fehlerkorb und sofort fällig,
  // ab 80 % der Punkte eine Stufe höher (nur wenn die Aufgabe fällig war), unter 50 % zurück auf 0, Stufe 5 gilt als gemeistert.
  const BOX_DAYS = [0, 1, 3, 7, 14];
  // s: bisheriger Stand der Teilaufgabe oder undefined, r: Anteil der Punkte, t: Zeitpunkt des Versuchs (ms)
  const nextBox = (s, r, t) => r < 0.5 ? 0 : r >= 0.8 && (!s || t >= s.dueAt - 12 * 3600e3) ? Math.min((s ? s.box : 0) + 1, 5) : Math.max(s ? s.box : 0, 1);
  function reviewItems() {
    const st = {};
    for (const a of attempts()) {
      const s = st[a.key]; const r = a.points / Math.max(0.5, a.max); const t = Date.parse(a.when);
      const box = nextBox(s, r, t);
      st[a.key] = { ...a, ratio: r, box, dueAt: box >= 5 ? Infinity : t + BOX_DAYS[box] * 864e5 };
    }
    return Object.values(st).map((a) => {
      const e = B.data.exams.find((x) => x.id === a.exam); const f = e && findItem(e, a.part, a.item);
      return f && !f.item.needs_figure ? { ...a, title: `${e.season === 'Winter' ? `Winter ${e.year}/${String(e.year + 1).slice(2)}` : `${e.season} ${e.year}`}, ${kindShortL[a.kind] || a.kind}, Aufgabe ${f.task.number}${f.item.label ? ' ' + f.item.label : ''}` } : null;
    }).filter(Boolean);
  }
  function reviewSummary() {
    const all = reviewItems(); const now = Date.now(); const boxes = [0, 0, 0, 0, 0, 0]; all.forEach((a) => { boxes[a.box]++; });
    const future = all.filter((a) => a.dueAt > now && a.dueAt !== Infinity).map((a) => a.dueAt);
    return { due: all.filter((a) => a.dueAt <= now).length, mistakes: boxes[0], boxes, total: all.length, next: future.length ? new Date(Math.min(...future)).toISOString() : null };
  }
  const kindShortL = { Teil1: 'Teil 1', Teil2: 'Teil 2', WiSo: 'WiSo' };
  // Wie oft kam ein Thema in echten Prüfungen vor? Je Termin einmal gezählt (Methode wie fiae-ap2-pruefungstrainer/Themenanalyse.md).
  // Unsere Themen sind breiter gefasst, darum gilt als Prüfungskern: in mindestens 70 % der Termine; Trend: letzte vier Termine gegenüber den früheren.
  function topicAnalysis() {
    const termine = {}; const occ = {}; const seen = new Set();
    for (const e of B.data.exams.filter((x) => x.origin === 'real')) {
      const key = `${e.year}-${e.season === 'Winter' ? 2 : 1}`; const label = e.season === 'Winter' ? `Winter ${e.year}/${String(e.year + 1).slice(2)}` : `${e.season} ${e.year}`;
      for (const p of e.parts) {
        (termine[p.kind] || (termine[p.kind] = new Set())).add(key);
        for (const t of p.tasks) for (const i of t.items) for (const tp of (i.topics || [])) {
          const id = `${key}|${p.kind}|${t.number}|${i.label}|${tp.toLowerCase()}`; if (seen.has(id)) continue; seen.add(id);
          const o = occ[tp.toLowerCase()] || (occ[tp.toLowerCase()] = { kind: p.kind, hits: {} });
          const h = o.hits[key] || (o.hits[key] = { label, refs: [], points: 0 });
          h.refs.push(`${kindShortL[p.kind]} A${t.number}${i.label ? ' ' + i.label.replace(/\)$/, '') : ''}`); h.points += i.points;
        }
      }
    }
    const out = {};
    for (const [topic, o] of Object.entries(occ)) {
      const all = [...termine[o.kind]].sort(); const keys = Object.keys(o.hits);
      const recent = all.slice(-4); const older = all.slice(0, -4);
      const share = (list) => list.length ? list.filter((k) => keys.includes(k)).length / list.length : 0;
      const d = share(recent) - share(older);
      out[topic] = { termine: keys.length, of: all.length, label: keys.length / all.length >= 0.7 ? 'Prüfungskern' : 'Kam vor', trend: older.length && d >= 0.4 ? 'zuletzt häufiger' : older.length && d <= -0.4 ? 'zuletzt seltener' : '',
        avg_points: Math.round(keys.reduce((a, k) => a + o.hits[k].points, 0) / keys.length), found: keys.sort().reverse().map((k) => ({ termin: o.hits[k].label, refs: o.hits[k].refs })) };
    }
    return out;
  }
  // Prognose je Prüfungsbereich: 60 % letzte drei Simulationen, 40 % letzte 40 bewertete Teilaufgaben (nach Punkten gewichtet), wie ap2-lerntool
  function readiness() {
    const sims = {};
    for (const s of Object.values(sessionsAll())) {
      if (s.mode !== 'exam' || !s.finished) continue; const e = examById(s.exam_id); if (!e) continue;
      (s.result || evaluate(s, e)).parts.forEach((p) => (sims[p.kind] || (sims[p.kind] = [])).push({ when: s.created_at, pct: p.points / Math.max(1, p.max_points) * 100 }));
    }
    const att = attempts();
    return ['Teil1', 'Teil2', 'WiSo'].map((kind) => {
      const sm = (sims[kind] || []).sort((a, b) => a.when.localeCompare(b.when)).slice(-3); const it = att.filter((a) => a.kind === kind).slice(-40);
      const simPct = sm.length ? sm.reduce((a, x) => a + x.pct, 0) / sm.length : null;
      const itMax = it.reduce((a, x) => a + x.max, 0); const itPct = it.length >= 5 && itMax ? it.reduce((a, x) => a + x.points, 0) / itMax * 100 : null;
      const pts = simPct !== null && itPct !== null ? 0.6 * simPct + 0.4 * itPct : simPct ?? itPct;
      return { kind, points: pts === null ? null : Math.round(pts), simulations: sm.length, items: it.length };
    });
  }

  // ---------- API ----------
  async function handle(method, path, body) {
    if (!B.data) fail('Daten noch nicht geladen');
    const url = new URL(path, location.href); const p = url.pathname.replace(/^.*?\/api\//, '/api/'); const q = url.searchParams;
    let m;
    if (p === '/api/status') {
      const banks = B.data.banks;
      return { exams: allExams().length, real_exams: B.data.exams.length, generated_exams: Object.keys(generatedAll()).length, bank_blocks: banks.reduce((a, b) => a + b.blocks.length, 0), bank_wiso_items: (bank('WiSo') || { items: [] }).items.length, topics: B.data.topics.length, sessions: Object.keys(sessionsAll()).length, warnings: B.data.warnings || [] };
    }
    if (p === '/api/exams') return allExams().map(summarize);
    if ((m = p.match(/^\/api\/exams\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (method === 'DELETE') { const all = generatedAll(); if (!all[id]) fail('Nur generierte Prüfungen können gelöscht werden'); delete all[id]; save(LS.generated, all); return { ok: true }; }
      const e = examById(id); if (!e) fail('Prüfung nicht gefunden');
      return q.get('solutions') === '0' ? stripped(e) : e;
    }
    if (p === '/api/generate') return summarize(generate(body || {}));
    if (p === '/api/bank/summary') return B.data.banks.map((b) => { const c = {}; b.blocks.forEach((x) => { c[x.cluster] = (c[x.cluster] || 0) + 1; }); b.items.forEach((x) => { const k = (x.topics || [])[0] || ''; c[k] = (c[k] || 0) + 1; }); return { kind: b.kind, blocks: b.blocks.length, items: b.items.length, clusters: Object.entries(c).sort() }; });
    if (p === '/api/topics') return B.data.topics;
    if (p === '/api/wiki') return B.data.wiki || [];
    if (p === '/api/fachfragen') return B.data.fachfragen || { categories: [], questions: [] };
    if (p === '/api/topic-counts') { const c = {}; B.data.exams.forEach((e) => e.parts.forEach((pp) => pp.tasks.forEach((t) => t.items.forEach((i) => (i.topics || []).forEach((tp) => { c[tp] = (c[tp] || 0) + 1; }))))); return Object.entries(c).map(([topic, items]) => ({ topic, items })).sort((a, b) => a.topic.localeCompare(b.topic)); }
    if (p === '/api/topic-exam') return summarize(topicExam(body || {}));
    if (p === '/api/topic-analysis') return topicAnalysis();
    if (p === '/api/review' && method === 'GET') return reviewSummary();
    if (p === '/api/review/exam') {
      const now = Date.now();
      const items = reviewItems().filter((a) => a.dueAt <= now).sort((a, b) => a.box - b.box || a.dueAt - b.dueAt).slice(0, 40).map((m) => ({ exam: m.exam, part: m.part, item: m.item }));
      if (!items.length) fail('Heute ist nichts fällig');
      const r = { kind: 'topic', id: `thema-wiederholung-${Date.now().toString(36)}`, topic: 'Wiederholung', title: `Wiederholung: ${items.length} fällige Teilaufgaben`, created: nowIso(), items };
      const all = generatedAll(); all[r.id] = r; save(LS.generated, all);
      return summarize(buildTopic(r));
    }
    if (p === '/api/archive') return B.data.archive || { docs: [] };
    if (p === '/api/sessions' && method === 'GET') return Object.values(sessionsAll()).map((s) => ({ id: s.id, exam_id: s.exam_id, exam_title: s.exam_title, mode: s.mode, created_at: s.created_at, finished: s.finished, part_order: s.part_order, answered: Object.values(s.answers).filter((a) => !isEmpty(a)).length, total_points: s.result ? s.result.total_points : null, total_max: s.result ? s.result.total_max : null, passed: s.result ? s.result.passed : null })).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (p === '/api/sessions' && method === 'POST') {
      const e = examById(body.exam_id); if (!e) fail('Prüfung nicht gefunden');
      const parts = (body.parts || []).filter((x) => e.parts.some((pp) => pp.id === x));
      const order = parts.length ? parts : e.parts.map((pp) => pp.id);
      const s = { id: uuid(), exam_id: e.id, exam_title: e.title, mode: body.mode || 'learn', created_at: nowIso(), part_order: order, parts: order.map((x) => ({ part_id: x, started_at: null, deadline: null, finished_at: null })), answers: {}, finished: false, finished_at: null, result: null };
      sessionPut(s); return viewOf(s);
    }
    if ((m = p.match(/^\/api\/sessions\/([^/]+)(?:\/([a-z-]+))?$/))) {
      const id = m[1], action = m[2] || '';
      if (!action && method === 'DELETE') { const all = sessionsAll(); delete all[id]; save(LS.sessions, all); return { ok: true }; }
      const s = getSession(id);
      const exam = () => examById(s.exam_id) || fail('Prüfung nicht gefunden');
      if (!action) return viewOf(s);
      if (action === 'start') { const st = partState(s, body.part) || fail('Teil nicht in dieser Sitzung'); if (!st.started_at) { st.started_at = nowIso(); if (s.mode === 'exam') { const dur = exam().parts.find((x) => x.id === body.part).duration_min; st.deadline = new Date(Date.now() + dur * 60000).toISOString(); } } sessionPut(s); return viewOf(s); }
      if (action === 'finish-part') { const st = partState(s, body.part) || fail('Teil nicht in dieser Sitzung'); if (!st.started_at) st.started_at = nowIso(); if (!st.finished_at) st.finished_at = nowIso(); if (s.parts.every((x) => x.finished_at)) finalize(s); sessionPut(s); return viewOf(s); }
      if (action === 'finish') { finalize(s); sessionPut(s); return viewOf(s); }
      if (action === 'answer') {
        if (s.mode === 'exam' && locked(s, body.part)) fail('Die Bearbeitungszeit für diesen Teil ist abgelaufen.');
        if (s.mode === 'exam' && !(partState(s, body.part) || {}).started_at) fail('Dieser Teil wurde noch nicht gestartet.');
        const key = `${body.part}/${body.item}`; const prev = s.answers[key] || {}; const a = Object.assign({}, body.answer);
        a.hints_used = Math.max(a.hints_used || 0, prev.hints_used || 0);
        if (a.self_points === undefined || a.self_points === null) a.self_points = prev.self_points ?? null;
        a.updated_at = nowIso(); s.answers[key] = a; sessionPut(s);
        return { ok: true, remaining: remaining(s, body.part) };
      }
      if (action === 'hint') {
        if (s.mode === 'exam' && !s.finished) fail('Im Prüfungsmodus gibt es keine Hinweise.');
        const f = findItem(exam(), body.part, body.item) || fail('Teilaufgabe nicht gefunden');
        const level = Math.min(3, Math.max(1, body.level));
        const hints = f.item.hints || [];
        const hint = hints.length ? hints[Math.min(level - 1, hints.length - 1)] : genericHint(f.item, level);
        const key = `${body.part}/${body.item}`; const a = s.answers[key] || (s.answers[key] = {}); a.hints_used = Math.max(a.hints_used || 0, level); sessionPut(s);
        // Gleichnamige Themen (z. B. Fehlersuche in Teil 1 und Teil 2): nur das aus dem Prüfungsteil der Aufgabe
        const topics = B.data.topics.filter((t) => (f.item.topics || []).some((x) => x.toLowerCase() === t.name.toLowerCase()))
          .filter((t, _, all) => all.filter((x) => x.name === t.name).length === 1 || t.part === f.part.kind);
        return { level, max_level: Math.max(hints.length, 3), hint, topics };
      }
      if (action === 'check') {
        if (s.mode === 'exam' && !s.finished) fail('Im Prüfungsmodus erst nach Abgabe.');
        const f = findItem(exam(), body.part, body.item) || fail('Teilaufgabe nicht gefunden');
        return { check: check(f.item, ans(s, body.part, body.item)), solution: f.item.solution, grading: f.item.grading, expected: f.item.expected, unit: f.item.unit };
      }
      if (action === 'self-grade') {
        const key = `${body.part}/${body.item}`; const a = s.answers[key] || (s.answers[key] = {}); a.self_points = body.points; a.updated_at = nowIso(); if (Array.isArray(body.criteria)) a.criteria = body.criteria; else delete a.criteria;
        if (s.finished) s.result = evaluate(s, exam());
        sessionPut(s); return { ok: true, result: s.result };
      }
      if (action === 'result') return evaluate(s, exam());
    }
    if (p === '/api/progress') {
      const all = Object.values(sessionsAll());
      const out = { sessions_total: all.length, exams_finished: 0, learn_sessions: 0, average_points: 0, best_points: 0, passed: 0, topic_stats: [], recent: [], per_part: [] };
      const topic = {}; const per = {};
      for (const s of all) {
        if (s.mode === 'learn') out.learn_sessions++;
        const e = examById(s.exam_id); const r = s.result || (e ? evaluate(s, e) : null); if (!r) continue;
        if (s.finished && s.mode === 'exam') {
          out.exams_finished++; if (r.passed) out.passed++;
          out.best_points = Math.max(out.best_points, r.total_points); out.average_points += r.total_points;
          r.parts.forEach((pp) => { (per[pp.kind] || (per[pp.kind] = [])).push(pp.points / Math.max(1, pp.max_points) * 100); });
        }
        r.topic_stats.forEach((t) => { const x = topic[t.topic] || (topic[t.topic] = [0, 0]); x[0] += t.points; x[1] += t.max_points; });
      }
      if (out.exams_finished) out.average_points /= out.exams_finished;
      out.topic_stats = Object.entries(topic).filter(([, [, mm]]) => mm > 0).map(([t, [pp, mm]]) => ({ topic: t, points: pp, max_points: mm, ratio: pp / mm })).sort((a, b) => a.ratio - b.ratio);
      out.per_part = Object.entries(per).map(([kind, v]) => ({ kind, attempts: v.length, average_percent: v.reduce((a, x) => a + x, 0) / v.length, best_percent: Math.max(...v) })).sort((a, b) => a.kind.localeCompare(b.kind));
      out.recent = (await handle('GET', '/api/sessions')).slice(0, 15);
      out.readiness = readiness(); out.review = reviewSummary();
      return out;
    }
    fail('Unbekannte Anfrage: ' + p);
  }

  // Übungen mit Original-Seiten aus dem Archiv
  const originals = {
    all: () => load(LS.originals, {}),
    get: (id) => load(LS.originals, {})[id] || null,
    put: (o) => { const all = load(LS.originals, {}); all[o.id] = o; save(LS.originals, all); },
    del: (id) => { const all = load(LS.originals, {}); delete all[id]; save(LS.originals, all); },
  };

  // Selbsttest der Bewertungslogik (läuft einmal beim Start, Fehler landen in der Konsole)
  const assert = (c, m) => { if (!c) console.error('Selbsttest fehlgeschlagen:', m); };
  assert(parseNumber('1.500,5') === 1500.5 && parseNumber('1,5') === 1.5 && parseNumber('90 min') === 90 && parseNumber('2.400') === 2400 && parseNumber('12.5') === 12.5, 'parseNumber');
  assert(check({ points: 4, answer_type: 'text', keywords: ['Hot-Spare', 'Ruhezustand', 'Ausfall', 'Rekonstruktion'] }, { text: 'Die Hotspare Platte ist im Ruhezustand und springt beim Ausfall ein' }).keywords.filter((k) => k.hit).length === 3, 'Stichworte');
  assert(check({ points: 3, answer_type: 'multi_choice', expected: '2,4' }, { selected: ['4', '2'] }).correct === true, 'Mehrfachauswahl');
  assert(check({ points: 3, answer_type: 'multi_choice', expected: '1,7,10' }, { selected: ['1', '7'] }).auto_points === 2 && check({ points: 3, answer_type: 'multi_choice', expected: '1,7,10' }, { selected: ['1', '7', '9'] }).auto_points === 1, 'Teilpunkte Mehrfachauswahl');
  assert(check({ points: 2, answer_type: 'text', keywords: ['Störung', 'Schirmung'] }, { text: 'Stoerung durch fehlende Schrimung' }).keywords.every((k) => k.hit), 'Umlaute und Tippfehler');
  assert(!check({ points: 2, answer_type: 'text', keywords: ['Switch'] }, { text: 'Router' }).keywords[0].hit, 'keine falschen Treffer');
  assert(check({ points: 2, answer_type: 'number', expected: '43,8' }, { value: '44' }).correct && !check({ points: 2, answer_type: 'number', expected: '43,8' }, { value: '45' }).correct, 'Zahlentoleranz');
  assert(check({ points: 3, answer_type: 'choice', expected: '3', options: [{ key: '1' }, { key: '3' }] }, { value: 'Netzwerkkarte 3' }).correct, 'Auswahl als Text');
  assert(check({ points: 2, answer_type: 'number', expected: '15.06.2023' }, { value: '15.06.2023' }).correct === true, 'Datum');
  const day = 864e5;
  assert(nextBox(undefined, 0.3, 0) === 0 && nextBox(undefined, 0.9, 0) === 1 && nextBox(undefined, 0.6, 0) === 1, 'Wiederholung: erster Versuch');
  assert(nextBox({ box: 2, dueAt: 10 * day }, 0.9, 2 * day) === 2 && nextBox({ box: 2, dueAt: 10 * day }, 0.9, 10 * day) === 3, 'Wiederholung: Aufstieg nur wenn fällig');
  assert(nextBox({ box: 4, dueAt: 0 }, 1, 0) === 5 && nextBox({ box: 5, dueAt: Infinity }, 0.2, 0) === 0, 'Wiederholung: gemeistert und Rückfall');

  window.AP2Local = { init, unlock, lock, handle, pageSrc, originals, keyFor, decrypt, crc32, zipBlob, get encrypted() { return B.encrypted; }, get builtAt() { return B.data && B.data.built; } };
})();
