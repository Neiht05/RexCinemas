require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');
const {
    APP_BASE_URL,
    paymentConfig,
    ensureProviderConfigured,
    createMoMoPayment,
    verifyMoMoSignature,
    queryMoMoTransaction,
} = require('./payments');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change_me_in_env') {
    console.warn('[SECURITY WARNING] JWT_SECRET is not set or is using the default value. Please set a strong secret in .env');
}
const _JWT_SECRET = JWT_SECRET || 'rexcinemas_fallback_dev_only_not_for_production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    jwt.verify(token, _JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token." });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (user && user.role === 'admin') next();
    else res.status(403).json({ error: "Access denied. Admins only." });
};

const PENDING_TIMEOUT_MINUTES = 15;
const SEAT_HOLD_TIMEOUT_MINUTES = PENDING_TIMEOUT_MINUTES;

const PAYMENT_METHOD_LABELS = {
    momo: 'MoMo',
    cash: 'Tiền mặt'
};
const DASHBOARD_DEFAULT_RANGE_DAYS = 29;

const cleanupExpiredPendingBookings = () => {
    db.prepare(`
        UPDATE bookings
        SET status = 'cancelled',
            payment_last_error = COALESCE(payment_last_error, 'Payment session expired')
        WHERE status = 'pending'
          AND booking_time <= datetime('now', 'localtime', ?)
    `).run(`-${PENDING_TIMEOUT_MINUTES} minutes`);
};

const cleanupExpiredSeatHolds = () => {
    db.prepare(`
        DELETE FROM seat_holds
        WHERE expires_at <= datetime('now', 'localtime')
    `).run();
};

const getSeatSessionId = (req) => String(req.headers['x-seat-session-id'] || req.body?.seat_session_id || '').trim();

const generateReference = (prefix = 'REX') =>
    `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const getBookingWithDetailsByCode = (bookingCode) => db.prepare(`
    SELECT b.*, m.title as movie_title, m.slug as movie_slug, m.poster_url, s.show_date, s.start_time, r.name as room_name, t.name as theater_name,
           GROUP_CONCAT(st.seat_row || st.seat_number, ', ') as seat_names
    FROM bookings b
    JOIN showtimes s ON b.showtime_id = s.id
    JOIN movies m ON s.movie_id = m.id
    JOIN rooms r ON s.room_id = r.id
    JOIN theaters t ON r.theater_id = t.id
    LEFT JOIN booking_tickets bt ON b.id = bt.booking_id
    LEFT JOIN seats st ON bt.seat_id = st.id
    WHERE b.booking_code = ?
    GROUP BY b.id
