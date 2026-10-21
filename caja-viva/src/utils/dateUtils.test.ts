import { describe, expect, it } from 'vitest';
import { addDaysLocal, formatFechaLocal, parseFechaLocal, toLocalDateISO } from './dateUtils';

describe('dateUtils', () => {
  it('toLocalDateISO usa la fecha local, no UTC', () => {
    // Medianoche local del 1 de enero: en UTC-4 aún es el 31 de diciembre.
    expect(toLocalDateISO(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('parseFechaLocal interpreta YYYY-MM-DD como hora local', () => {
    const date = parseFechaLocal('2026-10-21');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(21);
    expect(date.getHours()).toBe(12);
  });

  it('addDaysLocal cruza fin de mes sin saltos de UTC', () => {
    const base = new Date(2026, 0, 31, 23, 30);
    expect(addDaysLocal(1, base)).toBe('2026-02-01');
    expect(addDaysLocal(-31, base)).toBe('2025-12-31');
  });

  it('formatFechaLocal no muestra el día anterior', () => {
    expect(formatFechaLocal('2026-10-21')).toContain('21');
    expect(formatFechaLocal('2026-10-21')).toContain('2026');
  });
});
