import type { PillColor, PillEntry, PillScanResult, PillShape } from './types'

/**
 * Pill identification — research-backed approach: combine imprint OCR with
 * color + shape, then score candidates. The UI always presents results as
 * "possible match" with a confidence %, never as a definitive identification.
 *
 * Ships with a small built-in reference DB (offline). In a production
 * deployment this would sync the open FDA NLM pill image / DailyMed imprint
 * datasets.
 */

export const PILL_DB: PillEntry[] = [
  { id: 'p1',  name: 'Aspirin',        strength: '75 mg',  genericName: 'Acetylsalicylic acid', imprints: ['Aspirin 75', 'A 75', '75'],            colors: ['white'],                 shapes: ['round'],          purpose: 'Blood thinner / antiplatelet' },
  { id: 'p2',  name: 'Aspirin',        strength: '325 mg', genericName: 'Acetylsalicylic acid', imprints: ['Aspirin', '325'],                       colors: ['white'],                 shapes: ['round'],          purpose: 'Pain & fever relief' },
  { id: 'p3',  name: 'Paracetamol',    strength: '500 mg', genericName: 'Acetaminophen',        imprints: ['P 500', 'Paracetamol 500', 'PCM'],      colors: ['white', 'cream'],        shapes: ['round', 'oblong'], purpose: 'Pain & fever relief' },
  { id: 'p4',  name: 'Ibuprofen',      strength: '200 mg', genericName: 'Ibuprofen',            imprints: ['I-2', 'IBU 200'],                       colors: ['brown', 'orange', 'red'], shapes: ['round', 'oval'],  purpose: 'NSAID pain relief' },
  { id: 'p5',  name: 'Ibuprofen',      strength: '400 mg', genericName: 'Ibuprofen',            imprints: ['IBU 400', 'I-4'],                       colors: ['pink', 'red', 'brown'],  shapes: ['oval'],            purpose: 'NSAID pain relief' },
  { id: 'p6',  name: 'Metformin',      strength: '500 mg', genericName: 'Metformin HCl',        imprints: ['H 102', 'Metformin 500', '500'],        colors: ['white'],                 shapes: ['round', 'oval'],   purpose: 'Type 2 diabetes' },
  { id: 'p7',  name: 'Amlodipine',     strength: '5 mg',   genericName: 'Amlodipine besylate',  imprints: ['A5', 'AML 5', '210'],                   colors: ['white'],                 shapes: ['round'],           purpose: 'Blood pressure' },
  { id: 'p8',  name: 'Atorvastatin',   strength: '10 mg',  genericName: 'Atorvastatin calcium', imprints: ['ATV 10', '10', 'PD 155'],               colors: ['white'],                 shapes: ['oval', 'round'],   purpose: 'Cholesterol' },
  { id: 'p9',  name: 'Atorvastatin',   strength: '20 mg',  genericName: 'Atorvastatin calcium', imprints: ['ATV 20', '20', 'PD 156'],               colors: ['white'],                 shapes: ['oval'],            purpose: 'Cholesterol' },
  { id: 'p10', name: 'Omeprazole',     strength: '20 mg',  genericName: 'Omeprazole',           imprints: ['OME 20', '20'],                         colors: ['pink', 'cream'],         shapes: ['capsule'],         purpose: 'Acid reflux / PPI' },
  { id: 'p11', name: 'Cetirizine',     strength: '10 mg',  genericName: 'Cetirizine HCl',       imprints: ['C 10', '4H2', '10'],                     colors: ['white'],                 shapes: ['oval', 'round'],   purpose: 'Antihistamine / allergy' },
  { id: 'p12', name: 'Amoxicillin',    strength: '500 mg', genericName: 'Amoxicillin',          imprints: ['AMOX 500', 'A 45'],                     colors: ['pink', 'cream', 'red'],  shapes: ['capsule'],         purpose: 'Antibiotic' },
  { id: 'p13', name: 'Bisoprolol',     strength: '2.5 mg', genericName: 'Bisoprolol fumarate',  imprints: ['B 2.5', '2.5'],                         colors: ['white', 'pink'],         shapes: ['round'],           purpose: 'Beta blocker / heart & BP' },
  { id: 'p14', name: 'Concor',         strength: '2.5 mg', genericName: 'Bisoprolol fumarate',  imprints: ['CONCOR 2.5'],                           colors: ['white'],                 shapes: ['round'],           purpose: 'Beta blocker / heart & BP (brand of bisoprolol)' },
  { id: 'p15', name: 'Losartan',       strength: '50 mg',  genericName: 'Losartan potassium',   imprints: ['LOS 50', '952'],                        colors: ['white', 'cream'],        shapes: ['oval', 'round'],   purpose: 'Blood pressure (ARB)' },
  { id: 'p16', name: 'Levothyroxine',  strength: '50 mcg', genericName: 'Levothyroxine sodium', imprints: ['T4 50', '50'],                          colors: ['white'],                 shapes: ['round'],           purpose: 'Thyroid hormone' },
  { id: 'p17', name: 'Azithromycin',   strength: '500 mg', genericName: 'Azithromycin',         imprints: ['AZI 500', 'PLIVA 787'],                 colors: ['white'],                 shapes: ['oval'],            purpose: 'Antibiotic' },
  { id: 'p18', name: 'Pantoprazole',   strength: '40 mg',  genericName: 'Pantoprazole sodium',  imprints: ['PAN 40', '40'],                         colors: ['yellow', 'cream'],       shapes: ['oval'],            purpose: 'Acid reflux / PPI' },
]

