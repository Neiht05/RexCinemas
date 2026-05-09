/* ============================================
   REX CINEMAS - ADMIN DASHBOARD
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/'; return; }

    // Verify admin access
    try {
        const user = await API.get('/api/me', true);
        if (user.role !== 'admin') {
            showToast('Bạn không có quyền truy cập!', 'error');
            window.location.href = '/profile.html';
            return;
        }
        document.getElementById('admin-user-name').innerText = user.name;
    } catch (e) {
        window.location.href = '/';
        return;
    }

    // Current active section
    let activeSection = 'dashboard';

    // ============ SIDEBAR NAV ============
    window.showAdminSection = (section, btn) => {
        activeSection = section;
        document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
        if (btn) btn.classList.add('active');
        document.getElementById(`panel-${section}`).style.display = 'block';

        // Load data for the section
        switch (section) {
            case 'dashboard': (window.loadDashboard || loadDashboard)(); break;
            case 'movies': loadMovies(); break;
            case 'theaters': loadTheaters(); break;
            case 'showtimes': loadShowtimes(); break;
            case 'snacks': loadSnacks(); break;
            case 'bookings': loadBookings(); break;
            case 'users': loadUsers(); break;
            case 'reviews': loadReviews(); break;
            case 'events': loadEvents(); break;
            case 'articles': loadArticles(); break;
            case 'media': loadMedia(); break;
        }
    };

    // ============ DASHBOARD ============
    // NOTE: The enhanced version in admin-dashboard.js overrides window.loadDashboard
    async function loadDashboard() {
        // If admin-dashboard.js has loaded an enhanced version, use that
        if (typeof window.loadDashboard === 'function' && window.loadDashboard !== loadDashboard) {
            return window.loadDashboard();
        }
        // Fallback basic implementation
        try {
            const stats = await API.get('/api/admin/stats', true);
            const revEl = document.getElementById('stat-revenue');
            if (revEl) revEl.innerText = formatCurrency(stats.revenue);
            const tkEl = document.getElementById('stat-tickets');
            if (tkEl) tkEl.innerText = (stats.tickets || 0).toLocaleString();
            const usEl = document.getElementById('stat-users');
            if (usEl) usEl.innerText = (stats.users || stats.uniqueCustomers || 0).toLocaleString();
            const mvEl = document.getElementById('stat-movies');
            if (mvEl) mvEl.innerText = (stats.movies || 0).toLocaleString();
            const aovEl = document.getElementById('stat-aov');
            if (aovEl) aovEl.innerText = formatCurrency(stats.averageOrderValue || 0);
            const revSubEl = document.getElementById('stat-revenue-sub');
            if (revSubEl) revSubEl.innerText = stats.revenuePreviousPeriod ? `Kỳ trước: ${formatCurrency(stats.revenuePreviousPeriod)}` : 'So với kỳ trước';
            const trendEl = document.getElementById('kpi-trend-revenue');
            if (trendEl && stats.revenueTrendPercent != null) {
                const isUp = Number(stats.revenueTrendPercent) >= 0;
                trendEl.className = `kpi-trend ${isUp ? 'up' : 'down'}`;
                trendEl.innerText = `${isUp ? '▲' : '▼'} ${Math.abs(Number(stats.revenueTrendPercent)).toFixed(1)}%`;
            }
            const insightTotal = document.getElementById('insight-total-orders');
            if (insightTotal) insightTotal.innerText = (stats.totalOrders || 0).toLocaleString();
            const insightPaid = document.getElementById('insight-paid-orders');
            if (insightPaid) insightPaid.innerText = (stats.paidOrders || 0).toLocaleString();
            const insightPending = document.getElementById('insight-pending-orders');
            if (insightPending) insightPending.innerText = (stats.pendingOrders || 0).toLocaleString();
            const insightCancelled = document.getElementById('insight-cancelled-orders');
            if (insightCancelled) insightCancelled.innerText = (stats.cancelledOrders || 0).toLocaleString();
            const insightRate = document.getElementById('insight-completion-rate');
            if (insightRate) insightRate.innerText = `${Number(stats.completionRate || 0).toFixed(1)}%`;
        } catch (e) {
            showToast('Không thể tải thống kê.', 'error');
        }
    }

    // ============ MOVIES MANAGEMENT ============
    async function loadMovies() {
        try {
            const movies = await API.get('/api/admin/movies', true);
            const tbody = document.getElementById('movies-table-body');
            tbody.innerHTML = movies.map(m => `
                <tr>
                    <td><img src="${m.poster_url || ''}" class="table-poster" onerror="this.style.display='none'"></td>
                    <td><strong>${m.title}</strong><br><small style="color:#666">${m.slug}</small></td>
                    <td>${m.genre ? formatGenreVi(m.genre) : '-'}</td>
                    <td>${m.duration_minutes || 0} phút</td>
                    <td><span class="status-badge ${m.status}">${m.status === 'now_showing' ? 'Đang chiếu' : 'Sắp chiếu'}</span></td>
                    <td>${m.showtime_count || 0}</td>
                    <td>
                        <button class="btn-action edit" onclick="editMovie(${m.id})">Sửa</button>
                        <button class="btn-action delete" onclick="deleteMovie(${m.id}, '${m.title.replace(/'/g, "\\'")}')">Xóa</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải danh sách phim.', 'error'); }
    }

    window.showAddMovieModal = () => {
        document.getElementById('movie-modal-title').innerText = 'THÊM PHIM MỚI';
        document.getElementById('movie-form').reset();
        document.getElementById('movie-form').dataset.editId = '';
        document.getElementById('movie-modal').classList.add('show');
    };

    window.editMovie = async (id) => {
        try {
            const movies = await API.get('/api/admin/movies', true);
            const movie = movies.find(m => m.id === id);
            if (!movie) return;

            document.getElementById('movie-modal-title').innerText = 'SỬA THÔNG TIN PHIM';
            document.getElementById('movie-form').dataset.editId = id;
            document.getElementById('m-title').value = movie.title;
            document.getElementById('m-description').value = movie.description || '';
            document.getElementById('m-poster').value = movie.poster_url || '';
            document.getElementById('m-backdrop').value = movie.backdrop_url || '';
            document.getElementById('m-trailer').value = movie.trailer_url || '';
            
            const filterMap = {
                'action': ['action', 'hành động'], 'drama': ['drama', 'tâm lý', 'chính kịch'],
                'comedy': ['comedy', 'hài'], 'horror': ['horror', 'kinh dị', 'kinh di'],
                'animation': ['animation', 'hoạt hình'], 'scifi': ['scifi', 'sci-fi', 'viễn tưởng']
            };
            const genresArr = (movie.genre || '').toLowerCase();
            document.querySelectorAll('#m-genre-container input[type="checkbox"]').forEach(cb => {
                const allowed = filterMap[cb.value] || [cb.value];
                cb.checked = allowed.some(keyword => genresArr.includes(keyword));
            });

            document.getElementById('m-duration').value = movie.duration_minutes || '';
            document.getElementById('m-director').value = movie.director || '';
            document.getElementById('m-cast').value = movie.cast_members || '';
            document.getElementById('m-release').value = movie.release_date || '';
            document.getElementById('m-age').value = movie.age_rating || 'P';
            document.getElementById('m-status').value = movie.status || 'now_showing';
            document.getElementById('m-featured').checked = !!movie.is_featured;
            document.getElementById('movie-modal').classList.add('show');
        } catch (e) { showToast('Lỗi tải thông tin phim.', 'error'); }
    };

    window.submitMovieForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('movie-form').dataset.editId;
        const data = {
            title: document.getElementById('m-title').value,
            description: document.getElementById('m-description').value,
            poster_url: document.getElementById('m-poster').value,
            backdrop_url: document.getElementById('m-backdrop').value,
            trailer_url: document.getElementById('m-trailer').value,
            genre: Array.from(document.querySelectorAll('#m-genre-container input[type="checkbox"]:checked')).map(cb => cb.value).join(','),
            director: document.getElementById('m-director').value,
            cast_members: document.getElementById('m-cast').value,
            duration_minutes: parseInt(document.getElementById('m-duration').value) || 0,
            release_date: document.getElementById('m-release').value,
            age_rating: document.getElementById('m-age').value,
            status: document.getElementById('m-status').value,
            is_featured: document.getElementById('m-featured').checked
        };

        try {
            if (editId) {
                await API.put(`/api/admin/movies/${editId}`, data, true);
                showToast('Cập nhật phim thành công!');
            } else {
                await API.post('/api/admin/movies', data, true);
                showToast('Thêm phim thành công!');
            }
            document.getElementById('movie-modal').classList.remove('show');
            loadMovies();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    window.deleteMovie = async (id, title) => {
        if (!confirm(`Bạn chắc chắn muốn xóa phim "${title}"?`)) return;
        try {
            await API.delete(`/api/admin/movies/${id}`, true);
            showToast('Xóa phim thành công!');
            loadMovies();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ THEATERS MANAGEMENT ============
    async function loadTheaters() {
        try {
            const theaters = await API.get('/api/admin/theaters', true);
            const rooms = await API.get('/api/admin/rooms', true);
            const tbody = document.getElementById('theaters-table-body');
            
            tbody.innerHTML = theaters.map(t => {
                const theaterRooms = rooms.filter(r => r.theater_id === t.id);
                return `
                    <tr>
                        <td><strong>${t.name}</strong></td>
                        <td>${t.address}</td>
                        <td>${t.hotline || '-'}</td>
                        <td>${t.room_count || 0} phòng</td>
                        <td>
                            <button class="btn-action edit" onclick="editTheater(${t.id})">Sửa</button>
                            <button class="btn-action delete" onclick="deleteTheater(${t.id}, '${t.name.replace(/'/g, "\\'")}')">Xóa</button>
                        </td>
                    </tr>
                    ${theaterRooms.map(r => `
                    <tr class="room-row">
                        <td style="padding-left:30px;">↳ ${r.name}</td>
                        <td>${r.room_type}</td>
                        <td>${r.seat_count || 0} ghế</td>
                        <td></td>
                        <td><button class="btn-action delete" onclick="deleteRoom(${r.id})">Xóa</button></td>
                    </tr>
                    `).join('')}
                `;
            }).join('');
        } catch (e) { showToast('Không thể tải danh sách rạp.', 'error'); }
    }

    window.showAddTheaterModal = () => {
        document.getElementById('theater-modal-title').innerText = 'THÊM RẠP MỚI';
        document.getElementById('theater-form').reset();
        document.getElementById('theater-form').dataset.editId = '';
        document.getElementById('theater-modal').classList.add('show');
    };

    window.editTheater = async (id) => {
        try {
            const theaters = await API.get('/api/admin/theaters', true);
            const theater = theaters.find(t => t.id === id);
            if (!theater) return;
            
            document.getElementById('theater-modal-title').innerText = 'SỬA THÔNG TIN RẠP';
            document.getElementById('theater-form').dataset.editId = id;
            document.getElementById('t-name').value = theater.name;
            document.getElementById('t-address').value = theater.address;
            document.getElementById('t-hotline').value = theater.hotline || '';
            document.getElementById('theater-modal').classList.add('show');
        } catch (e) { showToast('Lỗi tải thông tin rạp.', 'error'); }
    };

    window.submitTheaterForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('theater-form').dataset.editId;
        const data = {
            name: document.getElementById('t-name').value,
            address: document.getElementById('t-address').value,
            hotline: document.getElementById('t-hotline').value
        };

        try {
            if (editId) {
                await API.put(`/api/admin/theaters/${editId}`, data, true);
                showToast('Cập nhật rạp thành công!');
            } else {
                await API.post('/api/admin/theaters', data, true);
                showToast('Thêm rạp thành công!');
            }
            document.getElementById('theater-modal').classList.remove('show');
            loadTheaters();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteTheater = async (id, name) => {
        if (!confirm(`Bạn chắc chắn muốn xóa rạp "${name}" và tất cả phòng chiếu?`)) return;
        try {
            await API.delete(`/api/admin/theaters/${id}`, true);
            showToast('Xóa rạp thành công!');
            loadTheaters();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.showAddRoomModal = () => {
        document.getElementById('room-form').reset();
        document.getElementById('room-modal').classList.add('show');
        loadTheaterOptions('r-theater');
    };

    window.submitRoomForm = async (e) => {
        e.preventDefault();
        const data = {
            theater_id: parseInt(document.getElementById('r-theater').value),
            name: document.getElementById('r-name').value,
            room_type: document.getElementById('r-type').value,
            rows: document.getElementById('r-rows').value,
            cols: document.getElementById('r-cols').value,
            vip_rows: document.getElementById('r-vip').value,
            couple_rows: document.getElementById('r-couple').value
        };

        try {
            await API.post('/api/admin/rooms', data, true);
            showToast('Thêm phòng chiếu thành công!');
            document.getElementById('room-modal').classList.remove('show');
            loadTheaters();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteRoom = async (id) => {
        if (!confirm('Bạn chắc chắn muốn xóa phòng chiếu này?')) return;
        try {
            await API.delete(`/api/admin/rooms/${id}`, true);
            showToast('Xóa phòng chiếu thành công!');
            loadTheaters();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ SHOWTIMES MANAGEMENT ============
    async function loadShowtimes() {
        try {
            const showtimes = await API.get('/api/admin/showtimes', true);
            const tbody = document.getElementById('showtimes-table-body');
            tbody.innerHTML = showtimes.map(s => `
                <tr>
                    <td><strong>${s.movie_title}</strong></td>
                    <td>${s.theater_name} — ${s.room_name}</td>
                    <td>${formatDate(s.show_date)}</td>
                    <td>${formatTime(s.start_time)}${s.end_time ? ' - ' + formatTime(s.end_time) : ''}</td>
                    <td>${formatCurrency(s.base_price)}</td>
                    <td>${s.tickets_sold || 0} vé</td>
                    <td>
                        <button class="btn-action delete" onclick="deleteShowtime(${s.id})">Xóa</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải suất chiếu.', 'error'); }
    }

    window.showAddShowtimeModal = () => {
        document.getElementById('showtime-form').reset();
        document.getElementById('showtime-modal').classList.add('show');
        loadMovieOptions('st-movie');
        loadRoomOptions('st-room');
    };

    function calculateEndTime() {
        const movieSelect = document.getElementById('st-movie');
        const startInput = document.getElementById('st-start');
        const endInput = document.getElementById('st-end');

        if(movieSelect.value && startInput.value) {
            const selectedOption = movieSelect.options[movieSelect.selectedIndex];
            const duration = parseInt(selectedOption.getAttribute('data-duration') || '0', 10);
            
            if (duration > 0) {
                const [startH, startM] = startInput.value.split(':').map(Number);
                const totalMins = startM + duration;
                const endH = (startH + Math.floor(totalMins / 60)) % 24;
                const endM = totalMins % 60;
                
                endInput.value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            }
        }
    }

    document.getElementById('st-movie').addEventListener('change', calculateEndTime);
    document.getElementById('st-start').addEventListener('change', calculateEndTime);
    document.getElementById('st-start').addEventListener('input', calculateEndTime);

    window.submitShowtimeForm = async (e) => {
        e.preventDefault();
        const data = {
            movie_id: parseInt(document.getElementById('st-movie').value),
            room_id: parseInt(document.getElementById('st-room').value),
            show_date: document.getElementById('st-date').value,
            start_time: document.getElementById('st-start').value,
            end_time: document.getElementById('st-end').value,
            base_price: parseFloat(document.getElementById('st-price').value)
        };

        try {
            await API.post('/api/admin/showtimes', data, true);
            showToast('Thêm suất chiếu thành công!');
            document.getElementById('showtime-modal').classList.remove('show');
            loadShowtimes();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteShowtime = async (id) => {
        if (!confirm('Bạn chắc chắn muốn xóa suất chiếu này?')) return;
        try {
            await API.delete(`/api/admin/showtimes/${id}`, true);
            showToast('Xóa suất chiếu thành công!');
            loadShowtimes();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ SNACKS MANAGEMENT ============
    async function loadSnacks() {
        try {
            const snacks = await API.get('/api/admin/snacks', true);
            const tbody = document.getElementById('snacks-table-body');
            tbody.innerHTML = snacks.map(s => `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td><img src="${s.image_url || ''}" class="table-poster" style="height:50px; width:50px; object-fit:cover; border-radius:4px;" onerror="this.style.display='none'"></td>
                    <td>${formatCurrency(s.price)}</td>
                    <td>${s.description || '-'}</td>
                    <td>
                        <button class="btn-action edit" onclick="editSnack(${s.id})">Sửa</button>
                        <button class="btn-action delete" onclick="deleteSnack(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Xóa</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải combo bắp nước.', 'error'); }
    }

    window.showAddSnackModal = () => {
        document.getElementById('snack-modal-title').innerText = 'THÊM COMBO BẮP NƯỚC';
        document.getElementById('snack-form').reset();
        document.getElementById('snack-form').dataset.editId = '';
        document.getElementById('snack-modal').classList.add('show');
    };

    window.editSnack = async (id) => {
        try {
            const snacks = await API.get('/api/admin/snacks', true);
            const snack = snacks.find(s => s.id === id);
            if (!snack) return;

            document.getElementById('snack-modal-title').innerText = 'SỬA COMBO BẮP NƯỚC';
            document.getElementById('snack-form').dataset.editId = id;
            document.getElementById('sn-name').value = snack.name;
            document.getElementById('sn-image').value = snack.image_url || '';
            document.getElementById('sn-price').value = snack.price;
            document.getElementById('sn-description').value = snack.description || '';
            document.getElementById('snack-modal').classList.add('show');
        } catch (e) { showToast('Lỗi tải thông tin combo.', 'error'); }
    };

    window.submitSnackForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('snack-form').dataset.editId;
        const data = {
            name: document.getElementById('sn-name').value,
            image_url: document.getElementById('sn-image').value,
            price: parseFloat(document.getElementById('sn-price').value) || 0,
            description: document.getElementById('sn-description').value
        };

        try {
            if (editId) {
                await API.put(`/api/admin/snacks/${editId}`, data, true);
                showToast('Cập nhật combo thành công!');
            } else {
                await API.post('/api/admin/snacks', data, true);
                showToast('Thêm combo thành công!');
            }
            document.getElementById('snack-modal').classList.remove('show');
            loadSnacks();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteSnack = async (id, name) => {
        if (!confirm(`Bạn chắc chắn muốn xóa combo "${name}"?`)) return;
        try {
            await API.delete(`/api/admin/snacks/${id}`, true);
            showToast('Xóa combo thành công!');
            loadSnacks();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ BOOKINGS ============
    async function loadBookings() {
        try {
            const bookings = await API.get('/api/admin/bookings', true);
            const tbody = document.getElementById('bookings-table-body');
            tbody.innerHTML = bookings.map(b => `
                <tr>
                    <td>#REX-${b.id}</td>
                    <td>${b.user_name}<br><small style="color:#666">${b.user_email}</small></td>
                    <td><strong>${b.movie_title}</strong></td>
                    <td>${formatDate(b.show_date)} ${formatTime(b.start_time)}</td>
                    <td>${b.seat_names || '-'}</td>
                    <td>${formatCurrency(b.total_amount)}</td>
                    <td><span class="status-badge ${b.status}">${b.status === 'paid' ? 'Đã TT' : b.status === 'cancelled' ? 'Đã hủy' : 'Chờ'}</span></td>
                    <td>
                        ${b.status === 'paid' ? `<button class="btn-action delete" onclick="cancelBooking(${b.id})">Hủy</button>` : ''}
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải đơn hàng.', 'error'); }
    }

    window.cancelBooking = async (id) => {
        if (!confirm(`Bạn chắc chắn muốn hủy đơn hàng #REX-${id}?`)) return;
        try {
            await API.put(`/api/admin/bookings/${id}/cancel`, {}, true);
            showToast('Đã hủy đơn hàng.');
            loadBookings();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ USERS ============
    async function loadUsers() {
        try {
            const users = await API.get('/api/admin/users', true);
            const tbody = document.getElementById('users-table-body');
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.id}</td>
                    <td><strong>${u.full_name}</strong></td>
                    <td>${u.email}</td>
                    <td>${u.phone || '-'}</td>
                    <td><span class="status-badge ${u.role}">${u.role === 'admin' ? 'Admin' : 'Khách hàng'}</span></td>
                    <td><span class="badge-member ${(u.membership_level || 'silver').toLowerCase()}">${u.membership_level || 'Silver'}</span></td>
                    <td>${(u.loyalty_points || 0).toLocaleString()}</td>
                    <td>${u.booking_count || 0} đơn</td>
                    <td>${formatCurrency(u.total_spent)}</td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải danh sách người dùng.', 'error'); }
    }

    // ============ REVIEWS ============
    async function loadReviews() {
        try {
            const reviews = await API.get('/api/admin/reviews', true);
            const tbody = document.getElementById('reviews-table-body');

            if (!reviews.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; color:#777;">Chưa có đánh giá nào.</td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = reviews.map(r => `
                <tr>
                    <td>${r.id}</td>
                    <td>
                        <strong>${r.movie_title}</strong><br>
                        <small style="color:#666">${r.movie_slug}</small>
                    </td>
                    <td>
                        ${r.user_name}<br>
                        <small style="color:#666">${r.user_email}</small>
                    </td>
                    <td>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
                    <td style="max-width:360px; white-space:normal; line-height:1.6;">${r.comment || '<span style="color:#666;">Không có nội dung</span>'}</td>
                    <td>${formatDateTime(r.created_at)}</td>
                    <td>
                        <button class="btn-action delete" onclick="deleteReview(${r.id})">Xóa</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Không thể tải danh sách đánh giá.', 'error'); }
    }

    window.deleteReview = async (id) => {
        if (!confirm(`Bạn chắc chắn muốn xóa đánh giá #${id}?`)) return;
        try {
            await API.delete(`/api/admin/reviews/${id}`, true);
            showToast('Xóa đánh giá thành công!');
            loadReviews();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ EVENTS ============
    async function loadEvents() {
        try {
            const events = await API.get('/api/admin/events', true);
            const tbody = document.getElementById('events-table-body');
            tbody.innerHTML = events.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td><strong>${item.title}</strong>${item.accent_text ? `<br><small style="color:#666">${item.accent_text}</small>` : ''}</td>
                    <td>${item.tag || '-'}</td>
                    <td>${item.layout === 'text_right' ? 'Ảnh trái - text phải' : 'Text trái - ảnh phải'}</td>
                    <td>${item.sort_order || 0}</td>
                    <td><span class="status-badge ${item.is_active ? 'paid' : 'cancelled'}">${item.is_active ? 'Hiện' : 'Ẩn'}</span></td>
                    <td>
                        <button class="btn-action edit" onclick="editEvent(${item.id})">Sửa</button>
                        <button class="btn-action delete" onclick="deleteEvent(${item.id})">Xóa</button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="7" style="text-align:center; color:#777;">Chưa có sự kiện nào.</td></tr>`;
        } catch (e) { showToast('Không thể tải sự kiện.', 'error'); }
    }

    window.showAddEventModal = () => {
        document.getElementById('event-modal-title').innerText = 'THÊM SỰ KIỆN';
        document.getElementById('event-form').reset();
        document.getElementById('event-form').dataset.editId = '';
        document.getElementById('ev-active').checked = true;
        document.getElementById('event-modal').classList.add('show');
    };

    window.editEvent = async (id) => {
        try {
            const events = await API.get('/api/admin/events', true);
            const item = events.find(event => event.id === id);
            if (!item) return;
            document.getElementById('event-modal-title').innerText = 'SỬA SỰ KIỆN';
            document.getElementById('event-form').dataset.editId = id;
            document.getElementById('ev-title').value = item.title || '';
            document.getElementById('ev-accent').value = item.accent_text || '';
            document.getElementById('ev-tag').value = item.tag || '';
            document.getElementById('ev-description').value = item.description || '';
            document.getElementById('ev-button-text').value = item.button_text || '';
            document.getElementById('ev-button-link').value = item.button_link || '';
            document.getElementById('ev-image-url').value = item.image_url || '';
            document.getElementById('ev-layout').value = item.layout || 'text_left';
            document.getElementById('ev-sort-order').value = item.sort_order || 0;
            document.getElementById('ev-active').checked = !!item.is_active;
            document.getElementById('event-modal').classList.add('show');
        } catch (e) { showToast('Không thể tải dữ liệu sự kiện.', 'error'); }
    };

    window.submitEventForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('event-form').dataset.editId;
        const data = {
            title: document.getElementById('ev-title').value,
            accent_text: document.getElementById('ev-accent').value,
            tag: document.getElementById('ev-tag').value,
            description: document.getElementById('ev-description').value,
            button_text: document.getElementById('ev-button-text').value,
            button_link: document.getElementById('ev-button-link').value,
            image_url: document.getElementById('ev-image-url').value,
            layout: document.getElementById('ev-layout').value,
            sort_order: parseInt(document.getElementById('ev-sort-order').value) || 0,
            is_active: document.getElementById('ev-active').checked
        };

        try {
            if (editId) {
                await API.put(`/api/admin/events/${editId}`, data, true);
                showToast('Cập nhật sự kiện thành công!');
            } else {
                await API.post('/api/admin/events', data, true);
                showToast('Thêm sự kiện thành công!');
            }
            document.getElementById('event-modal').classList.remove('show');
            loadEvents();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteEvent = async (id) => {
        if (!confirm(`Bạn chắc chắn muốn xóa sự kiện #${id}?`)) return;
        try {
            await API.delete(`/api/admin/events/${id}`, true);
            showToast('Xóa sự kiện thành công!');
            loadEvents();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ ARTICLES ============
    async function loadArticles() {
        try {
            const articles = await API.get('/api/admin/articles', true);
            const tbody = document.getElementById('articles-table-body');
            tbody.innerHTML = articles.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td><img src="${item.image_url || ''}" class="table-poster" style="height:50px; width:70px; object-fit:cover;" onerror="this.style.display='none'"></td>
                    <td style="max-width:360px; white-space:normal; line-height:1.6;"><strong>${item.title}</strong></td>
                    <td>${item.category_label || '-'}</td>
                    <td>${item.published_date ? formatDate(item.published_date) : '-'}</td>
                    <td>${item.sort_order || 0}</td>
                    <td><span class="status-badge ${item.is_active ? 'paid' : 'cancelled'}">${item.is_active ? 'Hiện' : 'Ẩn'}</span></td>
                    <td>
                        <button class="btn-action edit" onclick="editArticle(${item.id})">Sửa</button>
                        <button class="btn-action delete" onclick="deleteArticle(${item.id})">Xóa</button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="8" style="text-align:center; color:#777;">Chưa có bài viết nào.</td></tr>`;
        } catch (e) { showToast('Không thể tải bài viết.', 'error'); }
    }

    window.showAddArticleModal = () => {
        document.getElementById('article-modal-title').innerText = 'THÊM BÀI VIẾT';
        document.getElementById('article-form').reset();
        document.getElementById('article-form').dataset.editId = '';
        document.getElementById('ar-active').checked = true;
        document.getElementById('article-modal').classList.add('show');
    };

    window.editArticle = async (id) => {
        try {
            const articles = await API.get('/api/admin/articles', true);
            const item = articles.find(article => article.id === id);
            if (!item) return;
            document.getElementById('article-modal-title').innerText = 'SỬA BÀI VIẾT';
            document.getElementById('article-form').dataset.editId = id;
            document.getElementById('ar-title').value = item.title || '';
            document.getElementById('ar-category').value = item.category_label || '';
            document.getElementById('ar-date').value = item.published_date || '';
            document.getElementById('ar-image-url').value = item.image_url || '';
            document.getElementById('ar-link-url').value = item.link_url || '#';
            document.getElementById('ar-sort-order').value = item.sort_order || 0;
            document.getElementById('ar-active').checked = !!item.is_active;
            document.getElementById('article-modal').classList.add('show');
        } catch (e) { showToast('Không thể tải dữ liệu bài viết.', 'error'); }
    };

    window.submitArticleForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('article-form').dataset.editId;
        const data = {
            title: document.getElementById('ar-title').value,
            category_label: document.getElementById('ar-category').value,
            image_url: document.getElementById('ar-image-url').value,
            published_date: document.getElementById('ar-date').value,
            link_url: document.getElementById('ar-link-url').value,
            sort_order: parseInt(document.getElementById('ar-sort-order').value) || 0,
            is_active: document.getElementById('ar-active').checked
        };

        try {
            if (editId) {
                await API.put(`/api/admin/articles/${editId}`, data, true);
                showToast('Cập nhật bài viết thành công!');
            } else {
                await API.post('/api/admin/articles', data, true);
                showToast('Thêm bài viết thành công!');
            }
            document.getElementById('article-modal').classList.remove('show');
            loadArticles();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteArticle = async (id) => {
        if (!confirm(`Bạn chắc chắn muốn xóa bài viết #${id}?`)) return;
        try {
            await API.delete(`/api/admin/articles/${id}`, true);
            showToast('Xóa bài viết thành công!');
            loadArticles();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ MEDIA ============
    async function loadMedia() {
        try {
            const items = await API.get('/api/admin/media', true);
            const tbody = document.getElementById('media-table-body');
            tbody.innerHTML = items.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td><img src="${item.thumbnail_url || ''}" class="table-poster" style="height:50px; width:70px; object-fit:cover;" onerror="this.style.display='none'"></td>
                    <td style="max-width:260px; white-space:normal; line-height:1.6;"><strong>${item.title}</strong></td>
                    <td>${item.media_type === 'clip' ? 'Clip' : 'Trailer'}</td>
                    <td style="max-width:280px; white-space:normal; line-height:1.6;">${item.video_url || '-'}</td>
                    <td>${item.sort_order || 0}</td>
                    <td><span class="status-badge ${item.is_active ? 'paid' : 'cancelled'}">${item.is_active ? 'Hiện' : 'Ẩn'}</span></td>
                    <td>
                        <button class="btn-action edit" onclick="editMedia(${item.id})">Sửa</button>
                        <button class="btn-action delete" onclick="deleteMedia(${item.id})">Xóa</button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="8" style="text-align:center; color:#777;">Chưa có trailer/clip nào.</td></tr>`;
        } catch (e) { showToast('Không thể tải trailer/clip.', 'error'); }
    }

    window.showAddMediaModal = () => {
        document.getElementById('media-modal-title').innerText = 'THÊM TRAILER / CLIP';
        document.getElementById('media-form').reset();
        document.getElementById('media-form').dataset.editId = '';
        document.getElementById('md-active').checked = true;
        document.getElementById('media-modal').classList.add('show');
    };

    window.editMedia = async (id) => {
        try {
            const items = await API.get('/api/admin/media', true);
            const item = items.find(media => media.id === id);
            if (!item) return;
            document.getElementById('media-modal-title').innerText = 'SỬA TRAILER / CLIP';
            document.getElementById('media-form').dataset.editId = id;
            document.getElementById('md-title').value = item.title || '';
            document.getElementById('md-type').value = item.media_type || 'trailer';
            document.getElementById('md-thumbnail-url').value = item.thumbnail_url || '';
            document.getElementById('md-video-url').value = item.video_url || '';
            document.getElementById('md-sort-order').value = item.sort_order || 0;
            document.getElementById('md-active').checked = !!item.is_active;
            document.getElementById('media-modal').classList.add('show');
        } catch (e) { showToast('Không thể tải dữ liệu trailer/clip.', 'error'); }
    };

    window.submitMediaForm = async (e) => {
        e.preventDefault();
        const editId = document.getElementById('media-form').dataset.editId;
        const data = {
            title: document.getElementById('md-title').value,
            media_type: document.getElementById('md-type').value,
            thumbnail_url: document.getElementById('md-thumbnail-url').value,
            video_url: document.getElementById('md-video-url').value,
            sort_order: parseInt(document.getElementById('md-sort-order').value) || 0,
            is_active: document.getElementById('md-active').checked
        };

        try {
            if (editId) {
                await API.put(`/api/admin/media/${editId}`, data, true);
                showToast('Cập nhật trailer/clip thành công!');
            } else {
                await API.post('/api/admin/media', data, true);
                showToast('Thêm trailer/clip thành công!');
            }
            document.getElementById('media-modal').classList.remove('show');
            loadMedia();
        } catch (err) { showToast(err.message, 'error'); }
    };

    window.deleteMedia = async (id) => {
        if (!confirm(`Bạn chắc chắn muốn xóa mục #${id}?`)) return;
        try {
            await API.delete(`/api/admin/media/${id}`, true);
            showToast('Xóa trailer/clip thành công!');
            loadMedia();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // ============ HELPERS ============
    async function loadTheaterOptions(selectId) {
        try {
            const theaters = await API.get('/api/admin/theaters', true);
            const sel = document.getElementById(selectId);
            sel.innerHTML = '<option value="">Chọn rạp</option>' +
                theaters.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        } catch (e) { /* silent */ }
    }

    async function loadMovieOptions(selectId) {
        try {
            const movies = await API.get('/api/admin/movies', true);
            const sel = document.getElementById(selectId);
            sel.innerHTML = '<option value="">Chọn phim</option>' +
                movies.map(m => `<option value="${m.id}" data-duration="${m.duration_minutes || 0}">${m.title}</option>`).join('');
        } catch (e) { /* silent */ }
    }

    async function loadRoomOptions(selectId) {
        try {
            const rooms = await API.get('/api/admin/rooms', true);
            const sel = document.getElementById(selectId);
            sel.innerHTML = '<option value="">Chọn phòng</option>' +
                rooms.map(r => `<option value="${r.id}">${r.theater_name} — ${formatRoomLabel(r.name, r.room_type)}</option>`).join('');
        } catch (e) { /* silent */ }
    }

    function formatGenreVi(genreStr) {
        const map = { 'action': 'Hành động', 'drama': 'Tâm lý', 'comedy': 'Hài hước', 'horror': 'Kinh dị', 'animation': 'Hoạt hình', 'scifi': 'Sci-Fi' };
        return genreStr.split(',').map(g => map[g.trim()] || g.trim()).join(', ');
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Vừa xong';
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        return `${Math.floor(hours / 24)} ngày trước`;
    }

    // Close modals
    document.querySelectorAll('.admin-modal .close-btn').forEach(btn => {
        btn.onclick = () => btn.closest('.admin-modal').classList.remove('show');
    });
    document.querySelectorAll('.admin-modal').forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('show');
        };
    });

    // Init: load dashboard (enhanced version from admin-dashboard.js takes priority)
    setTimeout(() => { (window.loadDashboard || loadDashboard)(); }, 50);
});
