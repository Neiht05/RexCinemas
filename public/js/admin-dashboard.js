/* ================================================================
   REX CINEMAS — ADMIN DASHBOARD — ENHANCED STATISTICS
   ================================================================ */

// Chart instances (kept globally to allow destroy on re-render)
const _dashCharts = {};

// ── Utility: Destroy chart if exists ──
function destroyChart(id) {
    if (_dashCharts[id]) {
        _dashCharts[id].destroy();
        delete _dashCharts[id];
    }
}

// ── Chart.js global defaults ──
function initChartDefaults() {
    Chart.defaults.color = 'rgba(255,255,255,0.4)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
}

// ── Update live date/time in header ──
function updateDateTime() {
    const el = document.getElementById('dash-datetime');
    if (!el) return;
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    el.textContent = now.toLocaleDateString('vi-VN', opts);
}

const DASHBOARD_DEFAULT_RANGE_DAYS = 29;
const dashboardState = {
    stats: null
};

function toISODate(date) {
    return date.toISOString().split('T')[0];
}

function getDefaultDashboardRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - DASHBOARD_DEFAULT_RANGE_DAYS);
    return { startDate: toISODate(start), endDate: toISODate(end) };
}

function parseDashboardDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : toISODate(parsed);
}

function normalizeDashboardFilters() {
    const defaults = getDefaultDashboardRange();
    let startDate = parseDashboardDate(document.getElementById('dash-start-date')?.value) || defaults.startDate;
    let endDate = parseDashboardDate(document.getElementById('dash-end-date')?.value) || defaults.endDate;
    if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
    }
    return {
        start_date: startDate,
        end_date: endDate,
        theater_id: document.getElementById('dash-theater-filter')?.value || '',
        movie_id: document.getElementById('dash-movie-filter')?.value || '',
        payment_method: document.getElementById('dash-payment-filter')?.value || 'all'
    };
}

function setDashboardFilters(filters) {
    const defaults = getDefaultDashboardRange();
    document.getElementById('dash-start-date') && (document.getElementById('dash-start-date').value = filters.start_date || defaults.startDate);
    document.getElementById('dash-end-date') && (document.getElementById('dash-end-date').value = filters.end_date || defaults.endDate);
    document.getElementById('dash-theater-filter') && (document.getElementById('dash-theater-filter').value = filters.theater_id || '');
    document.getElementById('dash-movie-filter') && (document.getElementById('dash-movie-filter').value = filters.movie_id || '');
    document.getElementById('dash-payment-filter') && (document.getElementById('dash-payment-filter').value = filters.payment_method || 'all');
}

function formatDateRangeLabel(startDate, endDate) {
    if (!startDate || !endDate) return 'Tất cả thời gian';
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    return `${start.toLocaleDateString('vi-VN')} - ${end.toLocaleDateString('vi-VN')}`;
}

