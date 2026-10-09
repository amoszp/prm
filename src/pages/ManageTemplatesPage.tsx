import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Template } from '@/types';
import { useData, useLookups } from '@/stores/DataStore';
import { intervalLabel } from '@/lib/dates';
import { CategoryTile } from '@/components/CategoryIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

export function ManageTemplatesPage() {
  const { templates, loading, move, deleteTemplate } = useData();
  const lookup = useLookups();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Template | null>(null);

  if (loading) return <LoadingPage />;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('Templates')}
        sub={t('One-tap starting points for new reminders. Pick one at the top of “New reminder”, or use “Save as template” on any reminder.')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/settings/templates/new')}>
            {t('New template')}
          </Button>
        }
      />
      {templates.length === 0 ? (
        <div className="quiet-card">{t('No templates. Create one here, or restore the built-in ones from Settings → Data.')}</div>
      ) : (
        <ManageList
          items={templates}
          itemLabel={(t) => t.name}
          lead={(t) => {
            const cat = lookup.category(t.categoryId);
            return <CategoryTile color={cat?.color ?? 'graphite'} icon={cat?.icon ?? 'bell'} />;
          }}
          name={(t) => t.name}
          sub={(x) =>
            [
              intervalLabel(x.repeat),
              tn(x.alerts.length, '{n} alert', '{n} alerts'),
              x.autoPay ? t('charged automatically') : '',
              x.notice ? t('with a cancel-by date') : '',
            ]
              .filter(Boolean)
              .join(' · ')
          }
          onEdit={(t) => navigate(`/settings/templates/${t.id}`)}
          onDelete={setToDelete}
          onMove={(t, dir) => void move('templates', t.id, dir)}
        />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteTemplate(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Template deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {t('It disappears from the template picker. Reminders already made from it don’t change.')}
      </ConfirmDialog>
    </div>
  );
}
