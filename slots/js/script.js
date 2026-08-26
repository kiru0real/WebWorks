/* ============================================
   STATE
============================================ */
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];
const SYMBOL_VALUES = {
    '🍒': 2,
    '🍋': 3,
    '🍊': 4,
    '🍇': 5,
    '🔔': 10,
    '💎': 20,
    '7️⃣': 50
};

let balance = 1000;
let bet = 10;
let isSpinning = false;
let history = [];

/* ============================================
   DOM REFS
============================================ */
const balanceDisplay = document.getElementById('balanceDisplay');
const betDisplay = document.getElementById('betDisplay');
const spinBtn = document.getElementById('spinBtn');
const maxBetBtn = document.getElementById('maxBetBtn');
const betDown = document.getElementById('betDown');
const betUp = document.getElementById('betUp');
const reel1 = document.getElementById('reel1');
const reel2 = document.getElementById('reel2');
const reel3 = document.getElementById('reel3');
const slotResult = document.getElementById('slotResult');
const resultPopup = document.getElementById('resultPopup');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultAmount = document.getElementById('resultAmount');
const resultClose = document.getElementById('resultClose');
const historyList = document.getElementById('historyList');

/* ============================================
   INIT
============================================ */
document.addEventListener('DOMContentLoaded', function() {
    loadState();
    updateUI();
    initParticles();
    initEvents();
});

/* ============================================
   STATE MANAGEMENT
============================================ */
function loadState() {
    const saved = localStorage.getItem('casino_slots_state');
    if (saved) {
        const state = JSON.parse(saved);
        balance = state.balance || 1000;
        bet = state.bet || 10;
        history = state.history || [];
    }
}

function saveState() {
    localStorage.setItem('casino_slots_state', JSON.stringify({ balance, bet, history }));
}

function updateUI() {
    balanceDisplay.textContent = balance;
    betDisplay.textContent = bet;
    renderHistory();
}

/* ============================================
   PARTICLES
============================================ */
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (12 + Math.random() * 18) + 's';
        particle.style.animationDelay = (Math.random() * 20) + 's';
        particle.style.width = (1 + Math.random() * 3) + 'px';
        particle.style.height = particle.style.width;
        particle.style.opacity = 0.15 + Math.random() * 0.25;
        container.appendChild(particle);
    }
}

/* ============================================
   SLOT MACHINE
============================================ */
function spin() {
    if (isSpinning) return;
    if (balance < bet) {
        showResult(false, 'Недостаточно средств! 💸');
        return;
    }

    isSpinning = true;
    spinBtn.disabled = true;
    balance -= bet;
    updateUI();
    saveState();

    slotResult.classList.remove('show');
    slotResult.textContent = '';

    const results = [
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    ];

    const reels = [reel1, reel2, reel3];
    const spins = [18 + Math.random() * 8, 22 + Math.random() * 8, 26 + Math.random() * 8];

    reels.forEach((reel, i) => {
        reel.classList.add('spinning');
        let count = 0;
        const totalSpins = spins[i];
        const interval = setInterval(() => {
            const currentIndex = Math.floor(Math.random() * SYMBOLS.length);
            const symbols = reel.querySelectorAll('.symbol');
            symbols.forEach((sym, idx) => {
                if (idx === 2) {
                    sym.textContent = SYMBOLS[currentIndex];
                }
            });
            count++;
            if (count >= totalSpins) {
                clearInterval(interval);
                reel.classList.remove('spinning');
                
                const symbols = reel.querySelectorAll('.symbol');
                symbols.forEach((sym, idx) => {
                    if (idx === 2) {
                        sym.textContent = results[i];
                    }
                });

                if (i === 2) {
                    setTimeout(() => {
                        checkWin(results);
                    }, 250);
                }
            }
        }, 25 + i * 8);
    });
}

