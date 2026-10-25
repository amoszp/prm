// Direct calls to the Bot API — same approach as Kage. Sends alerts with
// inline buttons and long-polls for taps; no Telegram library needed.

const TELEGRAM_API = 'https://api.telegram.org';

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface CallbackQuery {
  id: string;
  data?: string;
  message?: { message_id: number; date: number; text?: string; chat: { id: number } };
}

async function call(method: string, payload: object): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!res.ok || !body?.ok) {
    console.error(`[telegram] ${method} failed (${res.status}):`, body?.description ?? '');
    return null;
  }
  return body.result;
}

export async function sendTelegramMessage(text: string, chatId: string, buttons?: InlineButton[]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping send:', text);
    return;
  }
  await call('sendMessage', {
    chat_id: chatId,
    text,
    ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
}

// Editing without a reply_markup also removes the buttons, so a tapped message can't be tapped twice.
export async function editTelegramMessage(chatId: number, messageId: number, text: string): Promise<void> {
  await call('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
}

// Long-polls for button taps. PRM is the only reader of its bot's updates, so
// getUpdates is enough and no public webhook is needed.
export function startTelegramPolling(onCallback: (q: CallbackQuery) => Promise<void>): void {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        const updates = (await call('getUpdates', { offset, timeout: 50, allowed_updates: ['callback_query'] })) as
          | { update_id: number; callback_query?: CallbackQuery }[]
          | null;
        if (!updates) {
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        for (const u of updates) {
          offset = u.update_id + 1;
          if (!u.callback_query) continue;
          try {
            await onCallback(u.callback_query);
          } catch (err) {
            console.error('[telegram] button tap failed:', err);
            await answerCallback(u.callback_query.id).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[telegram] polling failed:', err);
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
  };
  void loop();
  console.log('[telegram] listening for button taps');
}
