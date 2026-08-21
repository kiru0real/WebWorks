/* ============================================
   DATA
============================================ */
const DEFAULT_PRODUCTS = [
    {
        id: 1,
        name: 'Филадельфия',
        category: 'rolls',
        price: 550,
        image: 'img/roll-1.jpg',
        description: 'Классический ролл с лососем и сливочным сыром'
    },
    {
        id: 2,
        name: 'Калифорния',
        category: 'rolls',
        price: 480,
        image: 'img/roll-2.jpg',
        description: 'Ролл с крабом, авокадо и икрой тобико'
    },
    {
        id: 3,
        name: 'Дракон',
        category: 'rolls',
        price: 620,
        image: 'img/roll-3.jpg',
        description: 'Запеченный ролл с угрем и авокадо'
    },
    {
        id: 4,
        name: 'Суши с лососем',
        category: 'sushi',
        price: 180,
        image: 'img/sushi-1.jpg',
        description: 'Нежные суши с свежим лососем'
    },
    {
        id: 5,
        name: 'Суши с тунцом',
        category: 'sushi',
        price: 220,
        image: 'img/sushi-2.jpg',
        description: 'Суши с маринованным тунцом'
    },
    {
        id: 6,
        name: 'Сет "Счастье"',
        category: 'sets',
        price: 1990,
        image: 'img/set-1.jpg',
        description: '5 роллов + салат + напиток'
    }
];

/* ============================================
   STATE
============================================ */
let products = [];
let cart = [];
let editingId = null;
let isAdmin = false;

/* ============================================
   ADMIN CREDENTIALS
============================================ */
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin123'
};

/* ============================================
   INIT
============================================ */
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    loadCart();
    renderPopularProducts();
    renderCatalogProducts();
    updateCartCount();
    initEvents();
    initAnimations();
    checkAdminSession();
});

/* ============================================
   ANIMATIONS
============================================ */
function initAnimations() {
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        el.classList.add('visible');
    });
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    document.querySelectorAll('.animate-on-scroll:not(.visible)').forEach(el => {
        observer.observe(el);
    });
}

/* ============================================
   ADMIN SESSION
============================================ */
function checkAdminSession() {
    const session = localStorage.getItem('sushiwok_admin_session');
    if (session === 'true') {
        isAdmin = true;
        showAdminPanel();
    } else {
        isAdmin = false;
        showLoginForm();
    }
}

function showLoginForm() {
    const login = document.getElementById('adminLogin');
    const panel = document.getElementById('adminPanel');
    if (login) login.style.display = 'flex';
    if (panel) panel.style.display = 'none';
}

function showAdminPanel() {
    const login = document.getElementById('adminLogin');
    const panel = document.getElementById('adminPanel');
    if (login) login.style.display = 'none';
    if (panel) panel.style.display = 'block';
    renderAdminProducts();
}

function loginAdmin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const error = document.getElementById('loginError');
    
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        error.style.display = 'none';
        isAdmin = true;
        localStorage.setItem('sushiwok_admin_session', 'true');
        showAdminPanel();
        document.getElementById('loginForm').reset();
    } else {
        error.style.display = 'flex';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
    }
}

function logoutAdmin() {
    isAdmin = false;
    localStorage.removeItem('sushiwok_admin_session');
    showLoginForm();
    document.getElementById('loginForm').reset();
}

/* ============================================
   PRODUCTS CRUD
============================================ */
function loadProducts() {
    const stored = localStorage.getItem('sushiwok_products');
    if (stored) {
        products = JSON.parse(stored);
    } else {
        products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
        saveProducts();
    }
}

function saveProducts() {
    localStorage.setItem('sushiwok_products', JSON.stringify(products));
}

function getNextId() {
    return products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
}

function addProduct(product) {
    product.id = getNextId();
    products.push(product);
    saveProducts();
    renderAdminProducts();
    renderPopularProducts();
    renderCatalogProducts();
    updateProductCount();
}

function updateProduct(id, updated) {
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
        products[index] = { ...products[index], ...updated };
        saveProducts();
        renderAdminProducts();
        renderPopularProducts();
        renderCatalogProducts();
        updateProductCount();
    }
}

