import { describe, expect, it } from 'vitest';
import { formatClockTimeFromHours, formatTimeDisplay, UI_TIME_FORMAT } from '../src/utils/dateFormat';

describe('12-hour clock display', () => {
  it('renders midnight, noon, and evening in the display timezone', () => {
    expect(UI_TIME_FORMAT).toBe('12h');
    expect(formatTimeDisplay(new Date('2026-10-04T04:00:00Z'), UI_TIME_FORMAT, 'America/Toronto')).toBe('12:00 AM');
    expect(formatTimeDisplay(new Date('2026-10-04T16:00:00Z'), UI_TIME_FORMAT, 'America/Toronto')).toBe('12:00 PM');
    expect(formatTimeDisplay(new Date('2026-10-04T22:07:00Z'), UI_TIME_FORMAT, 'America/Toronto')).toBe('6:07 PM');
  });

  it('wraps report day boundaries and rounds minute carries correctly', () => {
    expect(formatClockTimeFromHours(0)).toBe('12:00 AM');
    expect(formatClockTimeFromHours(12)).toBe('12:00 PM');
    expect(formatClockTimeFromHours(24)).toBe('12:00 AM');
    expect(formatClockTimeFromHours(23 + 59.8 / 60)).toBe('12:00 AM');
    expect(formatClockTimeFromHours(13 + 5 / 60)).toBe('1:05 PM');
  });
});
