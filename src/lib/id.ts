import { nanoid } from 'nanoid';

export function createId(prefix = ''): string {
  return prefix ? `${prefix}_${nanoid(12)}` : nanoid(12);
}

export function nowISO(): string {
  return new Date().toISOString();
}
