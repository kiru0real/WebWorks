require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { db, ensureAdmin } = require('./src/db/database');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) app.set('trust proxy', 1);
ensureAdmin();

const publicDir = path.join(__dirname, 'src', 'public');
const csp = {
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://api-maps.yandex.ru', 'https://yandex.ru', 'https://*.yandex.ru', 'https://*.yandex.net'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://*.yandex.ru', 'https://*.yandex.net'],
    connectSrc: ["'self'", 'https://api-maps.yandex.ru', 'https://*.yandex.ru', 'https://*.yandex.net'],
    frameSrc: ["'self'", 'https://yandex.ru', 'https://*.yandex.ru']
  }
};
app.use(helmet({ contentSecurityPolicy: csp }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

class SQLiteStore extends session.Store {
  constructor(database) {
    super();
    this.getStatement = database.prepare('SELECT sess, expires FROM sessions WHERE sid = ?');
    this.setStatement = database.prepare('INSERT INTO sessions (sid,expires,sess) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires,sess=excluded.sess');
    this.destroyStatement = database.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = database.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.cleanupStatement = database.prepare('DELETE FROM sessions WHERE expires <= ?');
    this.lastCleanup = 0;
  }
  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.destroyStatement.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) { callback(error); }
  }
  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.setStatement.run(sid, expires, JSON.stringify(sess));
      if (Date.now() - this.lastCleanup > 3600000) {
        this.cleanupStatement.run(Date.now());
        this.lastCleanup = Date.now();
      }
      callback(null);
    } catch (error) { callback(error); }
  }
  destroy(sid, callback = () => {}) {
    try { this.destroyStatement.run(sid); callback(null); } catch (error) { callback(error); }
  }
  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.touchStatement.run(expires, sid);
      callback(null);
    } catch (error) { callback(error); }
  }
}

app.use(session({
  name: 'gorshochek.sid',
  secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deploying',
  store: new SQLiteStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 24 * 60 * 60 * 1000 }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже.' }
});

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function cleanUrl(value, max = 2000) {
  const text = cleanText(value, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}
function asInt(value, fallback = 0, min = 0, max = 10000000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}
function asBool(value) { return value === true || value === 1 || value === '1' || value === 'true' || value === 'on'; }
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Необходим вход в админ-панель.' });
  next();
}
function ownOriginOnly(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const expected = `${req.protocol}://${req.get('host')}`;
    if (new URL(origin).origin !== new URL(expected).origin) return res.status(403).json({ error: 'Запрос отклонён.' });
    next();
  } catch { res.status(403).json({ error: 'Некорректный источник запроса.' }); }
}

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'gorshochek' }));
app.get('/api/menu', (req, res) => {
  const rows = db.prepare('SELECT id,name,description,price,weight,category,image_url AS imageUrl,badge,is_available AS isAvailable,is_featured AS isFeatured FROM dishes WHERE is_available=1 ORDER BY is_featured DESC,sort_order ASC,id ASC').all();
  res.json(rows);
});
app.get('/api/news', (req, res) => {
  const rows = db.prepare('SELECT id,title,excerpt,content,image_url AS imageUrl,published_at AS publishedAt FROM news WHERE published=1 ORDER BY COALESCE(published_at,created_at) DESC LIMIT 12').all();
  res.json(rows);
});
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  settings.yandexMapsApiKey = process.env.YANDEX_MAPS_API_KEY || '';
  res.json(settings);
});

app.post('/api/admin/login', loginLimiter, ownOriginOnly, (req, res, next) => {
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password ?? '');
  if (!username || !password || password.length > 200) return res.status(400).json({ error: 'Введите логин и пароль.' });
  const admin = db.prepare('SELECT id,username,password_hash AS passwordHash FROM admins WHERE username=?').get(username);
  const valid = admin && bcrypt.compareSync(password, admin.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль.' });
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.adminId = admin.id;
    req.session.adminName = admin.username;
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      res.json({ ok: true, username: admin.username });
    });
  });
});
app.get('/api/admin/me', (req, res) => {
  if (!req.session.adminId) return res.json({ authenticated: false });
  res.json({ authenticated: true, username: req.session.adminName || 'admin' });
});
app.post('/api/admin/logout', ownOriginOnly, requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('gorshochek.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.json({ ok: true });
  });
});