function checkWin(results) {
    const [a, b, c] = results;
    let winAmount = 0;
    let message = '';

    if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣') {
        winAmount = bet * 50;
        message = '🎰 ДЖЕКПОТ! 🎰';
    }
    else if (a === b && b === c) {
        winAmount = bet * SYMBOL_VALUES[a];
        message = `Три ${a}!`;
    }
    else if (a === b) {
        winAmount = bet * SYMBOL_VALUES[a] * 0.5;
        message = `Два ${a}!`;
    }
    else if (a === c) {
        winAmount = bet * SYMBOL_VALUES[a] * 0.5;
        message = `Два ${a}!`;
    }
    else if (b === c) {
        winAmount = bet * SYMBOL_VALUES[b] * 0.5;
        message = `Два ${b}!`;
    }
    else {
        const specials = results.filter(s => s === '💎' || s === '🔔');
        if (specials.length > 0) {
            winAmount = bet * specials.length * 2;
            message = `${specials.length}x специальный! ✨`;
        } else {
            winAmount = 0;
            message = 'Попробуй ещё! 🎲';
        }
    }

    const reels = [reel1, reel2, reel3];
    reels.forEach((reel, i) => {
        const symbols = reel.querySelectorAll('.symbol');
        symbols.forEach((sym, idx) => {
            if (idx === 2) {
                if (results[i] === results[0] || results[i] === results[1] || results[i] === results[2]) {
                    if (results.filter(r => r === results[i]).length >= 2) {
                        sym.classList.add('winning');
                    }
                }
                if (results[0] === results[1] && results[1] === results[2]) {
                    sym.classList.add('winning');
                }
            }
        });
    });

    if (winAmount > 0) {
        balance += winAmount;
        showResult(true, message, winAmount);
        addHistory(true, winAmount, results);
    } else {
        showResult(false, message);
        addHistory(false, 0, results);
    }

    updateUI();
    saveState();

    setTimeout(() => {
        isSpinning = false;
        spinBtn.disabled = false;
        document.querySelectorAll('.symbol.winning').forEach(el => {
            el.classList.remove('winning');
        });
    }, 1800);
}

function showResult(isWin, message, amount = 0) {
    const popup = resultPopup;
    const icon = resultIcon;
    const title = resultTitle;
    const amountEl = resultAmount;

    if (isWin) {
        icon.className = 'fas fa-trophy';
        icon.style.color = '#ffd700';
        title.textContent = '🎉 ВЫ ВЫИГРАЛИ!';
        title.style.color = '#ffd700';
        amountEl.textContent = `+${amount} ₽`;
        amountEl.style.color = '#2ecc71';
    } else {
        icon.className = 'fas fa-dice';
        icon.style.color = '#8888aa';
        title.textContent = message;
        title.style.color = '#f5f0ed';
        amountEl.textContent = '';
    }

    popup.classList.add('active');
}

function closeResult() {
    resultPopup.classList.remove('active');
}

/* ============================================
   HISTORY
============================================ */
function addHistory(isWin, amount, results) {
    history.unshift({
        isWin,
        amount,
        results: results.join(' '),
        time: new Date().toLocaleTimeString()
    });
    if (history.length > 30) history.pop();
    renderHistory();
    saveState();
}

function renderHistory() {
    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Начните игру!</div>';
        return;
    }
    historyList.innerHTML = history.slice(0, 15).map(h => `
        <div class="history-item ${h.isWin ? 'win' : 'lose'}">
            <span>${h.results}</span>
            <span class="amount">${h.isWin ? '+' : ''}${h.amount} ₽</span>
        </div>
    `).join('');
}

/* ============================================
   BALANCE CONTROLS
============================================ */
function addMoney(amount) {
    balance += amount;
    updateUI();
    saveState();
    showResult(true, `💰 Пополнено на ${amount} ₽`, amount);
    setTimeout(closeResult, 1200);
}

function resetBalance() {
    if (confirm('Сбросить баланс до 1000 ₽?')) {
        balance = 1000;
        history = [];
        updateUI();
        saveState();
        renderHistory();
    }
}

function setBet(value) {
    bet = Math.max(1, Math.min(balance, value));
    betDisplay.textContent = bet;
    saveState();
}

function maxBet() {
    bet = Math.min(100, balance);
    betDisplay.textContent = bet;
    saveState();
}

/* ============================================
   EVENTS
============================================ */
function initEvents() {
    spinBtn.addEventListener('click', spin);
    
    betDown.addEventListener('click', () => {
        setBet(bet - 5);
    });
    
    betUp.addEventListener('click', () => {
        setBet(bet + 5);
    });
    
    maxBetBtn.addEventListener('click', maxBet);
    
    resultClose.addEventListener('click', closeResult);
    resultPopup.addEventListener('click', (e) => {
        if (e.target === resultPopup) closeResult();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isSpinning) spin();
        if (e.key === 'Escape') closeResult();
        if (e.key === 'ArrowUp') setBet(bet + 5);
        if (e.key === 'ArrowDown') setBet(Math.max(1, bet - 5));
    });
    
    document.getElementById('addMoney10').addEventListener('click', () => addMoney(100));
    document.getElementById('addMoney50').addEventListener('click', () => addMoney(500));
    document.getElementById('addMoney100').addEventListener('click', () => addMoney(1000));
    document.getElementById('resetBalance').addEventListener('click', resetBalance);
}

/* ============================================
   KEYBOARD SHORTCUTS
============================================ */
console.log('🎰 CASINO SLOTS');
console.log('⬆️⬇️  - Изменить ставку');
console.log('⏎     - Крутить');
console.log('⎋     - Закрыть попап');