function deleteProduct(id) {
    if (!isAdmin) return;
    if (confirm('Удалить этот товар?')) {
        products = products.filter(p => p.id !== id);
        saveProducts();
        renderAdminProducts();
        renderPopularProducts();
        renderCatalogProducts();
        updateProductCount();
    }
}

function updateProductCount() {
    const el = document.getElementById('productCount');
    if (el) el.textContent = `(${products.length})`;
}

/* ============================================
   CART
============================================ */
function loadCart() {
    const stored = localStorage.getItem('sushiwok_cart');
    if (stored) {
        cart = JSON.parse(stored);
    } else {
        cart = [];
    }
}

function saveCart() {
    localStorage.setItem('sushiwok_cart', JSON.stringify(cart));
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    saveCart();
    updateCartCount();
    renderCart();
    
    const btns = document.querySelectorAll(`.product-btn`);
    btns.forEach(btn => {
        if (btn.closest(`[data-id="${productId}"]`)) {
            btn.innerHTML = '<i class="fas fa-check"></i> В корзине';
            btn.style.background = '#2ecc71';
            btn.style.color = 'white';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-plus"></i> В корзину';
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
        }
    });
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartCount();
    renderCart();
}

function updateCartQuantity(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    saveCart();
    updateCartCount();
    renderCart();
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = count);
}

/* ============================================
   RENDER
============================================ */
function renderPopularProducts() {
    const container = document.getElementById('popularProducts');
    if (!container) return;
    
    const popular = products.slice(0, 4);
    if (popular.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 0;color:#8a827f;grid-column:1/-1;">
                <i class="fas fa-utensils" style="font-size:3rem;display:block;margin-bottom:15px;"></i>
                <p>Нет товаров. Добавьте их в админке!</p>
            </div>
        `;
        return;
    }
    container.innerHTML = popular.map(p => createProductCard(p)).join('');
}

function renderCatalogProducts(filter = 'all') {
    const container = document.getElementById('catalogProducts');
    if (!container) return;
    
    const filtered = filter === 'all' ? products : products.filter(p => p.category === filter);
    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 0;color:#8a827f;grid-column:1/-1;">
                <i class="fas fa-search" style="font-size:3rem;display:block;margin-bottom:15px;"></i>
                <p>Товары не найдены</p>
            </div>
        `;
        return;
    }
    container.innerHTML = filtered.map(p => createProductCard(p)).join('');
    
    container.querySelectorAll('.animate-on-scroll').forEach((el, i) => {
        setTimeout(() => {
            el.classList.add('visible');
        }, 100 + i * 100);
    });
}

function createProductCard(product) {
    const inCart = cart.find(item => item.id === product.id);
    const btnText = inCart ? 'В корзине' : 'В корзину';
    const btnIcon = inCart ? 'fa-check' : 'fa-plus';
    const btnStyle = inCart ? 'background:#2ecc71;color:white;' : '';
    
    return `
        <div class="product-card animate-on-scroll" data-id="${product.id}">
            <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/600x400/1a1412/ff6b35?text=${product.name}'">
            <div class="product-body">
                <div class="product-category">${product.category}</div>
                <h3>${product.name}</h3>
                <p class="product-description">${product.description || ''}</p>
                <div class="product-footer">
                    <span class="product-price">${product.price} ₽</span>
                    <button class="product-btn" onclick="addToCart(${product.id})" style="${btnStyle}">
                        <i class="fas ${btnIcon}"></i> ${btnText}
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderAdminProducts() {
    const container = document.getElementById('adminProductList');
    if (!container) return;
    updateProductCount();
    
    if (products.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:#8a827f;">
                <i class="fas fa-box" style="font-size:2rem;display:block;margin-bottom:15px;"></i>
                <p>Нет товаров. Добавьте первый!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = products.map(p => `
        <div class="admin-product-item">
            <div class="product-info">
                <img src="${p.image || 'https://via.placeholder.com/50/1a1412/ff6b35?text=' + p.name}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/50/1a1412/ff6b35?text=${p.name}'">
                <div>
                    <h4>${p.name}</h4>
                    <div class="product-meta">${p.category} • ${p.price} ₽</div>
                </div>
            </div>
            <div class="product-actions">
                <button class="edit-btn" onclick="editProduct(${p.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" onclick="deleteProduct(${p.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderCart() {
    const body = document.getElementById('cartBody');
    const total = document.getElementById('cartTotal');
    if (!body) return;
    
    if (cart.length === 0) {
        body.innerHTML = `
            <div class="cart-empty">
                <i class="fas fa-shopping-basket"></i>
                <p>Корзина пуста</p>
                <span>Добавьте товары из каталога</span>
            </div>
        `;
        if (total) total.textContent = '0 ₽';
        return;
    }
    
    body.innerHTML = cart.map(item => `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/60/1a1412/ff6b35?text=${item.name}'">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <div class="cart-item-price">${item.price} ₽</div>
            </div>
            <div class="cart-item-qty">
                <button onclick="updateCartQuantity(${item.id}, -1)">-</button>
                <span>${item.quantity}</span>
                <button onclick="updateCartQuantity(${item.id}, 1)">+</button>
            </div>
            <div class="cart-item-remove" onclick="removeFromCart(${item.id})">
                <i class="fas fa-times"></i>
            </div>
        </div>
    `).join('');
    
    if (total) total.textContent = getCartTotal() + ' ₽';
}