app.get('/api/admin/menu', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id,name,description,price,weight,category,image_url AS imageUrl,badge,is_available AS isAvailable,is_featured AS isFeatured,sort_order AS sortOrder FROM dishes ORDER BY sort_order ASC,id DESC').all();
  res.json(rows);
});
function readDish(body) {
  return {
    name: cleanText(body.name, 100),
    description: cleanText(body.description, 500),
    price: asInt(body.price, 0, 0, 1000000),
    weight: cleanText(body.weight, 40),
    category: cleanText(body.category, 50) || 'Основное',
    image_url: cleanUrl(body.imageUrl, 2000),
    badge: cleanText(body.badge, 40),
    is_available: asBool(body.isAvailable) ? 1 : 0,
    is_featured: asBool(body.isFeatured) ? 1 : 0,
    sort_order: asInt(body.sortOrder, 0, 0, 100000)
  };
}
app.post('/api/admin/menu', ownOriginOnly, requireAdmin, (req, res) => {
  const dish = readDish(req.body);
  if (!dish.name || dish.price < 0) return res.status(400).json({ error: 'Укажите название и корректную цену.' });
  const result = db.prepare(`INSERT INTO dishes (name,description,price,weight,category,image_url,badge,is_available,is_featured,sort_order)
    VALUES (@name,@description,@price,@weight,@category,@image_url,@badge,@is_available,@is_featured,@sort_order)`).run(dish);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.put('/api/admin/menu/:id', ownOriginOnly, requireAdmin, (req, res) => {
  const id = asInt(req.params.id, 0, 1);
  const dish = readDish(req.body);
  if (!dish.name) return res.status(400).json({ error: 'Укажите название блюда.' });
  const result = db.prepare(`UPDATE dishes SET name=@name,description=@description,price=@price,weight=@weight,category=@category,
    image_url=@image_url,badge=@badge,is_available=@is_available,is_featured=@is_featured,sort_order=@sort_order,updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...dish, id });
  if (!result.changes) return res.status(404).json({ error: 'Блюдо не найдено.' });
  res.json({ ok: true });
});
app.delete('/api/admin/menu/:id', ownOriginOnly, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM dishes WHERE id=?').run(asInt(req.params.id, 0, 1));
  if (!result.changes) return res.status(404).json({ error: 'Блюдо не найдено.' });
  res.json({ ok: true });
});

app.get('/api/admin/news', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id,title,excerpt,content,image_url AS imageUrl,published,published_at AS publishedAt,created_at AS createdAt FROM news ORDER BY created_at DESC').all();
  res.json(rows);
});
function readNews(body) {
  return {
    title: cleanText(body.title, 140),
    excerpt: cleanText(body.excerpt, 260),
    content: cleanText(body.content, 5000),
    image_url: cleanUrl(body.imageUrl, 2000),
    published: asBool(body.published) ? 1 : 0
  };
}
app.post('/api/admin/news', ownOriginOnly, requireAdmin, (req, res) => {
  const item = readNews(req.body);
  if (!item.title || !item.excerpt) return res.status(400).json({ error: 'Укажите заголовок и короткое описание.' });
  const publishedAt = item.published ? new Date().toISOString() : null;
  const result = db.prepare(`INSERT INTO news (title,excerpt,content,image_url,published,published_at)
    VALUES (@title,@excerpt,@content,@image_url,@published,@publishedAt)`).run({ ...item, publishedAt });
  res.status(201).json({ id: result.lastInsertRowid });
});
app.put('/api/admin/news/:id', ownOriginOnly, requireAdmin, (req, res) => {
  const id = asInt(req.params.id, 0, 1);
  const item = readNews(req.body);
  if (!item.title || !item.excerpt) return res.status(400).json({ error: 'Укажите заголовок и короткое описание.' });
  const existing = db.prepare('SELECT published,published_at FROM news WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Новость не найдена.' });
  const publishedAt = item.published ? (existing.published ? existing.published_at : new Date().toISOString()) : null;
  db.prepare(`UPDATE news SET title=@title,excerpt=@excerpt,content=@content,image_url=@image_url,published=@published,
    published_at=@publishedAt,updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...item, publishedAt, id });
  res.json({ ok: true });
});
app.delete('/api/admin/news/:id', ownOriginOnly, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM news WHERE id=?').run(asInt(req.params.id, 0, 1));
  if (!result.changes) return res.status(404).json({ error: 'Новость не найдена.' });
  res.json({ ok: true });
});

app.put('/api/admin/settings', ownOriginOnly, requireAdmin, (req, res) => {
  const address = cleanText(req.body.address, 200);
  const phone = cleanText(req.body.phone, 80);
  const hours = cleanText(req.body.hours, 100);
  const tagline = cleanText(req.body.tagline, 160);
  const yandexOrgUrl = cleanUrl(req.body.yandexOrgUrl, 1000);
  const reviewsWidgetUrl = cleanUrl(req.body.reviewsWidgetUrl, 1000);
  const mapLat = req.body.mapLat === '' || req.body.mapLat == null ? '' : String(Number(req.body.mapLat));
  const mapLng = req.body.mapLng === '' || req.body.mapLng == null ? '' : String(Number(req.body.mapLng));
  if ((mapLat && !Number.isFinite(Number(mapLat))) || (mapLng && !Number.isFinite(Number(mapLng)))) return res.status(400).json({ error: 'Координаты должны быть числами.' });
  if (reviewsWidgetUrl) {
    const url = new URL(reviewsWidgetUrl);
    if (!['yandex.ru', 'www.yandex.ru'].includes(url.hostname) || !url.pathname.startsWith('/maps-reviews-widget/')) {
      return res.status(400).json({ error: 'Вставьте URL src именно из виджета отзывов Яндекса.' });
    }
  }
  const values = {
    address, phone, hours, tagline, yandexOrgUrl, reviewsWidgetUrl,
    mapLat, mapLng
  };
  const put = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction((entries) => entries.forEach(([key, value]) => put.run(key, value)));
  tx(Object.entries(values));
  res.json({ ok: true });
});

app.use(express.static(publicDir, { extensions: ['html'], maxAge: isProduction ? '1h' : 0 }));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((error, req, res, next) => {
  console.error('[ГОРШОЧЕК]', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
});

const server = app.listen(PORT, () => {
  console.log(`\n🍲 ГОРШОЧЕК запущен: http://localhost:${PORT}`);
  console.log(`🔐 Админ-панель: http://localhost:${PORT}/admin\n`);
  if (!process.env.SESSION_SECRET || /change|replace/i.test(process.env.SESSION_SECRET)) {
    console.warn('[ГОРШОЧЕК] Установите уникальный SESSION_SECRET в .env перед публикацией.');
  }
});

function shutdown() {
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
