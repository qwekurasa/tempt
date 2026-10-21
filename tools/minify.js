// Сборка на Vercel: сжимает и запутывает JS/CSS сайта перед выкладкой. Локально ничего не делает,
// чтобы исходники в репозитории оставались читаемыми.
if (!process.env.VERCEL) return console.log('minify: пропуск (не Vercel)');
const { buildSync } = require('esbuild');
const banner = '/* © TEMPT. Все права защищены. Копирование и использование кода запрещено. */';
for (const f of ['app.js', 'admin.js', 'shipping.js']) {
  buildSync({ entryPoints: ['public/' + f], outfile: 'public/' + f, allowOverwrite: true, minify: true, target: 'es2020', banner: { js: banner }, legalComments: 'none' });
}
buildSync({ entryPoints: ['public/style.css'], outfile: 'public/style.css', allowOverwrite: true, minify: true, banner: { css: banner } });
console.log('minify: готово');
