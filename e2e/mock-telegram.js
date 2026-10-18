// Только для e2e: подменяет Telegram Bot API, чтобы тесты не ходили в сеть.
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    const method = String(url).split('/').pop();
    return new Response(JSON.stringify({ ok: true, result: method === 'getMe' ? { username: 'tempt_test_bot' } : {} }));
  }
  return real(url, opts);
};