export interface MatchInput {
  imprint?: string // OCR / AI-observed imprint text
  color?: PillColor
  shape?: PillShape
}

const WEIGHTS = { imprint: 60, color: 22, shape: 18 }

/** Normalize imprint text for fuzzy comparison. */
function normImprint(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function imprintScore(observed: string[], entry: PillEntry): { score: number; hits: string[] } {
  if (observed.length === 0) return { score: 0, hits: [] }
  const entryTokens = new Set(entry.imprints.flatMap(normImprint))
  const nameTokens = new Set(normImprint(`${entry.name} ${entry.strength} ${entry.genericName ?? ''}`))
  const hits: string[] = []
  for (const tok of observed) {
    if (tok.length < 2 && !/^\d+$/.test(tok)) continue
    if (entryTokens.has(tok) || nameTokens.has(tok)) hits.push(tok)
    else {
      // substring tolerance for OCR noise (e.g. "ATV10" vs "ATV", "10")
      for (const et of entryTokens) {
        if (et.length >= 2 && (et.includes(tok) || (tok.length >= 3 && tok.includes(et)))) {
          hits.push(tok)
          break
        }
      }
    }
  }
  const considered = observed.filter((t) => t.length >= 2 || /^\d+$/.test(t)).length
  const ratio = considered === 0 ? 0 : Math.min(1, hits.length / Math.max(1, Math.min(considered, 3)))
  return { score: ratio, hits: [...new Set(hits)] }
}

/**
 * Score every DB entry and return the top matches with 0–100 confidence.
 * Confidence is calibrated conservatively: a perfect color+shape match with
 * no imprint evidence caps at ~45 — imprints are the decisive signal.
 */
export function matchPills(input: MatchInput, db: PillEntry[] = PILL_DB, top = 3): PillScanResult[] {
  const observed = input.imprint ? normImprint(input.imprint) : []
  const scored = db.map((entry) => {
    const reasons: string[] = []
    const imp = imprintScore(observed, entry)
    if (imp.hits.length > 0) reasons.push(`Imprint match: "${imp.hits.join('", "')}"`)

    const colorPts =
      input.color == null ? 0 : entry.colors.includes(input.color) ? 1 : 0
    if (input.color && colorPts) reasons.push(`Color matches (${input.color})`)

    const shapePts = input.shape == null ? 0 : entry.shapes.includes(input.shape) ? 1 : 0
    if (input.shape && shapePts) reasons.push(`Shape matches (${input.shape})`)

    const confidence = Math.round(
      imp.score * WEIGHTS.imprint + colorPts * WEIGHTS.color + shapePts * WEIGHTS.shape,
    )
    return { entry, confidence, reasons }
  })

  return scored
    .filter((s) => s.confidence >= 15)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, top)
}
