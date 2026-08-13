import { describe, expect, it } from 'vitest'
import { extractJsonBlock, parseDurationDays, parseExtraction, foodFromText } from './extract'

describe('extractJsonBlock', () => {
  it('unwraps markdown fences', () => {
    expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('tolerates prose around JSON', () => {
    const raw = 'Here is the data:\n{"medicines": []}\nHope this helps!'
    expect(extractJsonBlock(raw)).toBe('{"medicines": []}')
  })
  it('throws when no JSON object exists', () => {
    expect(() => extractJsonBlock('no json here')).toThrow()
  })
})

describe('parseExtraction (defensive AI parsing)', () => {
  it('parses the canonical spec example', () => {
    const out = parseExtraction(`{
      "patientName": "Anas",
      "doctorName": "Dr. Khan",
      "medicines": [
        { "medicine": "Concor", "strength": "2.5mg", "morning": 1, "afternoon": 0, "night": 0, "food": "After Breakfast", "duration": "30 days" }
      ]
    }`)
    expect(out.patientName).toBe('Anas')
    expect(out.medicines).toHaveLength(1)
    expect(out.medicines[0]).toMatchObject({ medicine: 'Concor', strength: '2.5mg', morning: 1, night: 0 })
  })

  it('coerces string doses and clamps insane values', () => {
    const out = parseExtraction(`{ "medicines": [{ "medicine": "X", "morning": "2", "night": 999 }] }`)
    expect(out.medicines[0].morning).toBe(2)
    expect(out.medicines[0].night).toBe(0) // invalid → safe default
  })

  it('a medicine with all-zero doses falls back to 1 morning dose', () => {
    const out = parseExtraction(`{ "medicines": [{ "medicine": "Y", "morning": 0, "afternoon": 0, "evening": 0, "night": 0 }] }`)
    expect(out.medicines[0].morning).toBe(1)
  })

  it('rejects invalid JSON with a human-readable error', () => {
    expect(() => parseExtraction('{"medicines": ]}')).toThrow(/invalid JSON/i)
    expect(() => parseExtraction('definitely not json')).toThrow(/no JSON/i)
  })

  it('never invents medicines when AI returns none', () => {
    const out = parseExtraction('{"medicines": []}')
    expect(out.medicines).toHaveLength(0)
  })
})

describe('parseDurationDays', () => {
  it.each([
    ['30 days', 30],
    ['2 weeks', 14],
    ['1 month', 30],
    ['x 5 days', 5],
    ['ongoing', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, expected) => {
    expect(parseDurationDays(input)).toBe(expected)
  })
})

describe('foodFromText', () => {
  it('maps common prescription phrasing', () => {
    expect(foodFromText('After breakfast')).toBe('after')
    expect(foodFromText('before food (AC)')).toBe('before')
    expect(foodFromText('with lunch')).toBe('with')
    expect(foodFromText(undefined, 'before')).toBe('before')
    expect(foodFromText()).toBe('any')
  })
})
