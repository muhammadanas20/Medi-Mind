import { describe, expect, it } from 'vitest'
import { toTwentyFourHourTime, toTwelveHourTime } from './time'

describe('12-hour time conversion', () => {
  it('shows midnight and noon correctly', () => {
    expect(toTwelveHourTime('00:00')).toEqual({ hour: 12, minute: 0, period: 'AM' })
    expect(toTwelveHourTime('12:00')).toEqual({ hour: 12, minute: 0, period: 'PM' })
  })

  it('converts AM and PM selections back to the scheduler format', () => {
    expect(toTwentyFourHourTime(6, 5, 'AM')).toBe('06:05')
    expect(toTwentyFourHourTime(6, 5, 'PM')).toBe('18:05')
    expect(toTwentyFourHourTime(12, 30, 'AM')).toBe('00:30')
    expect(toTwentyFourHourTime(12, 30, 'PM')).toBe('12:30')
  })
})
