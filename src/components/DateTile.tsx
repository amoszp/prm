import type { CSSProperties } from 'react';
import { monthShort, parseISODate } from '@/lib/dates';
import { colorSoftVar, colorVar } from '@/lib/palette';

interface DateTileProps {
  date: string;
  color?: string;
  large?: boolean;
  showYear?: boolean;
}

/** Tear-off calendar page: category-tinted month band over a serif day number. */
export function DateTile({ date, color = 'graphite', large, showYear }: DateTileProps) {
  const d = parseISODate(date);
  const style = { '--c': colorVar(color), '--c-soft': colorSoftVar(color) } as CSSProperties;
  return (
    <div className={`datetile ${large ? 'datetile-lg' : ''}`} style={style} aria-hidden="true">
      <span className="datetile-month">{monthShort(date)}</span>
      <span className="datetile-day">{d.getDate()}</span>
      {showYear ? <span className="datetile-year">{d.getFullYear()}</span> : null}
    </div>
  );
}
