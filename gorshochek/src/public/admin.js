const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (value) => new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₽';
const state = { menu: [], news: [], view: 'overview', editorType: null, editorId: null };
let toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    credentials: 'same-origin'
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.includes('/login')) {
    showLogin();
    throw new Error('Сессия завершена. Войдите снова.');
  }
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2800);
}
function showLogin() {
  $('#login-view').hidden = false;
  $('#dashboard-view').hidden = true;
  $('#login-error').textContent = '';
}
function showDashboard(username) {
  $('#login-view').hidden = true;
  $('#dashboard-view').hidden = false;
  $('#admin-name').textContent = username || 'Администратор';
  navigate('overview');
  refreshAll().catch((error) => {
    toast(error.message);
    $('#menu-table-body').innerHTML = `<tr><td colspan="5">Не удалось загрузить меню: ${esc(error.message)}</td></tr>`;
    $('#news-admin-list').innerHTML = `<div class="empty-admin">Не удалось загрузить новости: ${esc(error.message)}</div>`;
  });
}
function navigate(view) {
  state.view = view;
  $$('.admin-view').forEach((node) => node.classList.toggle('is-active', node.id === `view-${view}`));
  $$('.side-link').forEach((node) => node.classList.toggle('is-active', node.dataset.view === view));
  const names = { overview: ['Обзор', 'Добрый день.'], menu: ['Меню', 'Управление меню'], news: ['Новости', 'Новости ресторана'], settings: ['Настройки', 'Настройки ресторана'] };
  $('#page-breadcrumb').textContent = names[view][0].toUpperCase();
  $('#page-title').textContent = names[view][1];
}
function updateStats() {
  $('#stat-dishes').textContent = state.menu.length;
  $('#stat-news').textContent = state.news.filter((item) => item.published).length;
  $('#stat-categories').textContent = new Set(state.menu.map((item) => item.category)).size;
  $('#menu-count').textContent = state.menu.length;
  $('#news-count').textContent = state.news.length;
}
async function refreshAll() {
  const [menu, news] = await Promise.all([api('/api/admin/menu'), api('/api/admin/news')]);
  state.menu = menu;
  state.news = news;
  renderMenu();
  renderNews();
  updateStats();
}
function renderMenu() {
  const query = ($('#menu-search')?.value || '').trim().toLowerCase();
  const items = state.menu.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query));
  $('#menu-result-count').textContent = `${items.length} ${items.length === 1 ? 'позиция' : 'позиций'}`;
  $('#menu-table-body').innerHTML = items.length ? items.map((item) => `
    <tr><td><div class="dish-cell"><img class="dish-thumb" src="${esc(item.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(item.name)}</b><small>${esc(item.weight || 'Вес не указан')}${item.isFeatured ? ' · ХИТ' : ''}</small></div></div></td>
    <td>${esc(item.category)}</td><td><b>${money(item.price)}</b></td><td><span class="status-pill ${item.isAvailable ? '' : 'is-off'}">${item.isAvailable ? 'В меню' : 'Скрыто'}</span></td>
    <td><div class="table-actions"><button class="icon-action" title="Редактировать" data-edit-dish="${item.id}">✎</button><button class="icon-action" title="Удалить" data-delete-dish="${item.id}">×</button></div></td></tr>`).join('') : '<tr><td colspan="5">Ничего не найдено.</td></tr>';
}
function renderNews() {
  $('#news-admin-list').innerHTML = state.news.length ? state.news.map((item) => `
    <article class="news-admin-card"><img src="${esc(item.imageUrl || '')}" alt="" onerror="this.style.visibility='hidden'"><div><span class="news-admin-meta">${item.published ? '● ОПУБЛИКОВАНО' : '○ ЧЕРНОВИК'}</span><h3>${esc(item.title)}</h3><p>${esc(item.excerpt)}</p><div class="news-card-actions"><button data-edit-news="${item.id}">Редактировать</button><button data-toggle-news="${item.id}">${item.published ? 'Снять с публикации' : 'Опубликовать'}</button><button data-delete-news="${item.id}">Удалить</button></div></div></article>`).join('') : '<div class="empty-admin">Новостей пока нет. Создайте первую публикацию.</div>';
}
function fillSettings(settings) {
  const form = $('#settings-form');
  ['tagline', 'address', 'phone', 'hours', 'mapLat', 'mapLng', 'yandexOrgUrl', 'reviewsWidgetUrl'].forEach((key) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = settings[key] || '';
  });
}
async function loadSettings() {
  const settings = await api('/api/settings');
  fillSettings(settings);
}

