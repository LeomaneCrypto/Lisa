/**
 * Telegram Mini App - Розыгрыш билетов
 * JavaScript логика
 */

// ========================================
// Конфигурация
// ========================================

const CONFIG = {
    // API URL (замените на ваш сервер)
    API_URL: window.location.origin.includes('localhost') 
        ? 'http://localhost:8080/api' 
        : '/api',
    
    // Доступные варианты покупки билетов
    TICKET_OPTIONS: [1, 3, 5, 10],
    
    // Интервал обновления данных (мс)
    REFRESH_INTERVAL: 30000,
    
    // Интервал таймера (мс)
    TIMER_INTERVAL: 1000
};

// ========================================
// Telegram Web App
// ========================================

const tg = window.Telegram?.WebApp;

// Инициализация Telegram Web App
function initTelegramApp() {
    if (!tg) {
        console.warn('Telegram WebApp not available');
        return;
    }
    
    // Расширяем на весь экран
    tg.expand();
    
    // Включаем кнопку закрытия
    tg.enableClosingConfirmation();
    
    // Устанавливаем цвета из темы Telegram
    if (tg.themeParams) {
        document.documentElement.style.setProperty(
            '--tg-theme-bg-color', 
            tg.themeParams.bg_color || '#0a0a0f'
        );
        document.documentElement.style.setProperty(
            '--tg-theme-text-color', 
            tg.themeParams.text_color || '#ffffff'
        );
    }
    
    // Готовность приложения
    tg.ready();
}

// Получение данных пользователя
function getUserData() {
    if (!tg || !tg.initDataUnsafe) {
        return null;
    }
    
    return {
        user_id: tg.initDataUnsafe.user?.id,
        username: tg.initDataUnsafe.user?.username,
        first_name: tg.initDataUnsafe.user?.first_name,
        initData: tg.initData
    };
}

// ========================================
// Состояние приложения
// ========================================

const state = {
    raffle: null,
    selectedTickets: 1,
    myTickets: [],
    isLoading: true,
    timerInterval: null,
    refreshInterval: null
};

// ========================================
// API функции
// ========================================

async function fetchAPI(endpoint, options = {}) {
    const url = `${CONFIG.API_URL}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // Добавляем данные Telegram для авторизации
    const userData = getUserData();
    if (userData?.initData) {
        headers['X-Telegram-Init-Data'] = userData.initData;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Получить активный розыгрыш
async function fetchActiveRaffle() {
    return await fetchAPI('/raffle/active');
}

// Получить билеты пользователя
async function fetchMyTickets(raffleId) {
    const userData = getUserData();
    if (!userData?.user_id) return [];
    
    try {
        const response = await fetchAPI(`/tickets/my?raffle_id=${raffleId}&user_id=${userData.user_id}`);
        return response.tickets || [];
    } catch {
        return [];
    }
}

// Инициировать покупку билетов
async function initiatePurchase(raffleId, ticketsCount) {
    const userData = getUserData();
    if (!userData?.user_id) {
        throw new Error('Пользователь не авторизован');
    }
    
    return await fetchAPI('/purchase/init', {
        method: 'POST',
        body: JSON.stringify({
            raffle_id: raffleId,
            tickets_count: ticketsCount,
            user_id: userData.user_id
        })
    });
}

// ========================================
// UI функции
// ========================================

// Показать загрузку
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

// Скрыть загрузку
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Показать модальное окно
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
}

// Закрыть все модальные окна
function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}

// Показать ошибку
function showError(message) {
    document.getElementById('error-text').textContent = message;
    showModal('error-modal');
}

// Показать успех
function showSuccess(message) {
    document.getElementById('success-text').textContent = message;
    showModal('success-modal');
}

// Показать "нет розыгрыша"
function showNoRaffle() {
    document.getElementById('no-raffle').style.display = 'flex';
    document.querySelector('.main-content').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';
}

// ========================================
// Таймер обратного отсчёта
// ========================================

function updateTimer() {
    if (!state.raffle?.end_time) {
        document.getElementById('days').textContent = '--';
        document.getElementById('hours').textContent = '--';
        document.getElementById('minutes').textContent = '--';
        document.getElementById('seconds').textContent = '--';
        return;
    }
    
    const endTime = new Date(state.raffle.end_time).getTime();
    const now = Date.now();
    const diff = endTime - now;
    
    if (diff <= 0) {
        document.getElementById('days').textContent = '00';
        document.getElementById('hours').textContent = '00';
        document.getElementById('minutes').textContent = '00';
        document.getElementById('seconds').textContent = '00';
        
        // Розыгрыш завершён
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
        }
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    document.getElementById('days').textContent = String(days).padStart(2, '0');
    document.getElementById('hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
}

// ========================================
// Отрисовка данных
// ========================================

function renderRaffle(raffle) {
    state.raffle = raffle;
    
    // Заголовок
    document.getElementById('raffle-title').textContent = raffle.title;
    document.getElementById('raffle-description').textContent = raffle.description || '';
    
    // Приз
    if (raffle.prize) {
        document.getElementById('prize-section').style.display = 'flex';
        document.getElementById('prize-text').textContent = raffle.prize;
    }
    
    // Статистика
    const available = raffle.total_tickets - raffle.sold_tickets;
    document.getElementById('available-tickets').textContent = available;
    document.getElementById('sold-tickets').textContent = raffle.sold_tickets;
    document.getElementById('winners-count').textContent = raffle.winners_count;
    
    // Прогресс
    const progress = raffle.total_tickets > 0 
        ? (raffle.sold_tickets / raffle.total_tickets) * 100 
        : 0;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-percent').textContent = `${progress.toFixed(1)}%`;
    
    // Кнопки билетов
    renderTicketButtons(raffle.price, available);
    
    // Запускаем таймер
    updateTimer();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(updateTimer, CONFIG.TIMER_INTERVAL);
}

function renderTicketButtons(price, available) {
    const grid = document.getElementById('tickets-grid');
    grid.innerHTML = '';
    
    CONFIG.TICKET_OPTIONS.forEach(count => {
        const btn = document.createElement('button');
        btn.className = 'ticket-btn';
        btn.dataset.count = count;
        
        if (count > available) {
            btn.classList.add('disabled');
        }
        
        if (count === state.selectedTickets && count <= available) {
            btn.classList.add('selected');
        }
        
        const totalPrice = Math.round(price * count);
        
        btn.innerHTML = `
            <span class="ticket-emoji">🎟</span>
            <span class="ticket-count">${count}</span>
            <span class="ticket-price">${totalPrice} ₽</span>
        `;
        
        btn.addEventListener('click', () => selectTickets(count, available));
        
        grid.appendChild(btn);
    });
    
    // Обновляем кнопку покупки
    updateBuyButton(price);
}

function selectTickets(count, available) {
    if (count > available) return;
    
    state.selectedTickets = count;
    
    // Обновляем визуал
    document.querySelectorAll('.ticket-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.dataset.count) === count) {
            btn.classList.add('selected');
        }
    });
    
    // Обновляем кнопку
    updateBuyButton(state.raffle.price);
    
    // Тактильная отдача
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
    }
}

function updateBuyButton(price) {
    const btn = document.getElementById('buy-button');
    const priceEl = document.getElementById('buy-price');
    
    const totalPrice = Math.round(price * state.selectedTickets);
    priceEl.textContent = `${totalPrice} ₽`;
    
    const available = state.raffle.total_tickets - state.raffle.sold_tickets;
    btn.disabled = state.selectedTickets > available || available === 0;
}

function renderMyTickets(tickets) {
    state.myTickets = tickets;
    
    const section = document.getElementById('my-tickets-section');
    const list = document.getElementById('my-tickets-list');
    
    if (tickets.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    list.innerHTML = tickets.map(t => 
        `<span class="my-ticket">#${t.ticket_number}</span>`
    ).join('');
}

