// Icon set users can pick from for their categories, plus the category badge.

import type { CSSProperties } from 'react';
import {
  Baby,
  Bell,
  BookOpen,
  Briefcase,
  Car,
  Cat,
  Cloud,
  CreditCard,
  Dumbbell,
  FileText,
  Flame,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  IdCard,
  Landmark,
  Laptop,
  Music,
  Plane,
  Receipt,
  Shield,
  ShoppingCart,
  Smartphone,
  Stethoscope,
  Tv,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '@/types';
import { colorSoftVar, colorVar } from '@/lib/palette';
import { t } from '@/i18n';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  shield: Shield,
  'credit-card': CreditCard,
  'id-card': IdCard,
  tv: Tv,
  receipt: Receipt,
  landmark: Landmark,
  car: Car,
  wrench: Wrench,
  'heart-pulse': HeartPulse,
  home: Home,
  zap: Zap,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  cloud: Cloud,
  laptop: Laptop,
  music: Music,
  wallet: Wallet,
  'file-text': FileText,
  plane: Plane,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  briefcase: Briefcase,
  'shopping-cart': ShoppingCart,
  gift: Gift,
  baby: Baby,
  cat: Cat,
  'book-open': BookOpen,
};

export const ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function CategoryGlyph({ icon, size = 16 }: { icon: string; size?: number }) {
  const Icon = CATEGORY_ICONS[icon] ?? Bell;
  return <Icon size={size} aria-hidden="true" />;
}

export function catStyle(color: string): CSSProperties {
  return { '--c': colorVar(color), '--c-soft': colorSoftVar(color) } as CSSProperties;
}

/** Category name with its icon, coloured. `pill` adds the soft wash. */
export function CategoryBadge({ category, pill }: { category?: Category; pill?: boolean }) {
  if (!category) return <span className="cat">{t('Uncategorised')}</span>;
  return (
    <span className={`cat ${pill ? 'cat-pill' : ''}`} style={catStyle(category.color)}>
      <CategoryGlyph icon={category.icon} size={pill ? 13 : 14} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{category.name}</span>
    </span>
  );
}

/** Square tinted tile with the category icon (lists, settings). */
export function CategoryTile({ color, icon }: { color: string; icon: string }) {
  return (
    <span className="cat-icon" style={catStyle(color)} aria-hidden="true">
      <CategoryGlyph icon={icon} size={18} />
    </span>
  );
}
