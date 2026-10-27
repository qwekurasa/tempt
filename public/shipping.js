// Расчёт доставки. Один файл для сайта (window.Shipping) и сервера (require).
// Все числа — в настройках админки; здесь значения по умолчанию.
(function (root) {
  const DEFAULTS = {
    cny: 0, // ₽ за 1 ¥
    usd: 0, // ₽ за 1 $
    auto1: 6.2, // $/кг, авто от 1 кг
    auto10: 4.5, // $/кг, авто от 10 кг (по общему весу заказа)
    tk: 250, // ₽, перекидка на ТК — раз за заказ
    cat_s: 5, // ¥ за 1 вещь по Китаю
    cat_m: 10,
    cat_l: 15,
    cat_xl: 20,
  };
  const CATS = {
    s: 'Мелкое: носки, аксессуары',
    m: 'Футболки, шорты, лонгсливы',
    l: 'Худи, свитшоты, штаны',
    xl: 'Обувь, куртки, крупное',
  };
  // Категории одежды по умолчанию; список редактируется в админке (Настройки)
  const TYPES = ['Футболки','Лонгсливы','Рубашки','Поло','Майки','Худи','Зип-худи','Свитшоты','Свитеры','Кардиганы','Жилеты','Куртки','Ветровки','Бомберы','Пуховики','Парки','Пальто','Тренчи','Джинсовые куртки','Кожаные куртки','Пиджаки','Джинсы','Брюки','Карго','Спортивные штаны','Шорты','Юбки','Платья','Костюмы','Комбинезоны','Кроссовки','Кеды','Ботинки','Туфли','Сандалии','Шлёпанцы','Кепки','Шапки','Панамы','Сумки','Рюкзаки','Ремни','Шарфы','Перчатки','Носки','Нижнее бельё','Очки','Украшения','Аксессуары'];
  const cat = c => (CATS[c] ? c : 'm');
  const settings = s => ({ ...DEFAULTS, types: TYPES, sizeTemplates: SIZE_TEMPLATES, ...s });

  // items: [{ price, qty, weight, cat }]. null — посчитать нельзя (нет курса или веса).
  function quote(items, s) {
    s = settings(s);
    const ok = s.cny > 0 && s.usd > 0;
    const lines = items.map(i => {
      const chinaCny = s['cat_' + cat(i.cat)] * i.qty;
      return { goods: i.price * i.qty, chinaCny, china: ok ? Math.round(chinaCny * s.cny) : null };
    });
    const goods = lines.reduce((a, l) => a + l.goods, 0);
    const chinaCny = lines.reduce((a, l) => a + l.chinaCny, 0);
    const china = ok ? lines.reduce((a, l) => a + l.china, 0) : null;
    const weight = Math.round(items.reduce((a, i) => a + (i.weight || 0) * i.qty, 0) * 100) / 100;
    const kg = Math.max(weight, 1);
    const rate = kg >= 10 ? s.auto10 : s.auto1;
    const intl = ok && items.length && items.every(i => i.weight > 0) ? Math.round(kg * rate * s.usd) : null;
    const tk = items.length ? s.tk : 0;
    const complete = china !== null && intl !== null;
    return { lines, goods, chinaCny, china, intl, tk, weight, kg, rate, total: goods + (china || 0) + (intl || 0) + tk, complete };
  }

  // Размерная сетка: строки, ячейки через | или табуляцию; первая строка — заголовок
  const sizeRows = t => String(t || '').split('\n').map(l => l.trim()).filter(l => l && !/^[-|:\s]+$/.test(l))
    .map(l => l.replace(/^\||\|$/g, '').split(/\s*\|\s*|\t/).map(c => c.trim()));

  // Шаблоны заголовков сетки (редактируются в админке); у товара хранится выбранный заголовок sizeHead
  const SIZE_TEMPLATES = ['Размер | Длина рукава | Длина', 'Размер | Длина | Ширина груди | Длина рукава', 'Размер | Талия | Бёдра | Длина | Шаговый шов', 'Размер | Талия | Длина', 'EU | US | Длина стопы, см'];
  // готовая таблица товара: [заголовок, ...строки]
  const sizeGrid = p => {
    const rows = sizeRows(p && p.sizeTable);
    return p && p.sizeHead ? [sizeRows(p.sizeHead)[0] || [], ...rows] : rows;
  };

  // цвета товара: из списка через запятую
  const colorsOf = p => (p && p.color ? String(p.color).split(',').map(c => c.trim()).filter(Boolean) : []);

  const api = { DEFAULTS, TYPES, CATS, colorsOf, SIZE_TEMPLATES, sizeGrid, sizeRows, cat, settings, quote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shipping = api;
})(this);
