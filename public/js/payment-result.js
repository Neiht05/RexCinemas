document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const bookingCode = params.get('booking');
    const forcedStatus = params.get('status');
    const content = document.getElementById('payment-result-content');
    let vietQrRequestSeq = 0;
    let vietQrCache = null;

    const renderVietQrMarkup = (qr) => `
        <div class="vietqr-panel-head">
            <div>
                <div class="vietqr-panel-title">QUÉT MÃ QR ĐỂ CHUYỂN KHOẢN</div>
                <div class="vietqr-panel-sub">Giữ nguyên nội dung chuyển khoản để đối soát đơn hàng</div>
            </div>
            <div class="vietqr-panel-sub">${qr.bank_name}</div>
        </div>
        <div class="vietqr-qr-wrap">
            <img src="${qr.qr_url}" alt="Mã QR VietQR">
        </div>
        <div class="vietqr-meta">
            <div class="vietqr-row"><span>Ngân hàng</span><strong>${qr.bank_name}</strong></div>
            <div class="vietqr-row"><span>Số tài khoản</span><strong>${qr.account_no}</strong></div>
            ${qr.account_name ? `<div class="vietqr-row"><span>Chủ tài khoản</span><strong>${qr.account_name}</strong></div>` : ''}
            <div class="vietqr-row"><span>Nội dung</span><strong>${qr.transfer_content}</strong></div>
            <div class="vietqr-row"><span>Số tiền</span><strong>${formatCurrency(qr.amount)}</strong></div>
        </div>
    `;

    const renderVietQrPanel = async (booking) => {
        const panel = document.getElementById('vietqr-panel');
        if (!panel) return;

        if (vietQrCache?.bookingCode === booking.booking_code) {
            panel.innerHTML = renderVietQrMarkup(vietQrCache.data);
            return;
        }

        const requestSeq = ++vietQrRequestSeq;
        panel.innerHTML = `<div class="summary-empty">Đang tạo mã QR chuyển khoản...</div>`;

        try {
            const qr = await API.get(`/api/payments/vietqr/${encodeURIComponent(booking.booking_code)}`);
            if (requestSeq !== vietQrRequestSeq || !document.getElementById('vietqr-panel')) return;
            vietQrCache = { bookingCode: booking.booking_code, data: qr };

            panel.innerHTML = renderVietQrMarkup(qr);
        } catch (error) {
            if (requestSeq !== vietQrRequestSeq || !document.getElementById('vietqr-panel')) return;
            panel.innerHTML = `<div class="payment-security" style="margin-top:0;">Không tải được mã QR VietQR.</div>`;
        }
    };

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
        const isTestAutoPaid = booking.payment_transaction_id?.startsWith('VIETQR-TEST-');

        content.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:18px;">
                <div>
                    <p style="font-family:var(--oswald); font-size:28px; letter-spacing:2px; color:${statusColor};">${statusLabel}</p>
                    ${forcedStatus === 'cancelled' ? '<p style="margin-top:8px; color:#999;">Bạn đã hủy hoặc thoát khỏi cổng thanh toán.</p>' : ''}
                    ${isTestAutoPaid ? '<p style="margin-top:8px; color:#999;">Chế độ test: đơn được đánh dấu đã thanh toán tự động.</p>' : ''}
                    ${booking.payment_provider === 'vietqr' && booking.status === 'pending'
                        ? '<p style="margin-top:8px; color:#999;">Sau khi chuyển khoản, vui lòng chờ xác nhận đơn hàng.</p>'
                        : booking.status === 'pending'
                            ? '<p style="margin-top:8px; color:#999;">Trang này sẽ tự cập nhật khi cổng thanh toán xác nhận giao dịch.</p>'
                            : ''}
                </div>
                <div class="summary-item-row"><span>MÃ ĐƠN</span><strong>#REX-${booking.id}</strong></div>
                <div class="summary-item-row"><span>MÃ BOOKING</span><strong>${booking.booking_code}</strong></div>
                <div class="summary-item-row"><span>PHIM</span><strong>${booking.movie_title}</strong></div>
                <div class="summary-item-row"><span>SUẤT CHIẾU</span><strong>${formatDate(booking.show_date)} | ${formatTime(booking.start_time)}</strong></div>
                <div class="summary-item-row"><span>RẠP</span><strong>${booking.theater_name} - ${booking.room_name}</strong></div>
                <div class="summary-item-row"><span>GHẾ</span><strong>${booking.seat_names || 'N/A'}</strong></div>
                <div class="summary-item-row"><span>TỔNG TIỀN</span><strong>${formatCurrency(booking.total_amount)}</strong></div>
                ${booking.payment_provider === 'vietqr' && booking.status === 'pending'
                    ? '<div id="vietqr-panel" style="margin-top:18px;"></div>'
                    : ''}
                ${booking.payment_last_error ? `<div class="payment-security" style="margin-top:0;">${booking.payment_last_error}</div>` : ''}
                <div class="success-actions" style="justify-content:flex-start;">
                    ${booking.status === 'paid'
                        ? '<a href="/profile.html" class="btn-vue-outline" style="text-decoration:none;">XEM VÉ CỦA TÔI</a>'
                        : `<a href="/booking.html?movie=${encodeURIComponent(booking.movie_slug || '')}" class="btn-vue-outline" style="text-decoration:none;">${booking.payment_provider === 'vietqr' ? 'QUAY LẠI' : 'THỬ LẠI'}</a>`}
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
        if (booking.payment_provider === 'vietqr' && booking.status === 'pending') {
            renderVietQrPanel(booking);
        }

        if (booking.status === 'pending') {
            const poll = setInterval(async () => {
                try {
                    const refreshed = await fetchBooking();
                    renderBooking(refreshed);
                    if (refreshed.payment_provider === 'vietqr' && refreshed.status === 'pending') {
                        renderVietQrPanel(refreshed);
                    }
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
