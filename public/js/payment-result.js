document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const bookingCode = params.get('booking');
    const forcedStatus = params.get('status');
    const content = document.getElementById('payment-result-content');

    const renderBooking = (booking) => {
        const statusLabel = booking.status === 'paid'
            ? 'THANH TOÁN THÀNH CÔNG'
            : booking.status === 'pending'
                ? 'ĐANG CHỜ XÁC NHẬN THANH TOÁN'
                : 'THANH TOÁN KHÔNG THÀNH CÔNG';

        const statusColor = booking.status === 'paid'
            ? '#4caf50'
            : booking.status === 'pending'
                ? '#f5c518'
                : '#e74c3c';

        content.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:18px;">
                <div>
                    <p style="font-family:var(--oswald); font-size:28px; letter-spacing:2px; color:${statusColor};">${statusLabel}</p>
                    ${forcedStatus === 'cancelled' ? '<p style="margin-top:8px; color:#999;">Bạn đã hủy hoặc thoát khỏi cổng thanh toán.</p>' : ''}
                    ${booking.status === 'pending'
                        ? '<p style="margin-top:8px; color:#999;">Trang này sẽ tự cập nhật khi MoMo xác nhận giao dịch.</p>'
                        : ''}
                </div>
                <div class="summary-item-row"><span>MÃ ĐƠN</span><strong>#REX-${booking.id}</strong></div>
                <div class="summary-item-row"><span>MÃ BOOKING</span><strong>${booking.booking_code}</strong></div>
                <div class="summary-item-row"><span>PHIM</span><strong>${booking.movie_title}</strong></div>
                <div class="summary-item-row"><span>SUẤT CHIẾU</span><strong>${formatDate(booking.show_date)} | ${formatTime(booking.start_time)}</strong></div>
                <div class="summary-item-row"><span>RẠP</span><strong>${booking.theater_name} - ${booking.room_name}</strong></div>
                <div class="summary-item-row"><span>GHẾ</span><strong>${booking.seat_names || 'N/A'}</strong></div>
                <div class="summary-item-row"><span>TỔNG TIỀN</span><strong>${formatCurrency(booking.total_amount)}</strong></div>
                ${booking.payment_last_error ? `<div class="payment-security" style="margin-top:0;">${booking.payment_last_error}</div>` : ''}
                <div class="success-actions" style="justify-content:flex-start;">
                    ${booking.status === 'paid'
                        ? '<a href="/profile.html" class="btn-vue-outline" style="text-decoration:none;">XEM VÉ CỦA TÔI</a>'
                        : `<a href="/booking.html?movie=${encodeURIComponent(booking.movie_slug || '')}" class="btn-vue-outline" style="text-decoration:none;">THỬ LẠI</a>`}
                    <a href="/" class="btn-vue-ghost" style="text-decoration:none;">VỀ TRANG CHỦ</a>
                </div>
            </div>
        `;
    };

    const fetchBooking = async () => API.get(`/api/payment-status/${bookingCode}`);

    if (!bookingCode) {
        content.innerHTML = `
            <p>Không tìm thấy mã đơn hàng.</p>
            <div class="success-actions" style="justify-content:flex-start;">
                <a href="/" class="btn-vue-outline" style="text-decoration:none;">VỀ TRANG CHỦ</a>
            </div>
        `;
        return;
    }

    try {
        const booking = await fetchBooking();
        renderBooking(booking);

        if (booking.status === 'pending') {
            const poll = setInterval(async () => {
                try {
                    const refreshed = await fetchBooking();
                    renderBooking(refreshed);
                    if (refreshed.status !== 'pending') clearInterval(poll);
                } catch {
                    clearInterval(poll);
                }
            }, 5000);
        }
    } catch (error) {
        content.innerHTML = `
            <p>${error.message || 'Không thể kiểm tra trạng thái thanh toán.'}</p>
            <div class="success-actions" style="justify-content:flex-start;">
                <a href="/" class="btn-vue-outline" style="text-decoration:none;">VỀ TRANG CHỦ</a>
            </div>
        `;
    }
});
