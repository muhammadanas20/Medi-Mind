export type TwelveHourTime = {
  hour: number
  minute: number
  period: 'AM' | 'PM'
}

/** Convert the app's stored 24-hour HH:mm value into fields for a 12-hour clock. */
export function toTwelveHourTime(value: string): TwelveHourTime {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  const hours = match ? Number(match[1]) : 0
  const minutes = match ? Number(match[2]) : 0
  const safeHours = Number.isInteger(hours) && hours >= 0 && hours <= 23 ? hours : 0
  const safeMinutes = Number.isInteger(minutes) && minutes >= 0 && minutes <= 59 ? minutes : 0

  return {
    hour: safeHours % 12 || 12,
    minute: safeMinutes,
    period: safeHours >= 12 ? 'PM' : 'AM',
  }
}

/** Convert 12-hour clock fields back to the HH:mm format used by scheduling. */
export function toTwentyFourHourTime(hour: number, minute: number, period: 'AM' | 'PM'): string {
  const safeHour = Number.isInteger(hour) && hour >= 1 && hour <= 12 ? hour : 12
  const safeMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0
  const hours = (safeHour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(hours).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`
}
