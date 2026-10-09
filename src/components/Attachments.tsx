// Photos and PDFs kept with a reminder (policy, bill, card). Device-only.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Paperclip, Trash2 } from 'lucide-react';
import type { Attachment } from '@/types';
import { useData } from '@/stores/DataStore';
import { formatDate } from '@/lib/dates';
import { ConfirmDialog } from './ConfirmDialog';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Button, IconButton } from './ui';
import { t, tn } from '@/i18n';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const isImage = (a: Attachment) => a.type.startsWith('image/');

/** Object URLs for this reminder's files, revoked when they go away. */
function useFileUrls(files: Attachment[], load: (id: string) => Promise<Blob | undefined>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = files.map((f) => f.id).join(',');
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const f of files) {
        const blob = await load(f.id);
        if (!blob) continue;
        next[f.id] = URL.createObjectURL(blob);
        made.push(next[f.id]);
      }
      if (alive) setUrls(next);
    })();
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);
  return urls;
}

export function AttachmentsSection({ reminderId }: { reminderId: string }) {
  const { attachments, addAttachment, deleteAttachment, attachmentBlob } = useData();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);
  const files = useMemo(
    () => attachments.filter((a) => a.reminderId === reminderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [attachments, reminderId],
  );
  const urls = useFileUrls(files, attachmentBlob);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(list)) {
      const res = await addAttachment(reminderId, file);
      if (res.ok) added++;
      else toast(res.error.message, { tone: 'error' });
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (added) toast(tn(added, 'Attachment added', '{n} attachments added'), { tone: 'success' });
  };

  return (
    <section className="section" aria-label={t('Attachments')}>
      <div className="section-head">
        <h2 className="section-title">
          {t('Attachments')} <span className="count">{files.length}</span>
        </h2>
        <Button variant="ghost" size="sm" icon={<Paperclip size={14} />} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? t('Adding…') : t('Add')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          aria-label={t('Add photos or PDFs')}
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {files.length === 0 ? (
        <div className="quiet-card">{t('A photo or PDF of the policy, the bill or the card, kept with this reminder. Stays on this device only.')}</div>
      ) : (
        <>
          <div className="attach-grid">
            {files.map((f) => {
              const url = urls[f.id];
              const thumb = isImage(f) && url ? <img src={url} alt="" /> : <FileText size={26} />;
              return (
                <div key={f.id} className="attach-card">
                  {isImage(f) ? (
                    <button type="button" className="attach-thumb" aria-label={t('View {name}', { name: f.name })} onClick={() => setPreview(f)}>
                      {thumb}
                    </button>
                  ) : (
                    <a className="attach-thumb" href={url} target="_blank" rel="noreferrer noopener" aria-label={t('Open {name}', { name: f.name })}>
                      {thumb}
                    </a>
                  )}
                  <div className="attach-meta">
                    <span className="attach-name" title={f.name}>
                      {f.name}
                    </span>
                    <span className="hint num">
                      {formatBytes(f.size)} · {formatDate(f.createdAt.slice(0, 10))}
                    </span>
                  </div>
                  <IconButton label={t('Delete {name}', { name: f.name })} tone="danger" onClick={() => setToDelete(f)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              );
            })}
          </div>
          <p className="hint" style={{ marginTop: 'var(--s-2)' }}>
            {t('Kept only on this device — not in backups or the calendar export.')}
          </p>
        </>
      )}

      <Sheet open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? ''} wide>
        {preview && urls[preview.id] ? (
          <>
            <img className="attach-preview" src={urls[preview.id]} alt={preview.name} />
            <a className="btn btn-secondary btn-sm" href={urls[preview.id]} target="_blank" rel="noreferrer noopener" style={{ alignSelf: 'flex-start' }}>
              <ExternalLink size={14} /> {t('Open full size')}
            </a>
          </>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteAttachment(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Attachment deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {t('It’s removed from this device for good — there is no other copy.')}
      </ConfirmDialog>
    </section>
  );
}