// ========================================
// Покупка билетов
// ========================================

async function handlePurchase() {
    if (!state.raffle) return;
    
    const btn = document.getElementById('buy-button');
    btn.disabled = true;
    
    // Тактильная отдача
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
    
    try {
        const result = await initiatePurchase(state.raffle.id, state.selectedTickets);
        
        if (result.success) {
            // Если есть ссылка на оплату - открываем
            if (result.payment_url) {
                window.open(result.payment_url, '_blank');
            } else {
                // Для Telegram Payments - закрываем mini app и открываем оплату в боте
                if (tg) {
                    tg.close();
                }
            }
        } else {
            showError(result.message || 'Ошибка при покупке');
        }
    } catch (error) {
        showError('Не удалось создать платёж. Попробуйте позже.');
    } finally {
        btn.disabled = false;
    }
}

// ========================================
// Частицы фона
// ========================================

function createParticles() {
    const container = document.getElementById('particles');
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particle.style.animationDuration = `${10 + Math.random() * 10}s`;
        container.appendChild(particle);
    }
}

// ========================================
// Инициализация
// ========================================

async function init() {
    // Инициализируем Telegram
    initTelegramApp();
    
    // Создаём частицы
    createParticles();
    
    try {
        // Загружаем данные розыгрыша
        const data = await fetchActiveRaffle();
        
        if (!data || !data.raffle) {
            showNoRaffle();
            hideLoading();
            return;
        }
        
        // Отрисовываем розыгрыш
        renderRaffle(data.raffle);
        
        // Загружаем билеты пользователя
        const tickets = await fetchMyTickets(data.raffle.id);
        renderMyTickets(tickets);
        
        // Скрываем загрузку
        hideLoading();
        
        // Устанавливаем автообновление
        state.refreshInterval = setInterval(async () => {
            try {
                const freshData = await fetchActiveRaffle();
                if (freshData?.raffle) {
                    renderRaffle(freshData.raffle);
                    const freshTickets = await fetchMyTickets(freshData.raffle.id);
                    renderMyTickets(freshTickets);
                }
            } catch (e) {
                console.error('Refresh error:', e);
            }
        }, CONFIG.REFRESH_INTERVAL);
        
    } catch (error) {
        console.error('Init error:', error);
        showNoRaffle();
        hideLoading();
    }
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', init);

// Кнопка покупки
document.getElementById('buy-button').addEventListener('click', handlePurchase);

// Закрытие модалок по клику вне
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
});

// Глобальная функция для закрытия модалок (используется в onclick)
window.closeModal = closeModal;

// Обработка возврата в приложение (если оплата прошла)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.raffle) {
        // Обновляем данные при возврате
        try {
            const data = await fetchActiveRaffle();
            if (data?.raffle) {
                renderRaffle(data.raffle);
                const tickets = await fetchMyTickets(data.raffle.id);
                
                // Проверяем, появились ли новые билеты
                if (tickets.length > state.myTickets.length) {
                    const newCount = tickets.length - state.myTickets.length;
                    const newTickets = tickets.slice(-newCount);
                    const ticketNumbers = newTickets.map(t => `#${t.ticket_number}`).join(', ');
                    
                    showSuccess(`Вам начислено ${newCount} билет(ов): ${ticketNumbers}`);
                    
                    if (tg?.HapticFeedback) {
                        tg.HapticFeedback.notificationOccurred('success');
                    }
                }
                
                renderMyTickets(tickets);
            }
        } catch (e) {
            console.error('Visibility change refresh error:', e);
        }
    }
});
