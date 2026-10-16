// Direct call to the Bot API's sendMessage endpoint — same approach as Kage.
// One-way delivery doesn't need a Telegram library.

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendTelegramMessage(text: string, chatId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or the chat id not set — skipping send:', text);
    return;
  }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram] send failed (${res.status}):`, body);
  }
}