function openDishEditor(item = null) {
  state.editorType = 'dish';
  state.editorId = item?.id || null;
  $('#dialog-eyebrow').textContent = item ? 'РЕДАКТИРОВАНИЕ МЕНЮ' : 'НОВАЯ ПОЗИЦИЯ';
  $('#dialog-title').textContent = item ? 'Изменить блюдо' : 'Добавить блюдо';
  $('#dialog-body').innerHTML = `
    <div class="dialog-grid">
      <label class="form-field field-wide">Название блюда<input name="name" maxlength="100" required value="${esc(item?.name || '')}" placeholder="Например, Вареники с вишней" /></label>
      <label class="form-field">Цена, ₽<input name="price" type="number" min="0" max="1000000" required value="${esc(item?.price ?? '')}" /></label>
      <label class="form-field">Вес / объём<input name="weight" maxlength="40" value="${esc(item?.weight || '')}" placeholder="250 г" /></label>
      <label class="form-field">Категория<input name="category" maxlength="50" list="category-options" required value="${esc(item?.category || 'Основное')}" placeholder="Основное" /></label>
      <label class="form-field">Метка<input name="badge" maxlength="40" value="${esc(item?.badge || '')}" placeholder="Хит, Новинка..." /></label>
      <label class="form-field field-wide">URL фотографии<input name="imageUrl" type="url" value="${esc(item?.imageUrl || '')}" placeholder="https://..." /></label>
      <label class="form-field field-wide">Описание<textarea name="description" maxlength="500" placeholder="Коротко расскажите о блюде">${esc(item?.description || '')}</textarea></label>
      <label class="form-field">Порядок сортировки<input name="sortOrder" type="number" min="0" value="${esc(item?.sortOrder ?? state.menu.length + 1)}" /></label>
    </div>
    <datalist id="category-options"><option>Супы</option><option>Основное</option><option>Из печи</option><option>Десерты</option><option>Напитки</option></datalist>
    <div class="form-checks"><label><input type="checkbox" name="isAvailable" ${item?.isAvailable === false || item?.isAvailable === 0 ? '' : 'checked'} /> Показывать в меню</label><label><input type="checkbox" name="isFeatured" ${item?.isFeatured ? 'checked' : ''} /> Отметить как хит</label></div>`;
  $('#editor-dialog').showModal();
}
function openNewsEditor(item = null) {
  state.editorType = 'news';
  state.editorId = item?.id || null;
  $('#dialog-eyebrow').textContent = item ? 'РЕДАКТИРОВАНИЕ ПУБЛИКАЦИИ' : 'НОВАЯ ПУБЛИКАЦИЯ';
  $('#dialog-title').textContent = item ? 'Изменить новость' : 'Выпустить новость';
  $('#dialog-body').innerHTML = `
    <div class="dialog-grid">
      <label class="form-field field-wide">Заголовок<input name="title" maxlength="140" required value="${esc(item?.title || '')}" placeholder="Что нового в ресторане?" /></label>
      <label class="form-field field-wide">Короткое описание<input name="excerpt" maxlength="260" required value="${esc(item?.excerpt || '')}" placeholder="Короткий анонс для главной страницы" /></label>
      <label class="form-field field-wide">Полный текст<textarea name="content" maxlength="5000" placeholder="Текст новости">${esc(item?.content || '')}</textarea></label>
      <label class="form-field field-wide">URL фотографии<input name="imageUrl" type="url" value="${esc(item?.imageUrl || '')}" placeholder="https://..." /></label>
    </div><div class="form-checks"><label><input type="checkbox" name="published" ${item?.published ? 'checked' : ''} /> Опубликовать сразу</label></div>`;
  $('#editor-dialog').showModal();
}
function closeEditor() {
  $('#editor-dialog').close();
  state.editorType = null;
  state.editorId = null;
}

