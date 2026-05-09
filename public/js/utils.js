/* ============================================
   REX CINEMAS - SHARED UTILITIES
   ============================================ */

// ============ API HELPER ============
const API = {
    getToken: () => localStorage.getItem('token'),
    
    headers: (withAuth = false, extraHeaders = {}) => {
        const h = { 'Content-Type': 'application/json', ...extraHeaders };
        if (withAuth) {
            const token = API.getToken();
            if (token) h['Authorization'] = `Bearer ${token}`;
        }
        return h;
    },

    get: async (url, auth = false, extraHeaders = {}) => {
        const res = await fetch(url, { headers: API.headers(auth, extraHeaders) });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
    },

    post: async (url, body, auth = false, extraHeaders = {}) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: API.headers(auth, extraHeaders),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
        return data;
    },

    put: async (url, body, auth = false, extraHeaders = {}) => {
        const res = await fetch(url, {
            method: 'PUT',
            headers: API.headers(auth, extraHeaders),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
        return data;
    },

    delete: async (url, auth = false, extraHeaders = {}) => {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: API.headers(auth, extraHeaders)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
        return data;
    }
};

// ============ TOAST ============
window.showToast = (message, type = 'default') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
};

// ============ FORMAT HELPERS ============
window.formatCurrency = (amount) => {
    return parseInt(amount || 0).toLocaleString('vi-VN') + 'đ';
};

window.formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('vi-VN');
};

window.formatDateTime = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString('vi-VN');
};

window.formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    return timeStr.substring(0, 5);
};

const SEAT_SESSION_KEY = 'rex_seat_session_id';
let seatSessionFallback = null;

window.getSeatSessionId = () => {
    try {
        let id = localStorage.getItem(SEAT_SESSION_KEY);
        if (!id) {
            id = window.crypto?.randomUUID?.() || `seat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            localStorage.setItem(SEAT_SESSION_KEY, id);
        }
        return id;
    } catch (e) {
        if (!seatSessionFallback) {
            seatSessionFallback = window.crypto?.randomUUID?.() || `seat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
        return seatSessionFallback;
    }
};

window.getSeatSessionHeaders = () => ({
    'x-seat-session-id': window.getSeatSessionId()
});

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeRoomType = (roomType) => String(roomType || '').trim().replace(/^\((.*)\)$/, '$1').trim();

window.formatRoomLabel = (roomName, roomType) => {
    const name = String(roomName || '').trim();
    const type = normalizeRoomType(roomType);
    if (!name) return type || '--';
    if (!type) return name;

    const suffixPattern = new RegExp(`\\s*\\(${escapeRegExp(type)}\\)\\s*$`, 'i');
    return suffixPattern.test(name) ? name : `${name} (${type})`;
};

window.formatRoomNameOnly = (roomName, roomType) => {
    const name = String(roomName || '').trim();
    const type = normalizeRoomType(roomType);
    if (!name) return '--';
    if (!type) return name;

    const suffixPattern = new RegExp(`\\s*\\(${escapeRegExp(type)}\\)\\s*$`, 'i');
    return name.replace(suffixPattern, '').trim() || name;
};

// ============ MOBILE MENU ============
window.toggleMobileMenu = () => {
    const nav = document.querySelector('.vue-nav-links');
    const overlay = document.querySelector('.mobile-menu-overlay');
    if (nav) {
        nav.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    }
};

window.closeMobileMenu = () => {
    const nav = document.querySelector('.vue-nav-links');
    const overlay = document.querySelector('.mobile-menu-overlay');
    if (nav) nav.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('menu-open');
};
