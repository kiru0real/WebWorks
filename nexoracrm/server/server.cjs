const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, '');
  }
}
const PORT = Number(process.env.PORT || 3001);
const DB_FILE = path.resolve(ROOT, process.env.DB_FILE || './data/nexora.sqlite');
const app = express();
let db;

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

function nowIso() { return new Date().toISOString(); }
function isoDaysFromNow(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); }
function saveDb() {
  const folder = path.dirname(DB_FILE);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}
function one(sql, params = []) { return all(sql, params)[0] || null; }
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return one('SELECT last_insert_rowid() AS id')?.id ?? null;
}
function runMany(sql, rows) {
  db.run('BEGIN');
  try {
    for (const params of rows) db.run(sql, params);
    db.run('COMMIT');
    saveDb();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
function cleanUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}
function createActivity({ type, title, description = '', userId, contactId = null, dealId = null }) {
  db.run(
    'INSERT INTO activities (type, title, description, user_id, contact_id, deal_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [type, title, description, userId, contactId, dealId, nowIso()],
  );
  saveDb();
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function requireAuth(req, res, next) {
  const token = getCookie(req, 'nexora_session');
  if (!token) return res.status(401).json({ error: 'Необходима авторизация' });
  const session = one(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(token), nowIso()],
  );
  if (!session || !session.is_active) return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' });
  req.user = session;
  next();
}
function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Недостаточно прав для этого действия' });
}
function text(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')); }
function sendError(res, error, code = 400) { console.error(error); return res.status(code).json({ error: error.message || 'Не удалось выполнить запрос' }); }

async function initializeDatabase() {
  const wasmDir = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({ locateFile: file => path.join(wasmDir, file) });
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (fs.existsSync(DB_FILE)) db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE)));
  else db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sales' CHECK(role IN ('admin','manager','sales')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Другое',
      status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','active','customer')),
      value REAL NOT NULL DEFAULT 0,
      last_contact TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      value REAL NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','qualified','proposal','negotiation','won','lost')),
      probability INTEGER NOT NULL DEFAULT 10,
      close_date TEXT,
      won_at TEXT,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      related_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
  `);

  const dealColumns = all('PRAGMA table_info(deals)').map(column => column.name);
  if (!dealColumns.includes('won_at')) db.run('ALTER TABLE deals ADD COLUMN won_at TEXT');

  const adminEmail = text(process.env.ADMIN_EMAIL || 'admin@nexora.local', 120).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Nexora2026!';
  const adminName = text(process.env.ADMIN_NAME || 'Alex Morgan', 80);
  if (!one('SELECT id FROM users WHERE email = ?', [adminEmail])) {
    runMany('INSERT INTO users (name,email,password_hash,role,is_active,created_at) VALUES (?,?,?,?,1,?)', [
      [adminName, adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', nowIso()],
    ]);
    console.log('\n[NEXORA] Создан первый администратор. Сохраните данные для входа:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Пароль: ${adminPassword}\n`);
  }
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [nowIso()]);

  if (Number(one('SELECT COUNT(*) AS count FROM contacts')?.count || 0) === 0) seedDemoData();
  saveDb();
}