async function submitEditor(event) {
  event.preventDefault();
  const form = $('#editor-form');
  const data = new FormData(form);
  const body = Object.fromEntries(data.entries());
  if (state.editorType === 'dish') {
    body.price = Number(body.price);
    body.sortOrder = Number(body.sortOrder || 0);
    body.isAvailable = form.elements.namedItem('isAvailable').checked;
    body.isFeatured = form.elements.namedItem('isFeatured').checked;
  } else if (state.editorType === 'news') {
    body.published = form.elements.namedItem('published').checked;
  }
  try {
    const editorType = state.editorType;
    const url = editorType === 'dish' ? '/api/admin/menu' : '/api/admin/news';
    const method = state.editorId ? 'PUT' : 'POST';
    await api(state.editorId ? `${url}/${state.editorId}` : url, { method, body: JSON.stringify(body) });
    closeEditor();
    await refreshAll();
    toast(editorType === 'dish' ? 'Блюдо сохранено.' : 'Новость сохранена.');
  } catch (error) { toast(error.message); }
}

async function deleteDish(id) {
  const item = state.menu.find((dish) => dish.id === Number(id));
  if (!item || !confirm(`Удалить блюдо «${item.name}»?`)) return;
  try { await api(`/api/admin/menu/${id}`, { method: 'DELETE' }); await refreshAll(); toast('Блюдо удалено.'); }
  catch (error) { toast(error.message); }
}
async function deleteNews(id) {
  const item = state.news.find((news) => news.id === Number(id));
  if (!item || !confirm(`Удалить новость «${item.title}»?`)) return;
  try { await api(`/api/admin/news/${id}`, { method: 'DELETE' }); await refreshAll(); toast('Новость удалена.'); }
  catch (error) { toast(error.message); }
}
async function toggleNews(id) {
  const item = state.news.find((news) => news.id === Number(id));
  if (!item) return;
  try {
    await api(`/api/admin/news/${id}`, { method: 'PUT', body: JSON.stringify({ ...item, published: !item.published }) });
    await refreshAll(); toast(item.published ? 'Новость снята с публикации.' : 'Новость опубликована.');
  } catch (error) { toast(error.message); }
}

async function init() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const loginForm = event.currentTarget;
    const data = new FormData(loginForm);
    $('#login-error').textContent = '';
    try {
      const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
      loginForm.reset();
      showDashboard(result.username);
    } catch (error) { $('#login-error').textContent = error.message; }
  });
  try {
    const me = await api('/api/admin/me');
    if (me.authenticated) showDashboard(me.username);
    else showLogin();
  } catch { showLogin(); }

  $$('.side-link').forEach((button) => button.addEventListener('click', () => {
    navigate(button.dataset.view);
    if (button.dataset.view === 'settings') loadSettings().catch((error) => toast(error.message));
  }));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => {
    navigate(button.dataset.go);
    if (button.dataset.go === 'settings') loadSettings().catch((error) => toast(error.message));
  }));
  $$('[data-action="add-dish"]').forEach((button) => button.addEventListener('click', () => openDishEditor()));
  $$('[data-action="add-news"]').forEach((button) => button.addEventListener('click', () => openNewsEditor()));
  $('#menu-search').addEventListener('input', renderMenu);
  $('#menu-table-body').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-dish]');
    const remove = event.target.closest('[data-delete-dish]');
    if (edit) openDishEditor(state.menu.find((item) => item.id === Number(edit.dataset.editDish)));
    if (remove) deleteDish(remove.dataset.deleteDish);
  });
  $('#news-admin-list').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-news]');
    const remove = event.target.closest('[data-delete-news]');
    const toggle = event.target.closest('[data-toggle-news]');
    if (edit) openNewsEditor(state.news.find((item) => item.id === Number(edit.dataset.editNews)));
    if (remove) deleteNews(remove.dataset.deleteNews);
    if (toggle) toggleNews(toggle.dataset.toggleNews);
  });
  $('#editor-form').addEventListener('submit', submitEditor);
  $('#dialog-close').addEventListener('click', closeEditor);
  $('#dialog-cancel').addEventListener('click', closeEditor);
  $('#editor-dialog').addEventListener('click', (event) => { if (event.target === $('#editor-dialog')) closeEditor(); });
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
      $('#settings-status').textContent = 'Настройки сохранены';
      toast('Настройки ресторана обновлены.');
    } catch (error) { $('#settings-status').textContent = error.message; toast(error.message); }
  });
  $('#logout-button').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) }); } catch {}
    showLogin();
  });
}

document.addEventListener('DOMContentLoaded', init);
