// Who a reminder is for: a tinted initial, optionally with the name.

import type { Person } from '@/types';
import { catStyle } from './CategoryIcon';

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}

export function PersonDot({ person, large }: { person: Pick<Person, 'name' | 'color'>; large?: boolean }) {
  return (
    <span className={`person-dot ${large ? 'person-dot-lg' : ''}`} style={catStyle(person.color)} aria-hidden="true">
      {initialOf(person.name)}
    </span>
  );
}

export function PersonBadge({ person }: { person: Pick<Person, 'name' | 'color'> }) {
  return (
    <span className="meta-item person-badge" style={catStyle(person.color)}>
      <PersonDot person={person} />
      {person.name}
    </span>
  );
}