function seedDemoData() {
  const stamp = nowIso();
  const contacts = [
    ['Olivia Rhye','Form & Function','olivia@formfunction.co','+7 900 111-20-30','Рекомендация','customer',420000,-2,'["Enterprise","Приоритет"]'],
    ['Phoenix Baker','Bento Works','phoenix@bento.works','+7 900 111-20-31','Сайт','active',185000,-5,'["SaaS"]'],
    ['Lana Steiner','Luminous Labs','lana@luminous.io','+7 900 111-20-32','LinkedIn','lead',96000,-1,'["Новый лид"]'],
    ['Demi Wilkinson','Outline Studio','demi@outline.studio','+7 900 111-20-33','Мероприятие','customer',310000,-8,'["Дизайн"]'],
    ['Candice Wu','Catalog','candice@catalog.team','+7 900 111-20-34','Реклама','active',74000,-3,'["Ретейл"]'],
    ['Natali Craig','Sisyphus','natali@sisyphus.io','+7 900 111-20-35','Партнёр','lead',225000,-12,'["Enterprise"]'],
    ['Drew Cano','Layers','drew@layers.app','+7 900 111-20-36','Сайт','active',132000,-4,'["Продукт"]'],
    ['Orlando Diggs','Circooles','orlando@circooles.com','+7 900 111-20-37','Рекомендация','customer',510000,-6,'["VIP"]'],
    ['Andi Lane','Quotient','andi@quotient.co','+7 900 111-20-38','LinkedIn','lead',58000,-10,'["Новый лид"]'],
    ['Kate Morrison','Command + R','kate@commandr.co','+7 900 111-20-39','Мероприятие','active',205000,-1,'["B2B"]'],
    ['Maximilian S.','Wildcrafted','max@wildcrafted.co','+7 900 111-20-40','Партнёр','customer',365000,-15,'["Enterprise"]'],
    ['Lisa Kim','Hourglass','lisa@hourglass.team','+7 900 111-20-41','Реклама','lead',89000,-7,'["B2B"]'],
  ];
  db.run('BEGIN');
  try {
    for (const [name, company, email, phone, source, status, value, ago, tags] of contacts) {
      const last = new Date(); last.setDate(last.getDate() + ago);
      db.run('INSERT INTO contacts (name,company,email,phone,source,status,value,last_contact,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [name,company,email,phone,source,status,value,last.toISOString(),tags,stamp]);
    }
    const userId = one('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', ['admin'])?.id || 1;
    const deals = [
      ['Website redesign','Form & Function',1,185000,'proposal',70,12],
      ['Enterprise onboarding','Luminous Labs',3,320000,'negotiation',85,24],
      ['Brand platform','Outline Studio',4,240000,'qualified',45,32],
      ['Mobile app MVP','Layers',7,460000,'lead',15,45],
      ['CRM integration','Bento Works',2,125000,'proposal',65,18],
      ['Analytics suite','Circooles',8,510000,'won',100,-8],
      ['Design system','Command + R',10,210000,'won',100,-22],
      ['Support package','Catalog',5,78000,'qualified',40,28],
      ['Growth consulting','Wildcrafted',11,155000,'negotiation',80,15],
      ['Product research','Sisyphus',6,96000,'lost',0,-14],
      ['Campaign launch','Northstar Studio',1,280000,'won',100,-12],
      ['Data migration','Bento Works',2,175000,'won',100,-25],
      ['Annual support','Sisyphus',6,120000,'won',100,-45],
    ];
    for (const [index, [title, company, contactId, value, stage, probability, closeIn]] of deals.entries()) {
      const created = new Date();
      created.setMonth(created.getMonth() - [4, 2, 1, 3, 0, 5, 2, 4, 1, 3, 0, 3, 1][index]);
      created.setDate(8 + index);
      const createdAt = created.toISOString();
      db.run('INSERT INTO deals (title,company,contact_id,value,stage,probability,close_date,won_at,owner_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [title,company,contactId,value,stage,probability,isoDaysFromNow(closeIn).slice(0,10),stage==='won'?createdAt:null,userId,createdAt]);
    }
    const tasks = [
      ['Подготовить коммерческое предложение','Собрать финальную смету и презентацию.',1,'high','todo',1],
      ['Позвонить Olivia Rhye','Обсудить следующий этап проекта.',2,'medium','in_progress',1],
      ['Отправить договор','Проверить реквизиты и отправить на согласование.',3,'high','todo',4],
      ['Обновить карточку клиента','Добавить итоги последней встречи.',1,'low','done',2],
      ['Подготовить демо','Собрать сценарий демонстрации продукта.',4,'medium','todo',3],
      ['Согласовать сроки запуска','Подтвердить календарный план.',5,'high','todo',5],
      ['Проверить обратную связь','Собрать комментарии после презентации.',7,'low','in_progress',7],
    ];
    for (const [title, description, days, priority, status, contactId] of tasks) {
      db.run('INSERT INTO tasks (title,description,due_date,priority,status,assigned_to,related_contact_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [title,description,isoDaysFromNow(days),priority,status,userId,contactId,stamp]);
    }
    db.run('INSERT INTO activities (type,title,description,user_id,contact_id,deal_id,created_at) VALUES (?,?,?,?,?,?,?)',
      ['deal','Новая сделка создана','Сделка «Website redesign» добавлена в воронку.',userId,1,1,isoDaysFromNow(-1)]);
    db.run('INSERT INTO activities (type,title,description,user_id,contact_id,deal_id,created_at) VALUES (?,?,?,?,?,?,?)',
      ['contact','Контакт обновлён','Обновлены контактные данные Olivia Rhye.',userId,1,null,isoDaysFromNow(-2)]);
    db.run('INSERT INTO activities (type,title,description,user_id,contact_id,deal_id,created_at) VALUES (?,?,?,?,?,?,?)',
      ['task','Задача завершена','Завершена задача «Обновить карточку клиента».',userId,1,null,isoDaysFromNow(-3)]);
    db.run('COMMIT');
    saveDb();
  } catch (error) { db.run('ROLLBACK'); throw error; }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'NexoraCRM', time: nowIso() }));

app.post('/api/auth/login', async (req, res) => {
  const email = text(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const user = one('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  run('INSERT INTO sessions (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)', [user.id, tokenHash(token), expires, nowIso()]);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `nexora_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
  res.json({ user: cleanUser(user) });
});
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = getCookie(req, 'nexora_session');
  db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
  saveDb();
  res.setHeader('Set-Cookie', 'nexora_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  return requireAuth(req, res, next);
});

app.get('/api/dashboard', (_req, res) => {
  const totalContacts = Number(one('SELECT COUNT(*) AS n FROM contacts')?.n || 0);
  const newContacts = Number(one("SELECT COUNT(*) AS n FROM contacts WHERE created_at >= datetime('now','-30 days')")?.n || 0);
  const openPipeline = Number(one("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage NOT IN ('won','lost')")?.n || 0);
  const wonRevenue = Number(one("SELECT COALESCE(SUM(value),0) AS n FROM deals WHERE stage='won'")?.n || 0);
  const wonCount = Number(one("SELECT COUNT(*) AS n FROM deals WHERE stage='won'")?.n || 0);
  const closedCount = Number(one("SELECT COUNT(*) AS n FROM deals WHERE stage IN ('won','lost')")?.n || 0);
  const tasksToday = Number(one("SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND date(due_date)=date('now')")?.n || 0);
  const stageRows = all("SELECT stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM deals GROUP BY stage");
  const revenueRows = all("SELECT strftime('%Y-%m', won_at) AS month, SUM(value) AS value FROM deals WHERE stage='won' AND won_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6").reverse();
  const recentActivities = all(`SELECT a.*, u.name AS user_name, c.name AS contact_name
    FROM activities a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN contacts c ON c.id=a.contact_id
    ORDER BY a.created_at DESC LIMIT 7`);
  const upcomingTasks = all(`SELECT t.*, u.name AS assignee_name, c.name AS contact_name FROM tasks t
    LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN contacts c ON c.id=t.related_contact_id
    WHERE t.status != 'done' ORDER BY t.due_date ASC LIMIT 6`);
  const recentDeals = all(`SELECT d.*, c.name AS contact_name, u.name AS owner_name FROM deals d
    LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN users u ON u.id=d.owner_id
    ORDER BY d.created_at DESC LIMIT 5`);
  res.json({
    metrics: { totalContacts, newContacts, openPipeline, wonRevenue, winRate: closedCount ? Math.round(wonCount / closedCount * 100) : 0, tasksToday },
    stages: stageRows, revenue: revenueRows, recentActivities, upcomingTasks, recentDeals,
  });
});

app.get('/api/contacts', (req, res) => {
  const search = `%${text(req.query.search, 100)}%`;
  const status = text(req.query.status, 20);
  const where = status && ['lead','active','customer'].includes(status) ? 'AND c.status = ?' : '';
  const params = where ? [search, search, search, status] : [search, search, search];
  const rows = all(`SELECT c.*, (SELECT COUNT(*) FROM deals d WHERE d.contact_id=c.id) AS deals_count
    FROM contacts c WHERE (c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ?) ${where}
    ORDER BY c.created_at DESC`, params).map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') }));
  res.json({ contacts: rows });
});
app.post('/api/contacts', (req, res) => {
  const name = text(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'Укажите имя контакта' });
  const email = text(req.body.email, 120).toLowerCase();
  if (email && !validEmail(email)) return res.status(400).json({ error: 'Проверьте формат email' });
  const id = run(`INSERT INTO contacts (name,company,email,phone,source,status,value,last_contact,tags,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [name,text(req.body.company,120),email,text(req.body.phone,40),text(req.body.source,40)||'Другое',
    ['lead','active','customer'].includes(req.body.status) ? req.body.status : 'lead', Math.max(0,num(req.body.value)), nowIso(),
    JSON.stringify(Array.isArray(req.body.tags) ? req.body.tags.map(v=>text(v,30)).slice(0,8) : []), nowIso()]);
  createActivity({ type:'contact', title:'Добавлен новый контакт', description:name, userId:req.user.id, contactId:id });
  res.status(201).json({ contact: one('SELECT * FROM contacts WHERE id=?',[id]) });
});
app.put('/api/contacts/:id', (req, res) => {
  const id = num(req.params.id);
  if (!one('SELECT id FROM contacts WHERE id=?',[id])) return res.status(404).json({ error:'Контакт не найден' });
  const name = text(req.body.name,120);
  if (!name) return res.status(400).json({ error:'Укажите имя контакта' });
  const email = text(req.body.email,120).toLowerCase();
  if (email && !validEmail(email)) return res.status(400).json({ error:'Проверьте формат email' });
  db.run(`UPDATE contacts SET name=?,company=?,email=?,phone=?,source=?,status=?,value=?,last_contact=?,tags=? WHERE id=?`,
    [name,text(req.body.company,120),email,text(req.body.phone,40),text(req.body.source,40),
    ['lead','active','customer'].includes(req.body.status)?req.body.status:'lead',Math.max(0,num(req.body.value)),req.body.last_contact||nowIso(),
    JSON.stringify(Array.isArray(req.body.tags)?req.body.tags.map(v=>text(v,30)).slice(0,8):[]),id]);
  saveDb();
  createActivity({ type:'contact', title:'Обновлён контакт', description:name, userId:req.user.id, contactId:id });
  res.json({ contact: one('SELECT * FROM contacts WHERE id=?',[id]) });
});
app.delete('/api/contacts/:id', (req, res) => {
  const id = num(req.params.id); const contact = one('SELECT name FROM contacts WHERE id=?',[id]);
  if (!contact) return res.status(404).json({ error:'Контакт не найден' });
  db.run('DELETE FROM contacts WHERE id=?',[id]); saveDb();
  createActivity({ type:'contact', title:'Контакт удалён', description:contact.name, userId:req.user.id });
  res.json({ ok:true });
});

app.get('/api/deals', (_req, res) => {
  const deals = all(`SELECT d.*, c.name AS contact_name, u.name AS owner_name FROM deals d
    LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN users u ON u.id=d.owner_id ORDER BY d.created_at DESC`);
  res.json({ deals });
});
app.post('/api/deals', (req, res) => {
  const title = text(req.body.title,140);
  if (!title) return res.status(400).json({ error:'Укажите название сделки' });
  const stage = ['lead','qualified','proposal','negotiation','won','lost'].includes(req.body.stage) ? req.body.stage : 'lead';
  const createdAt = nowIso();
  const id = run(`INSERT INTO deals (title,company,contact_id,value,stage,probability,close_date,won_at,owner_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [title,text(req.body.company,120),req.body.contact_id?num(req.body.contact_id):null,
    Math.max(0,num(req.body.value)),stage,stage==='won'?100:stage==='lost'?0:Math.max(0,Math.min(100,num(req.body.probability,10))),req.body.close_date||null,
    stage==='won'?createdAt:null,req.body.owner_id?num(req.body.owner_id):req.user.id,createdAt]);
  createActivity({ type:'deal', title:'Создана сделка', description:title, userId:req.user.id, dealId:id });
  res.status(201).json({ deal: one('SELECT * FROM deals WHERE id=?',[id]) });
});
app.patch('/api/deals/:id', (req, res) => {
  const id = num(req.params.id); const deal = one('SELECT * FROM deals WHERE id=?',[id]);
  if (!deal) return res.status(404).json({ error:'Сделка не найдена' });
  const stage = req.body.stage && ['lead','qualified','proposal','negotiation','won','lost'].includes(req.body.stage) ? req.body.stage : deal.stage;
  const probability = req.body.probability === undefined ? (stage==='won'?100:stage==='lost'?0:deal.probability) : Math.max(0,Math.min(100,num(req.body.probability)));
  const wonAt = stage==='won' ? (deal.stage==='won' ? deal.won_at || nowIso() : nowIso()) : null;
  db.run('UPDATE deals SET stage=?,probability=?,title=?,value=?,close_date=?,won_at=? WHERE id=?',
    [stage,probability,text(req.body.title||deal.title,140),Math.max(0,num(req.body.value,deal.value)),req.body.close_date===undefined?deal.close_date:req.body.close_date,wonAt,id]);
  saveDb();
  if (stage !== deal.stage) createActivity({ type:'deal', title:'Изменён этап сделки', description:`${deal.title}: ${deal.stage} → ${stage}`, userId:req.user.id, dealId:id });
  res.json({ deal: one('SELECT * FROM deals WHERE id=?',[id]) });
});
app.delete('/api/deals/:id', (req, res) => {
  const id = num(req.params.id); const deal = one('SELECT title FROM deals WHERE id=?',[id]);
  if (!deal) return res.status(404).json({ error:'Сделка не найдена' });
  db.run('DELETE FROM deals WHERE id=?',[id]); saveDb();
  createActivity({ type:'deal', title:'Сделка удалена', description:deal.title, userId:req.user.id });
  res.json({ ok:true });
});

app.get('/api/tasks', (_req, res) => {
  res.json({ tasks: all(`SELECT t.*, u.name AS assignee_name, c.name AS contact_name FROM tasks t
    LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN contacts c ON c.id=t.related_contact_id ORDER BY t.due_date ASC`) });
});
app.post('/api/tasks', (req, res) => {
  const title = text(req.body.title,160); if (!title) return res.status(400).json({ error:'Укажите название задачи' });
  const due = req.body.due_date ? new Date(req.body.due_date) : new Date();
  if (Number.isNaN(due.getTime())) return res.status(400).json({ error:'Некорректная дата задачи' });
  const id = run(`INSERT INTO tasks (title,description,due_date,priority,status,assigned_to,related_contact_id,created_at)
    VALUES (?,?,?,?,?,?,?,?)`, [title,text(req.body.description,500),due.toISOString(),['low','medium','high'].includes(req.body.priority)?req.body.priority:'medium',
    ['todo','in_progress','done'].includes(req.body.status)?req.body.status:'todo',req.body.assigned_to?num(req.body.assigned_to):req.user.id,
    req.body.related_contact_id?num(req.body.related_contact_id):null,nowIso()]);
  createActivity({ type:'task', title:'Создана задача', description:title, userId:req.user.id });
  res.status(201).json({ task: one('SELECT * FROM tasks WHERE id=?',[id]) });
});
app.patch('/api/tasks/:id', (req, res) => {
  const id=num(req.params.id); const task=one('SELECT * FROM tasks WHERE id=?',[id]);
  if(!task) return res.status(404).json({error:'Задача не найдена'});
  const status=['todo','in_progress','done'].includes(req.body.status)?req.body.status:task.status;
  db.run('UPDATE tasks SET status=?,title=?,description=?,priority=?,due_date=? WHERE id=?',
    [status,text(req.body.title||task.title,160),text(req.body.description??task.description,500),
    ['low','medium','high'].includes(req.body.priority)?req.body.priority:task.priority,req.body.due_date||task.due_date,id]); saveDb();
  if(status!==task.status) createActivity({type:'task',title:status==='done'?'Задача завершена':'Обновлён статус задачи',description:task.title,userId:req.user.id});
  res.json({task:one('SELECT * FROM tasks WHERE id=?',[id])});
});
app.delete('/api/tasks/:id', (req,res)=>{const id=num(req.params.id);if(!one('SELECT id FROM tasks WHERE id=?',[id]))return res.status(404).json({error:'Задача не найдена'});db.run('DELETE FROM tasks WHERE id=?',[id]);saveDb();res.json({ok:true});});

app.get('/api/reports', (_req,res)=>{
  const monthly = all(`SELECT strftime('%Y-%m', won_at) AS month, COUNT(*) AS deals, SUM(value) AS revenue,
    COUNT(*) AS won FROM deals WHERE stage='won' AND won_at IS NOT NULL GROUP BY month ORDER BY month ASC`);
  const byStage = all('SELECT stage, COUNT(*) AS count, SUM(value) AS value FROM deals GROUP BY stage');
  const sources = all('SELECT source, COUNT(*) AS count FROM contacts GROUP BY source ORDER BY count DESC');
  const topContacts = all(`SELECT c.id,c.name,c.company,COALESCE(SUM(d.value),0) AS value,COUNT(d.id) AS deals
    FROM contacts c LEFT JOIN deals d ON d.contact_id=c.id GROUP BY c.id ORDER BY value DESC LIMIT 5`);
  res.json({monthly,byStage,sources,topContacts});
});

app.get('/api/team', requireAuth, allowRoles('admin','manager'), (_req,res)=>{
  res.json({ users: all('SELECT id,name,email,role,is_active,created_at FROM users ORDER BY created_at ASC') });
});
app.post('/api/team', requireAuth, allowRoles('admin'), (req,res)=>{
  const name=text(req.body.name,80); const email=text(req.body.email,120).toLowerCase(); const password=String(req.body.password||'');
  const role=['admin','manager','sales'].includes(req.body.role)?req.body.role:'sales';
  if(!name||!validEmail(email)) return res.status(400).json({error:'Укажите имя и корректный email'});
  if(password.length<10) return res.status(400).json({error:'Пароль должен содержать минимум 10 символов'});
  try { const id=run('INSERT INTO users (name,email,password_hash,role,is_active,created_at) VALUES (?,?,?,?,1,?)',[name,email,bcrypt.hashSync(password,12),role,nowIso()]);
    createActivity({type:'team',title:'Добавлен сотрудник',description:name,userId:req.user.id});
    res.status(201).json({user:cleanUser(one('SELECT * FROM users WHERE id=?',[id]))});
  } catch(e){ return res.status(409).json({error:'Пользователь с таким email уже существует'}); }
});
app.patch('/api/team/:id', requireAuth, allowRoles('admin'), (req,res)=>{
  const id=num(req.params.id); const user=one('SELECT * FROM users WHERE id=?',[id]); if(!user)return res.status(404).json({error:'Пользователь не найден'});
  if(id===req.user.id && ((req.body.is_active!==undefined && !Boolean(req.body.is_active)) || (req.body.role && req.body.role!=='admin'))) return res.status(400).json({error:'Нельзя отключить собственный аккаунт или понизить собственную роль'});
  const role=['admin','manager','sales'].includes(req.body.role)?req.body.role:user.role;
  const isActive=req.body.is_active===undefined?user.is_active:(req.body.is_active?1:0);
  db.run('UPDATE users SET role=?,is_active=? WHERE id=?',[role,isActive,id]); saveDb();
  res.json({user:cleanUser(one('SELECT * FROM users WHERE id=?',[id]))});
});

app.use('/api', (_req,res)=>res.status(404).json({error:'API endpoint не найден'}));
app.use((error,_req,res,_next)=>{ console.error('[NEXORA ERROR]',error); res.status(500).json({error:'Внутренняя ошибка сервера'}); });

async function main(){
  await initializeDatabase();
  const dist=path.join(ROOT,'dist');
  if(fs.existsSync(dist)){
    app.use(express.static(dist));
    app.use((req,res)=>res.sendFile(path.join(dist,'index.html')));
  }
  app.listen(PORT,()=>console.log(`[NEXORA] API запущен: http://localhost:${PORT}`));
}
main().catch(error=>{console.error('[NEXORA] Не удалось запустить сервер',error);process.exit(1);});
