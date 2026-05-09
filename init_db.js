const db = require('./database');

const forceReset = process.argv.includes('--force-reset');

const seedData = () => {
    const existingMovieCount = db.prepare('SELECT COUNT(*) as total FROM movies').get().total;

    if (existingMovieCount > 0 && !forceReset) {
        console.log('[Seed] Database already has movie data. Seeding skipped to avoid overwriting existing content.');
        console.log('[Seed] Use "node init_db.js --force-reset" if you really want to wipe and reseed sample data.');
        return;
    }

    // Tạm tắt FK để xóa sạch dữ liệu cũ
    db.pragma('foreign_keys = OFF');
    db.exec(`
        DELETE FROM booking_snacks;
        DELETE FROM booking_tickets;
        DELETE FROM bookings;
        DELETE FROM reviews;
        DELETE FROM media_items;
        DELETE FROM articles;
        DELETE FROM events;
        DELETE FROM showtimes;
        DELETE FROM seats;
        DELETE FROM snacks;
        DELETE FROM rooms;
        DELETE FROM theaters;
        DELETE FROM movies;
    `);
    db.pragma('foreign_keys = ON');

    // ========== THEATERS ==========
    const insertTheater = db.prepare('INSERT INTO theaters (name, address, hotline) VALUES (?, ?, ?)');
    const theater1 = insertTheater.run('Rex Landmark 81', 'Tầng 3, Landmark 81, Bình Thạnh, TP.HCM', '1900 1234').lastInsertRowid;
    const theater2 = insertTheater.run('Rex Nguyễn Huệ', '135 Nguyễn Huệ, Quận 1, TP.HCM', '1900 5678').lastInsertRowid;

    // ========== ROOMS ==========
    const insertRoom = db.prepare('INSERT INTO rooms (theater_id, name, room_type, total_seats) VALUES (?, ?, ?, ?)');
    const room1 = insertRoom.run(theater1, 'Phòng 01 (IMAX)', 'IMAX', 100).lastInsertRowid;
    const room2 = insertRoom.run(theater1, 'Phòng 02 (Standard)', 'Standard', 80).lastInsertRowid;
    const room3 = insertRoom.run(theater2, 'Phòng 01 (4DX)', '4DX', 60).lastInsertRowid;

    // ========== SEATS ==========
    const insertSeat = db.prepare('INSERT INTO seats (room_id, seat_row, seat_number, seat_type) VALUES (?, ?, ?, ?)');
    
    const createSeats = (roomId, rows, cols, vipRows, coupleRows) => {
        rows.forEach(row => {
            for (let i = 1; i <= cols; i++) {
                let type = 'normal';
                if (vipRows.includes(row)) type = 'vip';
                if (coupleRows.includes(row)) type = 'couple';
                insertSeat.run(roomId, row, i, type);
            }
        });
    };

    // Room 1: 10 hàng x 10 ghế
    createSeats(room1, ['A','B','C','D','E','F','G','H','I','J'], 10, ['G','H','I'], ['J']);
    // Room 2: 8 hàng x 10 ghế
    createSeats(room2, ['A','B','C','D','E','F','G','H'], 10, ['F','G'], ['H']);
    // Room 3: 6 hàng x 10 ghế  
    createSeats(room3, ['A','B','C','D','E','F'], 10, ['E'], ['F']);

    // ========== MOVIES ==========
    const insertMovie = db.prepare(`
        INSERT INTO movies (title, slug, description, poster_url, trailer_url, genre, duration_minutes, release_date, age_rating, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // NOW SHOWING
    const movie1 = insertMovie.run(
        'ĐỊA ĐẠO: MẶT TRỜI TRONG BÓNG TỐI', 'dia-dao-mat-troi-trong-bong-toi',
        'Một đội du kích trẻ bám trụ trong lòng địa đạo Củ Chi, đối diện những trận càn khốc liệt và những lựa chọn sinh tử giữa chiến tranh.',
        'https://images.unsplash.com/photo-1518998053901-5348d3961a04?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/Way9Dexny3w',
        'drama,action', 128, '2026-04-10', 'C16', 'now_showing'
    ).lastInsertRowid;

    const movie2 = insertMovie.run(
        'LẬT MẶT 9: VÁN CỜ SÔNG NƯỚC', 'lat-mat-9-van-co-song-nuoc',
        'Một vụ mất tích bí ẩn trên miền Tây kéo theo chuỗi bí mật gia tộc, những cuộc rượt đuổi nghẹt thở và cú lật mặt không ai ngờ tới.',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/73_1biulkYk',
        'action,drama', 118, '2026-04-18', 'C16', 'now_showing'
    ).lastInsertRowid;

    const movie3 = insertMovie.run(
        'THÁM TỬ KIÊN: KỲ ÁN KHÔNG ĐẦU', 'tham-tu-kien-ky-an-khong-dau',
        'Thám tử Kiên trở lại với một vụ án ly kỳ ở vùng sông nước Nam Bộ, nơi mọi nhân chứng đều đang che giấu một nửa sự thật.',
        'https://images.unsplash.com/photo-1505685296765-3a2736de412f?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/lV1OOlGwExM',
        'thriller,drama', 122, '2026-04-05', 'C16', 'now_showing'
    ).lastInsertRowid;

    const movie4 = insertMovie.run(
        'NHÀ GIA TIÊN', 'nha-gia-tien',
        'Một gia đình nhiều thế hệ bất ngờ bị cuốn vào chuỗi hiện tượng kỳ lạ ngay trong căn nhà tổ, hé lộ những mâu thuẫn chưa từng được gọi tên.',
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/xy8aJw1vYHo',
        'drama,comedy', 110, '2026-03-28', 'C13', 'now_showing'
    ).lastInsertRowid;

    const movie5 = insertMovie.run(
        'DẾ MÈN: CUỘC PHIÊU LƯU TỚI XÓM LẦY LỘI', 'de-men-cuoc-phieu-luu-toi-xom-lay-loi',
        'Dế Mèn cùng những người bạn bước vào hành trình khám phá khu đầm lầy kỳ bí, nơi lòng dũng cảm và tình bạn được thử thách.',
        'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/LEjhY15eCx0',
        'animation,comedy', 96, '2026-04-12', 'P', 'now_showing'
    ).lastInsertRowid;

    const movie6 = insertMovie.run(
        'ÚT LAN: OÁN LINH GIỮ CỦA', 'ut-lan-oan-linh-giu-cua',
        'Sau khi nhận trông coi một căn nhà cổ ở miền Tây, Lan phát hiện lời nguyền cũ vẫn đang đòi món nợ chưa trả của cả dòng họ.',
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/rMk1UjOeTrM',
        'horror', 104, '2026-04-01', 'C18', 'now_showing'
    ).lastInsertRowid;

    // COMING SOON
    insertMovie.run(
        'MƯA ĐỎ', 'mua-do',
        'Giữa những ngày mưa kéo dài nơi vùng cao, một nhóm phóng viên trẻ lần theo dấu vết vụ án mất tích gắn với một truyền thuyết cổ.',
        'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/4rgYUipGJNo',
        'thriller,horror', 113, '2026-05-16', 'C16', 'coming_soon'
    );

    insertMovie.run(
        'CÔ BA SÀI GÒN: TÁI XUẤT', 'co-ba-sai-gon-tai-xuat',
        'Từ một tiệm áo dài cũ giữa lòng Sài Gòn, ba thế hệ phụ nữ viết tiếp câu chuyện về thời trang, gia đình và những lựa chọn của riêng mình.',
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/6COmYeLsz4c',
        'drama,comedy', 121, '2026-05-30', 'P', 'coming_soon'
    );

    insertMovie.run(
        'SÀI GÒN SIÊU NHIÊN', 'sai-gon-sieu-nhien',
        'Một nhóm bạn trẻ vô tình mở cánh cổng nối giữa Sài Gòn hiện đại và thế giới linh giới, kéo theo hàng loạt biến cố kỳ ảo.',
        'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=900&auto=format&fit=crop',
        'https://www.youtube.com/embed/JnQvGA8Wj1A',
        'scifi,action', 130, '2026-06-20', 'C13', 'coming_soon'
    );

    // ========== SHOWTIMES ==========
    const insertShowtime = db.prepare('INSERT INTO showtimes (movie_id, room_id, show_date, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?, ?)');
    
    // Generate showtimes for today and next 3 days
    for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        const dateStr = d.toISOString().split('T')[0];

        // Movie 1 - Dune (IMAX)
        insertShowtime.run(movie1, room1, dateStr, '10:00', '12:46', 95000);
        insertShowtime.run(movie1, room1, dateStr, '15:00', '17:46', 95000);
        insertShowtime.run(movie1, room1, dateStr, '19:30', '22:16', 115000);

        // Movie 2 - Deadpool (Standard) 
        insertShowtime.run(movie2, room2, dateStr, '13:00', '15:07', 85000);
        insertShowtime.run(movie2, room2, dateStr, '20:00', '22:07', 105000);

        // Movie 3 - Godzilla (4DX)
        insertShowtime.run(movie3, room3, dateStr, '11:00', '12:55', 120000);
        insertShowtime.run(movie3, room3, dateStr, '18:00', '19:55', 120000);

        // Movie 4 - Joker 2 (Standard)
        insertShowtime.run(movie4, room2, dateStr, '16:30', '18:48', 85000);
        insertShowtime.run(movie4, room1, dateStr, '21:30', '23:48', 105000);

        // Movie 5 - Inside Out 2 (Standard)
        insertShowtime.run(movie5, room2, dateStr, '10:00', '11:40', 75000);
        insertShowtime.run(movie5, room3, dateStr, '14:00', '15:40', 85000);

        // Movie 6 - Conjuring 4 (IMAX)
        insertShowtime.run(movie6, room1, dateStr, '22:30', '00:22', 105000);
    }

    // ========== SNACKS ==========
    const insertSnack = db.prepare('INSERT INTO snacks (name, image_url, price, description) VALUES (?, ?, ?, ?)');
    insertSnack.run('POPCORN CARAMEL (L)', 'https://images.unsplash.com/photo-1572177191856-3cde618dee1f?q=80&w=500&auto=format&fit=crop', 65000, 'Bắp rang vị Caramel thượng hạng size lớn');
    insertSnack.run('COMBO SOLO', '/img/combo_solo.png', 95000, '1 Bắp lớn + 1 Nước ngọt cỡ lớn');
    insertSnack.run('COMBO COUPLE', 'https://images.unsplash.com/photo-1513106580091-1d82408b8cd6?q=80&w=500&auto=format&fit=crop', 145000, '1 Bắp lớn + 2 Nước ngọt cỡ lớn');
    insertSnack.run('PEPSI / COCA COLA', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=500&auto=format&fit=crop', 35000, 'Nước ngọt giải khát (size L)');
    insertSnack.run('NACHOS CHEESE', 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?q=80&w=500&auto=format&fit=crop', 55000, 'Nachos phô mai Mexico');
    insertSnack.run('HOTDOG CLASSIC', '/img/hotdog_classic.png', 45000, 'Hotdog xúc xích Đức truyền thống');

    // ========== EVENTS ==========
    const insertEvent = db.prepare(`
        INSERT INTO events (title, accent_text, tag, description, button_text, button_link, image_url, layout, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEvent.run(
        'MÀN HÌNH', 'CỰC ĐẠI', 'NỔI BẬT',
        'Những cuộc hội thoại sống động trào dâng khỏi màn hình. Cảm giác được hòa mình cùng khán giả khi các ngôi sao lớn nhất mang tới một màn trình diễn đỉnh cao. Tất cả chỉ với mức giá hoàn toàn hợp lý.',
        'TÌM HIỂU THÊM', '#events-section',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1400&auto=format&fit=crop',
        'text_left', 1, 1
    );
    insertEvent.run(
        'THẺ', 'QUÀ TẶNG', 'ƯU ĐÃI REX',
        'Món quà phù hợp cho người mê điện ảnh. Tặng bạn bè, người thân hoặc đồng nghiệp một trải nghiệm xem phim trọn vẹn tại Rex Cinemas.',
        'MUA NGAY', '#',
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=1400&auto=format&fit=crop',
        'text_right', 2, 1
    );

    // ========== ARTICLES ==========
    const insertArticle = db.prepare(`
        INSERT INTO articles (title, category_label, image_url, published_date, link_url, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertArticle.run(
        'Rex Landmark 81 khai trương phòng chiếu IMAX Laser đầu tiên tại trung tâm TP.HCM',
        'TIN TỨC',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop',
        '2026-04-17',
        '#',
        1,
        1
    );
    insertArticle.run(
        '5 phim Việt đáng chú ý ngoài rạp trong dịp lễ 30/4 và 1/5 năm nay',
        'GÓC PHIM',
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=1200&auto=format&fit=crop',
        '2026-02-27',
        '#',
        2,
        1
    );
    insertArticle.run(
        'Bắp rang vị nước mắm, trà tắc và combo đôi mới có gì trong menu mùa hè của Rex?',
        'ĐẶC BIỆT',
        'https://images.unsplash.com/photo-1578849278619-e73505e9610f?q=80&w=1200&auto=format&fit=crop',
        '2026-02-14',
        '#',
        3,
        1
    );

    // ========== MEDIA ITEMS ==========
    const insertMedia = db.prepare(`
        INSERT INTO media_items (title, media_type, thumbnail_url, video_url, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertMedia.run('Trailer Địa Đạo', 'trailer', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/Way9Dexny3w', 1, 1);
    insertMedia.run('Clip hậu trường Lật Mặt 9', 'clip', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/73_1biulkYk', 2, 1);
    insertMedia.run('Trailer Thám Tử Kiên', 'trailer', 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/lV1OOlGwExM', 3, 1);
    insertMedia.run('Clip Nhà Gia Tiên', 'clip', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/xy8aJw1vYHo', 4, 1);
    insertMedia.run('Trailer Dế Mèn', 'trailer', 'https://images.unsplash.com/photo-1513106580091-1d82408b8b99?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/LEjhY15eCx0', 5, 1);
    insertMedia.run('Clip Út Lan', 'clip', 'https://images.unsplash.com/photo-1460881680858-30d872d5b530?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/rMk1UjOeTrM', 6, 1);

    console.log('[Seed] Database initialized with complete sample data.');
};

seedData();
console.log('[Seed] Done!');
