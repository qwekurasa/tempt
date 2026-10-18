const base = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Каждый тест падает на ошибке в консоли или ответе 5xx.
exports.test = base.test.extend({
  page: async ({ page }, use) => {
    const problems = [];
    // 401 — ожидаемый ответ проверки входа, остальное считаем ошибкой
    page.on('console', m => m.type() === 'error' && !m.text().includes('status of 401') && problems.push('console: ' + m.text()));
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('response', r => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`));
    await use(page);
    base.expect(problems).toEqual([]);
  },
});
exports.expect = base.expect;

// axe: без серьёзных и критичных нарушений доступности
exports.a11y = async page => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.length}`);
  base.expect(bad).toEqual([]);
};
