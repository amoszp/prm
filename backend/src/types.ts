// The eight server-relevant entity stores (see src/data/collection.ts's
// STORE_NAMES in the frontend). Attachments/attachmentFiles are device-only
// and 'meta' is local seeding bookkeeping — neither is ever synced here.
export const STORE_NAMES = [
  'reminders',
  'categories',
  'repeatPresets',
  'alertPresets',
  'providerTypes',
  'providers',
  'templates',
  'people',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export function isStoreName(value: string): value is StoreName {
  return (STORE_NAMES as readonly string[]).includes(value);
}
