const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'gorshochek.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    weight TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Основное',
    image_url TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    is_available INTEGER NOT NULL DEFAULT 1,
    is_featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires INTEGER NOT NULL,
    sess TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dishes_sort ON dishes(sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_news_published ON news(published, published_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

const dishCount = db.prepare('SELECT COUNT(*) AS count FROM dishes').get().count;
if (dishCount === 0) {
  const seedDishes = [
    ['Борщ с томлёной говядиной', 'Насыщенный свекольный бульон, мягкая говядина, сметана и пампушка с чесночным маслом.', 590, '380 г', 'Супы', 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1000&q=85', 'Хит', 1, 1, 1],
    ['Пельмени ручной лепки', 'Тонкое тесто, сочная начинка из фермерского мяса и сливочное масло с укропом.', 690, '250 г', 'Основное', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=1000&q=85', 'Лепим сами', 1, 1, 2],
    ['Горшочек с грибами и картофелем', 'Белые грибы, молодой картофель, лесной тимьян и сливочный соус под румяной корочкой.', 640, '320 г', 'Из печи', 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=1000&q=85', 'Из печи', 1, 1, 3],
    ['Котлета по-домашнему', 'Сочная котлета из говядины и свинины с нежным картофельным пюре и огурчиком.', 720, '340 г', 'Основное', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=85', '', 1, 0, 4],
    ['Сырники со сметаной', 'Творожные сырники с ванилью, ягодным вареньем и густой сметаной.', 420, '220 г', 'Десерты', 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1000&q=85', 'На завтрак', 1, 1, 5],
    ['Блины с мёдом и ягодами', 'Тонкие блины, цветочный мёд, сезонные ягоды и немного сливочного масла.', 390, '200 г', 'Десерты', 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=1000&q=85', '', 1, 0, 6],
    ['Морс из клюквы', 'Домашний морс на северной клюкве, без лишней сладости.', 220, '300 мл', 'Напитки', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1000&q=85', '', 1, 0, 7],
    ['Медовик', 'Тонкие медовые коржи, сметанный крем и крошка из карамелизированного теста.', 380, '150 г', 'Десерты', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=85', 'К чаю', 1, 0, 8]
  ];
  const insert = db.prepare(`INSERT INTO dishes
    (name,description,price,weight,category,image_url,badge,is_available,is_featured,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const transaction = db.transaction((items) => items.forEach((item) => insert.run(...item)));
  transaction(seedDishes);
}

const newsCount = db.prepare('SELECT COUNT(*) AS count FROM news').get().count;
if (newsCount === 0) {
  const now = new Date().toISOString();
  const insertNews = db.prepare(`INSERT INTO news
    (title,excerpt,content,image_url,published,published_at)
    VALUES (?,?,?,?,1,?)`);
  insertNews.run('Тёплый сезон начинается с окрошки', 'Добавили в меню две версии любимого летнего супа — на квасе и на кефире.', 'Мы верим, что сезонные блюда должны быть простыми и честными. Поэтому приготовили две версии окрошки: с домашним квасом и на прохладном кефире. Заходите пробовать, пока лето в самом разгаре.', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85', now);
  insertNews.run('Семейные воскресенья в «ГОРШОЧКЕ»', 'Каждое воскресенье готовим большой обед для тех, кто любит собираться за одним столом.', 'По воскресеньям накрываем большой семейный стол: сезонный суп, горячее из печи, домашняя выпечка и морс. Подробности и меню дня уточняйте у команды ресторана.', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85', now);
  insertNews.run('Готовим медленно. Подаём с любовью.', 'Рассказываем, почему наши блюда проводят время в печи, а не в микроволновке.', 'У хорошего вкуса есть свой ритм. Мы берём сезонные продукты, готовим небольшими партиями и даём блюдам время раскрыться. Никакой спешки — только знакомые вкусы и внимание к деталям.', 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=85', now);
}

const defaultSettings = {
  restaurantName: 'ГОРШОЧЕК',
  tagline: 'Русская кухня, которая собирает за столом',
  address: 'Укажите адрес ресторана в админ-панели',
  phone: '+7 (000) 000-00-00',
  hours: 'Ежедневно · 12:00–23:00',
  mapLat: '',
  mapLng: '',
  yandexOrgUrl: '',
  reviewsWidgetUrl: ''
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
for (const [key, value] of Object.entries(defaultSettings)) insertSetting.run(key, String(value));

function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  if (!password || password.toLowerCase().includes('replace-with')) {
    password = crypto.randomBytes(12).toString('base64url');
    console.warn('\n[ГОРШОЧЕК] Создан первый администратор. Сохраните пароль:');
    console.warn(`Логин: ${username}\nПароль: ${password}\n`);
  }
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO admins (username,password_hash) VALUES (?,?)').run(username, hash);
  if (process.env.ADMIN_PASSWORD) {
    console.log(`[ГОРШОЧЕК] Администратор ${username} создан из .env.`);
  }
}

module.exports = { db, ensureAdmin };
