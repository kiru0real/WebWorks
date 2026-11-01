const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₽';
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeUrl = (value = '') => {
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};

let allDishes = [];
let activeCategory = 'all';
let restaurantSettings = {};

async function getJSON(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderMenuTabs(dishes) {
  const categories = [...new Set(dishes.map((dish) => dish.category).filter(Boolean))];
  const tabs = [{ id: 'all', label: 'Всё меню' }, ...categories.map((category) => ({ id: category, label: category }))];
  $('#menu-tabs').innerHTML = tabs.map((tab) => `
    <button class="menu-tab ${activeCategory === tab.id ? 'is-active' : ''}" data-category="${esc(tab.id)}" role="tab" aria-selected="${activeCategory === tab.id}">
      ${esc(tab.label)}${tab.id === 'all' ? ' <span>↗</span>' : ''}
    </button>`).join('');
}

function renderMenu() {
  const visible = activeCategory === 'all' ? allDishes : allDishes.filter((dish) => dish.category === activeCategory);
  $('#menu-grid').innerHTML = visible.length ? visible.map((dish, index) => {
    const img = safeUrl(dish.imageUrl);
    return `<article class="menu-card" style="animation-delay:${Math.min(index, 8) * 65}ms">
      <div class="menu-card-image">${img ? `<img src="${esc(img)}" alt="${esc(dish.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}${dish.badge ? `<span class="menu-card-badge">${esc(dish.badge)}</span>` : ''}</div>
      <div class="menu-card-body"><div class="menu-card-top"><h3>${esc(dish.name)}</h3><span class="menu-price">${money(dish.price)}</span></div>
      <div class="menu-meta">${esc(dish.weight || '')} · ${esc(dish.category || '')}</div><p>${esc(dish.description || '')}</p></div>
    </article>`;
  }).join('') : '<div class="menu-empty">В этой категории пока пусто. Скоро добавим что-нибудь вкусное.</div>';
  observeReveals();
}

function renderNews(items) {
  const root = $('#news-grid');
  if (!items.length) {
    root.innerHTML = '<div class="menu-empty">Пока тихо. Скоро здесь появятся новости из нашей кухни.</div>';
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => {
    const url = safeUrl(item.imageUrl);
    const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'НОВОСТИ РЕСТОРАНА';
    return `<article class="news-card" data-reveal style="--delay:${index * 100}ms"><div class="news-card-image">${url ? `<img src="${esc(url)}" alt="${esc(item.title)}" loading="lazy" onerror="this.style.display='none'">` : ''}</div><span class="news-card-date">${esc(date)}</span><h3>${esc(item.title)}</h3><p>${esc(item.excerpt)}</p></article>`;
  }).join('');
  observeReveals();
}

function updateRestaurantInfo(settings) {
  const phone = settings.phone || '+7 (000) 000-00-00';
  const address = settings.address || 'Укажите адрес ресторана';
  const hours = settings.hours || 'Ежедневно · 12:00–23:00';
  $('#header-phone').textContent = phone;
  $('#header-phone').href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  $('#contact-phone').textContent = phone;
  $('#contact-phone').href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  $('#contact-address').textContent = address;
  $('#contact-hours').textContent = hours;
  const route = settings.yandexOrgUrl || (address && !address.toLowerCase().includes('укажите') ? `https://yandex.ru/maps/?text=${encodeURIComponent(address)}` : 'https://yandex.ru/maps/');
  $('#route-link').href = route;
  $('#write-review-link').href = settings.yandexOrgUrl || 'https://yandex.ru/maps/';
  if (settings.reviewsWidgetUrl) {
    const url = safeUrl(settings.reviewsWidgetUrl);
    if (url && new URL(url).hostname.endsWith('yandex.ru') && new URL(url).pathname.startsWith('/maps-reviews-widget/')) {
      $('#reviews-widget').innerHTML = `<iframe class="reviews-iframe" src="${esc(url)}" title="Отзывы о ресторане ГОРШОЧЕК на Яндекс Картах" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    }
  }
  initMap(settings);
}

function initMap(settings) {
  const lat = Number(settings.mapLat);
  const lng = Number(settings.mapLng);
  const key = String(settings.yandexMapsApiKey || '').trim();
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng) || !settings.mapLat || !settings.mapLng) return;
  $('#map-caption').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  $('#map-frame').innerHTML = '<div id="yandex-map" class="yandex-map"></div>';
  const script = document.createElement('script');
  script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
  script.async = true;
  script.onload = () => {
    if (!window.ymaps) return;
    window.ymaps.ready(() => {
      const map = new window.ymaps.Map('yandex-map', {
        center: [lat, lng], zoom: 16, controls: ['zoomControl', 'fullscreenControl']
      }, { suppressMapOpenBlock: true });
      const pin = new window.ymaps.Placemark([lat, lng], {
        balloonContentHeader: 'ГОРШОЧЕК',
        balloonContentBody: esc(settings.address || 'Русская кухня')
      }, { preset: 'islands#redFoodIcon', iconColor: '#cf563d' });
      map.geoObjects.add(pin);
      map.behaviors.disable('scrollZoom');
      pin.balloon.open();
    });
  };
  script.onerror = () => {
    $('#map-frame').innerHTML = '<div class="map-placeholder"><div class="map-pin">⌖</div><b>Не удалось загрузить карту</b><span>Проверьте API-ключ Яндекс Карт и ограничения по домену.</span></div>';
  };
  document.head.appendChild(script);
}

let revealObserver;
function observeReveals() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('[data-reveal]').forEach((node) => node.classList.add('is-visible'));
    return;
  }
  if (!('IntersectionObserver' in window)) {
    $$('[data-reveal]').forEach((node) => node.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -45px 0px' });
  }
  $$('[data-reveal]:not(.is-visible)').forEach((node) => revealObserver.observe(node));
}

function setupNavigation() {
  const toggle = $('#menu-toggle');
  const nav = $('.main-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('.main-nav a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
  $('#year').textContent = new Date().getFullYear();
}

async function init() {
  setupNavigation();
  document.querySelectorAll('.intro-layout,.intro-bottom,.section-heading-row,.menu-tabs,.menu-bottom,.quote-copy,.visit-copy,.map-panel,.reviews-heading,.section-kicker').forEach((node) => node.setAttribute('data-reveal', ''));
  observeReveals();
  try {
    const [dishes, news, settings] = await Promise.all([getJSON('/api/menu'), getJSON('/api/news'), getJSON('/api/settings')]);
    allDishes = dishes;
    restaurantSettings = settings;
    renderMenuTabs(allDishes);
    renderMenu();
    renderNews(news);
    updateRestaurantInfo(restaurantSettings);
  } catch (error) {
    console.error(error);
    $('#menu-grid').innerHTML = '<div class="menu-empty">Не удалось загрузить меню. Обновите страницу чуть позже.</div>';
    $('#news-grid').innerHTML = '<div class="menu-empty">Не удалось загрузить новости.</div>';
  }
  $('#menu-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    renderMenuTabs(allDishes);
    renderMenu();
  });
}

document.addEventListener('DOMContentLoaded', init);
