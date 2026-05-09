/* ============================================
   REX CINEMAS - AUTHENTICATION MODULE
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Inject Auth Modal
    const modalHTML = `
        <div id="auth-modal" class="modal">
            <div class="modal-content auth-modal-content">
                <span class="close-btn" id="close-auth">&times;</span>
                
                <!-- Login Form -->
                <div id="login-form" class="auth-form active">
                    <div class="auth-header">
                        <div class="auth-icon"></div>
                        <h2>Đăng nhập</h2>
                        <p class="auth-subtitle">Chào mừng trở lại Rex Cinemas</p>
                    </div>
                    <p id="login-error" class="error-msg"></p>
                    <form onsubmit="handleLogin(event)">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="login-email" placeholder="Nhập email của bạn" required>
                        </div>
                        <div class="form-group">
                            <label>Mật khẩu</label>
                            <input type="password" id="login-password" placeholder="Nhập mật khẩu" required>
                        </div>
                        <button type="submit" class="btn-primary btn-full btn-lg" id="login-submit-btn">ĐĂNG NHẬP</button>
                    </form>
                    <p class="auth-switch">Chưa có tài khoản? <a href="#" onclick="toggleAuthForm('register'); return false;">Đăng ký ngay</a></p>
                </div>

                <!-- Register Form -->
                <div id="register-form" class="auth-form">
                    <div class="auth-header">
                        <div class="auth-icon"></div>
                        <h2>Đăng ký</h2>
                        <p class="auth-subtitle">Tạo tài khoản để đặt vé nhanh hơn</p>
                    </div>
                    <p id="register-error" class="error-msg"></p>
                    <form onsubmit="handleRegister(event)">
                        <div class="form-group">
                            <label>Họ và tên</label>
                            <input type="text" id="reg-name" placeholder="Nhập họ và tên" required>
                        </div>
                        <div class="form-group">
                            <label>Số điện thoại</label>
                            <input type="tel" id="reg-phone" placeholder="Nhập số điện thoại">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="reg-email" placeholder="Nhập email" required>
                        </div>
                        <div class="form-group">
                            <label>Mật khẩu</label>
                            <input type="password" id="reg-password" placeholder="Tối thiểu 6 ký tự" required minlength="6">
                        </div>
                        <button type="submit" class="btn-primary btn-full btn-lg" id="register-submit-btn">ĐĂNG KÝ</button>
                    </form>
                    <p class="auth-switch">Đã có tài khoản? <a href="#" onclick="toggleAuthForm('login'); return false;">Đăng nhập</a></p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('auth-modal');
    document.getElementById('close-auth').onclick = () => modal.classList.remove('show');
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('show');
    };
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });

    checkAuthStatus();
});

window.openAuthModal = (formType = 'login') => {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('show');
        toggleAuthForm(formType);
        // Clear previous errors
        const loginErr = document.getElementById('login-error');
        const regErr = document.getElementById('register-error');
        if (loginErr) loginErr.innerText = '';
        if (regErr) regErr.innerText = '';
    }
};

window.toggleAuthForm = (formType) => {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    const form = document.getElementById(`${formType}-form`);
    if (form) form.classList.add('active');
};

window.handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit-btn');
    errorEl.innerText = '';

    btn.disabled = true;
    btn.innerText = 'ĐANG XỬ LÝ...';

    try {
        const data = await API.post('/api/login', { email, password });
        localStorage.setItem('token', data.token);
        document.getElementById('auth-modal').classList.remove('show');
        checkAuthStatus();
        if (window.showToast) showToast(`Xin chào! Đăng nhập thành công.`);
    } catch (error) {
        errorEl.innerText = error.message;
    } finally {
        btn.disabled = false;
        btn.innerText = 'ĐĂNG NHẬP';
    }
};

window.handleRegister = async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('register-error');
    const btn = document.getElementById('register-submit-btn');
    errorEl.innerText = '';

    btn.disabled = true;
    btn.innerText = 'ĐANG XỬ LÝ...';

    try {
        await API.post('/api/register', { full_name: name, phone, email, password });
        if (window.showToast) showToast('Đăng ký thành công! Vui lòng đăng nhập.', 'info');
        toggleAuthForm('login');
        document.getElementById('login-email').value = email;
    } catch (error) {
        errorEl.innerText = error.message;
    } finally {
        btn.disabled = false;
        btn.innerText = 'ĐĂNG KÝ';
    }
};

window.logout = () => {
    localStorage.removeItem('token');
    if (window.showToast) showToast('Đã đăng xuất.', 'info');
    setTimeout(() => window.location.href = '/', 500);
};

async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const navAuth = document.querySelector('.nav-auth');
    if (!navAuth) return;

    if (token) {
        try {
            const user = await API.get('/api/me', true);
            
            const adminBtn = user.role === 'admin' 
                ? `<a href="/admin.html" class="btn-text" style="color: var(--vue-orange);" title="Admin">Admin</a>` 
                : '';

            navAuth.innerHTML = `
                <div class="user-menu">
                    <a href="/profile.html" class="user-profile-link">
                        <span class="user-menu-avatar">${user.name.charAt(0).toUpperCase()}</span>
                        <span class="user-menu-name">${user.name}</span>
                    </a>
                    <div class="user-actions">
                        ${adminBtn}
                        <button onclick="logout()" class="btn-text btn-logout-nav" title="Đăng xuất">Đăng xuất</button>
                    </div>
                </div>
            `;
            // Store user data for other modules
            window.__currentUser = user;
            return;
        } catch (e) {
            localStorage.removeItem('token');
        }
    }

    navAuth.innerHTML = `
        <button class="btn-text" onclick="openAuthModal('login')">Đăng nhập</button>
        <button class="btn btn-sm btn-accent" onclick="openAuthModal('register')">Đăng ký</button>
    `;
}