/* ============================================
   ADMIN FUNCTIONS
============================================ */
function editProduct(id) {
    if (!isAdmin) return;
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    editingId = id;
    document.getElementById('editId').value = id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productImage').value = product.image || '';
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save"></i> Обновить товар';
    document.getElementById('cancelEdit').style.display = 'inline-flex';
    
    document.querySelector('.admin-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    document.getElementById('editId').value = '';
    document.getElementById('adminForm').reset();
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save"></i> Добавить товар';
    document.getElementById('cancelEdit').style.display = 'none';
}

/* ============================================
   EVENTS
============================================ */
function initEvents() {
    // Navigation toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }
    
    // Cart toggle
    document.querySelectorAll('#cartToggle').forEach(el => {
        el.addEventListener('click', toggleCart);
    });
    document.getElementById('cartClose')?.addEventListener('click', toggleCart);
    document.getElementById('cartOverlay')?.addEventListener('click', toggleCart);
    
    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderCatalogProducts(this.dataset.filter);
        });
    });
    
    // Admin login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', loginAdmin);
    }
    
    // Admin logout
    document.getElementById('logoutBtn')?.addEventListener('click', logoutAdmin);
    
    // Admin form
    const adminForm = document.getElementById('adminForm');
    if (adminForm) {
        adminForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (!isAdmin) {
                alert('Доступ запрещен!');
                return;
            }
            
            const name = document.getElementById('productName').value.trim();
            const category = document.getElementById('productCategory').value;
            const price = parseInt(document.getElementById('productPrice').value);
            const image = document.getElementById('productImage').value.trim() || 'https://via.placeholder.com/600x400/1a1412/ff6b35?text=' + name;
            const description = document.getElementById('productDescription').value.trim();
            const editId = document.getElementById('editId').value;
            
            if (!name || !category || isNaN(price)) {
                alert('Заполните все обязательные поля!');
                return;
            }
            
            const productData = { name, category, price, image, description };
            
            if (editId) {
                updateProduct(parseInt(editId), productData);
                cancelEdit();
                alert('✅ Товар обновлен!');
            } else {
                addProduct(productData);
                this.reset();
                alert('✅ Товар добавлен!');
            }
        });
    }
    
    document.getElementById('cancelEdit')?.addEventListener('click', cancelEdit);
    
    // Checkout
    document.getElementById('checkoutBtn')?.addEventListener('click', function() {
        if (cart.length === 0) {
            alert('Корзина пуста!');
            return;
        }
        const total = getCartTotal();
        const items = cart.map(i => `${i.name} x${i.quantity}`).join(', ');
        alert(`✅ Заказ оформлен!\n\n${items}\n\nСумма: ${total} ₽\nСпасибо за доверие! 🍣`);
        cart = [];
        saveCart();
        updateCartCount();
        renderCart();
        toggleCart();
    });
    
    // Enter key on login
    document.getElementById('loginPassword')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            loginForm?.dispatchEvent(new Event('submit'));
        }
    });
}

/* ============================================
   CART TOGGLE
============================================ */
function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (sidebar) {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
        renderCart();
    }
}

/* ============================================
   KEYBOARD SHORTCUTS
============================================ */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.getElementById('cartSidebar')?.classList.remove('open');
        document.getElementById('cartOverlay')?.classList.remove('active');
        cancelEdit();
    }
});