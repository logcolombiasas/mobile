/**
 * Extracción de placas colombianas a partir del texto que devuelve el OCR.
 *
 * Formatos soportados:
 *  - Carro / camioneta / camión:  ABC123  (LLLDDD)
 *  - Moto actual:                 ABC12D  (LLLDDL)
 *  - Moto antigua:                ABC12   (LLLDD)
 *
 * El OCR confunde con frecuencia caracteres parecidos (O/0, I/1, B/8, S/5...).
 * Como el formato indica si en cada posición va letra o número, se corrigen
 * esos caracteres según la posición, limitando la cantidad de correcciones
 * para no inventar placas a partir de texto cualquiera.
 */

type Slot = 'L' | 'D';

const FORMATS: { pattern: Slot[]; name: string }[] = [
  { pattern: ['L', 'L', 'L', 'D', 'D', 'D'], name: 'carro' },
  { pattern: ['L', 'L', 'L', 'D', 'D', 'L'], name: 'moto' },
  { pattern: ['L', 'L', 'L', 'D', 'D'], name: 'moto_antigua' },
];

const TO_LETTER: Record<string, string> = {
  '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B',
};
const TO_DIGIT: Record<string, string> = {
  O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '1', J: '1', Z: '2', S: '5', G: '6', B: '8', A: '4',
};

const MAX_CORRECTIONS = 2;
// En las posiciones numéricas se permite corregir como máximo 1 carácter:
// así "REPUBL" no se convierte en "REP08L".
const MAX_DIGIT_CORRECTIONS = 1;

export interface PlateCandidate {
  plate: string;
  corrections: number;
  source: string;
}

export function normalizeText(value: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const isLetter = (c: string) => c >= 'A' && c <= 'Z';
const isDigit = (c: string) => c >= '0' && c <= '9';

/** Intenta ajustar `token` a `pattern`. Devuelve la placa corregida o null. */
export function matchFormat(
  token: string,
  pattern: Slot[],
  maxCorrections = MAX_CORRECTIONS,
): { plate: string; corrections: number } | null {
  if (token.length !== pattern.length) return null;
  let corrections = 0;
  let digitCorrections = 0;
  let plate = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = token[i];
    if (pattern[i] === 'L') {
      if (isLetter(c)) plate += c;
      else if (TO_LETTER[c]) { plate += TO_LETTER[c]; corrections++; }
      else return null;
    } else {
      if (isDigit(c)) plate += c;
      else if (TO_DIGIT[c]) { plate += TO_DIGIT[c]; corrections++; digitCorrections++; }
      else return null;
    }
    if (corrections > maxCorrections || digitCorrections > MAX_DIGIT_CORRECTIONS) return null;
  }
  return { plate, corrections };
}

function candidatesFromToken(token: string, source: string): PlateCandidate[] {
  const results: PlateCandidate[] = [];
  const tryToken = (t: string, exact: boolean) => {
    for (const { pattern } of FORMATS) {
      if (pattern.length === 5 && !exact) continue;
      // Si el texto venía pegado a ruido se exige una lectura más limpia
      const m = matchFormat(t, pattern, exact ? MAX_CORRECTIONS : 1);
      if (m) results.push({ ...m, source });
    }
  };

  if (token.length === 5 || token.length === 6) {
    tryToken(token, true);
  } else if (token.length >= 7 && token.length <= 10) {
    // Texto pegado a ruido (ej. "ABC123CO" o "IABC123"): se evalúan ventanas de 6
    for (let i = 0; i + 6 <= token.length; i++) tryToken(token.slice(i, i + 6), false);
  }
  return results;
}

/** Estructura mínima del resultado del OCR (react-native-vision-camera-ocr-plus) */
export interface OcrText {
  resultText: string;
  blocks?: { blockText: string; lines?: { lineText: string; elements?: { elementText: string }[] }[] }[];
}

/**
 * Devuelve las placas candidatas encontradas en un resultado de OCR,
 * ordenadas por menor número de correcciones.
 */
export function extractPlates(ocr: OcrText): PlateCandidate[] {
  const tokens = new Set<string>();
  const add = (raw: string | undefined) => {
    const t = normalizeText(raw || '');
    if (t.length >= 5 && t.length <= 10) tokens.add(t);
  };

  for (const block of ocr.blocks ?? []) {
    add(block.blockText);
    for (const line of block.lines ?? []) {
      add(line.lineText);
      const elements = line.elements ?? [];
      elements.forEach((el, i) => {
        add(el.elementText);
        // "ABC" + "123" pueden venir como elementos separados
        if (i + 1 < elements.length) add(el.elementText + elements[i + 1].elementText);
      });
    }
  }
  if (!ocr.blocks?.length) {
    (ocr.resultText || '').split(/\n/).forEach(add);
  }

  const best = new Map<string, PlateCandidate>();
  for (const token of tokens) {
    for (const c of candidatesFromToken(token, token)) {
      const prev = best.get(c.plate);
      if (!prev || c.corrections < prev.corrections) best.set(c.plate, c);
    }
  }
  return [...best.values()].sort((a, b) => a.corrections - b.corrections);
}

/** ABC123 -> ABC-123 */
export function formatPlate(plate: string): string {
  return plate.length >= 6 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}