function renderTrendBadge(percent, previousRevenue, currentRevenue) {
    const el = document.getElementById('kpi-trend-revenue');
    if (!el) return;
    if (previousRevenue === 0 && Number(currentRevenue) > 0) {
        el.className = 'kpi-trend up';
        el.textContent = '▲ NEW';
        return;
    }
    if (percent === null || percent === undefined || Number.isNaN(Number(percent))) {
        el.className = 'kpi-trend';
        el.textContent = '';
        return;
    }
    const isUp = Number(percent) >= 0;
    el.className = `kpi-trend ${isUp ? 'up' : 'down'}`;
    el.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(Number(percent)).toFixed(1)}%`;
}

// ── Payment method label map ──
const PM_LABELS = { vietqr: 'VietQR/VietinBank', momo: 'MoMo', vnpay: 'VNPay', atm: 'ATM/VNPay', visa: 'Visa/Stripe', stripe: 'Stripe', cash: 'Tiền mặt' };
const PM_COLORS = ['#ff8a00','#f43f5e','#3b82f6','#22c55e','#8b5cf6','#f59e0b','#06b6d4'];
const STATUS_COLORS = { paid: '#22c55e', pending: '#f59e0b', cancelled: '#ef4444' };
const STATUS_LABELS = { paid: 'Đã thanh toán', pending: 'Chờ thanh toán', cancelled: 'Đã hủy' };
const MEMBER_COLORS = { Silver: '#94a3b8', Gold: '#f59e0b', Diamond: '#818cf8' };

// ── Revenue Trend Chart ──
function renderRevenueTrend(data, filters = {}) {
    destroyChart('revenueTrend');
    const ctx = document.getElementById('chart-revenue-trend');
    if (!ctx || !data || data.length === 0) return;

    const startDate = filters.startDate || getDefaultDashboardRange().startDate;
    const endDate = filters.endDate || getDefaultDashboardRange().endDate;
    const dateMap = new Map(data.map(d => [d.day, Number(d.revenue) || 0]));
    const allDays = [];

    for (let cursor = new Date(`${startDate}T00:00:00`); cursor <= new Date(`${endDate}T00:00:00`); cursor.setDate(cursor.getDate() + 1)) {
        const key = toISODate(cursor);
        allDays.push({ day: key, revenue: dateMap.get(key) || 0 });
    }

    const labels = allDays.map(d => {
        const parts = d.day.split('-');
        return `${parts[2]}/${parts[1]}`;
    });
    const revenues = allDays.map(d => d.revenue);

    _dashCharts['revenueTrend'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: revenues,
                borderColor: '#f97316',
                borderWidth: 2.5,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return 'transparent';
                    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, 'rgba(249,115,22,0.3)');
                    gradient.addColorStop(1, 'rgba(249,115,22,0)');
                    return gradient;
                },
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#f97316',
                pointBorderColor: '#1a0d00',
                pointBorderWidth: 2,
                pointHoverRadius: 6,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,10,5,0.95)',
                    borderColor: 'rgba(249,115,22,0.4)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        title: (items) => `Ngày ${items[0].label}`,
                        label: (item) => ` ${Number(item.raw).toLocaleString('vi-VN')} ₫`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { maxRotation: 0, maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: {
                        callback: (v) => {
                            if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
                            if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
                            return v;
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// ── Generic Donut Chart ──
function renderDonutChart(canvasId, labels, values, colors, legendId) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) {
        ctx.parentElement.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:12px;padding:20px;">Chưa có dữ liệu</p>';
        return;
    }

    _dashCharts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: 'rgba(10,7,4,0.8)',
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,10,5,0.95)',
                    borderColor: 'rgba(249,115,22,0.3)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: (item) => {
                            const pct = ((item.raw / total) * 100).toFixed(1);
                            return ` ${item.label}: ${pct}%`;
                        }
                    }
                }
            }
        }
    });

    // Custom legend
    const legendEl = document.getElementById(legendId);
    if (legendEl) {
        legendEl.innerHTML = labels.map((label, i) => {
            const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : 0;
            return `
                <div class="legend-item">
                    <span class="legend-dot" style="background:${colors[i]}; border-radius:2px;"></span>
                    <span>${label}</span>
                    <span class="legend-pct">${pct}%</span>
                </div>
            `;
        }).join('');
    }
}

// ── Render Theater Occupancy Bars ──
function renderOccupancy(data) {
    const el = document.getElementById('occupancy-list');
    if (!el || !data || data.length === 0) {
        if (el) el.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;">Chưa có dữ liệu</p>';
        return;
    }

    el.innerHTML = data.map(item => {
        const cap = item.total_capacity || 0;
        const sold = item.tickets_sold || 0;
        const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
        const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#f97316';
        return `
            <div class="occupancy-item">
                <div class="occupancy-info">
                    <span class="occupancy-name">${item.name}</span>
                    <span class="occupancy-pct" style="color:${color}">${pct}%</span>
                </div>
                <div class="occupancy-bar-bg">
                    <div class="occupancy-bar-fill" style="width:0%;background:linear-gradient(90deg,${color},${color}aa)"
                         data-target="${pct}"></div>
                </div>
                <div class="occupancy-sub">${sold.toLocaleString()} / ${cap.toLocaleString()} ghế · ${item.total_showtimes || 0} suất chiếu</div>
            </div>
        `;
    }).join('');

    // Animate bars after DOM paint
    requestAnimationFrame(() => {
        setTimeout(() => {
            el.querySelectorAll('.occupancy-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.target + '%';
            });
        }, 100);
    });
}

// ── Render Top Movies ──
function renderTopMovies(movies) {
    const el = document.getElementById('top-movies-list');
    if (!el) return;
    if (!movies || movies.length === 0) {
        el.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:20px;">Chưa có dữ liệu</p>';
        return;
    }

    el.innerHTML = movies.map((m, i) => {
        const rankClass = `rank-${i + 1}`;
        const stars = m.avg_rating > 0
            ? '★'.repeat(Math.round(m.avg_rating)) + '☆'.repeat(5 - Math.round(m.avg_rating))
            : '☆☆☆☆☆';
        return `
            <div class="movie-rank-item">
                <div class="movie-rank-badge ${rankClass}">${i + 1}</div>
                ${m.poster_url
                    ? `<img class="movie-rank-poster" src="${m.poster_url}" alt="${m.title}" onerror="this.style.display='none'">`
                    : ''}
                <div class="movie-rank-info">
                    <div class="movie-rank-title">${m.title}</div>
                    <div class="movie-rank-meta">
                        <span class="movie-rank-stars">${stars}</span>
                        &nbsp;·&nbsp;${(m.orders || 0).toLocaleString()} đơn
                        &nbsp;·&nbsp;${(m.tickets_sold || 0).toLocaleString()} vé
                    </div>
                </div>
                <div class="movie-rank-revenue">${formatCompact(m.revenue)}</div>
            </div>
        `;
    }).join('');
}

// ── Render Top Theaters ──
function renderTopTheaters(theaters) {
    const el = document.getElementById('top-theaters-list');
    if (!el) return;
    if (!theaters || theaters.length === 0) {
        el.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:20px;">Chưa có dữ liệu</p>';
        return;
    }

    el.innerHTML = theaters.map((t, i) => `
        <div class="theater-rank-item">
            <div class="movie-rank-badge rank-${i + 1}">${i + 1}</div>
            <div class="theater-rank-name">${t.name}</div>
            <div class="theater-rank-revenue">${formatCompact(t.revenue)} · ${(t.orders || 0).toLocaleString()} đơn</div>
        </div>
    `).join('');
}

// ── Render Recent Activity ──
function renderRecentActivity(bookings) {
    const el = document.getElementById('recent-activity');
    if (!el) return;
    if (!bookings || bookings.length === 0) {
        el.innerHTML = '<p class="activity-loading">Chưa có hoạt động nào.</p>';
        return;
    }

    el.innerHTML = bookings.map(b => {
        const statusLabel = STATUS_LABELS[b.status] || b.status;
        const payBadge = b.payment_method
            ? `<span class="pay-badge ${b.payment_method}">${PM_LABELS[b.payment_method] || b.payment_method}</span>`
            : '';
        return `
            <div class="activity-row">
                <div class="activity-status-dot ${b.status}"></div>
                <div class="activity-content">
                    <div class="activity-main">
                        <strong>${b.user_name}</strong> đặt vé &ldquo;${b.movie_title}&rdquo;
                        &nbsp;${payBadge}
                    </div>
                    <div class="activity-sub">
                        ${b.theater_name || ''} · ${formatDateShort(b.booking_time)} · ${statusLabel}
                    </div>
                </div>
                <div class="activity-amount">${formatCompact(b.total_amount)}</div>
            </div>
        `;
    }).join('');
}

// ── Compact number formatter ──
function formatCompact(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' Tỷ';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' Tr';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return n.toLocaleString('vi-VN') + ' đ';
}

function formatDateShort(str) {
    if (!str) return '';
    const d = new Date(str);
    const now = new Date();
    const diff = Math.round((now - d) / 60000);
    if (diff < 1) return 'Vừa xong';
    if (diff < 60) return `${diff} phút trước`;
    if (diff < 1440) return `${Math.floor(diff / 60)} giờ trước`;
    return `${Math.floor(diff / 1440)} ngày trước`;
}

function formatPureDate(dateStr) {
    if (!dateStr) return '--';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderDashboardSummary(stats) {
    const summaryEl = document.getElementById('dash-filter-summary');
    if (summaryEl && stats?.filters) {
        summaryEl.textContent = [
            `Kỳ: ${formatDateRangeLabel(stats.filters.startDate, stats.filters.endDate)}`,
            `${stats.filters.periodDays || 0} ngày`,
            `Rạp: ${stats.filters.theaterName || 'Tất cả rạp'}`,
            `Phim: ${stats.filters.movieTitle || 'Tất cả phim'}`,
            `Thanh toán: ${stats.filters.paymentMethodLabel || 'Tất cả phương thức'}`
        ].join(' · ');
    }

    const revenueSub = document.getElementById('stat-revenue-sub');
    if (revenueSub) {
        const previous = Number(stats?.revenuePreviousPeriod || 0);
        const current = Number(stats?.revenue || 0);
        revenueSub.textContent = previous > 0
            ? `Kỳ trước: ${formatCompact(previous)}`
            : current > 0
                ? 'Kỳ trước: chưa phát sinh'
                : 'Chưa có doanh thu';
    }

    const trendTitle = document.getElementById('revenue-trend-title');
    if (trendTitle && stats?.filters) {
        trendTitle.lastChild.nodeValue = ` DOANH THU ${stats.filters.startDate && stats.filters.endDate ? `(${formatDateRangeLabel(stats.filters.startDate, stats.filters.endDate)})` : 'THEO NGÀY'}`;
    }

    const occupancyTitle = document.getElementById('occupancy-title');
    if (occupancyTitle && stats?.filters) {
        occupancyTitle.lastChild.nodeValue = ` TỈ LỆ LẤP ĐẦY RẠP ${stats.filters.periodDays ? `(${stats.filters.periodDays} ngày)` : ''}`;
    }

    const dailyTitle = document.getElementById('daily-breakdown-title');
    if (dailyTitle && stats?.filters) {
        dailyTitle.lastChild.nodeValue = ` CHI TIẾT THEO NGÀY ${stats.filters.periodDays ? `(${stats.filters.periodDays} ngày)` : ''}`;
    }
}

function renderDashboardInsights(stats) {
    const mappings = [
        ['insight-total-orders', stats?.totalOrders],
        ['insight-paid-orders', stats?.paidOrders],
        ['insight-pending-orders', stats?.pendingOrders],
        ['insight-cancelled-orders', stats?.cancelledOrders],
        ['insight-completion-rate', stats?.completionRate != null ? `${Number(stats.completionRate).toFixed(1)}%` : '—']
    ];

    mappings.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof value === 'number') {
            el.textContent = value.toLocaleString('vi-VN');
        } else {
            el.textContent = value ?? '—';
        }
    });
}

function renderDailyMetricsTable(rows) {
    const tbody = document.getElementById('daily-metrics-body');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:rgba(255,255,255,0.35); padding:18px;">Không có dữ liệu trong khoảng này.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(row => {
        const paid = Number(row.paid_orders || 0);
        const revenue = Number(row.revenue || 0);
        const aov = paid > 0 ? revenue / paid : 0;
        return `
            <tr>
                <td><strong>${formatPureDate(row.day)}</strong></td>
                <td>${Number(row.total_orders || 0).toLocaleString('vi-VN')}</td>
                <td><span class="table-positive">${Number(row.paid_orders || 0).toLocaleString('vi-VN')}</span></td>
                <td>${Number(row.pending_orders || 0).toLocaleString('vi-VN')}</td>
                <td><span class="table-negative">${Number(row.cancelled_orders || 0).toLocaleString('vi-VN')}</span></td>
                <td>${Number(row.tickets_sold || 0).toLocaleString('vi-VN')}</td>
                <td>${formatCurrency(revenue)}</td>
                <td>${formatCurrency(aov)}</td>
            </tr>
        `;
    }).join('');
}

function exportDashboardCsv() {
    const stats = dashboardState.stats;
    if (!stats) {
        showToast('Chưa có dữ liệu để xuất.', 'info');
        return;
    }

    const rows = stats.dailyMetrics || [];
    if (!rows.length) {
        showToast('Không có dữ liệu trong khoảng lọc hiện tại.', 'info');
        return;
    }

    const lines = [
        ['Ngay', 'Don', 'Thanh cong', 'Cho', 'Huy', 'Ve', 'Doanh thu', 'AOV'].join(',')
    ];

    rows.forEach(row => {
        const paid = Number(row.paid_orders || 0);
        const revenue = Number(row.revenue || 0);
        const aov = paid > 0 ? revenue / paid : 0;
        lines.push([
            row.day,
            row.total_orders || 0,
            row.paid_orders || 0,
            row.pending_orders || 0,
            row.cancelled_orders || 0,
            row.tickets_sold || 0,
            revenue,
            Math.round(aov)
        ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rexcinemas-dashboard-${stats.filters?.startDate || 'from'}-${stats.filters?.endDate || 'to'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function setDashboardQuickRange(mode) {
    const startEl = document.getElementById('dash-start-date');
    const endEl = document.getElementById('dash-end-date');
    const end = new Date();
    const start = new Date();

    if (mode === 'month') {
        start.setDate(1);
    } else {
        start.setDate(start.getDate() - (Number(mode) - 1));
    }

    if (startEl) startEl.value = toISODate(start);
    if (endEl) endEl.value = toISODate(end);
    loadDashboard();
}

function resetDashboardFilters() {
    const defaults = getDefaultDashboardRange();
    setDashboardFilters({
        start_date: defaults.startDate,
        end_date: defaults.endDate,
        theater_id: '',
        movie_id: '',
        payment_method: 'all'
    });
    loadDashboard();
}

function applyDashboardFilters() {
    loadDashboard();
}

async function populateDashboardFilterOptions(selectedFilters = null) {
    const theaterSelect = document.getElementById('dash-theater-filter');
    const movieSelect = document.getElementById('dash-movie-filter');
    if (!theaterSelect || !movieSelect) return;

    const currentTheater = selectedFilters?.theater_id || theaterSelect.value || '';
    const currentMovie = selectedFilters?.movie_id || movieSelect.value || '';

    try {
        const [theaters, movies] = await Promise.all([
            API.get('/api/admin/theaters', true),
            API.get('/api/admin/movies', true)
        ]);

        theaterSelect.innerHTML = '<option value="">Tất cả rạp</option>' + theaters.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        movieSelect.innerHTML = '<option value="">Tất cả phim</option>' + movies.map(m => `<option value="${m.id}">${m.title}</option>`).join('');

        if (currentTheater) theaterSelect.value = String(currentTheater);
        if (currentMovie) movieSelect.value = String(currentMovie);
    } catch (e) {
        // Filters remain usable even if option preload fails.
    }
}

// ── Main loadDashboard override ──
// This overrides the basic one in admin.js once this file is loaded
document.addEventListener('DOMContentLoaded', () => {
    initChartDefaults();
    updateDateTime();
    const defaults = getDefaultDashboardRange();
    setDashboardFilters({
        start_date: defaults.startDate,
        end_date: defaults.endDate,
        theater_id: '',
        movie_id: '',
        payment_method: 'all'
    });
    populateDashboardFilterOptions();
    setInterval(updateDateTime, 60_000);
});

// Expose enhanced loadDashboard as window function (called by admin.js nav + refresh btn)
window.loadDashboard = async function () {
    const btn = document.getElementById('refresh-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
        const filters = normalizeDashboardFilters();
        const stats = await API.get(`/api/admin/stats?${new URLSearchParams(filters).toString()}`, true);
        dashboardState.stats = stats;
        setDashboardFilters({
            start_date: stats.filters?.startDate || filters.start_date,
            end_date: stats.filters?.endDate || filters.end_date,
            theater_id: stats.filters?.theaterId || '',
            movie_id: stats.filters?.movieId || '',
            payment_method: stats.filters?.paymentMethod || 'all'
        });
        renderDashboardSummary(stats);

        // ── KPIs ──
        const revEl = document.getElementById('stat-revenue');
        if (revEl) revEl.textContent = formatCompact(stats.revenue);

        const tickEl = document.getElementById('stat-tickets');
        if (tickEl) tickEl.textContent = Number(stats.tickets || 0).toLocaleString('vi-VN');

        const usrEl = document.getElementById('stat-users');
        if (usrEl) usrEl.textContent = Number(stats.users || 0).toLocaleString('vi-VN');

        const movEl = document.getElementById('stat-movies');
        if (movEl) movEl.textContent = Number(stats.movies || 0).toLocaleString('vi-VN');

        const aovEl = document.getElementById('stat-aov');
        if (aovEl) aovEl.textContent = formatCompact(stats.averageOrderValue || 0);

        renderTrendBadge(stats.revenueTrendPercent, stats.revenuePreviousPeriod, stats.revenue);

        renderDashboardInsights(stats);

        // ── Charts ──
        renderRevenueTrend(stats.dailyMetrics || stats.revenueByDay || [], stats.filters || filters);

        // Payment methods
        if (stats.revenueByPayment && stats.revenueByPayment.length > 0) {
            const pmLabels = stats.revenueByPayment.map(p => PM_LABELS[p.payment_method] || p.payment_method);
            const pmValues = stats.revenueByPayment.map(p => p.count);
            renderDonutChart('chart-payment-methods', pmLabels, pmValues, PM_COLORS, 'payment-legend');
        } else {
            destroyChart('chart-payment-methods');
            const legend = document.getElementById('payment-legend');
            if (legend) legend.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;">Chưa có dữ liệu</p>';
        }

        // Booking status
        if (stats.bookingStatus && stats.bookingStatus.length > 0) {
            const bsLabels = stats.bookingStatus.map(s => STATUS_LABELS[s.status] || s.status);
            const bsValues = stats.bookingStatus.map(s => s.count);
            const bsColors = stats.bookingStatus.map(s => STATUS_COLORS[s.status] || '#64748b');
            renderDonutChart('chart-booking-status', bsLabels, bsValues, bsColors, 'status-legend');
        } else {
            destroyChart('chart-booking-status');
            const legend = document.getElementById('status-legend');
            if (legend) legend.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;">Chưa có dữ liệu</p>';
        }

        // Membership distribution
        if (stats.membershipDist && stats.membershipDist.length > 0) {
            const mLabels = stats.membershipDist.map(m => m.membership_level || 'Silver');
            const mValues = stats.membershipDist.map(m => m.count);
            const mColors = mLabels.map(l => MEMBER_COLORS[l] || '#94a3b8');
            renderDonutChart('chart-membership', mLabels, mValues, mColors, 'membership-legend');
        } else {
            destroyChart('chart-membership');
            const legend = document.getElementById('membership-legend');
            if (legend) legend.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:12px;">Chưa có dữ liệu</p>';
        }

        // Theater occupancy
        renderOccupancy(stats.occupancy || []);

        // Top movies & theaters
        renderTopMovies(stats.topMovies || []);
        renderTopTheaters(stats.topTheaters || []);

        // Recent activity
        renderRecentActivity(stats.recentBookings || []);

        // Detailed table
        renderDailyMetricsTable(stats.dailyMetrics || []);

    } catch (e) {
        console.error('Dashboard load error:', e);
        if (typeof showToast !== 'undefined') showToast('Không thể tải dữ liệu thống kê.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
};
