import { describe, expect, it } from 'vitest'
import { matchPills, PILL_DB } from './pills'

describe('matchPills', () => {
  it('imprint dominates confidence', () => {
    const [best] = matchPills({ imprint: 'ATV 20' })
    expect(best.entry.name).toBe('Atorvastatin')
    expect(best.entry.strength).toBe('20 mg')
    expect(best.confidence).toBeGreaterThanOrEqual(60)
    expect(best.reasons.join(' ')).toMatch(/imprint/i)
  })

  it('combines imprint + color + shape for high confidence', () => {
    const [best] = matchPills({ imprint: 'CONCOR 2.5', color: 'white', shape: 'round' })
    expect(best.entry.name).toBe('Concor')
    expect(best.confidence).toBeGreaterThanOrEqual(95)
  })

  it('never reports high confidence without imprint evidence', () => {
    const results = matchPills({ color: 'white', shape: 'round' })
    for (const r of results) {
      // color + shape alone cap at 40
      expect(r.confidence).toBeLessThanOrEqual(45)
    }
  })

  it('handles OCR noise in imprints via substring tolerance', () => {
    const [best] = matchPills({ imprint: 'ATV10' })
    expect(best.entry.name).toBe('Atorvastatin')
  })

  it('returns empty when nothing is close (no false positives)', () => {
    expect(matchPills({ imprint: 'ZZZZ QQQQ' })).toHaveLength(0)
  })

  it('respects the top-N limit', () => {
    expect(matchPills({ imprint: '' , color: 'white' }, PILL_DB, 3).length).toBeLessThanOrEqual(3)
  })
})
