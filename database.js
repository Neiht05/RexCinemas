const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'rexcinemas.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

const initSchema = () => {
    // Temporarily disable FK for schema creation
    db.pragma('foreign_keys = OFF');

    db.exec(`
        -- ========== USERS ==========
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            role TEXT CHECK( role IN ('admin', 'customer') ) DEFAULT 'customer',
            loyalty_points INTEGER DEFAULT 0,
            membership_level TEXT DEFAULT 'Silver',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- ========== THEATERS (Rạp) ==========
        CREATE TABLE IF NOT EXISTS theaters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            hotline TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- ========== ROOMS (Phòng chiếu) ==========
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            theater_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            room_type TEXT DEFAULT 'Standard',
            total_seats INTEGER DEFAULT 0,
            FOREIGN KEY(theater_id) REFERENCES theaters(id) ON DELETE CASCADE
        );

        -- ========== MOVIES ==========
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            poster_url TEXT,
            backdrop_url TEXT,
            trailer_url TEXT,
            genre TEXT DEFAULT '',
            director TEXT DEFAULT '',
            cast_members TEXT DEFAULT '',
            duration_minutes INTEGER,
            release_date TEXT,
            age_rating TEXT DEFAULT 'P',
            status TEXT CHECK( status IN ('now_showing', 'coming_soon') ) DEFAULT 'now_showing',
            is_featured INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- ========== SHOWTIMES ==========
        CREATE TABLE IF NOT EXISTS showtimes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL,
            room_id INTEGER NOT NULL,
            show_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            base_price REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE,
            FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );

        -- ========== SEATS ==========
        CREATE TABLE IF NOT EXISTS seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            seat_row TEXT NOT NULL,
            seat_number INTEGER NOT NULL,
            seat_type TEXT CHECK( seat_type IN ('normal', 'vip', 'couple') ) DEFAULT 'normal',
            FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );

        -- ========== SEAT HOLDS ==========
        CREATE TABLE IF NOT EXISTS seat_holds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            showtime_id INTEGER NOT NULL,
            seat_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            user_id INTEGER,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(showtime_id) REFERENCES showtimes(id) ON DELETE CASCADE,
            FOREIGN KEY(seat_id) REFERENCES seats(id) ON DELETE CASCADE,
            UNIQUE(showtime_id, seat_id)
        );

        -- ========== SNACKS ==========
        CREATE TABLE IF NOT EXISTS snacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            image_url TEXT,
            price REAL NOT NULL,
            description TEXT
        );

        -- ========== BOOKINGS ==========
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_code TEXT UNIQUE,
            user_id INTEGER NOT NULL,
            showtime_id INTEGER NOT NULL,
            total_amount REAL NOT NULL,
            booking_time TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT CHECK( status IN ('pending', 'paid', 'cancelled') ) DEFAULT 'paid',
            payment_method TEXT,
            payment_provider TEXT,
            payment_reference TEXT,
            payment_transaction_id TEXT,
            payment_session_id TEXT,
            payment_last_error TEXT,
            payment_completed_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(showtime_id) REFERENCES showtimes(id)
        );

        -- ========== BOOKING TICKETS ==========
        CREATE TABLE IF NOT EXISTS booking_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER NOT NULL,
            seat_id INTEGER NOT NULL,
            price_at_booking REAL NOT NULL,
            FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
            FOREIGN KEY(seat_id) REFERENCES seats(id)
        );

        -- ========== BOOKING SNACKS ==========
        CREATE TABLE IF NOT EXISTS booking_snacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER NOT NULL,
            snack_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            price_at_booking REAL NOT NULL,
            FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
            FOREIGN KEY(snack_id) REFERENCES snacks(id)
        );

        -- ========== REVIEWS ==========
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            movie_id INTEGER NOT NULL,
            rating INTEGER CHECK(rating BETWEEN 1 AND 5),
            comment TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE
        );

        -- ========== HOMEPAGE EVENTS ==========
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            accent_text TEXT DEFAULT '',
            tag TEXT DEFAULT '',
            description TEXT DEFAULT '',
            button_text TEXT DEFAULT '',
            button_link TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            layout TEXT CHECK(layout IN ('text_left', 'text_right')) DEFAULT 'text_left',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- ========== HOMEPAGE ARTICLES ==========
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category_label TEXT DEFAULT 'TIN TỨC',
            image_url TEXT DEFAULT '',
            published_date TEXT,
            link_url TEXT DEFAULT '#',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- ========== HOMEPAGE MEDIA ==========
        CREATE TABLE IF NOT EXISTS media_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            media_type TEXT CHECK(media_type IN ('trailer', 'clip')) DEFAULT 'trailer',
            thumbnail_url TEXT DEFAULT '',
            video_url TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // ========== MIGRATIONS ==========
    const migrateColumn = (table, column, type) => {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all();
        if (!columns.find(c => c.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            console.log(`[Migration] Added column ${column} to ${table}`);
        }
    };

    migrateColumn('users', 'loyalty_points', 'INTEGER DEFAULT 0');
    migrateColumn('users', 'membership_level', "TEXT DEFAULT 'Silver'");
    migrateColumn('movies', 'backdrop_url', 'TEXT');
    migrateColumn('movies', 'trailer_url', 'TEXT');
    migrateColumn('movies', 'genre', "TEXT DEFAULT ''");
    migrateColumn('movies', 'director', "TEXT DEFAULT ''");
    migrateColumn('movies', 'cast_members', "TEXT DEFAULT ''");
    migrateColumn('movies', 'duration_minutes', 'INTEGER');
    migrateColumn('movies', 'release_date', 'TEXT');
    migrateColumn('movies', 'age_rating', "TEXT DEFAULT 'P'");
    migrateColumn('movies', 'status', "TEXT DEFAULT 'now_showing'");
    migrateColumn('movies', 'is_featured', 'INTEGER DEFAULT 0');
    migrateColumn('bookings', 'booking_code', 'TEXT');
    migrateColumn('bookings', 'payment_provider', 'TEXT');
    migrateColumn('bookings', 'payment_reference', 'TEXT');
    migrateColumn('bookings', 'payment_transaction_id', 'TEXT');
    migrateColumn('bookings', 'payment_session_id', 'TEXT');
    migrateColumn('bookings', 'payment_last_error', 'TEXT');
    migrateColumn('bookings', 'payment_completed_at', 'TEXT');
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_seat_holds_expires_at ON seat_holds(expires_at);
    `);
    migrateColumn('events', 'accent_text', "TEXT DEFAULT ''");
    migrateColumn('events', 'tag', "TEXT DEFAULT ''");
    migrateColumn('events', 'description', "TEXT DEFAULT ''");
    migrateColumn('events', 'button_text', "TEXT DEFAULT ''");
    migrateColumn('events', 'button_link', "TEXT DEFAULT ''");
    migrateColumn('events', 'image_url', "TEXT DEFAULT ''");
    migrateColumn('events', 'layout', "TEXT DEFAULT 'text_left'");
    migrateColumn('events', 'sort_order', 'INTEGER DEFAULT 0');
    migrateColumn('events', 'is_active', 'INTEGER DEFAULT 1');
    migrateColumn('articles', 'category_label', "TEXT DEFAULT 'TIN TỨC'");
    migrateColumn('articles', 'image_url', "TEXT DEFAULT ''");
    migrateColumn('articles', 'published_date', 'TEXT');
    migrateColumn('articles', 'link_url', "TEXT DEFAULT '#'");
    migrateColumn('articles', 'sort_order', 'INTEGER DEFAULT 0');
    migrateColumn('articles', 'is_active', 'INTEGER DEFAULT 1');
    migrateColumn('media_items', 'media_type', "TEXT DEFAULT 'trailer'");
    migrateColumn('media_items', 'thumbnail_url', "TEXT DEFAULT ''");
    migrateColumn('media_items', 'video_url', "TEXT DEFAULT ''");
    migrateColumn('media_items', 'sort_order', 'INTEGER DEFAULT 0');
    migrateColumn('media_items', 'is_active', 'INTEGER DEFAULT 1');

    // ========== DEFAULT ADMIN ==========
    const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@rex.com');
    if (!adminExists) {
        const bcrypt = require('bcrypt');
        const hash = bcrypt.hashSync('admin123', 10);
        db.prepare(
            'INSERT INTO users (full_name, email, password_hash, role, membership_level) VALUES (?, ?, ?, ?, ?)'
        ).run('System Admin', 'admin@rex.com', hash, 'admin', 'Diamond');
        console.log('[DB] Default admin created: admin@rex.com / admin123');
    }

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
    console.log('[DB] Schema initialized successfully.');
};

initSchema();

module.exports = db;