`).get(bookingCode);

const updateMembershipForUser = (userId) => {
    const user = db.prepare('SELECT loyalty_points FROM users WHERE id = ?').get(userId);
    let newLevel = 'Silver';
    if ((user?.loyalty_points || 0) >= 3000) newLevel = 'Diamond';
    else if ((user?.loyalty_points || 0) >= 1000) newLevel = 'Gold';
    db.prepare('UPDATE users SET membership_level = ? WHERE id = ?').run(newLevel, userId);
};

const markBookingPaid = db.transaction((bookingId, transactionId = '') => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking || booking.status !== 'pending') return booking;

    db.prepare(`
        UPDATE bookings
        SET status = 'paid',
            payment_transaction_id = COALESCE(?, payment_transaction_id),
            payment_completed_at = datetime('now', 'localtime'),
            payment_last_error = NULL
        WHERE id = ?
    `).run(transactionId || booking.payment_transaction_id || null, bookingId);

    const pointsGained = Math.floor(booking.total_amount / 1000);
    db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(pointsGained, booking.user_id);
    updateMembershipForUser(booking.user_id);

    return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
});

const markBookingCancelled = (bookingId, message = 'Payment failed or cancelled') => {
    db.prepare(`
        UPDATE bookings
        SET status = 'cancelled',
            payment_last_error = ?
        WHERE id = ? AND status != 'paid'
    `).run(message, bookingId);
};

const MOMO_SUCCESS_RESULT_CODES = new Set([0, 9000]);
const MOMO_PENDING_RESULT_CODES = new Set([1000, 7000, 7002]);

const toRoundedAmount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
};

const getMoMoResultCode = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const isMoMoAmountMatch = (booking, momoAmount) => {
    const bookingAmount = toRoundedAmount(booking?.total_amount);
    const callbackAmount = toRoundedAmount(momoAmount);
    return bookingAmount !== null && callbackAmount !== null && bookingAmount === callbackAmount;
};

const isMoMoPartnerCodeMatch = (partnerCode) =>
    String(partnerCode || '').trim() === String(paymentConfig.momo.partnerCode || '').trim();

const resolveMoMoCheckoutMethod = (method) => {
    const normalized = String(method || '').trim().toLowerCase();
    if (!normalized || normalized === 'momo') {
        return { paymentMethod: 'momo', requestType: 'payWithMethod' };
    }
    if (normalized === 'momo_wallet' || normalized === 'wallet') {
        return { paymentMethod: 'momo_wallet', requestType: 'captureWallet' };
    }
    if (normalized === 'momo_atm' || normalized === 'atm' || normalized === 'paywithatm') {
        return { paymentMethod: 'momo_atm', requestType: 'payWithATM' };
    }
    throw new Error('Phương thức thanh toán không hợp lệ. Vui lòng chọn MoMo Ví hoặc MoMo ATM.');
};

const buildPaymentResultUrl = (status, bookingCode) => {
    const params = new URLSearchParams({ status });
    if (bookingCode) params.set('booking', bookingCode);
    return `${APP_BASE_URL}/payment-result.html?${params.toString()}`;
};

const reconcilePendingMoMoBooking = async (booking) => {
    if (!booking || booking.status !== 'pending' || booking.payment_provider !== 'momo' || !booking.payment_reference) {
        return booking;
    }

    const queryResult = await queryMoMoTransaction({
        orderId: booking.payment_reference,
        requestId: generateReference('QRY')
    });

    const hasPartnerCode = queryResult.partnerCode !== undefined && queryResult.partnerCode !== null && queryResult.partnerCode !== '';
    const hasAmount = queryResult.amount !== undefined && queryResult.amount !== null && queryResult.amount !== '';
    if ((hasPartnerCode && !isMoMoPartnerCodeMatch(queryResult.partnerCode))
        || (hasAmount && !isMoMoAmountMatch(booking, queryResult.amount))) {
        markBookingCancelled(booking.id, 'Du lieu doi soat MoMo khong hop le.');
        return db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    }

    const resultCode = getMoMoResultCode(queryResult.resultCode);
    if (MOMO_SUCCESS_RESULT_CODES.has(resultCode)) {
        return markBookingPaid(booking.id, queryResult.transId ? String(queryResult.transId) : '');
    }
    if (MOMO_PENDING_RESULT_CODES.has(resultCode) || resultCode === null) {
        return booking;
    }

    markBookingCancelled(booking.id, queryResult.message || 'MoMo payment failed');
    return db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
};

const toISODate = (date) => date.toISOString().split('T')[0];

const normalizeDashboardDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return toISODate(parsed);
};

const shiftISODate = (dateStr, days) => {
    const parsed = new Date(`${dateStr}T00:00:00`);
    parsed.setDate(parsed.getDate() + days);
    return toISODate(parsed);
};

const getDefaultDashboardRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - DASHBOARD_DEFAULT_RANGE_DAYS);
    return { startDate: toISODate(start), endDate: toISODate(end) };
};

const daysBetweenInclusive = (startDate, endDate) => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const diff = Math.round((end - start) / 86400000);
    return Math.max(1, diff + 1);
};

const resolveDashboardFilters = (query = {}) => {
    const defaults = getDefaultDashboardRange();
    let startDate = normalizeDashboardDate(query.start_date) || defaults.startDate;
    let endDate = normalizeDashboardDate(query.end_date) || defaults.endDate;

    if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
    }

    const theaterId = query.theater_id ? Number.parseInt(query.theater_id, 10) : null;
    const movieId = query.movie_id ? Number.parseInt(query.movie_id, 10) : null;
    const paymentMethod = query.payment_method && query.payment_method !== 'all' ? query.payment_method : null;

    return {
        startDate,
        endDate,
        theaterId: Number.isFinite(theaterId) ? theaterId : null,
        movieId: Number.isFinite(movieId) ? movieId : null,
        paymentMethod
    };
};

const buildBookingScope = (filters, aliases = {}) => {
    const bookingAlias = aliases.bookingAlias || 'b';
    const movieAlias = aliases.movieAlias || 'm';
    const theaterAlias = aliases.theaterAlias || 't';

    const conditions = [`date(${bookingAlias}.booking_time) BETWEEN ? AND ?`];
    const params = [filters.startDate, filters.endDate];

    if (filters.movieId) {
        conditions.push(`${movieAlias}.id = ?`);
        params.push(filters.movieId);
    }
    if (filters.theaterId) {
        conditions.push(`${theaterAlias}.id = ?`);
        params.push(filters.theaterId);
    }
    if (filters.paymentMethod) {
        conditions.push(`${bookingAlias}.payment_method = ?`);
        params.push(filters.paymentMethod);
    }

    return {
        where: `WHERE ${conditions.join(' AND ')}`,
        params
    };
};

const buildShowtimeScope = (filters, aliases = {}) => {
    const showtimeAlias = aliases.showtimeAlias || 's';
    const movieAlias = aliases.movieAlias || 'm';
    const theaterAlias = aliases.theaterAlias || 't';

    const conditions = [`date(${showtimeAlias}.show_date) BETWEEN ? AND ?`];
    const params = [filters.startDate, filters.endDate];

    if (filters.movieId) {
        conditions.push(`${movieAlias}.id = ?`);
        params.push(filters.movieId);
    }
    if (filters.theaterId) {
        conditions.push(`${theaterAlias}.id = ?`);
        params.push(filters.theaterId);
    }

    return {
        where: `WHERE ${conditions.join(' AND ')}`,
        params
    };
};

const syncReleasedMovies = () => {
    const result = db.prepare(`
        UPDATE movies
        SET status = 'now_showing'
        WHERE status = 'coming_soon'
          AND release_date IS NOT NULL
          AND release_date <> ''
          AND date(release_date) <= date('now', 'localtime')
    `).run();

    return result.changes;
};

const resolveMovieStatus = (status, releaseDate) => {
    const desiredStatus = status === 'coming_soon' ? 'coming_soon' : 'now_showing';
    if (desiredStatus === 'coming_soon' && releaseDate) {
        const today = db.prepare(`SELECT date('now', 'localtime') as today`).get().today;
        if (releaseDate <= today) return 'now_showing';
    }
    return desiredStatus;
};

const buildMovieSlug = (title) => String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const toPositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const isValidDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isValidTimeString = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

app.use(['/api/movies', '/api/admin/movies'], (req, res, next) => {
    syncReleasedMovies();
    next();
});

syncReleasedMovies();
setInterval(syncReleasedMovies, 15 * 60 * 1000).unref?.();
cleanupExpiredSeatHolds();
setInterval(cleanupExpiredSeatHolds, 5 * 60 * 1000).unref?.();

// ============================================
// AUTH APIs
// ============================================

app.post('/api/register', async (req, res) => {
    try {
        const { full_name, email, password, phone } = req.body;
        if (!full_name || !email || !password) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin." });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const insert = db.prepare('INSERT INTO users (full_name, email, password_hash, phone) VALUES (?, ?, ?, ?)');
        const result = insert.run(full_name, email, hashedPassword, phone || null);
        res.status(201).json({ message: "Đăng ký thành công", user_id: result.lastInsertRowid });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: "Email này đã được sử dụng." });
        }
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Vui lòng nhập email và mật khẩu." });
        }
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) return res.status(400).json({ error: "Email hoặc mật khẩu không đúng." });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: "Email hoặc mật khẩu không đúng." });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.full_name },
            _JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ message: "Đăng nhập thành công", token, role: user.role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/me', authenticateToken, (req, res) => {
    const user = db.prepare(
        'SELECT id, full_name as name, email, phone, role, loyalty_points, membership_level, created_at FROM users WHERE id = ?'
    ).get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
});

app.put('/api/me/password', authenticateToken, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin." });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." });
        }

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });

        const hash = await bcrypt.hash(new_password, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
        res.json({ message: "Đổi mật khẩu thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PUBLIC APIs — MOVIES
// ============================================

app.get('/api/movies/now-showing', (req, res) => {
    const movies = db.prepare(`
        SELECT m.*, (SELECT AVG(rating) FROM reviews WHERE movie_id = m.id) as avg_rating 
        FROM movies m WHERE m.status = 'now_showing'
        ORDER BY m.created_at DESC
    `).all();
    res.json(movies);
});

app.get('/api/movies/coming-soon', (req, res) => {
    const movies = db.prepare(`
        SELECT m.*, (SELECT AVG(rating) FROM reviews WHERE movie_id = m.id) as avg_rating 
        FROM movies m WHERE m.status = 'coming_soon'
        ORDER BY m.release_date ASC
    `).all();
    res.json(movies);
});

app.get('/api/movies/:slug', (req, res) => {
    const movie = db.prepare(`
        SELECT m.*, (SELECT AVG(rating) FROM reviews WHERE movie_id = m.id) as avg_rating 
        FROM movies m WHERE m.slug = ?
    `).get(req.params.slug);
    if (movie) res.json(movie);
    else res.status(404).json({ error: "Movie not found" });
});

// ============================================
// PUBLIC APIs — SHOWTIMES & SEATS
// ============================================

app.get('/api/movies/:slug/showtimes', (req, res) => {
    const movie = db.prepare("SELECT id FROM movies WHERE slug = ?").get(req.params.slug);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    const showtimes = db.prepare(`
        SELECT s.*, r.name as room_name, r.room_type, t.name as theater_name 
        FROM showtimes s
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        WHERE s.movie_id = ? 
          AND s.show_date >= date('now', 'localtime')
        ORDER BY s.show_date, s.start_time
    `).all(movie.id);
    res.json(showtimes);
});

app.get('/api/showtimes/:id/seats', (req, res) => {
    cleanupExpiredPendingBookings();
    cleanupExpiredSeatHolds();
    const showtime = db.prepare("SELECT room_id FROM showtimes WHERE id = ?").get(req.params.id);
    if (!showtime) return res.status(404).json({ error: "Showtime not found" });
    const seatSessionId = getSeatSessionId(req);

    const seats = db.prepare(`
        SELECT s.*,
        CASE WHEN EXISTS (
            SELECT 1 FROM booking_tickets bt
            JOIN bookings b ON bt.booking_id = b.id
            WHERE bt.seat_id = s.id AND b.showtime_id = ? AND b.status != 'cancelled'
        ) THEN 1 ELSE 0 END as is_booked,
        sh.session_id as hold_session_id,
        sh.expires_at as hold_expires_at
        FROM seats s
        LEFT JOIN seat_holds sh
            ON sh.seat_id = s.id
           AND sh.showtime_id = ?
           AND sh.expires_at > datetime('now', 'localtime')
        WHERE s.room_id = ?
        ORDER BY s.seat_row, s.seat_number
    `).all(req.params.id, req.params.id, showtime.room_id).map(seat => ({
        ...seat,
        is_booked: !!seat.is_booked,
        is_held: !!seat.hold_session_id && seat.hold_session_id !== seatSessionId,
        is_held_by_me: !!seat.hold_session_id && seat.hold_session_id === seatSessionId
    }));
    res.json(seats);
});

app.post('/api/showtimes/:id/seats/hold', (req, res) => {
    try {
        cleanupExpiredSeatHolds();
        const seatSessionId = getSeatSessionId(req);
        const seatId = parseInt(req.body.seat_id, 10);
        if (!seatSessionId) {
            return res.status(400).json({ error: 'Thiếu mã phiên chọn ghế.' });
        }
        if (!seatId) {
            return res.status(400).json({ error: 'Thiếu ghế cần giữ.' });
        }

        const showtime = db.prepare("SELECT room_id FROM showtimes WHERE id = ?").get(req.params.id);
        if (!showtime) return res.status(404).json({ error: "Showtime not found" });

        const holdSeat = db.transaction(() => {
            const seat = db.prepare("SELECT id, seat_row, seat_number, room_id FROM seats WHERE id = ?").get(seatId);
            if (!seat || seat.room_id !== showtime.room_id) {
                const err = new Error('Ghế không hợp lệ.');
                err.statusCode = 400;
                throw err;
            }

            const booked = db.prepare(`
                SELECT s.seat_row || s.seat_number as seat_name
                FROM booking_tickets bt
                JOIN bookings b ON bt.booking_id = b.id
                JOIN seats s ON bt.seat_id = s.id
                WHERE bt.seat_id = ? AND b.showtime_id = ? AND b.status != 'cancelled'
            `).get(seatId, req.params.id);
            if (booked) {
                const err = new Error(`Ghế ${booked.seat_name} đã được đặt.`);
                err.statusCode = 409;
                throw err;
            }

            const activeHold = db.prepare(`
                SELECT session_id
                FROM seat_holds
                WHERE showtime_id = ? AND seat_id = ? AND expires_at > datetime('now', 'localtime')
            `).get(req.params.id, seatId);
            if (activeHold && activeHold.session_id !== seatSessionId) {
                const err = new Error(`Ghế ${seat.seat_row}${seat.seat_number} đang được người khác chọn.`);
                err.statusCode = 409;
                throw err;
            }

            const upsertResult = db.prepare(`
                INSERT INTO seat_holds (showtime_id, seat_id, session_id, user_id, expires_at)
                VALUES (?, ?, ?, ?, datetime('now', 'localtime', ?))
                ON CONFLICT(showtime_id, seat_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    user_id = excluded.user_id,
                    expires_at = excluded.expires_at,
                    updated_at = datetime('now', 'localtime')
                WHERE seat_holds.session_id = excluded.session_id
                   OR seat_holds.expires_at <= datetime('now', 'localtime')
            `).run(req.params.id, seatId, seatSessionId, req.user?.id || null, `+${SEAT_HOLD_TIMEOUT_MINUTES} minutes`);

            if (upsertResult.changes === 0) {
                const err = new Error(`Ghế ${seat.seat_row}${seat.seat_number} đang được người khác chọn.`);
                err.statusCode = 409;
                throw err;
            }

            return seat;
        });

        const seat = holdSeat();
        res.json({
            message: 'Đã giữ ghế.',
            seat_id: seat.id,
            seat_name: `${seat.seat_row}${seat.seat_number}`
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

app.post('/api/showtimes/:id/seats/release', (req, res) => {
    try {
        cleanupExpiredSeatHolds();
        const seatSessionId = getSeatSessionId(req);
        const seatIds = Array.isArray(req.body.seat_ids)
            ? req.body.seat_ids.map(id => parseInt(id, 10)).filter(Boolean)
            : [parseInt(req.body.seat_id, 10)].filter(Boolean);
        if (!seatSessionId) {
            return res.status(400).json({ error: 'Thiếu mã phiên chọn ghế.' });
        }
        if (seatIds.length === 0) {
            return res.status(400).json({ error: 'Thiếu ghế cần nhả.' });
        }

        const deleteHold = db.transaction((ids) => {
            const stmt = db.prepare(`
                DELETE FROM seat_holds
                WHERE showtime_id = ? AND seat_id = ? AND session_id = ?
            `);
            for (const seatId of ids) {
                stmt.run(req.params.id, seatId, seatSessionId);
            }
        });

        deleteHold(seatIds);
        res.json({ message: 'Đã nhả ghế.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/snacks', (req, res) => {
    const snacks = db.prepare("SELECT * FROM snacks ORDER BY price ASC").all();
    res.json(snacks);
});

app.get('/api/theaters', (req, res) => {
    const theaters = db.prepare("SELECT * FROM theaters ORDER BY name").all();
    res.json(theaters);
});

// ============================================
// PUBLIC APIs — HOMEPAGE CONTENT
// ============================================

app.get('/api/content/events', (req, res) => {
    const events = db.prepare(`
        SELECT * FROM events
        WHERE is_active = 1
        ORDER BY sort_order ASC, created_at DESC
    `).all();
    res.json(events);
});

app.get('/api/content/articles', (req, res) => {
    const articles = db.prepare(`
        SELECT * FROM articles
        WHERE is_active = 1
        ORDER BY sort_order ASC, published_date DESC, created_at DESC
        LIMIT 6
    `).all();
    res.json(articles);
});

app.get('/api/content/media', (req, res) => {
    const items = db.prepare(`
        SELECT * FROM media_items
        WHERE is_active = 1
        ORDER BY sort_order ASC, created_at DESC
        LIMIT 12
    `).all();
    res.json(items);
});

// ============================================
// PROTECTED — BOOKING
// ============================================

app.post('/api/bookings/checkout', authenticateToken, async (req, res) => {
    const { showtime_id, total_amount, seats, snacks, seat_session_id, payment_method } = req.body;
    cleanupExpiredPendingBookings();
    cleanupExpiredSeatHolds();

    if (!seats || seats.length === 0) {
        return res.status(400).json({ error: "Vui lòng chọn ít nhất 1 ghế." });
    }
    if (!showtime_id) {
        return res.status(400).json({ error: "Vui lòng chọn suất chiếu." });
    }
    if (!seat_session_id) {
        return res.status(400).json({ error: "Thiếu mã phiên chọn ghế." });
    }
    const provider = 'momo';
    let resolvedMethod;
    try {
        resolvedMethod = resolveMoMoCheckoutMethod(payment_method);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        ensureProviderConfigured(provider);
    } catch (error) {
        return res.status(503).json({ error: error.message });
    }

    const createPendingBooking = db.transaction((data) => {
        const checkBooked = db.prepare(`
            SELECT s.seat_row || s.seat_number as seat_name FROM booking_tickets bt
            JOIN bookings b ON bt.booking_id = b.id
            JOIN seats s ON bt.seat_id = s.id
            WHERE bt.seat_id = ? AND b.showtime_id = ? AND b.status != 'cancelled'
        `);
        const checkHeld = db.prepare(`
            SELECT s.seat_row || s.seat_number as seat_name, sh.session_id
            FROM seat_holds sh
            JOIN seats s ON sh.seat_id = s.id
            WHERE sh.showtime_id = ? AND sh.seat_id = ? AND sh.expires_at > datetime('now', 'localtime')
        `);

        for (const seat of data.seats) {
            const booked = checkBooked.get(seat.id, data.showtime_id);
            if (booked) {
                throw new Error(`Ghế ${booked.seat_name} đã được đặt bởi người khác. Vui lòng chọn ghế khác.`);
            }
            const held = checkHeld.get(data.showtime_id, seat.id);
            if (held && held.session_id !== data.seat_session_id) {
                throw new Error(`Ghế ${held.seat_name} đang được người khác chọn. Vui lòng chọn ghế khác.`);
            }
        }

        const bookingCode = crypto.randomUUID();
        const paymentReference = generateReference('PAY');
        const result = db.prepare(`
            INSERT INTO bookings (
                booking_code, user_id, showtime_id, total_amount, payment_method, payment_provider, payment_reference, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            bookingCode,
            req.user.id,
            data.showtime_id,
            data.total_amount,
            data.payment_method,
            provider,
            paymentReference
        );
        const bookingId = result.lastInsertRowid;

        const insertTicket = db.prepare('INSERT INTO booking_tickets (booking_id, seat_id, price_at_booking) VALUES (?, ?, ?)');
        for (const seat of data.seats) {
            insertTicket.run(bookingId, seat.id, seat.price);
        }

        db.prepare(`
            DELETE FROM seat_holds
            WHERE showtime_id = ?
              AND seat_id IN (${data.seats.map(() => '?').join(',')})
        `).run(data.showtime_id, ...data.seats.map(seat => seat.id));

        if (data.snacks && data.snacks.length > 0) {
            const insertSnack = db.prepare('INSERT INTO booking_snacks (booking_id, snack_id, quantity, price_at_booking) VALUES (?, ?, ?, ?)');
            for (const snack of data.snacks) {
                insertSnack.run(bookingId, snack.id, snack.quantity, snack.price);
            }
        }

        return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    });

    try {
        const booking = createPendingBooking({
            showtime_id,
            total_amount,
            payment_method: resolvedMethod.paymentMethod,
            seats,
            snacks,
            seat_session_id
        });
        const orderInfo = `Thanh toan ve xem phim #${booking.id} - Rex Cinemas`;
        let checkout;

        if (provider === 'momo') {
            checkout = await createMoMoPayment({
                booking,
                amount: total_amount,
                orderInfo,
                requestType: resolvedMethod.requestType
            });
        } else {
            return res.status(400).json({ error: 'Phương thức thanh toán này tạm thời đã đóng. Chỉ hỗ trợ MoMo.' });
        }

        db.prepare('UPDATE bookings SET payment_session_id = ? WHERE id = ?').run(checkout.sessionId || null, booking.id);

        res.status(201).json({
            message: "Khởi tạo thanh toán thành công.",
            booking_id: booking.id,
            booking_code: booking.booking_code,
            status: booking.status,
            checkout_url: checkout.checkoutUrl,
            provider
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/payment-status/:bookingCode', async (req, res) => {
    cleanupExpiredPendingBookings();
    let booking = getBookingWithDetailsByCode(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status === 'pending' && booking.payment_provider === 'momo') {
        try {
            await reconcilePendingMoMoBooking(booking);
            booking = getBookingWithDetailsByCode(req.params.bookingCode);
        } catch (error) {
            console.warn('[MoMo Query] Failed to reconcile booking', booking.booking_code, error.message);
        }
    }

    res.json(booking);
});

app.get('/api/payments/momo/return', (req, res) => {
    let verification;
    try {
        verification = verifyMoMoSignature(req.query);
    } catch (error) {
        return res.redirect(buildPaymentResultUrl('error'));
    }

    const reference = verification.reference || req.query.orderId || req.query.order_id;
    const booking = db.prepare('SELECT * FROM bookings WHERE payment_reference = ?').get(reference);
    if (!booking) {
        return res.redirect(buildPaymentResultUrl('error'));
    }

    if (!verification.isValid) {
        return res.redirect(buildPaymentResultUrl('failed', booking.booking_code));
    }

    if (!isMoMoPartnerCodeMatch(verification.payload.partnerCode) || !isMoMoAmountMatch(booking, verification.payload.amount)) {
        markBookingCancelled(booking.id, 'Du lieu thanh toan MoMo khong hop le.');
        return res.redirect(buildPaymentResultUrl('failed', booking.booking_code));
    }

    if (booking.status === 'paid') {
        return res.redirect(buildPaymentResultUrl('success', booking.booking_code));
    }

    if (verification.isSuccess) {
        markBookingPaid(booking.id, verification.transactionId);
        return res.redirect(buildPaymentResultUrl('success', booking.booking_code));
    }

    markBookingCancelled(booking.id, verification.payload.message || 'MoMo payment failed');
    return res.redirect(buildPaymentResultUrl('failed', booking.booking_code));
});

app.post('/api/payments/momo/ipn', (req, res) => {
    try {
        const verification = verifyMoMoSignature(req.body);
        if (!verification.reference) {
            return res.status(400).json({ resultCode: 1, message: 'missing_order_id' });
        }

        const booking = db.prepare('SELECT * FROM bookings WHERE payment_reference = ?').get(verification.reference);
        if (!booking) {
            return res.status(404).json({ resultCode: 1, message: 'booking_not_found' });
        }
        if (!verification.isValid) {
            return res.status(400).json({ resultCode: 1, message: 'invalid_signature' });
        }
        if (!isMoMoPartnerCodeMatch(verification.payload.partnerCode)) {
            return res.status(400).json({ resultCode: 1, message: 'invalid_partner_code' });
        }
        if (!isMoMoAmountMatch(booking, verification.payload.amount)) {
            markBookingCancelled(booking.id, 'So tien thanh toan khong khop.');
            return res.status(400).json({ resultCode: 1, message: 'invalid_amount' });
        }

        if (booking.status !== 'paid') {
            if (verification.isSuccess) markBookingPaid(booking.id, verification.transactionId);
            else markBookingCancelled(booking.id, verification.payload.message || 'MoMo payment failed');
        }

        return res.json({ resultCode: 0, message: 'success' });
    } catch (error) {
        return res.status(500).json({ resultCode: 99, message: 'internal_error' });
    }
});

// User booking history
app.get('/api/me/bookings', authenticateToken, (req, res) => {
    cleanupExpiredPendingBookings();
    const bookings = db.prepare(`
        SELECT b.id, b.total_amount, b.booking_time, b.status, b.payment_method,
               b.booking_code,
               s.show_date, s.start_time, m.title, m.poster_url, r.name as room_name, t.name as theater_name,
               GROUP_CONCAT(st.seat_row || st.seat_number, ', ') as seat_names
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        LEFT JOIN booking_tickets bt ON b.id = bt.booking_id
        LEFT JOIN seats st ON bt.seat_id = st.id
        WHERE b.user_id = ?
        GROUP BY b.id
        ORDER BY b.booking_time DESC
    `).all(req.user.id);
    res.json(bookings);
});

// ============================================
// REVIEWS
// ============================================

app.get('/api/movies/:id/reviews', (req, res) => {
    const reviews = db.prepare(`
        SELECT r.*, u.full_name as user_name 
        FROM reviews r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.movie_id = ? 
        ORDER BY r.created_at DESC
        LIMIT 20
    `).all(req.params.id);
    res.json(reviews);
});

app.post('/api/movies/:id/reviews', authenticateToken, (req, res) => {
    try {
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Vui lòng chọn số sao (1-5)." });
        }
        // Check if user already reviewed this movie
        const existing = db.prepare('SELECT id FROM reviews WHERE user_id = ? AND movie_id = ?').get(req.user.id, req.params.id);
        if (existing) {
            // Update existing review
            db.prepare('UPDATE reviews SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(rating, comment || '', existing.id);
            return res.json({ message: "Cập nhật đánh giá thành công!" });
        }
        db.prepare('INSERT INTO reviews (user_id, movie_id, rating, comment) VALUES (?, ?, ?, ?)')
            .run(req.user.id, req.params.id, rating, comment || '');
        res.status(201).json({ message: "Đánh giá thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADMIN APIs
// ============================================

// --- Stats ---
app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
  try {
    const filters = resolveDashboardFilters(req.query);
    const periodDays = daysBetweenInclusive(filters.startDate, filters.endDate);
    const previousPeriod = {
        startDate: shiftISODate(filters.startDate, -periodDays),
        endDate: shiftISODate(filters.startDate, -1),
        theaterId: filters.theaterId,
        movieId: filters.movieId,
        paymentMethod: filters.paymentMethod
    };

    const currentScope = buildBookingScope(filters, {
        bookingAlias: 'b',
        movieAlias: 'm',
        theaterAlias: 't'
    });
    const previousScope = buildBookingScope(previousPeriod, {
        bookingAlias: 'b',
        movieAlias: 'm',
        theaterAlias: 't'
    });
    const occupancyShowtimeScope = buildShowtimeScope(filters, {
        showtimeAlias: 's',
        movieAlias: 'm',
        theaterAlias: 't'
    });
    const occupancySoldScope = buildBookingScope(filters, {
        bookingAlias: 'b',
        movieAlias: 'm2',
        theaterAlias: 't2'
    });

    const totalUsers = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'customer'").get();
    const totalMovies = db.prepare("SELECT COUNT(*) as total FROM movies").get();
    const totalTheaters = db.prepare("SELECT COUNT(*) as total FROM theaters").get();

    const currentPeriodTotals = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END), 0) as revenue,
            SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
            SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            COUNT(*) as total_orders,
            COUNT(DISTINCT CASE WHEN b.status = 'paid' THEN b.user_id END) as unique_customers,
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN COALESCE(bt.ticket_count, 0) ELSE 0 END), 0) as tickets_sold,
            COALESCE(AVG(CASE WHEN b.status = 'paid' THEN b.total_amount END), 0) as avg_order_value
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        LEFT JOIN (
            SELECT booking_id, COUNT(*) as ticket_count
            FROM booking_tickets
            GROUP BY booking_id
        ) bt ON bt.booking_id = b.id
        ${currentScope.where}
    `).get(...currentScope.params);

    const previousPeriodTotals = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END), 0) as revenue
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${previousScope.where}
    `).get(...previousScope.params);

    const dailyMetrics = db.prepare(`
        SELECT
            date(b.booking_time) as day,
            COUNT(*) as total_orders,
            SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
            SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END), 0) as revenue,
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN COALESCE(bt.ticket_count, 0) ELSE 0 END), 0) as tickets_sold
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        LEFT JOIN (
            SELECT booking_id, COUNT(*) as ticket_count
            FROM booking_tickets
            GROUP BY booking_id
        ) bt ON bt.booking_id = b.id
        ${currentScope.where}
        GROUP BY date(b.booking_time)
        ORDER BY day ASC
    `).all(...currentScope.params);

    const revenueByPayment = db.prepare(`
        SELECT COALESCE(b.payment_method, 'unknown') as payment_method,
               COUNT(*) as count,
               COALESCE(SUM(b.total_amount), 0) as revenue
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${currentScope.where} AND b.status = 'paid'
        GROUP BY COALESCE(b.payment_method, 'unknown')
        ORDER BY revenue DESC
    `).all(...currentScope.params);

    const bookingStatus = db.prepare(`
        SELECT b.status, COUNT(*) as count
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${currentScope.where}
        GROUP BY b.status
    `).all(...currentScope.params);

    const membershipDist = db.prepare(`
        SELECT u.membership_level, COUNT(DISTINCT u.id) as count
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${currentScope.where} AND b.status = 'paid'
        GROUP BY u.membership_level
    `).all(...currentScope.params);

    const topMovies = db.prepare(`
        SELECT m.id, m.title, m.poster_url, m.genre,
               COUNT(DISTINCT b.id) as orders,
               COALESCE(SUM(CASE WHEN b.status = 'paid' THEN COALESCE(bt.ticket_count, 0) ELSE 0 END), 0) as tickets_sold,
               COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END), 0) as revenue,
               COALESCE((SELECT AVG(rating) FROM reviews WHERE movie_id = m.id), 0) as avg_rating
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        LEFT JOIN (
            SELECT booking_id, COUNT(*) as ticket_count
            FROM booking_tickets
            GROUP BY booking_id
        ) bt ON bt.booking_id = b.id
        ${currentScope.where} AND b.status = 'paid'
        GROUP BY m.id
        ORDER BY revenue DESC
        LIMIT 5
    `).all(...currentScope.params);

    const topTheaters = db.prepare(`
        SELECT t.id, t.name, COUNT(DISTINCT b.id) as orders, COALESCE(SUM(b.total_amount), 0) as revenue
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${currentScope.where} AND b.status = 'paid'
        GROUP BY t.id
        ORDER BY revenue DESC
        LIMIT 5
    `).all(...currentScope.params);

    const occupancy = db.prepare(`
        SELECT t.id, t.name,
               COUNT(DISTINCT s.id) as total_showtimes,
               COALESCE(SUM(COALESCE(sold.sold, 0)), 0) as tickets_sold,
               COALESCE(SUM(COALESCE(r.total_seats, 0)), 0) as total_capacity
        FROM theaters t
        JOIN rooms r ON r.theater_id = t.id
        LEFT JOIN showtimes s ON s.room_id = r.id
        LEFT JOIN movies m ON s.movie_id = m.id
        LEFT JOIN (
            SELECT b.showtime_id, COUNT(bt.id) as sold
            FROM bookings b
            JOIN showtimes s2 ON b.showtime_id = s2.id
            JOIN movies m2 ON s2.movie_id = m2.id
            JOIN rooms r2 ON s2.room_id = r2.id
            JOIN theaters t2 ON r2.theater_id = t2.id
            JOIN booking_tickets bt ON bt.booking_id = b.id
            ${occupancySoldScope.where}
            GROUP BY b.showtime_id
        ) sold ON sold.showtime_id = s.id
        ${occupancyShowtimeScope.where}
        GROUP BY t.id
        ORDER BY tickets_sold DESC
    `).all(...occupancySoldScope.params, ...occupancyShowtimeScope.params);

    const recentBookings = db.prepare(`
        SELECT b.id, b.booking_code, b.total_amount, b.booking_time, b.status,
               b.payment_method, u.full_name as user_name, m.title as movie_title,
               s.show_date, t.name as theater_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ${currentScope.where}
        ORDER BY b.booking_time DESC
        LIMIT 12
    `).all(...currentScope.params);

    const newUsersWeek = db.prepare(`
        SELECT date(created_at) as day, COUNT(*) as count
        FROM users WHERE role='customer' AND created_at >= datetime('now','localtime','-7 days')
        GROUP BY date(created_at) ORDER BY day ASC
    `).all();

    const selectedTheater = filters.theaterId
        ? db.prepare('SELECT name FROM theaters WHERE id = ?').get(filters.theaterId)
        : null;
    const selectedMovie = filters.movieId
        ? db.prepare('SELECT title FROM movies WHERE id = ?').get(filters.movieId)
        : null;

    const completionRate = currentPeriodTotals.total_orders > 0
        ? ((currentPeriodTotals.paid_orders / currentPeriodTotals.total_orders) * 100)
        : 0;
    const revenueTrendPercent = previousPeriodTotals.revenue > 0
        ? (((currentPeriodTotals.revenue - previousPeriodTotals.revenue) / previousPeriodTotals.revenue) * 100)
        : null;

    const bookingsToday = db.prepare(`
        SELECT COUNT(*) as total
        FROM bookings
        WHERE status = 'paid' AND date(booking_time) = date('now', 'localtime')
    `).get();

    res.json({
        filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            periodDays,
            theaterId: filters.theaterId,
            theaterName: selectedTheater?.name || 'Tất cả rạp',
            movieId: filters.movieId,
            movieTitle: selectedMovie?.title || 'Tất cả phim',
            paymentMethod: filters.paymentMethod || 'all',
            paymentMethodLabel: filters.paymentMethod ? PAYMENT_METHOD_LABELS[filters.paymentMethod] || filters.paymentMethod : 'Tất cả phương thức'
        },
        revenue: currentPeriodTotals.revenue,
        tickets: currentPeriodTotals.tickets_sold,
        users: currentPeriodTotals.unique_customers,
        totalUsers: totalUsers.total,
        movies: totalMovies.total,
        totalMovies: totalMovies.total,
        theaters: totalTheaters.total,
        paidOrders: currentPeriodTotals.paid_orders,
        totalOrders: currentPeriodTotals.total_orders,
        pendingOrders: currentPeriodTotals.pending_orders,
        cancelledOrders: currentPeriodTotals.cancelled_orders,
        averageOrderValue: currentPeriodTotals.avg_order_value || 0,
        completionRate,
        revenuePreviousPeriod: previousPeriodTotals.revenue,
        revenueTrendPercent,
        revenueThisMonth: db.prepare(`
            SELECT COALESCE(SUM(total_amount),0) as total
            FROM bookings
            WHERE status = 'paid' AND strftime('%Y-%m', booking_time) = strftime('%Y-%m', 'now', 'localtime')
        `).get().total,
        revenueLastMonth: db.prepare(`
            SELECT COALESCE(SUM(total_amount),0) as total
            FROM bookings
            WHERE status = 'paid' AND strftime('%Y-%m', booking_time) = strftime('%Y-%m', 'now', 'localtime', '-1 month')
        `).get().total,
        bookingsToday: bookingsToday.total,
        dailyMetrics,
        revenueByDay: dailyMetrics.map(row => ({
            day: row.day,
            revenue: row.revenue,
            count: row.total_orders
        })),
        revenueByPayment,
        bookingStatus,
        membershipDist,
        topMovies,
        topTheaters,
        occupancy,
        recentBookings,
        newUsersWeek
    });
  } catch (err) {
    console.error('[Stats Error]', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
});

