/* AP2-Simulator – Rechentrainer und Notenrechner (reine Logik, ohne Oberfläche). */
(() => {
  'use strict';
  const num = (v) => { const t = String(v ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return t === '' || isNaN(+t) ? null : +t; };
  const de = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('de-DE', { maximumFractionDigits: d });
  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const ip = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const bin = (n) => [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');

  // Jede Aufgabe: text, fields [{label, unit, value, tol (relativ) | exact (Text)}], steps (Lösungsweg); je Typ: level (1 leicht, 2 mittel, 3 schwer), hints (Vorgehen ohne Zahlen), formulas (zum Herleiten), explain (warum das so ist)
  const DRILLS = {
    subnet: { name: 'Subnetting IPv4', part: 'Teil1', level: 3, formulas: ["Präfix = Anzahl der Einsen in der Maske von links", "Netzadresse = IP-Adresse UND Maske", "Broadcast = Netzadresse mit allen Hostbits auf 1", "Blockgröße = 256 − Maskenwert im angebrochenen Oktett", "Nutzbare Hosts = 2^(32 − Präfix) − 2"],
      explain: "Eine IPv4-Adresse hat 32 Bit. Die Maske teilt sie in Netzteil (Einsen) und Hostteil (Nullen). Alle Adressen mit gleichem Netzteil liegen im selben Netz: Die kleinste davon (alle Hostbits 0) ist die Netzadresse, die größte (alle Hostbits 1) die Broadcastadresse. Beide kann man keinem Gerät geben, deshalb zieht man 2 ab.",
      hints: [
      'Die Zahl hinter dem Schrägstrich sagt, wie viele Bits der Maske von links 1 sind. Acht Einsen in einem Oktett ergeben 255.',
      'Nur das Oktett, in dem die Maske weder 255 noch 0 ist, muss man genau rechnen. Blockgröße = 256 − Maskenwert in diesem Oktett.',
      'Netzadresse: das größte Vielfache der Blockgröße, das nicht über dem Adresswert liegt. Broadcast: nächste Netzadresse − 1.',
      'Nutzbare Hosts = 2^(32 − Präfix) − 2, weil Netz- und Broadcastadresse wegfallen.',
      'Am fx-991DE CW: HOME, Basis-N. Mit FORMAT auf Binär stellen, dann Adress-Oktett and Masken-Oktett rechnen (and unter CATALOG, Logikoperatoren).'],
    make(rng, fixed) {
      const p = fixed ? fixed.prefix : int(rng, 20, 29);
      const a = fixed ? fixed.ip : ((pick(rng, [10, 172, 192]) << 24) | (int(rng, 0, 255) << 16) | (int(rng, 0, 255) << 8) | int(rng, 1, 254)) >>> 0;
      const mask = (0xFFFFFFFF << (32 - p)) >>> 0; const net = (a & mask) >>> 0; const bc = (net | ~mask) >>> 0; const hosts = 2 ** (32 - p) - 2;
      return { text: `Ein Host hat die Adresse ${ip(a)}/${p}. Bestimmen Sie Subnetzmaske, Netzadresse, Broadcastadresse und die Anzahl nutzbarer Hostadressen.`,
        fields: [{ label: 'Subnetzmaske', exact: ip(mask) }, { label: 'Netzadresse', exact: ip(net) }, { label: 'Broadcastadresse', exact: ip(bc) }, { label: 'Nutzbare Hosts', value: hosts, tol: 0 }],
        steps: [`/${p} heißt ${p} Einsen in der Maske: ${bin(mask)} = ${ip(mask)}.`, `Netzadresse = Adresse UND Maske: ${bin(a)} UND Maske = ${ip(net)}.`, `Broadcast = Netzadresse mit allen ${32 - p} Hostbits auf 1 = ${ip(bc)}.`, `Hosts = 2^${32 - p} − 2 = ${hosts} (Netz- und Broadcastadresse fallen weg).`] };
    } },
    ohm: { name: 'Strom und Widerstand eines Verbrauchers', part: 'Teil2', level: 2, formulas: ["P = U · I", "U = R · I", "R = U² / P", "I = P / U"],
      explain: "Bei einem ohmschen Verbraucher hängen Spannung, Strom, Widerstand und Leistung fest zusammen. Aus zwei bekannten Größen lassen sich die anderen berechnen, indem man das ohmsche Gesetz in die Leistungsformel einsetzt.",
      hints: [
      'Gegeben sind Spannung U und Leistung P, gesucht Strom I und Widerstand R.',
      'Leistungsformel P = U · I nach I umstellen: I = P / U.',
      'Ohmsches Gesetz R = U / I, oder ohne Umweg R = U² / P.'],
    make(rng) {
      const U = pick(rng, [230, 230, 24, 12, 48]); const P = U >= 230 ? pick(rng, [60, 150, 460, 690, 920, 1150, 2300]) : pick(rng, [6, 12, 24, 36, 48, 60]);
      const I = P / U; const R = U * U / P;
      return { text: `Ein ohmscher Verbraucher nimmt an ${U} V eine Leistung von ${P} W auf. Berechnen Sie Stromstärke und Widerstand.`,
        fields: [{ label: 'Strom I', unit: 'A', value: I, tol: 0.01 }, { label: 'Widerstand R', unit: 'Ω', value: R, tol: 0.01 }],
        steps: [`P = U · I, also I = P / U = ${P} W / ${U} V = ${de(I, 3)} A.`, `R = U / I = U² / P = ${U}² / ${P} = ${de(R, 2)} Ω.`] };
    } },
    leitung: { name: 'Leitungswiderstand und Spannungsfall', part: 'Teil2', level: 3, formulas: ["R_L = 2 · l / (κ · A)", "ΔU = I · R_L", "Δu = ΔU / U · 100 %"],
      explain: "Jede Leitung hat einen Widerstand, der mit der Länge wächst und mit dem Querschnitt sinkt. Fließt Strom, fällt an ihm Spannung ab, die dem Verbraucher fehlt. Der Faktor 2 steht für Hin- und Rückleiter. Zu viel Spannungsfall führt zu Fehlfunktionen und Erwärmung; deshalb begrenzt man ihn, meist auf 3 %.",
      hints: [
      'Der Strom fließt hin und zurück: Die Leitungslänge zählt doppelt.',
      'R_L = 2 · l / (κ · A), mit l in m, A in mm² und κ in m/(Ω·mm²). κ für Kupfer steht im Belegsatz oder Tabellenbuch (56).',
      'ΔU = I · R_L, in Prozent Δu = ΔU / U · 100 %.',
      'Kleine Werte am fx-991DE CW mit FORMAT, ENG Notation anzeigen: Dann steht der Exponent in Dreierschritten da (×10⁻³ = milli).'],
    make(rng) {
      const l = pick(rng, [12, 18, 25, 30, 35, 40, 50]); const A = pick(rng, [1.5, 2.5, 4]); const I = pick(rng, [10, 13, 16, 20]); const k = 56;
      const R = 2 * l / (k * A); const dU = I * R; const pct = dU / 230 * 100;
      return { text: `Ein Wechselstromkreis (230 V, cos φ = 1) wird über eine ${l} m lange Kupferleitung mit ${de(A, 1)} mm² versorgt (κ = 56 m/(Ω·mm²)). Es fließen ${I} A. Berechnen Sie Leitungswiderstand (Hin- und Rückleiter), Spannungsfall und Spannungsfall in Prozent.`,
        fields: [{ label: 'Leitungswiderstand R_L', unit: 'Ω', value: R, tol: 0.015 }, { label: 'Spannungsfall ΔU', unit: 'V', value: dU, tol: 0.015 }, { label: 'Spannungsfall', unit: '%', value: pct, tol: 0.02 }],
        steps: [`R_L = 2 · l / (κ · A) = 2 · ${l} m / (56 · ${de(A, 1)} mm²) = ${de(R, 3)} Ω (Faktor 2 für Hin- und Rückleiter).`, `ΔU = I · R_L = ${I} A · ${de(R, 3)} Ω = ${de(dU, 2)} V.`, `Δu = ΔU / U · 100 % = ${de(dU, 2)} V / 230 V · 100 % = ${de(pct, 2)} %. Üblich sind höchstens 3 % (DIN VDE 0100-520, Empfehlung).`] };
    } },
    drehstrom: { name: 'Leistung im Drehstromnetz', part: 'Teil2', level: 2, formulas: ["S = √3 · U · I", "P = S · cos φ", "Q = S · sin φ"],
      explain: "Im Drehstromnetz liegen zwischen zwei Außenleitern 400 V, das ist √3 mal die Strangspannung von 230 V. Die Scheinleistung muss das Netz liefern; nur der Anteil cos φ davon wird als Wirkleistung tatsächlich in Arbeit umgesetzt.",
      hints: [
      'Im Drehstromnetz ist U die Spannung zwischen zwei Außenleitern (400 V). Dazu kommt der Verkettungsfaktor √3.',
      'Scheinleistung S = √3 · U · I.',
      'Wirkleistung P = S · cos φ. Watt durch 1000 ergibt Kilowatt.',
      'Am fx-991DE CW hat √ eine eigene Taste: √3 × 400 × I direkt eintippen.'],
    make(rng) {
      const I = pick(rng, [10, 16, 20, 25, 32]); const cos = pick(rng, [0.8, 0.85, 0.9, 0.95, 1]);
      const S = Math.sqrt(3) * 400 * I; const P = S * cos;
      return { text: `Ein Drehstromverbraucher am 400-V-Netz nimmt je Außenleiter ${I} A auf, cos φ = ${de(cos, 2)}. Berechnen Sie Scheinleistung und Wirkleistung.`,
        fields: [{ label: 'Scheinleistung S', unit: 'kVA', value: S / 1000, tol: 0.01 }, { label: 'Wirkleistung P', unit: 'kW', value: P / 1000, tol: 0.01 }],
        steps: [`S = √3 · U · I = 1,732 · 400 V · ${I} A = ${de(S / 1000, 2)} kVA.`, `P = S · cos φ = ${de(S / 1000, 2)} kVA · ${de(cos, 2)} = ${de(P / 1000, 2)} kW.`] };
    } },
    usv: { name: 'USV-Überbrückungszeit', part: 'Teil2', level: 2, formulas: ["E = n · U · Q (in Wh)", "E_nutz = E · η", "t = E_nutz / P"],
      explain: "Ein Akku speichert Energie: Spannung mal Kapazität in Amperestunden ergibt Wattstunden. Der Wechselrichter wandelt die Gleichspannung mit Verlusten in Wechselspannung, deshalb steht nur der Anteil η zur Verfügung. Nutzbare Energie geteilt durch die Last ergibt die Zeit.",
      hints: [
      'Energie eines Akkus: E = U · Q, Volt mal Amperestunden ergibt Wattstunden. Alle Akkus zusammenzählen.',
      'Der Wechselrichter verliert einen Teil: nutzbare Energie = E · η (Prozent durch 100).',
      'Zeit t = nutzbare Energie / Leistung ergibt Stunden, mal 60 ergibt Minuten.'],
    make(rng) {
      const n = pick(rng, [2, 4, 6, 8]); const Ah = pick(rng, [7, 9, 12, 18]); const W = pick(rng, [300, 450, 600, 800, 1200]); const eta = pick(rng, [0.85, 0.9, 0.95]);
      const E = n * 12 * Ah; const t = E * eta / W * 60;
      return { text: `Eine USV hat ${n} Akkus mit je 12 V und ${Ah} Ah. Die angeschlossene Last beträgt ${W} W, der Wechselrichter hat einen Wirkungsgrad von ${de(eta * 100, 0)} %. Berechnen Sie die gespeicherte Energie und die Überbrückungszeit (Akkus vollständig nutzbar).`,
        fields: [{ label: 'Gespeicherte Energie', unit: 'Wh', value: E, tol: 0.005 }, { label: 'Überbrückungszeit', unit: 'min', value: t, tol: 0.02 }],
        steps: [`E = Anzahl · U · Q = ${n} · 12 V · ${Ah} Ah = ${E} Wh.`, `Nutzbare Energie = E · η = ${E} Wh · ${de(eta, 2)} = ${de(E * eta, 1)} Wh.`, `t = ${de(E * eta, 1)} Wh / ${W} W = ${de(E * eta / W, 3)} h = ${de(t, 1)} min.`] };
    } },
    energie: { name: 'Energiekosten', part: 'Teil2', level: 1, formulas: ["W = P · t", "1 kWh = 1.000 Wh", "Kosten = W · Preis je kWh"],
      explain: "Die Leistung gibt an, wie viel Energie ein Gerät pro Zeit braucht. Über die Betriebszeit summiert sich das zur elektrischen Arbeit, die der Energieversorger in Kilowattstunden abrechnet.",
      hints: [
      'Elektrische Arbeit W = P · t: Leistung mal Betriebsstunden im Jahr (Stunden pro Tag mal Tage).',
      'Wattstunden durch 1000 ergibt Kilowattstunden.',
      'Kosten = Energie in kWh · Preis. Cent durch 100 ergibt Euro.'],
    make(rng) {
      const P = pick(rng, [35, 65, 120, 250, 400]); const h = pick(rng, [8, 10, 24]); const d = pick(rng, [220, 250, 365]); const ct = pick(rng, [28, 32, 35, 40]);
      const kWh = P * h * d / 1000; const eur = kWh * ct / 100;
      return { text: `Ein Gerät mit ${P} W läuft ${h} Stunden am Tag an ${d} Tagen im Jahr. Eine Kilowattstunde kostet ${ct} Cent. Berechnen Sie Energiebedarf und Kosten pro Jahr.`,
        fields: [{ label: 'Energiebedarf', unit: 'kWh', value: kWh, tol: 0.005 }, { label: 'Kosten', unit: '€', value: eur, tol: 0.005 }],
        steps: [`W = P · t = ${P} W · ${h} h · ${d} = ${de(P * h * d, 0)} Wh = ${de(kWh, 1)} kWh.`, `Kosten = ${de(kWh, 1)} kWh · ${de(ct / 100, 2)} €/kWh = ${de(eur, 2)} €.`] };
    } },
    transfer: { name: 'Übertragungsdauer', part: 'Teil1', level: 2, formulas: ["t = Datenmenge / Datenrate", "1 Byte = 8 bit", "1 GiB = 1024³ Byte, 1 Mbit = 10⁶ bit"],
      explain: "Datenraten stehen in Bit pro Sekunde, Dateigrößen meist in Byte und oft mit Binärvorsätzen (Ki, Mi, Gi). Erst wenn beide Größen in derselben Einheit stehen, ergibt die Division die Zeit.",
      hints: [
      'Datenmenge und Datenrate in dieselbe Einheit bringen, am einfachsten in Bit.',
      'GiB in Byte: mal 1024³. Byte in Bit: mal 8. Mbit/s in bit/s: mal 10⁶.',
      'Dauer t = Datenmenge / Datenrate.',
      'Am fx-991DE CW: 1024³ mit der x^■-Taste, 10⁶ mit der ×10^x-Taste eingeben.'],
    make(rng) {
      const GiB = pick(rng, [2, 4, 8, 20, 50]); const rate = pick(rng, [50, 100, 250, 500, 1000]);
      const bits = GiB * 1024 ** 3 * 8; const s = bits / (rate * 1e6);
      return { text: `Eine Datei mit ${GiB} GiB (1 GiB = 1024³ Byte) wird mit ${rate} Mbit/s (1 Mbit = 10⁶ bit) übertragen. Wie lange dauert die Übertragung ohne Protokoll-Overhead?`,
        fields: [{ label: 'Dauer', unit: 's', value: s, tol: 0.01 }],
        steps: [`Datenmenge in Bit = ${GiB} · 1024³ · 8 = ${de(bits, 0)} bit.`, `t = ${de(bits, 0)} bit / (${rate} · 10⁶ bit/s) = ${de(s, 1)} s (${de(s / 60, 1)} min).`] };
    } },
    zahlen: { name: 'Zahlensysteme umrechnen', part: 'Teil1', level: 1, formulas: ["Stellenwerte dual: 128 64 32 16 8 4 2 1", "Dezimalwert = Σ Ziffer · Basis^Stelle", "1 Hex-Ziffer = 4 Bit (Nibble)"],
      explain: "Alle Zahlensysteme sind Stellenwertsysteme: Jede Stelle ist eine Potenz der Basis (2, 10 oder 16). Weil 16 = 2⁴ ist, entspricht eine Hex-Ziffer genau vier Bit; deshalb lässt sich zwischen dual und hexadezimal blockweise umrechnen.",
      hints: [
      'Stellenwerte einer 8-Bit-Dualzahl: 128 64 32 16 8 4 2 1. Von links den größten passenden Wert abziehen und dort eine 1 setzen.',
      'Hexadezimal: die Dualzahl in zwei Gruppen zu 4 Bit teilen. Jede Gruppe ist eine Hex-Ziffer, 10 bis 15 sind A bis F.',
      'Hex nach dezimal: erste Ziffer · 16 + zweite Ziffer.',
      'Am fx-991DE CW: HOME, Basis-N. Zahl eingeben, mit FORMAT Hexadezimal oder Binär wählen. A bis C liegen auf SHIFT 4 bis 6, D bis F auf SHIFT 1 bis 3.'],
    make(rng) {
      const v = int(rng, 17, 255); const b = v.toString(2).padStart(8, '0'); const h = v.toString(16).toUpperCase();
      const steps = [`Stellenwerte 128 64 32 16 8 4 2 1: ${v} = ${b.split('').map((d, i) => d === '1' ? 2 ** (7 - i) : 0).filter(Boolean).join(' + ')} → ${b.slice(0, 4)} ${b.slice(4)}.`, `Hexadezimal je 4 Bit (Nibble): ${b.slice(0, 4)} = ${parseInt(b.slice(0, 4), 2).toString(16).toUpperCase()}, ${b.slice(4)} = ${parseInt(b.slice(4), 2).toString(16).toUpperCase()} → ${h}.`];
      return rng() < 0.5
        ? { text: `Wandeln Sie die Dezimalzahl ${v} in eine 8-stellige Dualzahl und in eine Hexadezimalzahl um.`, fields: [{ label: 'Dual (8 Bit)', exact: b }, { label: 'Hexadezimal', exact: h }], steps }
        : { text: `Wandeln Sie die Hexadezimalzahl ${h} in eine Dezimalzahl und eine 8-stellige Dualzahl um.`, fields: [{ label: 'Dezimal', value: v, tol: 0 }, { label: 'Dual (8 Bit)', exact: b }], steps: [`${h} = ${h.split('').map((c, i, a) => `${parseInt(c, 16)} · 16^${a.length - 1 - i}`).join(' + ')} = ${v}.`, ...steps] };
    } },
    einheiten: { name: 'Speichereinheiten (SI und IEC)', part: 'Teil1', level: 1, formulas: ["SI: k = 10³, M = 10⁶, G = 10⁹, T = 10¹²", "IEC: Ki = 2¹⁰, Mi = 2²⁰, Gi = 2³⁰, Ti = 2⁴⁰", "Wert in Byte = Zahl · Vorsatz"],
      explain: "Festplattenhersteller rechnen mit Zehnerpotenzen (SI), Betriebssysteme oft mit Zweierpotenzen (IEC). Weil 1024 größer als 1000 ist, zeigt das Betriebssystem die kleinere Zahl an; je größer der Vorsatz, desto größer der Unterschied (bei TB und TiB etwa 9 %).",
      hints: [
      'SI-Vorsätze (k, M, G, T) stehen für Potenzen von 1000, IEC-Vorsätze (Ki, Mi, Gi, Ti) für Potenzen von 1024.',
      'M = 1000², G = 1000³, T = 1000⁴. Mi = 1024², Gi = 1024³, Ti = 1024⁴.',
      'Erst in Byte umrechnen, dann durch die Potenz der anderen Basis teilen.',
      'Am fx-991DE CW: Potenzen mit der x^■-Taste, also 1000 x^■ 3 oder 1024 x^■ 3.'],
    make(rng) {
      const k = pick(rng, [['MB', 'MiB', 2], ['GB', 'GiB', 3], ['TB', 'TiB', 4]]); const x = pick(rng, [3, 8, 16, 120, 256, 500]);
      const toIec = rng() < 0.5; const r = toIec ? x * 1000 ** k[2] / 1024 ** k[2] : x * 1024 ** k[2] / 1000 ** k[2];
      return { text: toIec ? `Ein Hersteller gibt ${x} ${k[0]} an. Wie viele ${k[1]} zeigt ein Betriebssystem an, das mit Faktor 1024 rechnet?` : `Eine Datei ist ${x} ${k[1]} groß. Wie viele ${k[0]} (Faktor 1000) sind das?`,
        fields: [{ label: toIec ? k[1] : k[0], value: r, tol: 0.005 }],
        steps: [toIec ? `${x} ${k[0]} = ${x} · 1000^${k[2]} Byte; geteilt durch 1024^${k[2]} ergibt ${de(r, 2)} ${k[1]}.` : `${x} ${k[1]} = ${x} · 1024^${k[2]} Byte; geteilt durch 1000^${k[2]} ergibt ${de(r, 2)} ${k[0]}.`, 'SI (k, M, G, T) rechnet mit 1000, IEC (Ki, Mi, Gi, Ti) mit 1024. Ein kleines „i“ ändert das Ergebnis.'] };
    } },
    gatter: { name: 'Logikgatter', part: 'Teil1', level: 1, formulas: ["AND: Y = 1 nur bei A = 1 und B = 1", "OR: Y = 1, wenn mindestens ein Eingang 1 ist", "XOR: Y = 1, wenn A ≠ B", "NAND = NICHT AND, NOR = NICHT OR"],
      explain: "Logikgatter verknüpfen Bits nach festen Regeln, den Wahrheitstabellen. In einem Schaltnetz rechnet man von den Eingängen zum Ausgang: Das Ergebnis des ersten Gatters ist der Eingang des nächsten.",
      hints: [
      'Schritt für Schritt: zuerst X aus A und B, dann Y aus X und C.',
      'AND: nur 1 und 1 ergibt 1. OR: mindestens eine 1. XOR: genau eine 1.',
      'NAND und NOR: erst AND oder OR bilden, dann das Ergebnis umkehren.',
      'Zum Prüfen am fx-991DE CW: Basis-N auf Binär, dann and, or, xor oder xnor aus CATALOG, Logikoperatoren. Vorsicht: Not kippt alle 32 Bit.'],
    make(rng) {
      const G = { AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => 1 - (a & b), NOR: (a, b) => 1 - (a | b), XOR: (a, b) => a ^ b };
      const g1 = pick(rng, Object.keys(G)), g2 = pick(rng, Object.keys(G)); const A = int(rng, 0, 1), B = int(rng, 0, 1), C = int(rng, 0, 1);
      const x = G[g1](A, B), y = G[g2](x, C);
      return { text: `Ein Schaltnetz verknüpft A und B mit einem ${g1}-Gatter zu X. X und C gehen in ein ${g2}-Gatter mit dem Ausgang Y. Eingänge: A = ${A}, B = ${B}, C = ${C}. Bestimmen Sie X und Y.`,
        fields: [{ label: 'X', value: x, tol: 0 }, { label: 'Y', value: y, tol: 0 }],
        steps: [`X = ${A} ${g1} ${B} = ${x}.`, `Y = ${x} ${g2} ${C} = ${y}.`, 'AND: nur 1 und 1 ergibt 1. OR: mindestens eine 1. XOR: genau eine 1. NAND und NOR sind das Gegenteil von AND und OR.'] };
    } },
    raid: { name: 'RAID-Nettokapazität', part: 'Teil1', level: 1, formulas: ["RAID 0: n · C", "RAID 1: C (Spiegel)", "RAID 5: (n − 1) · C", "RAID 6: (n − 2) · C", "RAID 10: n / 2 · C"],
      explain: "Redundanz kostet Kapazität: Bei Spiegelung steht jede Information doppelt da, bei Parität geht der Platz einer (RAID 5) oder zweier Platten (RAID 6) für die Prüfdaten verloren. Dafür übersteht das System den Ausfall einer bzw. zweier Platten. RAID 0 hat keine Redundanz.",
      hints: [
      'Frage dich, wie viel Kapazität für Spiegelung oder Parität verloren geht.',
      'RAID 0: nichts. RAID 1: Spiegel, eine Platte nutzbar. RAID 5: eine Platte Parität. RAID 6: zwei Platten Parität. RAID 10: die Hälfte.'],
    make(rng) {
      const level = pick(rng, [0, 1, 5, 6, 10]); const n = level === 1 ? 2 : level === 10 ? pick(rng, [4, 6, 8]) : level === 6 ? pick(rng, [4, 5, 6, 8]) : pick(rng, [3, 4, 5, 6]); const s = pick(rng, [2, 4, 8, 12, 16]);
      const net = { 0: n * s, 1: s, 5: (n - 1) * s, 6: (n - 2) * s, 10: n / 2 * s }[level];
      const why = { 0: 'RAID 0 verteilt nur, es gibt keine Redundanz: alle Platten zählen.', 1: 'RAID 1 spiegelt: nutzbar ist eine Platte.', 5: 'RAID 5 braucht eine Platte für Parität: (n − 1) · Größe.', 6: 'RAID 6 braucht zwei Platten für Parität: (n − 2) · Größe.', 10: 'RAID 10 spiegelt Paare: n / 2 · Größe.' }[level];
      return { text: `Ein Server hat ${n} Festplatten mit je ${s} TB im RAID ${level}. Wie groß ist die nutzbare Kapazität?`,
        fields: [{ label: 'Nutzbare Kapazität', unit: 'TB', value: net, tol: 0 }], steps: [why, `${n} Platten · ${s} TB ergeben netto ${net} TB.`] };
    } },
    verfuegbarkeit: { name: 'Verfügbarkeit und Ausfallzeit', part: 'Teil1', level: 2, formulas: ["Ausfallzeit = Gesamtzeit · (1 − Verfügbarkeit)", "Gesamtzeit pro Jahr = 24 h · 365 = 8.760 h", "Verfügbarkeit = Betriebszeit / Gesamtzeit"],
      explain: "Die Verfügbarkeit ist der Anteil der Zeit, in der ein System nutzbar ist. Was zu 100 % fehlt, darf es ausfallen. Schon kleine Unterschiede zählen: 99 % erlauben rund 87,6 Stunden Ausfall im Jahr, 99,99 % nur noch etwa 53 Minuten.",
      hints: [
      'Verfügbarkeit ist der Anteil der Zeit, in der das System läuft; der Rest ist die erlaubte Ausfallzeit.',
      'Ein Jahr Dauerbetrieb hat 24 h · 365 = 8.760 h.',
      'Ausfallzeit = 8.760 h · (100 % − Verfügbarkeit). Stunden mal 60 ergibt Minuten.'],
    make(rng, fixed) {
      const p = fixed ? fixed.p : pick(rng, [99, 99.5, 99.9, 99.95, 99.99]); const h = 8760 * (100 - p) / 100; const min = h * 60;
      return { text: `Ein Server soll rund um die Uhr laufen und eine Verfügbarkeit von ${de(p, 2)} % erreichen. Berechnen Sie die maximale Ausfallzeit pro Jahr in Stunden und in Minuten.`,
        fields: [{ label: 'Ausfallzeit', unit: 'h', value: h, tol: 0.005 }, { label: 'Ausfallzeit', unit: 'min', value: min, tol: 0.005 }],
        steps: ['Stunden pro Jahr: 24 h · 365 = 8.760 h.', `Ausfall = 8.760 h · (100 % − ${de(p, 2)} %) = 8.760 h · ${de((100 - p) / 100, 4)} = ${de(h, 3)} h.`, `In Minuten: ${de(h, 3)} h · 60 = ${de(min, 1)} min.`] };
    } },
    hostmaske: { name: 'Subnetz für eine Mindestzahl an Hosts', part: 'Teil1', level: 2, formulas: ["2^h − 2 ≥ Anzahl Hosts (kleinstes h)", "Präfix = 32 − h", "h = log₂(Hosts + 2), aufgerundet"],
      explain: "Jedes Hostbit verdoppelt die Zahl der Adressen im Netz. Man nimmt so wenige Hostbits wie möglich, damit keine Adressen verschwendet werden, aber genug für alle Geräte plus Netz- und Broadcastadresse.",
      hints: [
      'Gesucht ist die kleinste Zahl Hostbits h, für die 2^h − 2 mindestens die geforderte Zahl Hosts ergibt.',
      'Netz- und Broadcastadresse sind nicht nutzbar, deshalb „− 2“.',
      'Präfix = 32 − h; die Maske hat so viele Einsen von links, wie das Präfix angibt.',
      'Am fx-991DE CW: log(2;Hosts + 2) mit der Taste log■□ rechnen und auf die nächste ganze Zahl aufrunden.'],
    make(rng, fixed) {
      const n = fixed ? fixed.n : pick(rng, [10, 14, 25, 30, 50, 60, 100, 120, 200, 250, 300, 500, 1000, 2000]);
      let bits = 1; while (2 ** bits - 2 < n) bits++;
      const prefix = 32 - bits; const mask = (0xFFFFFFFF << bits) >>> 0; const hosts = 2 ** bits - 2;
      return { text: `Ein Kunde braucht ein Netz für mindestens ${n} Geräte. Es dürfen keine IP-Adressen verschwendet werden. Bestimmen Sie Präfixlänge, Subnetzmaske und die Anzahl nutzbarer Hostadressen.`,
        fields: [{ label: 'Präfixlänge (ohne Schrägstrich)', value: prefix, tol: 0 }, { label: 'Subnetzmaske', exact: ip(mask) }, { label: 'Nutzbare Hosts', value: hosts, tol: 0 }],
        steps: [`Hostbits: 2^${bits - 1} − 2 = ${2 ** (bits - 1) - 2} reicht nicht, 2^${bits} − 2 = ${hosts} reicht für ${n}.`, `Präfix = 32 − ${bits} = /${prefix}.`, `Maske mit ${prefix} Einsen: ${ip(mask)}.`] };
    } },
    uplink: { name: 'Bandbreite und Link Aggregation', part: 'Teil1', level: 2, formulas: ["Bedarf = Σ (Anzahl Geräte · Datenrate je Gerät)", "Verbindungen = Bedarf / Datenrate je Verbindung, aufgerundet", "Zusätzlich = benötigt − vorhanden"],
      explain: "Beim Dimensionieren rechnet man mit dem ungünstigsten Fall, dass alle Geräte gleichzeitig voll senden. Link Aggregation bündelt mehrere physische Leitungen zu einer logischen, ihre Datenraten addieren sich. Eine halbe Leitung gibt es nicht, deshalb wird aufgerundet.",
      hints: [
      'Im ungünstigsten Fall senden alle Geräte gleichzeitig mit voller Geschwindigkeit: alle Datenraten addieren.',
      'Anzahl Verbindungen = Bedarf : Datenrate je Verbindung, immer aufrunden.',
      'Gefragt sind die zusätzlichen Verbindungen: die vorhandenen abziehen.'],
    make(rng, fixed) {
      const f = fixed || { aps: int(rng, 2, 6), apRate: pick(rng, [1, 2.5, 5]), pcs: pick(rng, [8, 10, 12, 16, 20, 24]), have: pick(rng, [1, 1, 2]) };
      const demand = f.aps * f.apRate + f.pcs; const needed = Math.ceil(demand / 10 - 1e-9); const extra = Math.max(0, needed - f.have);
      return { text: `An einem Etagenswitch hängen ${f.aps} Accesspoints mit je ${de(f.apRate, 1)} Gbit/s und ${f.pcs} PCs mit je 1 Gbit/s. Der Switch ist über ${f.have === 1 ? 'eine Verbindung' : f.have + ' Verbindungen'} mit je 10 Gbit/s an den Core-Switch angebunden (Link Aggregation). Berechnen Sie die maximale Datenrate, wenn alle Geräte gleichzeitig senden, und die Anzahl zusätzlich nötiger 10-Gbit/s-Verbindungen.`,
        fields: [{ label: 'Maximale Datenrate', unit: 'Gbit/s', value: demand, tol: 0.001 }, { label: 'Zusätzliche Verbindungen', value: extra, tol: 0 }],
        steps: [`Bedarf = ${f.aps} · ${de(f.apRate, 1)} Gbit/s + ${f.pcs} · 1 Gbit/s = ${de(demand, 1)} Gbit/s.`, `${de(demand, 1)} Gbit/s : 10 Gbit/s = ${de(demand / 10, 2)}, aufgerundet ${needed} Verbindungen.`, `Vorhanden ${f.have}, also ${extra} zusätzlich.`] };
    } },
    ram: { name: 'Arbeitsspeicher aufrüsten', part: 'Teil1', level: 1, formulas: ["Module gesamt = Zielkapazität / Modulgröße", "Neu = gesamt − vorhanden"],
      explain: "Bei identischen Modulen ist die Kapazität Anzahl mal Modulgröße. Schon eingebaute Module bleiben drin und zählen mit. Gesteckt wird in der Reihenfolge laut Mainboard-Handbuch, damit die Speicherkanäle gleichmäßig belegt sind.",
      hints: [
      'Alle Module sollen gleich groß sein: Zielkapazität : Modulgröße ergibt die Gesamtzahl der Module.',
      'Die schon eingebauten Module zählen mit; kaufen muss man nur die Differenz.'],
    make(rng, fixed) {
      const f = fixed || (() => { const mod = pick(rng, [8, 16, 32]); const haveN = pick(rng, [1, 2]); return { mod, haveN, target: mod * pick(rng, [4, 6, 8]) }; })();
      const total = f.target / f.mod; const neu = total - f.haveN;
      return { text: `Ein Server hat ${f.haveN * f.mod} GB Arbeitsspeicher aus ${f.haveN === 1 ? 'einem Modul' : f.haveN + ' Modulen'} mit je ${f.mod} GB. Er soll mit identischen Modulen auf ${f.target} GB aufgerüstet werden. Wie viele Module sind dann eingebaut, und wie viele müssen neu beschafft werden?`,
        fields: [{ label: 'Module insgesamt', value: total, tol: 0 }, { label: 'Neu zu beschaffende Module', value: neu, tol: 0 }],
        steps: [`${f.target} GB : ${f.mod} GB = ${total} Module insgesamt.`, `${total} − ${f.haveN} vorhandene = ${neu} neue Module.`] };
    } },
    abschalt: { name: 'Abschaltbedingung und Schleifenimpedanz', part: 'Teil2', level: 3, formulas: ["Z_s · I_a ≤ U₀", "Z_s,max = U₀ / I_a", "I_a = 5 · I_n (Charakteristik B), 10 · I_n (Charakteristik C)"],
      explain: "Bei einem Körperschluss fließt der Fehlerstrom durch die Fehlerschleife: Außenleiter, Fehlerstelle, Schutzleiter und zurück zum Transformator. Ist deren Impedanz Z_s zu groß, bleibt der Strom zu klein, der LS-Schalter löst nicht schnell genug aus und am Gehäuse bleibt eine gefährliche Berührungsspannung. Die Abschaltbedingung stellt sicher, dass mindestens der Auslösestrom I_a fließt.",
      hints: [
      'Im Fehlerfall muss der Leitungsschutzschalter innerhalb von 0,4 s abschalten; dafür muss der Fehlerstrom groß genug sein.',
      'Abschaltstrom laut Belegsatz bzw. Tabellenbuch: Charakteristik B 5 · I_n, Charakteristik C 10 · I_n.',
      'Abschaltbedingung Z_s · I_a ≤ U₀, also Z_s,max = U₀ / I_a. Dann mit dem Messwert vergleichen.'],
    make(rng, fixed) {
      const f = fixed || { ch: pick(rng, ['B', 'C']), In: pick(rng, [10, 13, 16, 20, 25, 32]), k: pick(rng, [0.6, 0.8, 1.2, 1.4]) };
      const factor = f.ch === 'B' ? 5 : 10; const Ia = factor * f.In; const zmax = 230 / Ia; const zs = Math.round(zmax * f.k * 100) / 100; const ok = zs <= zmax;
      return { text: `Ein Stromkreis im TN-S-System (U₀ = 230 V) ist mit einem Leitungsschutzschalter ${f.ch}${f.In} abgesichert. Gemessen wurde eine Schleifenimpedanz Z_s = ${de(zs, 2)} Ω. Bestimmen Sie den Abschaltstrom I_a für die Abschaltung innerhalb von 0,4 s, die höchstzulässige Schleifenimpedanz und ob die Abschaltbedingung erfüllt ist.`,
        fields: [{ label: 'Abschaltstrom I_a', unit: 'A', value: Ia, tol: 0 }, { label: 'Maximale Schleifenimpedanz', unit: 'Ω', value: zmax, tol: 0.01 }, { label: 'Abschaltbedingung erfüllt? (ja oder nein)', exact: ok ? 'ja' : 'nein' }],
        steps: [`Charakteristik ${f.ch}: I_a = ${factor} · I_n = ${factor} · ${f.In} A = ${Ia} A.`, `Z_s · I_a ≤ U₀, also Z_s,max = 230 V / ${Ia} A = ${de(zmax, 3)} Ω.`, `Gemessen ${de(zs, 2)} Ω ${ok ? '≤' : '>'} ${de(zmax, 3)} Ω: Abschaltbedingung ${ok ? 'erfüllt' : 'nicht erfüllt'}.`] };
    } },
    zweihoch: { name: 'Bits und Wertebereich (2ⁿ)', part: 'Teil1', level: 1, formulas: ["Anzahl Werte = 2ⁿ (n = Anzahl Bit)", "Bits = log₂(N), aufgerundet"],
      explain: "Jedes Bit hat zwei Zustände. Bei n Bit multiplizieren sich die Möglichkeiten: 2 · 2 · … · 2 = 2ⁿ. Für N Werte braucht man daher so viele Bits, dass 2ⁿ mindestens N erreicht.",
      hints: [
      'Mit n Bit lassen sich 2ⁿ verschiedene Werte darstellen.',
      'Umgekehrt: Für N Werte braucht man die kleinste Zahl n mit 2ⁿ ≥ N.',
      'Am fx-991DE CW: 2 x^■ n für 2ⁿ, log(2;N) für die Bits (aufrunden).'],
    make(rng, fixed) {
      if ((fixed && fixed.bits) || (!fixed && rng() < 0.5)) {
        const [what, n] = fixed ? ['VLAN-ID (VID)', fixed.bits] : pick(rng, [['VLAN-ID (VID)', 12], ['Hostanteil', 8], ['Port-Nummer', 16], ['Farbtiefe je Pixel', 24], ['Adressfeld', 20]]);
        return { text: `Ein Feld „${what}“ ist ${n} Bit lang. Wie viele verschiedene Werte lassen sich damit darstellen?`, fields: [{ label: 'Anzahl Werte', value: 2 ** n, tol: 0 }],
          steps: [`2^${n} = ${de(2 ** n, 0)} Werte.`, n === 12 ? 'Bei VLAN sind 0 und 4.095 reserviert; 4.094 nutzbare IDs gelten in der IHK-Lösung ebenfalls als richtig.' : 'Jedes zusätzliche Bit verdoppelt die Anzahl.'] };
      }
      const N = pick(rng, [5, 12, 30, 100, 200, 1000, 5000]); let n = 0; while (2 ** n < N) n++;
      return { text: `Es sollen ${N} verschiedene Werte binär codiert werden. Wie viele Bit sind mindestens nötig?`, fields: [{ label: 'Bits', value: n, tol: 0 }],
        steps: [`2^${n - 1} = ${2 ** (n - 1)} reicht nicht, 2^${n} = ${2 ** n} reicht für ${N}.`, `Also ${n} Bit.`] };
    } },
  };

  // Taschenrechner nach dem Vorbild des fx-991DE CW: eigener Parser statt eval, Winkel in Grad, Ergebnis auf 12 Stellen gerundet
  const RAD = Math.PI / 180;
  const FN = { sin: (x) => Math.sin(x * RAD), cos: (x) => Math.cos(x * RAD), tan: (x) => Math.tan(x * RAD), asin: (x) => Math.asin(x) / RAD, acos: (x) => Math.acos(x) / RAD, atan: (x) => Math.atan(x) / RAD,
    ln: Math.log, log: (a, b) => b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a), root: (n, x) => x === undefined ? Math.sqrt(n) : x < 0 && n % 2 ? -((-x) ** (1 / n)) : x ** (1 / n) };
  const autoClose = (t) => t + ')'.repeat(Math.max(0, (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length)); // offene Klammern schließen wie am Taschenrechner
  function calc(src, ans = 0) {
    const t0 = String(src).toLowerCase().replace(/[×·*]/g, '*').replace(/[÷:/]/g, '/').replace(/[−–]/g, '-').replace(/,/g, '.').replace(/\s+/g, '')
      .replace(/(sin|cos|tan)⁻¹/g, 'a$1').replace(/ⁿ√/g, 'root').replace(/sqrt/g, '√').replace(/pi/g, 'π').replace(/⁻¹/g, '^(-1)').replace(/²/g, '^2').replace(/³/g, '^3');
    if (!t0) return null;
    const t = autoClose(t0);
    let i = 0;
    const fail = () => { throw new Error(i < t.length ? `Unerwartetes Zeichen „${t[i]}“` : 'Ausdruck unvollständig'); };
    const args = () => { // nach einem Funktionsnamen: (a), (a;b) oder ein einzelner Wert wie in ln2
      if (t[i] !== '(') return [unary()];
      i++; const a = [expr()]; if (t[i] === ';') { i++; a.push(expr()); } if (t[i] !== ')') fail(); i++; return a;
    };
    const atom = () => {
      if (t[i] === '(') { i++; const v = expr(); if (t[i] !== ')') fail(); i++; return v; }
      if (t[i] === '√') { i++; return Math.sqrt(unary()); }
      if (t[i] === 'π') { i++; return Math.PI; }
      const w = /^[a-z]+/.exec(t.slice(i));
      if (w) {
        if (w[0] === 'e') { i++; return Math.E; }
        if (w[0] === 'ans') { i += 3; return ans; }
        if (!FN[w[0]]) fail();
        i += w[0].length; return FN[w[0]](...args());
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i)); if (!m) fail(); i += m[0].length; return +m[0];
    };
    const pow = () => { const b = atom(); if (t[i] === '^') { i++; return b ** unary(); } return b; };
    const unary = () => t[i] === '-' ? (i++, -unary()) : t[i] === '+' ? (i++, unary()) : pow();
    const term = () => {
      let v = unary();
      for (;;) {
        if (t[i] === '*' || t[i] === '/') { const o = t[i++]; const r = unary(); v = o === '*' ? v * r : v / r; }
        else if (t[i] && /[(√πa-z]/.test(t[i])) v *= unary(); // 2π, 2(3+1), 2√3, 3sin30
        else return v;
      }
    };
    const expr = () => { let v = term(); while (t[i] === '+' || t[i] === '-') { const o = t[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
    const v = expr(); if (i < t.length) fail();
    if (!Number.isFinite(v)) throw new Error('Kein endliches Ergebnis (Division durch 0?)');
    return +v.toPrecision(12);
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).replace(/./g, (c) => SUP[c]);
  const deN = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 9 });
  // Anzeige mit höchstens 10 Stellen wie am Gerät, sehr große oder kleine Werte mit ×10ⁿ
  function fmtNum(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e10 || a < 1e-4) { const [m, e] = v.toExponential(9).split('e'); return `${deN(+m)} ×10${sup(+e)}`; }
    return deN(+v.toPrecision(10));
  }
  // Ingenieurschreibweise (FORMAT, ENG Notation): Exponent in Dreierschritten, dazu der Vorsatz (m, µ, k …)
  const PREFIX = { '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };
  function engNum(v) {
    if (v === 0) return { text: '0', e: 0, prefix: '' };
    let e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3; let m = +(v / 10 ** e).toPrecision(10);
    if (Math.abs(m) >= 1000) { m /= 1000; e += 3; }
    return { text: `${deN(m)} ×10${sup(e)}`, e, prefix: PREFIX[e] ?? '' };
  }

  // Basis-N wie am fx-991DE CW: ganze Zahlen mit 32 Bit, negative Werte im Zweierkomplement; Vorrang Neg/Not, × ÷, + −, and, dann or/xor/xnor
  const BASES = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
  const BASE_NAME = { 10: 'Dezimal', 16: 'Hexadezimal', 2: 'Binär', 8: 'Oktal' };
  const DIGITS = { 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/, 2: /^[01]+$/, 8: /^[0-7]+$/ };
  function baseCalc(src, base, ans = 0) {
    const t0 = String(src).toLowerCase().replace(/[×·*]/g, '*').replace(/[÷:/]/g, '/').replace(/[−–]/g, '-');
    if (!t0.trim()) return null;
    const t = autoClose(t0); const tok = []; const re = /\s*(xnor|xor|and|or|not|neg|ans|[0-9a-f]+|[-+*/()])/y; let m;
    for (let p = 0; p < t.length; p = re.lastIndex) {
      re.lastIndex = p; m = re.exec(t);
      if (!m) { if (t.slice(p).trim()) throw new Error(`Unerwartetes Zeichen „${t.slice(p).trim()[0]}“`); break; }
      tok.push(m[1]);
    }
    let i = 0;
    const R = (v) => { if (!(v >= -2147483648 && v <= 2147483647)) throw new Error('Außerhalb von 32 Bit (am Gerät Math ERROR)'); return v; };
    const atom = () => {
      const x = tok[i++];
      if (x === undefined) throw new Error('Ausdruck unvollständig');
      if (x === '(') { const v = lor(); if (tok[i++] !== ')') throw new Error('Klammer fehlt'); return v; }
      if (x === 'ans') return ans;
      if (!DIGITS[base].test(x)) throw new Error(`„${x.toUpperCase()}“ ist keine ${BASE_NAME[base]}zahl`);
      const v = parseInt(x, base);
      if (base === 10) return R(v);
      if (v > 0xFFFFFFFF) throw new Error('Außerhalb von 32 Bit (am Gerät Math ERROR)');
      return v | 0;
    };
    const unary = () => { const x = tok[i]; if (x === 'neg' || x === '-') { i++; return R(-unary()); } if (x === 'not') { i++; return ~unary(); } if (x === '+') { i++; return unary(); } return atom(); };
    const mul = () => { let v = unary(); while (tok[i] === '*' || tok[i] === '/') { const o = tok[i++]; const r = unary(); if (o === '/' && r === 0) throw new Error('Division durch 0'); v = R(o === '*' ? v * r : Math.trunc(v / r)); } return v; };
    const add = () => { let v = mul(); while (tok[i] === '+' || tok[i] === '-') { const o = tok[i++]; const r = mul(); v = R(o === '+' ? v + r : v - r); } return v; };
    const land = () => { let v = add(); while (tok[i] === 'and') { i++; v &= add(); } return v; };
    const lor = () => { let v = land(); while (['or', 'xor', 'xnor'].includes(tok[i])) { const o = tok[i++]; const r = land(); v = o === 'or' ? v | r : o === 'xor' ? v ^ r : ~(v ^ r); } return v; };
    const v = lor(); if (i < tok.length) throw new Error(`Unerwartet: „${tok[i]}“`);
    return v;
  }
  const toBase = (v, b) => b === 10 ? String(v) : (v >>> 0).toString(b).toUpperCase();
  const binGroups = (s) => s.padStart(Math.ceil(s.length / 4) * 4, '0').replace(/(.{4})(?=.)/g, '$1 ');

  function checkField(f, input) {
    if (f.exact !== undefined) return String(input || '').trim().replace(/\s/g, '').toUpperCase() === f.exact.toUpperCase();
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

  // ---------- Operatoren in Aufgabentexten (was genau verlangt ist) ----------
  const OPS = {
    nennen: 'Nennen: Begriffe oder Fakten aufzählen, ohne Erklärung. Genau so viele wie verlangt.',
    beschreiben: 'Beschreiben: Sachverhalt oder Ablauf in eigenen Worten wiedergeben, ohne Bewertung.',
    erläutern: 'Erläutern: Zusammenhang verständlich machen, mit Begründung oder Beispiel.',
    erklären: 'Erklären: Ursache und Wirkung oder Funktionsweise nachvollziehbar darstellen.',
    begründen: 'Begründen: Gründe oder Argumente angeben, warum etwas so ist oder so gemacht wird.',
    berechnen: 'Berechnen: Formel, Rechenweg und Ergebnis mit Einheit angeben.',
    ermitteln: 'Ermitteln: Ergebnis herleiten, durch Rechnung, Tabelle oder Kennlinie. Weg zeigen.',
    bestimmen: 'Bestimmen: Wert oder Lösung eindeutig angeben, Lösungsweg nachvollziehbar.',
    vergleichen: 'Vergleichen: Gemeinsamkeiten und Unterschiede nach Kriterien gegenüberstellen.',
    beurteilen: 'Beurteilen: Aussage an Kriterien prüfen und ein begründetes Urteil fällen.',
    bewerten: 'Bewerten: Vor- und Nachteile abwägen und mit Begründung Stellung nehmen.',
    skizzieren: 'Skizzieren: Wesentliches grafisch darstellen, beschriftet, ohne Maßstab.',
    zeichnen: 'Zeichnen: Grafik oder Schaltplan genau und beschriftet anfertigen.',
    ergänzen: 'Ergänzen: Lücken in Text, Tabelle oder Plan füllen.',
    vervollständigen: 'Vervollständigen: Tabelle, Plan oder Text komplett ausfüllen.',
    unterscheiden: 'Unterscheiden: Merkmale herausstellen, die Dinge voneinander abgrenzen.',
    überprüfen: 'Überprüfen: Angaben an Vorgaben oder Grenzwerten messen und Ergebnis nennen.',
    prüfen: 'Prüfen: Angaben an Vorgaben oder Grenzwerten messen und Ergebnis nennen.',
    entscheiden: 'Entscheiden: eine Möglichkeit wählen und die Wahl begründen.',
    zuordnen: 'Zuordnen: Elemente passenden Begriffen oder Kategorien zuweisen.',
    benennen: 'Benennen: Bauteile, Begriffe oder Fachbezeichnungen korrekt angeben, ohne Erklärung.',
    bezeichnen: 'Bezeichnen: den richtigen Fachbegriff angeben.',
    wählen: 'Wählen: eine passende Möglichkeit aussuchen, meist mit kurzer Begründung.',
    auswählen: 'Auswählen: eine passende Möglichkeit aussuchen, meist mit kurzer Begründung.',
    markieren: 'Markieren: die gesuchten Stellen im Plan, Text oder in der Tabelle kennzeichnen.',
    erstellen: 'Erstellen: Plan, Tabelle oder Konfiguration vollständig selbst anfertigen.',
    definieren: 'Definieren: Begriff genau und knapp festlegen.',
    empfehlen: 'Empfehlen: eine Lösung vorschlagen und begründen, warum sie passt.',
    'geben sie': 'Angeben („Geben Sie … an“): Werte, Fakten oder Begriffe knapp nennen.',
    'tragen sie': 'Eintragen („Tragen Sie … ein“): Werte oder Ziffern an die vorgesehene Stelle schreiben.',
    'kreuzen sie': 'Ankreuzen: die zutreffenden Aussagen markieren, Anzahl beachten.',
    'ordnen sie': 'Zuordnen („Ordnen Sie … zu“): Elemente passenden Begriffen zuweisen.',
    'füllen sie': 'Ausfüllen („Füllen Sie … aus“): Tabelle oder Formular vollständig ergänzen.',
    'weisen sie': 'Zuweisen oder nachweisen („Weisen Sie … zu/nach“): Zuordnung treffen bzw. Nachweis rechnerisch führen.',
  };
  // Längere Schlüssel zuerst, damit „auswählen“ vor „wählen“ greift; „Geben Sie“ statt „geben“ vermeidet Treffer wie „gegeben“
  const OP_RE = new RegExp(`(^|[^\\p{L}])(${Object.keys(OPS).sort((x, y) => y.length - x.length).join('|')})(?=[^\\p{L}]|$)`, 'giu');
  // Markiert Operatoren in bereits HTML-escapetem Text; liefert html und die gefundenen Operatoren in Reihenfolge
  function markOps(html) {
    const found = [];
    const out = html.replace(OP_RE, (m, pre, w) => { const k = w.toLowerCase(); if (!found.includes(k)) found.push(k); return `${pre}<mark class="op" title="${OPS[k]}">${w}</mark>`; });
    return { html: out, ops: found.map((k) => ({ op: OPS[k].split(/[ :(„]/)[0].toLowerCase(), hint: OPS[k] })) };
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
  const DOC_FORM = [
    'Umfang nach Vorgabe deiner IHK, z. B. IHK Hannover etwa 10 bis 15 Seiten ohne Anlagen',
    'Schrift und Ränder nach IHK-Vorgabe, z. B. Arial 10 bis 12 pt, links 2,5 cm, rechts 2 cm',
    'Kopf- und Fußzeile mit Name, Titel und Seitenzahl',
    'Personen, Kunden und interne Daten anonymisiert',
    'Bilder und Grafiken mit Quelle und nur mit Nutzungsrecht',
    'Sachlicher Stil, einheitliche Zeitform, Fachbegriffe erklärt',
    'Hilfsmittel offen angegeben, auch KI-Werkzeuge',
    'Schlusskontrolle: Rechtschreibung, Verweise, Seitenzahlen, Anlagen vollständig',
  ];
  const ANTRAG = [
    'Einmalig: kein Routinejob, der regelmäßig gleich abläuft',
    'Klares, überprüfbares Ziel und beschriebene Ausgangslage',
    'Zeitlich begrenzt mit Start, Ende und Phasen, höchstens 40 Stunden',
    'Mittel festgelegt: Personen, Material, Budget',
    'Fachliche Tiefe: eigene Planung, Alternativen verglichen, Entscheidung begründet',
    'Passt zum Beruf: IT-Systeme und Infrastruktur, gern mit Stromversorgung',
    'Eigene Leistung klar abgegrenzt von der Arbeit anderer',
    'Auftraggeber benannt, intern oder extern',
    'Test, Abnahme und Übergabe sind eingeplant',
    'Antrag fristgerecht eingereicht, Beginn erst nach Genehmigung',
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

  // Wiederholung im Rechentrainer: falsch gelöste Typen kommen sofort, dann nach 1, 3, 7 und 14 Tagen wieder (wie bei den Prüfungsaufgaben)
  const REVIEW_DAYS = [0, 1, 3, 7, 14];
  function drillReview(e, ok, now) {
    if (!ok) { e.box = 0; e.due = now; }
    else if (e.due !== undefined && e.due <= now) {
      e.box++;
      if (e.box < REVIEW_DAYS.length) e.due = now + REVIEW_DAYS[e.box] * 864e5; else { delete e.box; delete e.due; }
    }
    return e;
  }
  const drillDue = (d, now) => Object.keys(DRILLS).filter((k) => d[k] && d[k].due !== undefined && d[k].due <= now);

  // Selbsttest (Fehler landen in der Konsole)
  const assert = (c, m) => { if (!c) console.error('Selbsttest tools.js fehlgeschlagen:', m); };
  const sn = DRILLS.subnet.make(Math.random, { ip: ((192 << 24) | (168 << 16) | (50 << 8) | 17) >>> 0, prefix: 26 });
  assert(sn.fields.map((f) => f.exact ?? f.value).join() === '255.255.255.192,192.168.50.0,192.168.50.63,62', 'Subnetting');
  assert(checkField({ value: 0.4286, tol: 0.015 }, '0,43') && !checkField({ value: 2, tol: 0 }, '2,5') && checkField({ value: 1500, tol: 0.01 }, '1.500'), 'Prüfen mit Toleranz');
  assert(decimalGrade(100) === '1,0' && decimalGrade(66.6) === '3,4' && decimalGrade(50) === '4,4' && decimalGrade(29) === '5,5' && decimalGrade(3) === '6,0', 'Dezimalnote');
  const all = (x) => fill({}, x);
  assert(assess(all(50)).passed === true && assess({ ...all(80), t2: 45 }).passed === false && assess({ ...all(80), t1: 40 }).passed === true && assess({ ...all(80), t1: 40, wiso: 45 }).passed === false && assess({ ...all(80), wiso: 25 }).passed === false, 'Bestehensregeln');
  assert(assess({ ap1: 60 }).target === 50 && assess({ ...all(70), t2: 40 }).oral[0].needed === 69, 'Ziel und Ergänzungsprüfung');

  const mo = markOps('Ermitteln Sie den Strom und vergleichen Sie. Die Nennung zählt nicht.');
  assert(mo.ops.map((x) => x.op).join() === 'ermitteln,vergleichen' && (mo.html.match(/<mark/g) || []).length === 2, 'Operatoren');
  assert(markOps('Geben Sie die Werte an. Es ist gegeben: 5 V. Benennen Sie das Bauteil.').ops.map((x) => x.op).join() === 'angeben,benennen', 'Operatoren trennbar');
  const zr = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
  assert(near(calc('2*25/(56*1,5)'), 50 / 84) && calc('-2^2') === -4 && calc('2^3^2') === 512 && calc('2(3+1)') === 8 && near(calc('2π'), 2 * Math.PI) && near(calc('√3 · 400 · 16'), Math.sqrt(3) * 6400) && calc('10 − 4 − 3') === 3 && calc('12:4·3') === 9 && calc('√(9)+3²') === 12 && calc('√(9') === 3, 'Rechner');
  ['alert(1)', '2+', '2)', '1/0', '2..3'].forEach((x) => { let ok = false; try { calc(x); } catch (e) { ok = true; } assert(ok, 'Rechner lehnt ab: ' + x); });
  assert(calc('sin(30)') === 0.5 && calc('sin⁻¹(0,5)') === 30 && calc('cos(60') === 0.5 && calc('log(1000)') === 3 && calc('log(2;16)') === 4 && calc('ln(e)') === 1 && calc('ⁿ√(3;27)') === 3 && calc('10⁻¹') === 0.1 && calc('1,23×10^3') === 1230 && calc('Ans×2', 21) === 42 && calc('0,1+0,2') === 0.3, 'Rechner Funktionen');
  assert(fmtNum(1e-7) === '1 ×10⁻⁷' && fmtNum(1234.5) === '1.234,5' && engNum(0.0005952).text === '595,2 ×10⁻⁶' && engNum(0.0005952).prefix === 'µ' && engNum(4700).prefix === 'k', 'Rechner Anzeige');
  assert(baseCalc('15×37', 10) === 555 && toBase(555, 16) === '22B' && baseCalc('1010 and 1100', 2) === 8 && toBase(baseCalc('not(1010)', 2), 2) === '11111111111111111111111111110101' && baseCalc('FFFFFFFF', 16) === -1 && baseCalc('7FFFFFFF', 16) === 2147483647 && baseCalc('1010 xor 0110', 2) === 12 && baseCalc('neg(1)', 16) === -1 && binGroups('101') === '0101', 'Basis-N');
  ['2147483647+1', '12', '1/0', 'G'].forEach((x) => { let ok = false; try { baseCalc(x, x === '12' ? 2 : 10); } catch (e) { ok = true; } assert(ok, 'Basis-N lehnt ab: ' + x); });
  assert(Object.values(DRILLS).every((d) => d.hints && d.hints.length >= 2), 'Tipps je Aufgabentyp');
  assert(Object.values(DRILLS).every((d) => d.formulas && d.formulas.length && d.explain), 'Formeln und Erklärung je Aufgabentyp');
  assert(Object.values(DRILLS).every((d) => [1, 2, 3].includes(d.level)), 'Schwierigkeit je Aufgabentyp');
  const vals = (t) => t.fields.map((f) => f.exact ?? +f.value.toFixed(4)).join('|');
  assert(vals(DRILLS.verfuegbarkeit.make(Math.random, { p: 99.5 })) === '43.8|2628', 'Verfügbarkeit 99,5 % (IHK W25/26 4aa)');
  assert(vals(DRILLS.hostmaske.make(Math.random, { n: 300 })) === '23|255.255.254.0|510' && vals(DRILLS.hostmaske.make(Math.random, { n: 30 })) === '27|255.255.255.224|30', 'Hosts zu Maske (IHK W25/26 1da, 1db)');
  assert(vals(DRILLS.uplink.make(Math.random, { aps: 3, apRate: 2.5, pcs: 10, have: 1 })) === '17.5|1', 'Link Aggregation (IHK W25/26 3ac, 3ad)');
  assert(vals(DRILLS.ram.make(Math.random, { mod: 16, haveN: 1, target: 64 })) === '4|3', 'RAM-Module (IHK W25/26 4ca)');
  assert(vals(DRILLS.abschalt.make(Math.random, { ch: 'B', In: 16, k: 0.8 })) === '80|2.875|ja' && vals(DRILLS.abschalt.make(Math.random, { ch: 'C', In: 16, k: 1.2 })) === '160|1.4375|nein', 'Abschaltbedingung');
  assert(vals(DRILLS.zweihoch.make(Math.random, { bits: 12 })) === '4096', 'VLAN-IDs 2^12 (IHK W25/26 1ab)');
  for (let k = 0; k < 40; k++) Object.values(DRILLS).forEach((d) => { const t = d.make(Math.random); assert(t.fields.every((f) => f.exact !== undefined || Number.isFinite(f.value)) && t.steps.length, 'Rechentrainer erzeugt gültige Aufgabe: ' + d.name); });
  ['zahlen', 'einheiten', 'gatter'].forEach((k) => { const t = DRILLS[k].make(zr()); assert(t.fields.every((f) => checkField(f, f.exact ?? String(f.value).replace('.', ','))), 'Rechentrainer ' + k); });
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
  const rv = drillReview({}, true, 0); drillReview(rv, false, 0); assert(rv.box === 0 && drillDue({ ohm: rv }, 0).join() === 'ohm', 'Wiederholung: Fehler fällig');
  drillReview(rv, true, 0); drillReview(rv, true, 1); assert(rv.box === 1 && rv.due === 864e5 && !drillDue({ ohm: rv }, 1).length, 'Wiederholung: Stufe 1, vorher nicht weiter');
  [1, 4, 11, 25].forEach((d) => drillReview(rv, true, d * 864e5)); assert(rv.box === undefined && rv.due === undefined, 'Wiederholung: gemeistert');
  assert(crit('4 Punkte (Grund 2 Punkte, Beschreibung 2 Punkte)', 4) === 'Grund=2|Beschreibung=2', 'Kriterien in Klammern');

  window.AP2Tools = { DRILLS, calc, fmtNum, engNum, BASES, BASE_NAME, baseCalc, toBase, binGroups, checkField, drillReview, drillDue, num, de, AREAS, assess, decimalGrade, gradeWord, criteria, DOC_CHECKLIST, DOC_FORM, ANTRAG, TALK_OUTLINE, FG_QUESTIONS, markOps };
})();
