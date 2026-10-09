// Shared list for every user-editable catalogue (categories, repeat options,
// alert options, provider types): reorder, edit, delete.

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { IconButton } from './ui';
import { t } from '@/i18n';

interface ManageListProps<T extends { id: string }> {
  items: T[];
  lead: (item: T) => ReactNode;
  name: (item: T) => ReactNode;
  sub?: (item: T) => ReactNode;
  itemLabel: (item: T) => string;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  onMove: (item: T, direction: -1 | 1) => void;
  canDelete?: (item: T) => boolean;
}

export function ManageList<T extends { id: string }>({
  items,
  lead,
  name,
  sub,
  itemLabel,
  onEdit,
  onDelete,
  onMove,
  canDelete = () => true,
}: ManageListProps<T>) {
  return (
    <div className="list">
      {items.map((item, i) => (
        <div className="manage-row" key={item.id}>
          {lead(item)}
          <button
            type="button"
            className="manage-main"
            style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }}
            onClick={() => onEdit(item)}
          >
            <div className="manage-name">{name(item)}</div>
            {sub ? <div className="manage-sub">{sub(item)}</div> : null}
          </button>
          <div className="manage-actions">
            <IconButton label={t('Move {name} up', { name: itemLabel(item) })} disabled={i === 0} onClick={() => onMove(item, -1)}>
              <ChevronUp size={16} />
            </IconButton>
            <IconButton label={t('Move {name} down', { name: itemLabel(item) })} disabled={i === items.length - 1} onClick={() => onMove(item, 1)}>
              <ChevronDown size={16} />
            </IconButton>
            <IconButton label={t('Edit {name}', { name: itemLabel(item) })} onClick={() => onEdit(item)}>
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label={t('Delete {name}', { name: itemLabel(item) })}
              tone="danger"
              disabled={!canDelete(item)}
              onClick={() => onDelete(item)}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}