// --- Movies CRUD ---
app.get('/api/admin/movies', authenticateToken, isAdmin, (req, res) => {
    const movies = db.prepare(`
        SELECT m.*, 
            (SELECT COUNT(*) FROM showtimes WHERE movie_id = m.id) as showtime_count,
            (SELECT AVG(rating) FROM reviews WHERE movie_id = m.id) as avg_rating
        FROM movies m ORDER BY m.created_at DESC
    `).all();
    res.json(movies);
});

app.post('/api/admin/movies', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, description, poster_url, backdrop_url, trailer_url, genre, director, cast_members, duration_minutes, release_date, age_rating, status, is_featured } = req.body;
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle) return res.status(400).json({ error: "Tên phim không được để trống." });

        const slug = buildMovieSlug(normalizedTitle);
        if (!slug) return res.status(400).json({ error: "Tên phim không hợp lệ để tạo slug." });
        const finalStatus = resolveMovieStatus(status, release_date || '');

        const result = db.prepare(`
            INSERT INTO movies (title, slug, description, poster_url, backdrop_url, trailer_url, genre, director, cast_members, duration_minutes, release_date, age_rating, status, is_featured)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(normalizedTitle, slug, description || '', poster_url || '', backdrop_url || '', trailer_url || '', genre || '', director || '', cast_members || '', duration_minutes || 0, release_date || '', age_rating || 'P', finalStatus, is_featured ? 1 : 0);

        res.status(201).json({ message: "Thêm phim thành công!", id: result.lastInsertRowid });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: "Phim với tên này đã tồn tại." });
        }
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/movies/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, description, poster_url, backdrop_url, trailer_url, genre, director, cast_members, duration_minutes, release_date, age_rating, status, is_featured } = req.body;
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle) return res.status(400).json({ error: "Tên phim không được để trống." });

        const slug = buildMovieSlug(normalizedTitle);
        if (!slug) return res.status(400).json({ error: "Tên phim không hợp lệ để tạo slug." });
        const finalStatus = resolveMovieStatus(status, release_date || '');

        db.prepare(`
            UPDATE movies SET title=?, slug=?, description=?, poster_url=?, backdrop_url=?, trailer_url=?, genre=?, director=?, cast_members=?, 
            duration_minutes=?, release_date=?, age_rating=?, status=?, is_featured=? WHERE id=?
        `).run(normalizedTitle, slug, description || '', poster_url || '', backdrop_url || '', trailer_url || '', genre || '', director || '', cast_members || '', duration_minutes || 0, release_date || '', age_rating || 'P', finalStatus, is_featured ? 1 : 0, req.params.id);

        res.json({ message: "Cập nhật phim thành công!" });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: "Phim với tên này đã tồn tại." });
        }
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/movies/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const id = req.params.id;
        db.transaction(() => {
            db.prepare(`DELETE FROM booking_tickets WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE movie_id = ?))`).run(id);
            db.prepare(`DELETE FROM booking_snacks WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE movie_id = ?))`).run(id);
            db.prepare(`DELETE FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE movie_id = ?)`).run(id);
            db.prepare(`DELETE FROM showtimes WHERE movie_id = ?`).run(id);
            db.prepare(`DELETE FROM reviews WHERE movie_id = ?`).run(id);
            db.prepare('DELETE FROM movies WHERE id = ?').run(id);
        })();
        res.json({ message: "Xóa phim thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Snacks CRUD ---
app.get('/api/admin/snacks', authenticateToken, isAdmin, (req, res) => {
    try {
        const snacks = db.prepare('SELECT * FROM snacks ORDER BY id DESC').all();
        res.json(snacks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/snacks', authenticateToken, isAdmin, (req, res) => {
    try {
        const { name, image_url, price, description } = req.body;
        if (!name || !price) return res.status(400).json({ error: "Tên và giá không được để trống." });
        const result = db.prepare('INSERT INTO snacks (name, image_url, price, description) VALUES (?, ?, ?, ?)').run(name, image_url || '', price, description || '');
        res.status(201).json({ message: "Thêm combo thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/snacks/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { name, image_url, price, description } = req.body;
        const normalizedName = String(name || '').trim();
        const normalizedPrice = toPositiveNumber(price);
        if (!normalizedName || normalizedPrice === null) {
            return res.status(400).json({ error: "Tên và giá không hợp lệ." });
        }
        db.prepare('UPDATE snacks SET name=?, image_url=?, price=?, description=? WHERE id=?')
            .run(normalizedName, image_url || '', normalizedPrice, description || '', req.params.id);
        res.json({ message: "Cập nhật combo thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/snacks/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM snacks WHERE id = ?').run(req.params.id);
        res.json({ message: "Xóa combo thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Theaters CRUD ---
app.get('/api/admin/theaters', authenticateToken, isAdmin, (req, res) => {
    const theaters = db.prepare(`
        SELECT t.*, 
            (SELECT COUNT(*) FROM rooms WHERE theater_id = t.id) as room_count
        FROM theaters t ORDER BY t.name
    `).all();
    res.json(theaters);
});

app.post('/api/admin/theaters', authenticateToken, isAdmin, (req, res) => {
    try {
        const { name, address, hotline } = req.body;
        if (!name || !address) return res.status(400).json({ error: "Tên và địa chỉ rạp không được để trống." });
        const result = db.prepare('INSERT INTO theaters (name, address, hotline) VALUES (?, ?, ?)').run(name, address, hotline || '');
        res.status(201).json({ message: "Thêm rạp thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/theaters/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { name, address, hotline } = req.body;
        const normalizedName = String(name || '').trim();
        const normalizedAddress = String(address || '').trim();
        if (!normalizedName || !normalizedAddress) {
            return res.status(400).json({ error: "Tên và địa chỉ rạp không được để trống." });
        }
        db.prepare('UPDATE theaters SET name=?, address=?, hotline=? WHERE id=?')
            .run(normalizedName, normalizedAddress, hotline || '', req.params.id);
        res.json({ message: "Cập nhật rạp thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/theaters/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const id = req.params.id;
        db.transaction(() => {
            const rooms = db.prepare('SELECT id FROM rooms WHERE theater_id = ?').all(id);
            const dropRoom = db.prepare('DELETE FROM rooms WHERE id = ?');
            // Re-use logic for deleting rooms manually to cascade correctly
            for (let r of rooms) {
                db.prepare(`DELETE FROM booking_tickets WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?))`).run(r.id);
                db.prepare(`DELETE FROM booking_snacks WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?))`).run(r.id);
                db.prepare(`DELETE FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?)`).run(r.id);
                db.prepare(`DELETE FROM showtimes WHERE room_id = ?`).run(r.id);
                db.prepare(`DELETE FROM seats WHERE room_id = ?`).run(r.id);
                dropRoom.run(r.id);
            }
            db.prepare('DELETE FROM theaters WHERE id = ?').run(id);
        })();
        res.json({ message: "Xóa rạp thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Rooms CRUD ---
app.get('/api/admin/rooms', authenticateToken, isAdmin, (req, res) => {
    const rooms = db.prepare(`
        SELECT r.*, t.name as theater_name,
            (SELECT COUNT(*) FROM seats WHERE room_id = r.id) as seat_count
        FROM rooms r JOIN theaters t ON r.theater_id = t.id
        ORDER BY t.name, r.name
    `).all();
    res.json(rooms);
});

app.post('/api/admin/rooms', authenticateToken, isAdmin, (req, res) => {
    try {
        const { theater_id, name, room_type, rows, cols, vip_rows, couple_rows } = req.body;
        if (!theater_id || !name) return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin." });

        const roomResult = db.prepare('INSERT INTO rooms (theater_id, name, room_type) VALUES (?, ?, ?)')
            .run(theater_id, name, room_type || 'Standard');
        const roomId = roomResult.lastInsertRowid;

        // Auto-generate seats if rows/cols provided
        if (rows && cols) {
            const insertSeat = db.prepare('INSERT INTO seats (room_id, seat_row, seat_number, seat_type) VALUES (?, ?, ?, ?)');
            const vipArr = (vip_rows || '').split(',').map(r => r.trim().toUpperCase());
            const coupleArr = (couple_rows || '').split(',').map(r => r.trim().toUpperCase());
            const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, parseInt(rows));

            rowLetters.forEach(row => {
                for (let i = 1; i <= parseInt(cols); i++) {
                    let type = 'normal';
                    if (vipArr.includes(row)) type = 'vip';
                    if (coupleArr.includes(row)) type = 'couple';
                    insertSeat.run(roomId, row, i, type);
                }
            });

            db.prepare('UPDATE rooms SET total_seats = ? WHERE id = ?').run(rowLetters.length * parseInt(cols), roomId);
        }

        res.status(201).json({ message: "Thêm phòng chiếu thành công!", id: roomId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/rooms/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const id = req.params.id;
        db.transaction(() => {
            db.prepare(`DELETE FROM booking_tickets WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?))`).run(id);
            db.prepare(`DELETE FROM booking_snacks WHERE booking_id IN (SELECT id FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?))`).run(id);
            db.prepare(`DELETE FROM bookings WHERE showtime_id IN (SELECT id FROM showtimes WHERE room_id = ?)`).run(id);
            db.prepare(`DELETE FROM showtimes WHERE room_id = ?`).run(id);
            db.prepare(`DELETE FROM seats WHERE room_id = ?`).run(id);
            db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
        })();
        res.json({ message: "Xóa phòng chiếu thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Showtimes CRUD ---
app.get('/api/admin/showtimes', authenticateToken, isAdmin, (req, res) => {
    const showtimes = db.prepare(`
        SELECT s.*, m.title as movie_title, m.poster_url, r.name as room_name, t.name as theater_name,
            (SELECT COUNT(*) FROM booking_tickets bt 
             JOIN bookings b ON bt.booking_id = b.id 
             WHERE b.showtime_id = s.id AND b.status != 'cancelled') as tickets_sold
        FROM showtimes s
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        ORDER BY s.show_date DESC, s.start_time DESC
    `).all();
    res.json(showtimes);
});

app.post('/api/admin/showtimes', authenticateToken, isAdmin, (req, res) => {
    try {
        const { movie_id, room_id, show_date, start_time, end_time, base_price } = req.body;
        if (!movie_id || !room_id || !show_date || !start_time || !base_price) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin suất chiếu." });
        }
        const result = db.prepare(
            'INSERT INTO showtimes (movie_id, room_id, show_date, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(movie_id, room_id, show_date, start_time, end_time || '', base_price);
        res.status(201).json({ message: "Thêm suất chiếu thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/showtimes/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { movie_id, room_id, show_date, start_time, end_time, base_price } = req.body;
        const normalizedMovieId = toPositiveInt(movie_id);
        const normalizedRoomId = toPositiveInt(room_id);
        const normalizedBasePrice = toPositiveNumber(base_price);
        const normalizedShowDate = String(show_date || '').trim();
        const normalizedStartTime = String(start_time || '').trim();
        const normalizedEndTime = String(end_time || '').trim();

        if (!normalizedMovieId || !normalizedRoomId || normalizedBasePrice === null || !isValidDateString(normalizedShowDate) || !isValidTimeString(normalizedStartTime)) {
            return res.status(400).json({ error: "Dữ liệu suất chiếu không hợp lệ." });
        }
        if (normalizedEndTime && !isValidTimeString(normalizedEndTime)) {
            return res.status(400).json({ error: "Giờ kết thúc không hợp lệ." });
        }

        db.prepare(
            'UPDATE showtimes SET movie_id=?, room_id=?, show_date=?, start_time=?, end_time=?, base_price=? WHERE id=?'
        ).run(normalizedMovieId, normalizedRoomId, normalizedShowDate, normalizedStartTime, normalizedEndTime, normalizedBasePrice, req.params.id);
        res.json({ message: "Cập nhật suất chiếu thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/showtimes/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM showtimes WHERE id = ?').run(req.params.id);
        res.json({ message: "Xóa suất chiếu thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Bookings (Admin view) ---
app.get('/api/admin/bookings', authenticateToken, isAdmin, (req, res) => {
    const bookings = db.prepare(`
        SELECT b.*, u.full_name as user_name, u.email as user_email,
               m.title as movie_title, s.show_date, s.start_time,
               r.name as room_name, t.name as theater_name,
               GROUP_CONCAT(st.seat_row || st.seat_number, ', ') as seat_names
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN rooms r ON s.room_id = r.id
        JOIN theaters t ON r.theater_id = t.id
        LEFT JOIN booking_tickets bt ON b.id = bt.booking_id
        LEFT JOIN seats st ON bt.seat_id = st.id
        GROUP BY b.id
        ORDER BY b.booking_time DESC
    `).all();
    res.json(bookings);
});

app.put('/api/admin/bookings/:id/cancel', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(req.params.id);
        res.json({ message: "Đã hủy đơn hàng." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Users (Admin view) ---
app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare(`
        SELECT u.id, u.full_name, u.email, u.phone, u.role, u.loyalty_points, u.membership_level, u.created_at,
            (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as booking_count,
            (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE user_id = u.id AND status = 'paid') as total_spent
        FROM users u ORDER BY u.created_at DESC
    `).all();
    res.json(users);
});

// --- Reviews (Admin view) ---
app.get('/api/admin/reviews', authenticateToken, isAdmin, (req, res) => {
    const reviews = db.prepare(`
        SELECT r.id, r.rating, r.comment, r.created_at,
               u.full_name as user_name, u.email as user_email,
               m.title as movie_title, m.slug as movie_slug
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN movies m ON r.movie_id = m.id
        ORDER BY r.created_at DESC
    `).all();
    res.json(reviews);
});

app.delete('/api/admin/reviews/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Đánh giá không tồn tại." });
        }
        res.json({ message: "Xóa đánh giá thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Events (Admin view) ---
app.get('/api/admin/events', authenticateToken, isAdmin, (req, res) => {
    const events = db.prepare(`
        SELECT * FROM events
        ORDER BY sort_order ASC, created_at DESC
    `).all();
    res.json(events);
});

app.post('/api/admin/events', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, accent_text, tag, description, button_text, button_link, image_url, layout, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề sự kiện không được để trống." });

        const result = db.prepare(`
            INSERT INTO events (title, accent_text, tag, description, button_text, button_link, image_url, layout, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            title,
            accent_text || '',
            tag || '',
            description || '',
            button_text || '',
            button_link || '',
            image_url || '',
            layout === 'text_right' ? 'text_right' : 'text_left',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0
        );

        res.status(201).json({ message: "Thêm sự kiện thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/events/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, accent_text, tag, description, button_text, button_link, image_url, layout, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề sự kiện không được để trống." });

        db.prepare(`
            UPDATE events
            SET title = ?, accent_text = ?, tag = ?, description = ?, button_text = ?, button_link = ?,
                image_url = ?, layout = ?, sort_order = ?, is_active = ?
            WHERE id = ?
        `).run(
            title,
            accent_text || '',
            tag || '',
            description || '',
            button_text || '',
            button_link || '',
            image_url || '',
            layout === 'text_right' ? 'text_right' : 'text_left',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0,
            req.params.id
        );

        res.json({ message: "Cập nhật sự kiện thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/events/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
        res.json({ message: "Xóa sự kiện thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Articles (Admin view) ---
app.get('/api/admin/articles', authenticateToken, isAdmin, (req, res) => {
    const articles = db.prepare(`
        SELECT * FROM articles
        ORDER BY sort_order ASC, published_date DESC, created_at DESC
    `).all();
    res.json(articles);
});

app.post('/api/admin/articles', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, category_label, image_url, published_date, link_url, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề bài viết không được để trống." });

        const result = db.prepare(`
            INSERT INTO articles (title, category_label, image_url, published_date, link_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            title,
            category_label || 'TIN TỨC',
            image_url || '',
            published_date || '',
            link_url || '#',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0
        );

        res.status(201).json({ message: "Thêm bài viết thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/articles/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, category_label, image_url, published_date, link_url, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề bài viết không được để trống." });

        db.prepare(`
            UPDATE articles
            SET title = ?, category_label = ?, image_url = ?, published_date = ?, link_url = ?, sort_order = ?, is_active = ?
            WHERE id = ?
        `).run(
            title,
            category_label || 'TIN TỨC',
            image_url || '',
            published_date || '',
            link_url || '#',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0,
            req.params.id
        );

        res.json({ message: "Cập nhật bài viết thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/articles/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
        res.json({ message: "Xóa bài viết thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Media (Admin view) ---
app.get('/api/admin/media', authenticateToken, isAdmin, (req, res) => {
    const items = db.prepare(`
        SELECT * FROM media_items
        ORDER BY sort_order ASC, created_at DESC
    `).all();
    res.json(items);
});

app.post('/api/admin/media', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, media_type, thumbnail_url, video_url, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề trailer/clip không được để trống." });

        const result = db.prepare(`
            INSERT INTO media_items (title, media_type, thumbnail_url, video_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            title,
            media_type === 'clip' ? 'clip' : 'trailer',
            thumbnail_url || '',
            video_url || '',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0
        );

        res.status(201).json({ message: "Thêm trailer/clip thành công!", id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/media/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        const { title, media_type, thumbnail_url, video_url, sort_order, is_active } = req.body;
        if (!title) return res.status(400).json({ error: "Tiêu đề trailer/clip không được để trống." });

        db.prepare(`
            UPDATE media_items
            SET title = ?, media_type = ?, thumbnail_url = ?, video_url = ?, sort_order = ?, is_active = ?
            WHERE id = ?
        `).run(
            title,
            media_type === 'clip' ? 'clip' : 'trailer',
            thumbnail_url || '',
            video_url || '',
            parseInt(sort_order, 10) || 0,
            is_active ? 1 : 0,
            req.params.id
        );

        res.json({ message: "Cập nhật trailer/clip thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/media/:id', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM media_items WHERE id = ?').run(req.params.id);
        res.json({ message: "Xóa trailer/clip thành công!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CATCH-ALL: SPA fallback
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`\n🎬 Rex Cinemas Server is running on http://localhost:${PORT}`);
    console.log(`📧 Admin login: admin@rex.com / admin123\n`);
});
