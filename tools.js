/* AP2-Simulator – Rechentrainer und Notenrechner (reine Logik, ohne Oberfläche). */
(() => {
  'use strict';
  const num = (v) => { const t = String(v ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return t === '' || isNaN(+t) ? null : +t; };
  const de = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('de-DE', { maximumFractionDigits: d });
  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const ip = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const bin = (n) => [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');

  // Jede Aufgabe: text, fields [{label, unit, value, tol (relativ) | exact (Text)}], steps (Lösungsweg)
  const DRILLS = {
    subnet: { name: 'Subnetting IPv4', part: 'Teil1', make(rng, fixed) {
      const p = fixed ? fixed.prefix : int(rng, 20, 29);
      const a = fixed ? fixed.ip : ((pick(rng, [10, 172, 192]) << 24) | (int(rng, 0, 255) << 16) | (int(rng, 0, 255) << 8) | int(rng, 1, 254)) >>> 0;
      const mask = (0xFFFFFFFF << (32 - p)) >>> 0; const net = (a & mask) >>> 0; const bc = (net | ~mask) >>> 0; const hosts = 2 ** (32 - p) - 2;
      return { text: `Ein Host hat die Adresse ${ip(a)}/${p}. Bestimmen Sie Subnetzmaske, Netzadresse, Broadcastadresse und die Anzahl nutzbarer Hostadressen.`,
        fields: [{ label: 'Subnetzmaske', exact: ip(mask) }, { label: 'Netzadresse', exact: ip(net) }, { label: 'Broadcastadresse', exact: ip(bc) }, { label: 'Nutzbare Hosts', value: hosts, tol: 0 }],
        steps: [`/${p} heißt ${p} Einsen in der Maske: ${bin(mask)} = ${ip(mask)}.`, `Netzadresse = Adresse UND Maske: ${bin(a)} UND Maske = ${ip(net)}.`, `Broadcast = Netzadresse mit allen ${32 - p} Hostbits auf 1 = ${ip(bc)}.`, `Hosts = 2^${32 - p} − 2 = ${hosts} (Netz- und Broadcastadresse fallen weg).`] };
    } },
    ohm: { name: 'Strom und Widerstand eines Verbrauchers', part: 'Teil2', make(rng) {
      const U = pick(rng, [230, 230, 24, 12, 48]); const P = U >= 230 ? pick(rng, [60, 150, 460, 690, 920, 1150, 2300]) : pick(rng, [6, 12, 24, 36, 48, 60]);
      const I = P / U; const R = U * U / P;
      return { text: `Ein ohmscher Verbraucher nimmt an ${U} V eine Leistung von ${P} W auf. Berechnen Sie Stromstärke und Widerstand.`,
        fields: [{ label: 'Strom I', unit: 'A', value: I, tol: 0.01 }, { label: 'Widerstand R', unit: 'Ω', value: R, tol: 0.01 }],
        steps: [`P = U · I, also I = P / U = ${P} W / ${U} V = ${de(I, 3)} A.`, `R = U / I = U² / P = ${U}² / ${P} = ${de(R, 2)} Ω.`] };
    } },
    leitung: { name: 'Leitungswiderstand und Spannungsfall', part: 'Teil2', make(rng) {
      const l = pick(rng, [12, 18, 25, 30, 35, 40, 50]); const A = pick(rng, [1.5, 2.5, 4]); const I = pick(rng, [10, 13, 16, 20]); const k = 56;
      const R = 2 * l / (k * A); const dU = I * R; const pct = dU / 230 * 100;
      return { text: `Ein Wechselstromkreis (230 V, cos φ = 1) wird über eine ${l} m lange Kupferleitung mit ${de(A, 1)} mm² versorgt (κ = 56 m/(Ω·mm²)). Es fließen ${I} A. Berechnen Sie Leitungswiderstand (Hin- und Rückleiter), Spannungsfall und Spannungsfall in Prozent.`,
        fields: [{ label: 'Leitungswiderstand R_L', unit: 'Ω', value: R, tol: 0.015 }, { label: 'Spannungsfall ΔU', unit: 'V', value: dU, tol: 0.015 }, { label: 'Spannungsfall', unit: '%', value: pct, tol: 0.02 }],
        steps: [`R_L = 2 · l / (κ · A) = 2 · ${l} m / (56 · ${de(A, 1)} mm²) = ${de(R, 3)} Ω (Faktor 2 für Hin- und Rückleiter).`, `ΔU = I · R_L = ${I} A · ${de(R, 3)} Ω = ${de(dU, 2)} V.`, `Δu = ΔU / U · 100 % = ${de(dU, 2)} V / 230 V · 100 % = ${de(pct, 2)} %. Üblich sind höchstens 3 % (DIN VDE 0100-520, Empfehlung).`] };
    } },
    drehstrom: { name: 'Leistung im Drehstromnetz', part: 'Teil2', make(rng) {
      const I = pick(rng, [10, 16, 20, 25, 32]); const cos = pick(rng, [0.8, 0.85, 0.9, 0.95, 1]);
      const S = Math.sqrt(3) * 400 * I; const P = S * cos;
      return { text: `Ein Drehstromverbraucher am 400-V-Netz nimmt je Außenleiter ${I} A auf, cos φ = ${de(cos, 2)}. Berechnen Sie Scheinleistung und Wirkleistung.`,
        fields: [{ label: 'Scheinleistung S', unit: 'kVA', value: S / 1000, tol: 0.01 }, { label: 'Wirkleistung P', unit: 'kW', value: P / 1000, tol: 0.01 }],
        steps: [`S = √3 · U · I = 1,732 · 400 V · ${I} A = ${de(S / 1000, 2)} kVA.`, `P = S · cos φ = ${de(S / 1000, 2)} kVA · ${de(cos, 2)} = ${de(P / 1000, 2)} kW.`] };
    } },
    usv: { name: 'USV-Überbrückungszeit', part: 'Teil2', make(rng) {
      const n = pick(rng, [2, 4, 6, 8]); const Ah = pick(rng, [7, 9, 12, 18]); const W = pick(rng, [300, 450, 600, 800, 1200]); const eta = pick(rng, [0.85, 0.9, 0.95]);
      const E = n * 12 * Ah; const t = E * eta / W * 60;
      return { text: `Eine USV hat ${n} Akkus mit je 12 V und ${Ah} Ah. Die angeschlossene Last beträgt ${W} W, der Wechselrichter hat einen Wirkungsgrad von ${de(eta * 100, 0)} %. Berechnen Sie die gespeicherte Energie und die Überbrückungszeit (Akkus vollständig nutzbar).`,
        fields: [{ label: 'Gespeicherte Energie', unit: 'Wh', value: E, tol: 0.005 }, { label: 'Überbrückungszeit', unit: 'min', value: t, tol: 0.02 }],
        steps: [`E = Anzahl · U · Q = ${n} · 12 V · ${Ah} Ah = ${E} Wh.`, `Nutzbare Energie = E · η = ${E} Wh · ${de(eta, 2)} = ${de(E * eta, 1)} Wh.`, `t = ${de(E * eta, 1)} Wh / ${W} W = ${de(E * eta / W, 3)} h = ${de(t, 1)} min.`] };
    } },
    energie: { name: 'Energiekosten', part: 'Teil2', make(rng) {
      const P = pick(rng, [35, 65, 120, 250, 400]); const h = pick(rng, [8, 10, 24]); const d = pick(rng, [220, 250, 365]); const ct = pick(rng, [28, 32, 35, 40]);
      const kWh = P * h * d / 1000; const eur = kWh * ct / 100;
      return { text: `Ein Gerät mit ${P} W läuft ${h} Stunden am Tag an ${d} Tagen im Jahr. Eine Kilowattstunde kostet ${ct} Cent. Berechnen Sie Energiebedarf und Kosten pro Jahr.`,
        fields: [{ label: 'Energiebedarf', unit: 'kWh', value: kWh, tol: 0.005 }, { label: 'Kosten', unit: '€', value: eur, tol: 0.005 }],
        steps: [`W = P · t = ${P} W · ${h} h · ${d} = ${de(P * h * d, 0)} Wh = ${de(kWh, 1)} kWh.`, `Kosten = ${de(kWh, 1)} kWh · ${de(ct / 100, 2)} €/kWh = ${de(eur, 2)} €.`] };
    } },
    transfer: { name: 'Übertragungsdauer', part: 'Teil1', make(rng) {
      const GiB = pick(rng, [2, 4, 8, 20, 50]); const rate = pick(rng, [50, 100, 250, 500, 1000]);
      const bits = GiB * 1024 ** 3 * 8; const s = bits / (rate * 1e6);
      return { text: `Eine Datei mit ${GiB} GiB (1 GiB = 1024³ Byte) wird mit ${rate} Mbit/s (1 Mbit = 10⁶ bit) übertragen. Wie lange dauert die Übertragung ohne Protokoll-Overhead?`,
        fields: [{ label: 'Dauer', unit: 's', value: s, tol: 0.01 }],
        steps: [`Datenmenge in Bit = ${GiB} · 1024³ · 8 = ${de(bits, 0)} bit.`, `t = ${de(bits, 0)} bit / (${rate} · 10⁶ bit/s) = ${de(s, 1)} s (${de(s / 60, 1)} min).`] };
    } },
    raid: { name: 'RAID-Nettokapazität', part: 'Teil1', make(rng) {
      const level = pick(rng, [0, 1, 5, 6, 10]); const n = level === 1 ? 2 : level === 10 ? pick(rng, [4, 6, 8]) : level === 6 ? pick(rng, [4, 5, 6, 8]) : pick(rng, [3, 4, 5, 6]); const s = pick(rng, [2, 4, 8, 12, 16]);
      const net = { 0: n * s, 1: s, 5: (n - 1) * s, 6: (n - 2) * s, 10: n / 2 * s }[level];
      const why = { 0: 'RAID 0 verteilt nur, es gibt keine Redundanz: alle Platten zählen.', 1: 'RAID 1 spiegelt: nutzbar ist eine Platte.', 5: 'RAID 5 braucht eine Platte für Parität: (n − 1) · Größe.', 6: 'RAID 6 braucht zwei Platten für Parität: (n − 2) · Größe.', 10: 'RAID 10 spiegelt Paare: n / 2 · Größe.' }[level];
      return { text: `Ein Server hat ${n} Festplatten mit je ${s} TB im RAID ${level}. Wie groß ist die nutzbare Kapazität?`,
        fields: [{ label: 'Nutzbare Kapazität', unit: 'TB', value: net, tol: 0 }], steps: [why, `${n} Platten · ${s} TB ergeben netto ${net} TB.`] };
    } },
  };

  function checkField(f, input) {
    if (f.exact !== undefined) return String(input || '').trim().replace(/\s/g, '') === f.exact;
    const v = num(input); if (v === null) return false;
    return f.tol ? Math.abs(v - f.value) <= Math.abs(f.value) * f.tol + 1e-9 : Math.abs(v - f.value) < 1e-9;
  }

  // ---------- Notenrechner nach ITSEAusbV (BGBl. 2020 I S. 268) ----------
  // Dezimalnoten nach IHK-Tabelle (Fassung IHK Oldenburg), Eingabe: ganze Punkte
  const DEC = [[100, '1,0'], [98, '1,1'], [96, '1,2'], [94, '1,3'], [92, '1,4'], [91, '1,5'], [90, '1,6'], [89, '1,7'], [88, '1,8'], [87, '1,9'], [85, '2,0'], [84, '2,1'], [83, '2,2'], [82, '2,3'], [81, '2,4'], [79, '2,5'], [78, '2,6'], [77, '2,7'], [75, '2,8'], [74, '2,9'], [72, '3,0'], [71, '3,1'], [70, '3,2'], [68, '3,3'], [67, '3,4'], [65, '3,5'], [63, '3,6'], [62, '3,7'], [60, '3,8'], [58, '3,9'], [56, '4,0'], [55, '4,1'], [53, '4,2'], [51, '4,3'], [50, '4,4'], [48, '4,5'], [46, '4,6'], [44, '4,7'], [42, '4,8'], [40, '4,9'], [38, '5,0'], [36, '5,1'], [34, '5,2'], [32, '5,3'], [30, '5,4'], [25, '5,5'], [20, '5,6'], [15, '5,7'], [10, '5,8'], [5, '5,9'], [0, '6,0']];
  const decimalGrade = (p) => DEC.find(([min]) => Math.round(p) >= min)[1];
  const WORD = ['', 'sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'];
  const gradeWord = (p) => WORD[p >= 92 ? 1 : p >= 81 ? 2 : p >= 67 ? 3 : p >= 50 ? 4 : p >= 30 ? 5 : 6];

  // Gewichte nach § 15 Abs. 1. Projekt (§ 11, 50 %): Dokumentation 30 %, Fachgespräch 20 % auf Wunsch des Nutzers;
  // § 11 Abs. 4 ITSEAusbV sieht je 50 % des Bereichs vor (25/25). Beide Werte nur hier ändern.
  const AREAS = [
    { id: 'ap1', label: 'Teil 1 der Abschlussprüfung', note: 'Einrichten eines IT-gestützten Arbeitsplatzes, schriftlich 90 Minuten', w: 20 },
    { id: 'doc', label: 'Projektarbeit mit Dokumentation', note: 'Erstellen, Ändern oder Erweitern von IT-Systemen', w: 30 },
    { id: 'talk', label: 'Präsentation und Fachgespräch', note: 'Gehört zum selben Bereich wie die Projektarbeit, höchstens 30 Minuten', w: 20 },
    { id: 't1', label: 'Installation und Service', note: 'Schriftlich 90 Minuten', w: 10, kind: 'Teil1', oral: true },
    { id: 't2', label: 'Anbindung an die Stromversorgung', note: 'Schriftlich 90 Minuten, muss mindestens ausreichend sein', w: 10, kind: 'Teil2', oral: true },
    { id: 'wiso', label: 'Wirtschafts- und Sozialkunde', note: 'Schriftlich 60 Minuten', w: 10, kind: 'WiSo', oral: true },
  ];
  // Prüfungsbereiche von Teil 2 (Projekt zählt als ein Bereich)
  const W = Object.fromEntries(AREAS.map((a) => [a.id, a.w]));
  const proj = (v) => (v.doc * W.doc + v.talk * W.talk) / (W.doc + W.talk);
  const t2Areas = (v) => [proj(v), v.t1, v.t2, v.wiso];
  const total = (v) => AREAS.reduce((a, x) => a + v[x.id] * x.w / 100, 0);
  // shortcut: Ergebnisse werden auf ganze Punkte gerundet verglichen; manche IHKs runden Bereichsergebnisse anders.
  const RULES = [
    { id: 'gesamt', label: 'Gesamtergebnis aus Teil 1 und Teil 2 mindestens 50 Punkte', ok: (v) => Math.round(total(v)) >= 50 },
    { id: 'strom', label: 'Anbindung an die Stromversorgung mindestens 50 Punkte', ok: (v) => Math.round(v.t2) >= 50 },
    { id: 'zwei', label: 'Mindestens zwei weitere Bereiche von Teil 2 mit 50 Punkten', ok: (v) => [proj(v), v.t1, v.wiso].filter((x) => Math.round(x) >= 50).length >= 2 },
    { id: 'keine6', label: 'Kein Bereich von Teil 2 unter 30 Punkten', ok: (v) => t2Areas(v).every((x) => Math.round(x) >= 30) },
  ];
  const fill = (vals, x) => Object.fromEntries(AREAS.map((a) => [a.id, vals[a.id] ?? x]));
  // Status je Regel: alle Regeln sind monoton, also reicht der Test mit 0 und 100 in den offenen Feldern
  function assess(vals) {
    const open = AREAS.filter((a) => vals[a.id] === null || vals[a.id] === undefined);
    const rules = RULES.map((r) => ({ id: r.id, label: r.label, state: r.ok(fill(vals, 0)) ? 'ok' : !r.ok(fill(vals, 100)) ? 'fail' : 'open' }));
    let target = null;
    if (open.length) for (let x = 0; x <= 100; x++) if (RULES.every((r) => r.ok(fill(vals, x)))) { target = x; break; }
    const res = { open: open.map((a) => a.id), rules, target, passed: rules.every((r) => r.state === 'ok') ? true : rules.some((r) => r.state === 'fail') ? false : null };
    if (!open.length) { const t = total(vals); res.total = t; res.grade = decimalGrade(t); res.word = gradeWord(Math.round(t)); }
    // Mündliche Ergänzungsprüfung (§ 16): nur ein schriftlicher Bereich, Gewichtung 2:1
    if (!open.length && res.passed === false) {
      res.oral = AREAS.filter((a) => a.oral && vals[a.id] < 50).map((a) => {
        for (let o = 0; o <= 100; o++) { const v = { ...vals, [a.id]: (2 * vals[a.id] + o) / 3 }; if (RULES.every((r) => r.ok(v))) return { id: a.id, label: a.label, needed: o }; }
        return null;
      }).filter(Boolean);
    }
    return res;
  }

  // ---------- Projekt und Fachgespräch (§ 11 ITSEAusbV: 50 % der Gesamtnote) ----------
  const DOC_CHECKLIST = [
    'Deckblatt mit Projekttitel, Name, Prüflingsnummer und Ausbildungsbetrieb',
    'Inhaltsverzeichnis mit Seitenzahlen',
    'Ausgangssituation, Auftraggeber und Auftrag',
    'Projektziel und Abgrenzung: was gehört dazu, was nicht',
    'Ist-Analyse des vorhandenen Systems',
    'Soll-Konzept mit Alternativen und begründeter Entscheidung (z. B. Entscheidungsmatrix)',
    'Zeitplanung mit Soll-Ist-Vergleich, höchstens 40 Stunden',
    'Kosten und Wirtschaftlichkeit',
    'Durchführung: technische Umsetzung mit Plänen, Schemata und Konfiguration',
    'Normen und Sicherheit: DIN VDE 0100, fünf Sicherheitsregeln, Datenschutz',
    'Qualitätssicherung: Prüfungen und Messungen mit Protokollen (z. B. DIN VDE 0100-600)',
    'Übergabe, Abnahme und Einweisung des Kunden',
    'Fazit mit Soll-Ist-Vergleich und Ausblick',
    'Anhang: Pläne, Protokolle, Auszüge aus der Kundendokumentation',
    'Quellenverzeichnis und Erklärung zur selbstständigen Durchführung',
  ];
  const TALK_OUTLINE = ['Einstieg und Vorstellung (1 min)', 'Ausgangssituation und Auftrag (2 min)', 'Ziel und Planung (2 min)', 'Entscheidung und Alternativen (2 min)', 'Umsetzung (4 min)', 'Prüfung und Übergabe (2 min)', 'Fazit (2 min)'];
  const FG = [
    ['Auftrag und Planung', ['Warum haben Sie sich für dieses Projekt entschieden, und was war Ihr konkreter Auftrag?', 'Wer war Ihr Auftraggeber, und wie haben Sie die Anforderungen aufgenommen?', 'Welche Alternativen haben Sie geprüft, und warum haben Sie sich für Ihre Lösung entschieden?', 'Wie haben Sie die 40 Stunden geplant, und wo wichen Soll und Ist voneinander ab?', 'Welche Risiken haben Sie vorab gesehen, und wie sind Sie damit umgegangen?']],
    ['Technik und Umsetzung', ['Erklären Sie den Aufbau Ihrer Lösung anhand Ihres Plans oder Schemas.', 'Welche Normen und Vorschriften mussten Sie beachten?', 'Wie haben Sie Leitungen, Schutzorgane oder Komponenten dimensioniert?', 'Welche Schutzmaßnahme gegen elektrischen Schlag gilt in Ihrer Anlage, und wie haben Sie sie nachgewiesen?', 'Wie haben Sie die fünf Sicherheitsregeln bei Ihren Arbeiten angewendet?', 'Welche Netzwerkkonfiguration haben Sie umgesetzt, zum Beispiel Adressen, VLANs und Dienste, und warum?', 'Wie haben Sie Datensicherheit und Datenschutz berücksichtigt?', 'Was hätten Sie getan, wenn eine geplante Komponente nicht lieferbar gewesen wäre?']],
    ['Prüfung und Qualität', ['Welche Prüfungen und Messungen haben Sie nach der Installation durchgeführt?', 'Welche Messwerte haben Sie erwartet, und welche Grenzwerte gelten?', 'Wie haben Sie die Funktion gegenüber dem Kunden nachgewiesen?', 'Welche Fehler traten auf, und wie haben Sie sie systematisch eingegrenzt?']],
    ['Wirtschaftlichkeit', ['Wie setzen sich die Projektkosten zusammen?', 'Wie haben Sie die Wirtschaftlichkeit bewertet, zum Beispiel über Amortisation oder Energiekosten?', 'Hätte es eine günstigere Lösung gegeben? Warum haben Sie sie nicht gewählt?']],
    ['Übergabe und Kunde', ['Wie lief die Übergabe ab, und was enthält die Kundendokumentation?', 'Wie haben Sie den Kunden eingewiesen?', 'Welche Wartungs- und Prüffristen muss der Kunde künftig beachten?']],
    ['Rückblick', ['Was würden Sie beim nächsten Mal anders machen?', 'Was haben Sie in diesem Projekt gelernt?', 'Wie ließe sich Ihre Lösung erweitern oder skalieren?', 'Welche Aufgaben haben Sie selbst erledigt, und wobei hatten Sie Unterstützung?']],
    ['Fachliche Vertiefung', ['Erklären Sie den Unterschied zwischen einem TN-S- und einem TN-C-S-System.', 'Wann ist eine Fehlerstrom-Schutzeinrichtung vorgeschrieben, und wie funktioniert sie?', 'Wie berechnen Sie den Spannungsfall einer Leitung?', 'Worin unterscheiden sich die Schutzklassen I, II und III?', 'Wie dimensionieren Sie eine USV?', 'Wie unterscheiden sich Switch und Router, bezogen auf das OSI-Modell?', 'Was ist Power over Ethernet, und welche Leistungsklassen gibt es?', 'Welche Vorteile bieten VLANs?', 'Was regelt die DGUV Vorschrift 3?']],
  ];
  const FG_QUESTIONS = FG.flatMap(([cat, qs], c) => qs.map((text, i) => ({ id: `q${c + 1}-${i + 1}`, cat, text })));

  // ---------- Bewertungskriterien aus dem Bewertungshinweis (grading) ----------
  // Liefert [{label, points}] oder null, wenn der Hinweis nicht sicher in Kriterien zerlegbar ist.
  const P = '(\\d+(?:,\\d+)?)\\s*(?:Punkte?|P\\.?)';
  const pnum = (x) => +String(x).replace(',', '.');
  function criteria(item) {
    if (!item || ['number', 'choice', 'multi_choice', 'assignment', 'order'].includes(item.answer_type)) return null;
    const pts = item.points; let g = String(item.grading || '').trim().replace(/\.$/, '');
    // Gesamtpunkte vorneweg weglassen: „4 Punkte: …“, „4 Punkte, …“, „4 Punkte (…)“
    g = g.replace(new RegExp('^' + P + '\\s*[:,]\\s*'), '');
    const wrapped = g.match(new RegExp('^' + P + '\\s*\\((.+)\\)$')); if (wrapped) g = wrapped[2].trim();
    if (!g) return null;
    const half = (x) => x > 0 && Math.round(x * 2) === x * 2;
    // Zählregel: „je 2 Punkte für A, B und C“, „1 Punkt je Verfahren“, „Je Nennung 1 Punkt“
    const m = g.match(new RegExp('^je\\s+' + P + '\\s*(?:für|pro|je)?\\s*(.*)$', 'i')) || g.match(new RegExp('^' + P + '\\s+(?:je|pro)\\s+(.+)$', 'i'));
    const m2 = !m && g.match(new RegExp('^(?:je|pro)\\s+(.+?)\\s+' + P + '$', 'i'));
    if (m || m2) {
      const per = pnum(m ? m[1] : m2[2]); const rest = (m ? m[2] : m2[1]).trim().replace(/^richtig\w*\s+/i, '').replace(/^Punkt$/i, '') || 'Nennung';
      const named = rest.split(/,\s*|\s+und\s+|\s+sowie\s+/).map((x) => x.trim()).filter(Boolean);
      if (named.length >= 2 && Math.abs(named.length * per - pts) < 0.01) return named.map((label) => ({ label, points: per }));
      const k = pts / per; const unit = rest.replace(/\s*\(.*\)\s*$/, '').replace(/^(jede[nrs]?|eine[nrs]?)\s+/i, '');
      if (Number.isInteger(k) && k >= 2 && k <= 12 && unit && !/[,;]/.test(unit)) return Array.from({ length: k }, (_, i) => ({ label: `${unit[0].toUpperCase()}${unit.slice(1)} ${i + 1}`, points: per }));
      return null;
    }
    // Einzelkriterien: „2 Punkte Verfahren, 2 Punkte Ergebnis“, „Personenschutz (1)“, „Querschnitt 1 Punkt“
    const segs = g.split(/[;\n]|,\s*(?![^()]*\))|\s\/\s/).map((x) => x.trim()).filter(Boolean);
    if (segs.length < 2) return null;
    const out = segs.map((x) => {
      let r = x.match(new RegExp('^' + P + '\\s+(?:für\\s+)?(.+)$')); if (r) return { label: r[2], points: pnum(r[1]) };
      r = x.match(/^(.+?)\s*\((\d+(?:,\d+)?)(?:\s*P(?:unkte?)?)?\)$/); if (r) return { label: r[1], points: pnum(r[2]) };
      r = x.match(new RegExp('^(.+?)\\s+' + P + '$')); if (r) return { label: r[1], points: pnum(r[2]) };
      return /\d\s*Punkt/.test(x) ? false : { label: x, points: null };
    });
    if (out.some((x) => !x)) return null;
    if (out.every((x) => x.points === null)) { const each = pts / out.length; if (!half(each)) return null; out.forEach((x) => { x.points = each; }); }
    if (out.some((x) => x.points === null) || Math.abs(out.reduce((a, x) => a + x.points, 0) - pts) > 0.01) return null;
    return out.map((x) => ({ label: x.label.replace(/^\w/, (c) => c.toUpperCase()), points: x.points }));
  }

  // Selbsttest (Fehler landen in der Konsole)
  const assert = (c, m) => { if (!c) console.error('Selbsttest tools.js fehlgeschlagen:', m); };
  const sn = DRILLS.subnet.make(Math.random, { ip: ((192 << 24) | (168 << 16) | (50 << 8) | 17) >>> 0, prefix: 26 });
  assert(sn.fields.map((f) => f.exact ?? f.value).join() === '255.255.255.192,192.168.50.0,192.168.50.63,62', 'Subnetting');
  assert(checkField({ value: 0.4286, tol: 0.015 }, '0,43') && !checkField({ value: 2, tol: 0 }, '2,5') && checkField({ value: 1500, tol: 0.01 }, '1.500'), 'Prüfen mit Toleranz');
  assert(decimalGrade(100) === '1,0' && decimalGrade(66.6) === '3,4' && decimalGrade(50) === '4,4' && decimalGrade(29) === '5,5' && decimalGrade(3) === '6,0', 'Dezimalnote');
  const all = (x) => fill({}, x);
  assert(assess(all(50)).passed === true && assess({ ...all(80), t2: 45 }).passed === false && assess({ ...all(80), t1: 40 }).passed === true && assess({ ...all(80), t1: 40, wiso: 45 }).passed === false && assess({ ...all(80), wiso: 25 }).passed === false, 'Bestehensregeln');
  assert(assess({ ap1: 60 }).target === 50 && assess({ ...all(70), t2: 40 }).oral[0].needed === 69, 'Ziel und Ergänzungsprüfung');

  const crit = (grading, points) => (criteria({ answer_type: 'text', grading, points }) || []).map((c) => `${c.label}=${c.points}`).join('|');
  assert(crit('6 Punkte: je 2 Punkte für IP-Adresse, Subnetzmaske und Standardgateway', 6) === 'IP-Adresse=2|Subnetzmaske=2|Standardgateway=2', 'Kriterien je für');
  assert(crit('3 Punkte: je 1 Punkt pro Nennung', 3) === 'Nennung 1=1|Nennung 2=1|Nennung 3=1', 'Kriterien je pro');
  assert(crit('Je Nennung 1 Punkt', 3) === 'Nennung 1=1|Nennung 2=1|Nennung 3=1', 'Kriterien Je … Punkt');
  assert(crit('2 Punkte Verfahren (ff:fe einfügen, U/L-Bit kippen), 2 Punkte Ergebnis', 4) === 'Verfahren (ff:fe einfügen, U/L-Bit kippen)=2|Ergebnis=2', 'Kriterien mit Klammer');
  assert(crit('4 Punkte: Personenschutz/Fehlerschutz (1), Brandschutz bzw. Zusatzschutz (1), Wirkprinzip (1), Abschaltung (1)', 4).split('|').length === 4, 'Kriterien (1)');
  assert(crit('2 Punkte: Querschnitt 1 Punkt, Anschlussort 1 Punkt', 2) === 'Querschnitt=1|Anschlussort=1', 'Kriterien nachgestellt');
  assert(crit('6 Punkte: Attribute zugeordnet, Schlüssel gekennzeichnet, Kardinalitäten eingetragen', 6) === 'Attribute zugeordnet=2|Schlüssel gekennzeichnet=2|Kardinalitäten eingetragen=2', 'Kriterien gleich verteilt');
  assert(crit('2 Punkte', 2) === '' && crit('1 Punkt Faserdämpfung, 1 Punkt Stecker', 3) === '', 'Kriterien nur bei passender Summe');
  assert(crit('3 Punkte, je Nennung 1 Punkt', 3) === 'Nennung 1=1|Nennung 2=1|Nennung 3=1' && crit('4 Punkte (je 1 Punkt pro Ursache)', 4).split('|').length === 4, 'Kriterien nach Komma und in Klammern');
  assert(crit('2 Punkte: je 1 Punkt', 2) === 'Nennung 1=1|Nennung 2=1' && crit('3 Punkte (je richtigem Eintrag 1 Punkt)', 3) === 'Eintrag 1=1|Eintrag 2=1|Eintrag 3=1', 'Kriterien ohne Einheit');
  assert(crit('4 Punkte (Grund 2 Punkte, Beschreibung 2 Punkte)', 4) === 'Grund=2|Beschreibung=2', 'Kriterien in Klammern');

  window.AP2Tools = { DRILLS, checkField, num, de, AREAS, assess, decimalGrade, gradeWord, criteria, DOC_CHECKLIST, TALK_OUTLINE, FG_QUESTIONS };
})();
