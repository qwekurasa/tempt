const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } }, testIgnore: /api\.spec/ },
  ],
  webServer: {
    command: 'node -r ./e2e/mock-telegram.js server.js',
    url: 'http://localhost:3100/api/products',
    reuseExistingServer: false,
    env: { NO_RATE_LIMIT: '1', PORT: '3100', ADMIN_PASSWORD: 'e2e-pass', BOT_TOKEN: 'test', CHAT_ID: '1' },
  },
});
