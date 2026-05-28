/* ============================================
   REX CINEMAS - BOOKING FLOW
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const movieSlug = params.get('movie');
    const autoShowtimeId = params.get('showtime');

    let currentStep = 1;
    let selectedShowtime = null;
    let selectedSeats = [];
    let selectedSnacks = [];
    let totalPrice = 0;
    let allShowtimes = [];
    let currentMovieData = null;
    let seatRefreshTimer = null;
    let seatRefreshInFlight = false;
    let lastSeatInteractionAt = 0;
    let seatDomSignature = '';
    let seatFitRaf = null;
    const SEAT_REFRESH_INTERVAL_MS = 5000;

    const nextBtn = document.getElementById('next-btn');
    const backBtn = document.getElementById('back-btn');

    if (!movieSlug) {
        document.querySelector('.booking-main').innerHTML = `
            <div class="empty-state-large">
                <div class="empty-icon"></div>
                <h2>Chưa chọn phim</h2>
                <p>Vui lòng chọn một bộ phim từ trang chủ để bắt đầu đặt vé.</p>
                <a href="/" class="btn-vue-outline" style="display:inline-block; text-decoration:none; margin-top:20px;">← QUAY LẠI TRANG CHỦ</a>
            </div>
        `;
        return;
    }

    loadMovieDetails(movieSlug);
    loadShowtimes(movieSlug);

    // ============ MOVIE DETAILS ============
    async function loadMovieDetails(slug) {
        try {
            const movie = await API.get(`/api/movies/${slug}`);
            currentMovieData = movie;

            document.title = `Đặt vé - ${movie.title} | Rex Cinemas`;
            document.getElementById('movie-title').innerText = movie.title;
            document.getElementById('movie-desc').innerText = movie.description || '';
            document.getElementById('movie-poster').src = movie.poster_url || '';

            const metas = [];
            if (movie.duration_minutes) metas.push(`${movie.duration_minutes} phút`);
            if (movie.age_rating) metas.push(movie.age_rating);
            if (movie.genre) metas.push(formatGenreVi(movie.genre));
            document.getElementById('movie-meta').innerText = metas.join(' · ');

            const crewHtml = [];
            if (movie.director) crewHtml.push(`<strong>Đạo diễn:</strong> ${movie.director}`);
            if (movie.cast_members) crewHtml.push(`<strong>Diễn viên:</strong> ${movie.cast_members}`);
            document.getElementById('movie-crew').innerHTML = crewHtml.join('<br>');

            loadReviews(movie.id);
            renderReviewForm(movie.id);
        } catch (e) {
            console.error(e);
        }
    }

    function formatGenreVi(genreStr) {
        const map = {
            'action': 'Hành động', 'drama': 'Tâm lý', 'comedy': 'Hài hước',
            'horror': 'Kinh dị', 'animation': 'Hoạt hình', 'scifi': 'Sci-Fi',
            'romance': 'Lãng mạn', 'thriller': 'Giật gân'
        };
        return genreStr.split(',').map(g => map[g.trim()] || g.trim()).join(', ');
    }

    // ============ REVIEWS ============
    async function loadReviews(movieId) {
        try {
            const reviews = await API.get(`/api/movies/${movieId}/reviews`);
            const list = document.getElementById('review-list');

            if (reviews.length === 0) {
                list.innerHTML = '<p class="summary-empty">Chưa có đánh giá nào. Hãy là người đầu tiên!</p>';
                return;
            }

            const avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
            list.innerHTML = `
                <div class="review-summary-bar">
                    <div class="review-score">${avg.toFixed(1)}</div>
                    <div>
                        <div class="review-stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div>
                        <div class="review-count">${reviews.length} đánh giá</div>
                    </div>
                </div>
                ${reviews.map(r => `
                <div class="review-item">
                    <div class="review-header">
                        <strong>${r.user_name}</strong>
                        <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    <p>${r.comment || ''}</p>
                    <small>${formatDate(r.created_at)}</small>
                </div>
            `).join('')}`;
        } catch (e) { console.error(e); }
    }

    function renderReviewForm(movieId) {
        const container = document.getElementById('review-form-container');
        const token = localStorage.getItem('token');

        if (!token) {
            container.innerHTML = '<p class="review-login-msg">Vui lòng <a href="#" onclick="window.openAuthModal(\'login\')">đăng nhập</a> để gửi đánh giá.</p>';
            return;
        }

        container.innerHTML = `
            <div class="review-form">
                <p class="review-form-label">Chọn số sao:</p>
                <div class="rating-input">
                    ${[1, 2, 3, 4, 5].map(i => `<span class="star-input" data-value="${i}">☆</span>`).join('')}
                </div>
                <textarea id="review-comment" placeholder="Chia sẻ cảm nhận của bạn về bộ phim..."></textarea>
                <button id="submit-review" class="btn-primary" style="width:auto; padding:12px 30px; font-size:13px; letter-spacing:2px;">GỬI ĐÁNH GIÁ</button>
            </div>
        `;

        let selectedRating = 0;
        const stars = container.querySelectorAll('.star-input');
        stars.forEach(star => {
            star.onmouseover = () => stars.forEach(s => s.innerText = parseInt(s.dataset.value) <= parseInt(star.dataset.value) ? '★' : '☆');
            star.onmouseout = () => stars.forEach(s => s.innerText = parseInt(s.dataset.value) <= selectedRating ? '★' : '☆');
            star.onclick = () => {
                selectedRating = parseInt(star.dataset.value);
                stars.forEach(s => {
                    const active = parseInt(s.dataset.value) <= selectedRating;
                    s.innerText = active ? '★' : '☆';
                    s.classList.toggle('active', active);
                });
            };
        });

        document.getElementById('submit-review').onclick = async () => {
            const comment = document.getElementById('review-comment').value;
            if (selectedRating === 0) { showToast('Vui lòng chọn số sao!', 'error'); return; }

            try {
                await API.post(`/api/movies/${movieId}/reviews`, { rating: selectedRating, comment }, true);
                loadReviews(movieId);
                container.innerHTML = '<p class="success-msg">✓ Cảm ơn bạn đã đánh giá!</p>';
                showToast('Đánh giá thành công!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        };
    }

    // ============ SHOWTIMES ============
    async function loadShowtimes(slug) {
        try {
            allShowtimes = await API.get(`/api/movies/${slug}/showtimes`);
            const dates = [...new Set(allShowtimes.map(s => s.show_date))];
            const tabsEl = document.getElementById('showtime-date-tabs');

            if (dates.length === 0) {
                document.getElementById('showtime-list').innerHTML = '<p class="summary-empty">Hiện chưa có suất chiếu nào cho phim này.</p>';
                if (tabsEl) tabsEl.style.display = 'none';
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

            tabsEl.innerHTML = dates.map((d, i) => {
                const label = d === today ? 'Hôm nay' : d === tomorrow ? 'Ngày mai'
                    : new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
                return `<button class="showtime-date-tab ${i === 0 ? 'active' : ''}" onclick="filterShowtimesByDate('${d}', this)">${label}</button>`;
            }).join('');

            filterShowtimesByDate(dates[0]);

            if (autoShowtimeId) {
                setTimeout(() => {
                    const item = document.querySelector(`.showtime-item[data-id="${autoShowtimeId}"]`);
                    if (item) item.click();
                }, 500);
            }
        } catch (e) { console.error(e); }
    }

    function fitSeatMap() {
        const map = document.getElementById('seat-map');
        const wrapper = map?.querySelector('.seatmap-wrapper');
        if (!map || !wrapper) return;

        wrapper.style.setProperty('--seat-scale', '1');
        if (seatFitRaf) cancelAnimationFrame(seatFitRaf);
        seatFitRaf = requestAnimationFrame(() => {
            const availableWidth = Math.max(0, map.clientWidth - 16);
            const naturalWidth = wrapper.scrollWidth || 1;
            const scale = availableWidth > 0 ? Math.min(1, availableWidth / naturalWidth) : 1;
            wrapper.style.setProperty('--seat-scale', String(scale));
        });
    }

    window.addEventListener('resize', fitSeatMap);

    window.filterShowtimesByDate = (date, btn) => {
        if (btn) {
            document.querySelectorAll('.showtime-date-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
        }

        const filtered = allShowtimes.filter(s => s.show_date === date);
        const list = document.getElementById('showtime-list');

        const now = new Date();
        const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        const localDateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Group by theater
        const byTheater = {};
        filtered.forEach(s => {
            if (!byTheater[s.theater_name]) byTheater[s.theater_name] = [];
            byTheater[s.theater_name].push(s);
        });

        list.innerHTML = Object.entries(byTheater).map(([theater, shows]) => `
            <div class="showtime-theater-group">
                <div class="showtime-group-label">${theater}</div>
                <div class="showtime-items-wrap">
                    ${shows.map(st => {
                        const isExpired = st.show_date < localDateStr || (st.show_date === localDateStr && st.start_time < currentHHMM);
                        return `
                        <div class="showtime-item ${isExpired ? 'expired' : ''}" 
                             ${!isExpired ? `data-id="${st.id}" data-price="${st.base_price}" data-time="${st.start_time}" data-date="${st.show_date}" data-room="${formatRoomNameOnly(st.room_name, st.room_type)}" data-theater="${st.theater_name}" data-roomtype="${st.room_type}"` : ''}>
                            <strong>${formatTime(st.start_time)}</strong>
                            <span style="display:flex; justify-content:center; gap: 4px;">
                                <span class="showtime-type">${st.room_type}</span>
                                <span style="font-family: var(--mont);">${formatCurrency(st.base_price)}</span>
                            </span>
                            ${isExpired ? '<span class="expired-label">Đã chiếu</span>' : `<span>${formatRoomNameOnly(st.room_name, st.room_type)}</span>`}
                        </div>`
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Click handlers
        document.querySelectorAll('.showtime-item').forEach(item => {
            item.onclick = async () => {
                const nextShowtimeId = item.dataset.id;
                const prevShowtimeId = selectedShowtime?.id;
                const prevSeatIds = selectedSeats.map(s => s.id);
                if (prevShowtimeId && prevShowtimeId !== nextShowtimeId && prevSeatIds.length > 0) {
                    try {
                        await releaseSeatsForShowtime(prevShowtimeId, prevSeatIds);
                    } catch (e) { /* best effort */ }
                    selectedSeats = [];
                }
                document.querySelectorAll('.showtime-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedShowtime = {
                    id: item.dataset.id,
                    price: parseFloat(item.dataset.price),
                    time: item.dataset.time,
                    date: item.dataset.date,
                    room: item.dataset.room,
                    theater: item.dataset.theater,
                    roomType: item.dataset.roomtype
                };
                nextBtn.disabled = false;
                updateSummary();
            };
        });
    };

    function stopSeatRefreshTimer() {
        if (seatRefreshTimer) {
            clearInterval(seatRefreshTimer);
            seatRefreshTimer = null;
        }
    }

    function startSeatRefreshTimer() {
        stopSeatRefreshTimer();
        seatRefreshTimer = setInterval(() => {
            if (currentStep >= 2 && selectedShowtime?.id) refreshSeatState();
        }, SEAT_REFRESH_INTERVAL_MS);
    }

    function syncSelectedSeatsFromServer(seats) {
        const oldSelectedIds = new Set(selectedSeats.map(s => String(s.id)));
        const nextSelected = seats
            .filter(s => s.is_held_by_me && !s.is_booked)
            .map(s => ({
                id: String(s.id),
                name: `${s.seat_row}${s.seat_number}`,
                type: s.seat_type
            }));
        const nextSelectedIds = new Set(nextSelected.map(s => String(s.id)));
        const lostCount = [...oldSelectedIds].filter(id => !nextSelectedIds.has(id)).length;
        selectedSeats = nextSelected;
        if (lostCount > 0) {
            showToast('Có ghế vừa bị người khác lấy hoặc hết thời gian giữ.', 'error');
        }
    }

    async function releaseSeatsForShowtime(showtimeId, seatIds) {
        if (!showtimeId || !Array.isArray(seatIds) || seatIds.length === 0) return;
        await API.post(
            `/api/showtimes/${showtimeId}/seats/release`,
            { seat_ids: seatIds, seat_session_id: getSeatSessionId() },
            false,
            getSeatSessionHeaders()
        );
    }

    async function holdSeatOnServer(seatId) {
        return API.post(
            `/api/showtimes/${selectedShowtime.id}/seats/hold`,
            { seat_id: seatId, seat_session_id: getSeatSessionId() },
            false,
            getSeatSessionHeaders()
        );
    }

    async function refreshSeatState() {
        if (seatRefreshInFlight || currentStep < 2 || !selectedShowtime?.id) return;
        if (currentStep === 2 && Date.now() - lastSeatInteractionAt < 1200) return;
        seatRefreshInFlight = true;
        try {
            await loadSeats(selectedShowtime.id, { silent: true });
        } catch (e) {
            await loadSeats(selectedShowtime.id, { silent: true });
        } finally {
            seatRefreshInFlight = false;
        }
    }

    async function releaseSeatOnServer(seatId) {
        return API.post(
            `/api/showtimes/${selectedShowtime.id}/seats/release`,
            { seat_id: seatId, seat_session_id: getSeatSessionId() },
            false,
            getSeatSessionHeaders()
        );
    }

    function releaseSelectedSeatsOnUnload() {
        if (!selectedShowtime?.id || selectedSeats.length === 0) return;
        const payload = JSON.stringify({
            seat_ids: selectedSeats.map(s => s.id),
            seat_session_id: getSeatSessionId()
        });

        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                `/api/showtimes/${selectedShowtime.id}/seats/release`,
                new Blob([payload], { type: 'application/json' })
            );
            return;
        }

        fetch(`/api/showtimes/${selectedShowtime.id}/seats/release`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getSeatSessionHeaders()
            },
            body: payload,
            keepalive: true
        }).catch(() => {});
    }

    // ============ SEAT MAP ============
    async function loadSeats(showtimeId, { silent = false } = {}) {
        try {
            const seats = await API.get(`/api/showtimes/${showtimeId}/seats`, false, getSeatSessionHeaders());
            syncSelectedSeatsFromServer(seats);
            const map = document.getElementById('seat-map');
            const selectedSeatIds = new Set(selectedSeats.map(s => String(s.id)));
            const nextSeatDomSignature = `${showtimeId}::${seats.map(s =>
                `${s.id}:${s.is_booked ? 1 : 0}:${s.is_held ? 1 : 0}:${s.is_held_by_me ? 1 : 0}`
            ).join('|')}`;

            if (map.innerHTML && nextSeatDomSignature === seatDomSignature) {
                updateSummary();
                updateSeatBadge();
                return;
            }

            const rows = {};
            seats.forEach(s => {
                if (!rows[s.seat_row]) rows[s.seat_row] = [];
                rows[s.seat_row].push(s);
            });

            const rowNames = Object.keys(rows).sort();
            const firstVipRow = rowNames.find(r => rows[r].some(s => s.seat_type === 'vip'));
            const firstCoupleRow = rowNames.find(r => rows[r].some(s => s.seat_type === 'couple'));

            let html = '<div class="seatmap-wrapper">';

            rowNames.forEach(rowName => {
                const rowSeats = rows[rowName].sort((a, b) => a.seat_number - b.seat_number);

                if (rowName === firstVipRow) {
                    html += '<div class="seat-section-sep"><span>— Khu VIP —</span></div>';
                }
                if (rowName === firstCoupleRow) {
                    html += '<div class="seat-section-sep couple-sep"><span>— Ghế Đôi —</span></div>';
                }

                html += '<div class="seat-row-wrap">';
                html += `<div class="seat-row-label">${rowName}</div>`;
                html += '<div class="seat-row-inner">';

                rowSeats.forEach(s => {
                    const isSelected = selectedSeatIds.has(String(s.id));
                    const isHeld = !!s.is_held && !s.is_held_by_me;
                    const booked = s.is_booked ? 'booked' : '';
                    const held = isHeld ? 'held' : '';
                    const selected = isSelected ? 'selected' : '';
                    const seatPrice = selectedShowtime
                        ? selectedShowtime.price + (s.seat_type === 'vip' ? 20000 : s.seat_type === 'couple' ? 50000 : 0)
                        : 0;
                    const tipLabel = s.seat_type === 'vip' ? ' · VIP' : s.seat_type === 'couple' ? ' · Đôi' : '';
                    const statusTip = s.is_booked
                        ? ' · Đã bán'
                        : isHeld
                            ? ' · Đang được chọn'
                            : ` · ${formatCurrency(seatPrice)}`;

                    if (s.seat_number === 6) {
                        html += '<div class="seat-aisle"></div>';
                    }

                    html += `<div class="seat ${s.seat_type} ${booked} ${held} ${selected}"
                        data-id="${s.id}"
                        data-name="${s.seat_row}${s.seat_number}"
                        data-type="${s.seat_type}"
                        data-price="${seatPrice}"
                        title="${s.seat_row}${s.seat_number}${tipLabel}${statusTip}">
                        ${s.seat_number}
                    </div>`;
                });

                html += '</div>';
                html += `<div class="seat-row-label">${rowName}</div>`;
                html += '</div>';
            });

            html += '</div>';
            map.innerHTML = html;
            seatDomSignature = nextSeatDomSignature;
            fitSeatMap();

            document.querySelectorAll('#seat-map .seat:not(.booked):not(.held)').forEach(seat => {
                seat.onclick = async () => {
                    if (seat.dataset.busy === '1') return;
                    const seatId = seat.dataset.id;
                    seat.dataset.busy = '1';
                    lastSeatInteractionAt = Date.now();
                    try {
                        if (seat.classList.contains('selected')) {
                            await releaseSeatOnServer(seatId);
                            selectedSeats = selectedSeats.filter(s => s.id !== seatId);
                            seat.classList.remove('selected');
                        } else {
                            await holdSeatOnServer(seatId);
                            selectedSeats = selectedSeats.filter(s => s.id !== seatId);
                            selectedSeats.push({ id: seatId, name: seat.dataset.name, type: seat.dataset.type });
                            seat.classList.add('selected');
                        }
                        updateSummary();
                        updateSeatBadge();
                        nextBtn.disabled = selectedSeats.length === 0;
                        // Avoid full rerender on every click to prevent UI jitter.
                    } catch (err) {
                        showToast(err.message, 'error');
                        await loadSeats(showtimeId, { silent: true });
                    } finally {
                        delete seat.dataset.busy;
                    }
                };
            });
            updateSummary();
            updateSeatBadge();
        } catch (e) {
            if (!silent) showToast('Không thể tải sơ đồ ghế.', 'error');
        }
    }

    function updateSeatBadge() {
        const el = document.getElementById('seat-selected-count');
        if (el) {
            el.textContent = selectedSeats.length > 0
                ? `Đã chọn ${selectedSeats.length} ghế: ${selectedSeats.map(s => s.name).join(', ')}`
                : 'Nhấn vào ghế để chọn.';
        }
    }

    // ============ SNACKS ============
    async function loadSnacks() {
        try {
            const snacks = await API.get('/api/snacks');
            const list = document.getElementById('snack-list');

            if (snacks.length === 0) {
                list.innerHTML = '<p class="summary-empty">Hiện chưa có combo nào.</p>';
                return;
            }

            list.innerHTML = snacks.map(snack => `
                <div class="snack-item">
                    <img src="${snack.image_url || '/img/placeholder-snack.svg'}" alt="${snack.name}" loading="lazy">
                    <div class="snack-info">
                        <h3>${snack.name}</h3>
                        <p>${snack.description || ''}</p>
                        <strong>${formatCurrency(snack.price)}</strong>
                        <div class="quantity-control">
                            <button class="quantity-btn minus" data-id="${snack.id}">−</button>
                            <span class="qty" id="qty-${snack.id}">0</span>
                            <button class="quantity-btn plus" data-id="${snack.id}">+</button>
                        </div>
                    </div>
                </div>
            `).join('');

            document.querySelectorAll('.quantity-btn').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    const snack = snacks.find(s => s.id == id);
                    const qtyEl = document.getElementById(`qty-${id}`);
                    let qty = parseInt(qtyEl.innerText);

                    if (btn.classList.contains('plus')) qty++;
                    else if (qty > 0) qty--;
                    qtyEl.innerText = qty;

                    selectedSnacks = selectedSnacks.filter(s => s.id != id);
                    if (qty > 0) selectedSnacks.push({ ...snack, quantity: qty });
                    updateSummary();
                };
            });
        } catch (e) {
            showToast('Không thể tải menu bắp nước.', 'error');
        }
    }

    // ============ PRICE CALC ============
    function getSeatPrice(seat) {
        let price = selectedShowtime.price;
        if (seat.type === 'vip') price += 20000;
        if (seat.type === 'couple') price += 50000;
        return price;
    }

    function updateSummary() {
        const summary = document.getElementById('sidebar-summary');
        if (!selectedShowtime) {
            summary.innerHTML = '<div class="summary-empty">Vui lòng chọn suất chiếu để tiếp tục.</div>';
            return;
        }

        const seatTotal = selectedSeats.reduce((acc, s) => acc + getSeatPrice(s), 0);
        const snackTotal = selectedSnacks.reduce((acc, s) => acc + s.price * s.quantity, 0);
        totalPrice = seatTotal + snackTotal;
        document.getElementById('total-price').innerText = formatCurrency(totalPrice);

        const movieTitle = currentMovieData?.title || document.getElementById('movie-title')?.innerText || '';

        summary.innerHTML = `
            <div class="summary-item-row"><span>PHIM</span><strong>${movieTitle}</strong></div>
            <div class="summary-item-row"><span>RẠP</span><strong>${selectedShowtime.theater}</strong></div>
            <div class="summary-item-row"><span>PHÒNG</span><strong>${formatRoomLabel(selectedShowtime.room, selectedShowtime.roomType)}</strong></div>
            <div class="summary-item-row"><span>SUẤT</span><strong>${formatTime(selectedShowtime.time)} | ${formatDate(selectedShowtime.date)}</strong></div>
            <hr class="summary-divider">
            <div class="summary-item-row"><span>GHẾ (${selectedSeats.length})</span><strong>${selectedSeats.length > 0 ? selectedSeats.map(s => s.name).join(', ') : 'Chưa chọn'}</strong></div>
            ${selectedSeats.length > 0 ? `<div class="summary-item-row"><span>Vé</span><strong>${formatCurrency(seatTotal)}</strong></div>` : ''}
            ${selectedSnacks.length > 0 ? `
                <div class="summary-item-row">
                    <span>ĐỒ ĂN</span>
                    <div style="text-align:right; font-weight:700; color:var(--white);">
                        ${selectedSnacks.map(s => `${s.name} ×${s.quantity}`).join('<br>')}
                    </div>
                </div>
                <div class="summary-item-row"><span>Bắp nước</span><strong>${formatCurrency(snackTotal)}</strong></div>
            ` : ''}
        `;

        if (currentStep >= 2) nextBtn.disabled = selectedSeats.length === 0;
    }

    // ============ STEP NAVIGATION ============
    if (nextBtn) {
        nextBtn.onclick = async () => {
            if (currentStep < 4) {
                if (currentStep === 1 && !selectedShowtime) {
                    showToast('Vui lòng chọn suất chiếu!', 'error');
                    return;
                }
                if (currentStep === 2 && selectedSeats.length === 0) {
                    showToast('Vui lòng chọn ít nhất 1 ghế!', 'error');
                    return;
                }
                if (currentStep === 3) {
                    const token = localStorage.getItem('token');
                    if (!token) {
                        showToast('Vui lòng đăng nhập để tiếp tục thanh toán.', 'error');
                        if (window.openAuthModal) openAuthModal('login');
                        return;
                    }
                }
                currentStep++;
                renderStep();
            } else {
                await processPayment();
            }
        };
    }

    if (backBtn) {
        backBtn.onclick = () => {
            if (currentStep > 1) {
                currentStep--;
                renderStep();
            }
        };
    }

    function renderStep() {
        stopSeatRefreshTimer();
        document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.progress-bar .step').forEach((s, i) => {
            s.classList.toggle('active', (i + 1) <= currentStep);
            s.classList.toggle('completed', (i + 1) < currentStep);
        });
        document.getElementById(`step-${currentStep}`)?.classList.add('active');

        // Back button visibility
        if (backBtn) backBtn.style.display = currentStep > 1 ? 'block' : 'none';

        // Next button text
        if (currentStep === 4) {
            nextBtn.innerText = 'XÁC NHẬN & THANH TOÁN';
            nextBtn.disabled = selectedSeats.length === 0;
        } else {
            nextBtn.innerText = 'TIẾP THEO';
        }

        if (currentStep >= 2) {
            startSeatRefreshTimer();
        }

        if (currentStep === 2) {
            loadSeats(selectedShowtime.id);
            nextBtn.disabled = selectedSeats.length === 0;
        } else if (currentStep === 3) {
            loadSnacks();
            nextBtn.disabled = selectedSeats.length === 0;
        }

        // Scroll to top of booking area
        document.querySelector('.booking-progress')?.scrollIntoView({ behavior: 'smooth' });
    }

    async function processPayment() {
        const token = localStorage.getItem('token');
        if (!token) {
            showToast('Vui lòng đăng nhập!', 'error');
            return;
        }

        const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'momo';

        try {
            nextBtn.disabled = true;
            nextBtn.innerText = 'ĐANG XỬ LÝ...';

            const data = await API.post('/api/bookings/checkout', {
                showtime_id: selectedShowtime.id,
                total_amount: totalPrice,
                payment_method: paymentMethod,
                seat_session_id: getSeatSessionId(),
                seats: selectedSeats.map(s => ({ id: s.id, price: getSeatPrice(s) })),
                snacks: selectedSnacks.map(s => ({ id: s.id, quantity: s.quantity, price: s.price }))
            }, true);

            showToast('Đang chuyển tới cổng thanh toán MoMo...');
            window.location.href = data.checkout_url;
        } catch (err) {
            showToast(err.message, 'error');
            nextBtn.disabled = false;
            nextBtn.innerText = 'XÁC NHẬN & THANH TOÁN';
        }
    }

    window.addEventListener('pagehide', releaseSelectedSeatsOnUnload);
});
