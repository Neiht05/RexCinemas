/* ============================================
   REX CINEMAS - PROFILE PAGE
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/'; return; }

    let currentUser = null;

    // ============ LOAD USER INFO ============
    try {
        currentUser = await API.get('/api/me', true);

        document.getElementById('profile-name').innerText = currentUser.name;
        document.getElementById('profile-email').innerText = currentUser.email;
        document.getElementById('user-initials').innerText = currentUser.name.charAt(0).toUpperCase();
        document.getElementById('info-name').value = currentUser.name;
        document.getElementById('info-email').value = currentUser.email;
        if (currentUser.phone) {
            document.getElementById('info-phone').value = currentUser.phone;
        }
        document.getElementById('loyalty-points').innerText = (currentUser.loyalty_points || 0).toLocaleString();

        const levelMap = { silver: 'Bạc', gold: 'Vàng', diamond: 'Kim cương' };
        const nameMap = { silver: 'Thành viên Bạc', gold: 'Thành viên Vàng', diamond: 'Thành viên Kim Cương' };
        const level = (currentUser.membership_level || 'silver').toLowerCase();
        
        document.getElementById('profile-badge').innerText = nameMap[level] || 'Thành viên';
        document.getElementById('profile-badge').className = `badge-member ${level}`;
        document.getElementById('profile-points').innerHTML = `Điểm tích lũy: <strong style="color:var(--vue-orange)">${(currentUser.loyalty_points || 0).toLocaleString()}</strong>`;
        document.getElementById('loyalty-level').innerText = levelMap[level] || 'Bạc';
        document.getElementById('profile-joined').innerText = `Tham gia: ${formatDate(currentUser.created_at)}`;

        if (currentUser.role === 'admin') {
            document.getElementById('admin-link').style.display = 'block';
        }
    } catch (e) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return;
    }

    // ============ LOAD BOOKINGS ============
    await loadBookings();

    async function loadBookings() {
        const grid = document.getElementById('booking-history');
        try {
            const bookings = await API.get('/api/me/bookings', true);
            document.getElementById('loyalty-bookings').innerText = bookings.length;

            if (bookings.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-icon"></div>
                        <p>Bạn chưa có lịch sử đặt vé nào.</p>
                        <a href="/" class="btn-vue-outline" style="display:inline-block; padding:12px 30px; text-decoration:none;">XEM PHIM NGAY</a>
                    </div>
                `;
                return;
            }

            grid.innerHTML = bookings.map(b => `
                <div class="booking-card" onclick='showTicket(${JSON.stringify(b).replace(/'/g, "&#39;")})'>
                    <div class="booking-card-poster">
                        <img src="${b.poster_url || ''}" alt="${b.title}" onerror="this.style.display='none'">
                    </div>
                    <div class="booking-main">
                        <h3>${b.title}</h3>
                        <p>${formatDate(b.show_date)} · ${formatTime(b.start_time)} · ${b.room_name}</p>
                        <p style="margin-top:4px; font-size:11px; color:#555;">${b.theater_name || ''} · Đặt: ${formatDateTime(b.booking_time)}</p>
                        <p style="margin-top:4px; font-size:11px; color:#777;">Ghế: ${b.seat_names || 'N/A'}</p>
                    </div>
                    <div class="booking-status ${b.status}">${b.status === 'paid' ? 'Đã thanh toán' : b.status === 'cancelled' ? 'Đã hủy' : 'Đang xử lý'}</div>
                    <div class="booking-price">
                        <strong>${formatCurrency(b.total_amount)}</strong>
                        <p style="font-size:11px; color:#555; margin-top:5px; font-family:var(--mont);">#REX-${b.id}</p>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            grid.innerHTML = '<p class="empty-state">Không thể tải lịch sử đặt vé.</p>';
        }
    }

    // ============ TABS ============
    window.showTab = (tab, btn) => {
        document.querySelectorAll('.profile-tab').forEach(t => t.style.display = 'none');
        document.querySelectorAll('.profile-nav a').forEach(a => a.classList.remove('active'));
        document.getElementById(`tab-${tab}`).style.display = 'block';
        if (btn) btn.classList.add('active');
    };

    // ============ CHANGE PASSWORD (Real API) ============
    window.handleChangePassword = async (e) => {
        e.preventDefault();
        const current = document.getElementById('current-password').value;
        const newPw = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-password').value;

        if (newPw !== confirm) { showToast('Mật khẩu mới không khớp!', 'error'); return; }
        if (newPw.length < 6) { showToast('Mật khẩu phải có ít nhất 6 ký tự!', 'error'); return; }

        try {
            await API.put('/api/me/password', {
                current_password: current,
                new_password: newPw
            }, true);
            showToast('Đổi mật khẩu thành công!');
            e.target.reset();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // ============ TICKET MODAL ============
    window.showTicket = (booking) => {
        const modal = document.getElementById('ticket-modal');
        document.getElementById('ticket-id').innerText = `#REX-${booking.id}`;
        document.getElementById('ticket-movie').innerText = booking.title;
        document.getElementById('ticket-date').innerText = formatDate(booking.show_date);
        document.getElementById('ticket-time').innerText = formatTime(booking.start_time);
        document.getElementById('ticket-room').innerText = booking.room_name;
        document.getElementById('ticket-seats').innerText = booking.seat_names || 'N/A';
        document.getElementById('ticket-theater').innerText = booking.theater_name || '';
        document.getElementById('ticket-amount').innerText = formatCurrency(booking.total_amount);

        const qrData = encodeURIComponent(JSON.stringify({ 
            id: booking.id, 
            movie: booking.title, 
            seats: booking.seat_names,
            date: booking.show_date,
            time: booking.start_time
        }));
        document.getElementById('ticket-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;
        modal.classList.add('show');
    };

    document.getElementById('close-ticket')?.addEventListener('click', () => {
        document.getElementById('ticket-modal').classList.remove('show');
    });
    document.getElementById('ticket-modal')?.addEventListener('click', e => {
        if (e.target.id === 'ticket-modal') document.getElementById('ticket-modal').classList.remove('show');
    });
});
