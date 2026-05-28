const db = require('./database');

const forceReset = process.argv.includes('--force-reset');
const toLocalDateString = (date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

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
        INSERT INTO movies (
            title, slug, description, poster_url, backdrop_url, trailer_url, genre,
            director, cast_members, duration_minutes, release_date, age_rating, status, is_featured
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const movies = [
        {
            title: 'Phí Phông: Quỷ Máu Rừng Thiêng',
            slug: 'phi-phong-quy-mau-rung-thieng',
            description: 'Phí Phông, loài quỷ khát máu trong truyền thuyết dân gian của đồng bào miền núi gây ám ảnh bao đời nay. Phim xoay quanh Còn (Kiều Minh Tuấn) và Dương (Minh Anh), hai pháp sư tập sự lên núi cứu người mẹ đang bị lời nguyền Phí Phông đánh gục. Cùng lúc đó, trong bản sâu cũng xảy ra nhiều cái chết ghê rợn. Mọi nghi ngờ đổ dồn về hai mẹ con Mon (Diệp Bảo Ngọc) và Lua (Nina Nutthacha), những người mang đặc tính y hệt Phí Phông. Thế nhưng, vẫn còn những bí mật động trời bị chôn vùi trong chốn rừng thiêng nước độc, cuốn hai anh em Còn và Dương vào cuộc truy lùng “Phí Phông” không hồi kết.',
            poster_url: 'https://i.postimg.cc/sDsKT0w5/phiphong-poster.png',
            backdrop_url: 'https://i.postimg.cc/zfb9qcmj/phiphong.png',
            trailer_url: 'https://youtu.be/LDvCnwE6TtA?si=AMpp9Ekwpx7En72V',
            genre: 'horror',
            director: 'Đỗ Quốc Trung',
            cast_members: 'Kiều Minh Tuấn, Nina Nutthacha Padovan, Diệp Bảo Ngọc, Đoàn Minh Anh, NSƯT Hạnh Thuý,...',
            duration_minutes: 120,
            release_date: '2026-04-20',
            age_rating: 'C16',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Đại Tiệc Trăng Máu 8',
            slug: 'ai-tiec-trang-mau-8',
            description: 'Đại Tiệc Trăng Máu 8 theo chân một vị đạo diễn hay bị coi thường (Vân Sơn đóng) trong dự án thử thách nhất đời ông: thực hiện một bộ phim dài 35 phút chỉ với một cú máy. Hàng loạt tình huống dở khóc dở cười xảy ra khi các diễn viên liên tục gây chuyện “khó đỡ”. Thế nhưng, việc hoàn thành tác phẩm là cơ hội cuối cùng để ông giành lại sự tôn trọng từ cô con gái đam mê nghệ thuật.',
            poster_url: 'https://i.postimg.cc/6qg6z1v1/media-images-2026-04-16-400x633-102941-160426-44.jpg',
            backdrop_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5FwypPZ690tL2xvVwNWK8MWi9pMF5fwM5hw&s',
            trailer_url: 'https://youtu.be/NZ9-wGErh4o?si=cjWaW7OiK4MlT3CO',
            genre: 'comedy,horror',
            director: 'Phan Gia Nhật Linh',
            cast_members: 'Vân Sơn, Lê Khánh, Miu Lê, Liên Bỉnh Phát, Quốc Khánh, Quỳnh Lý, Lâm Thanh Mỹ, Quang Minh, Hứa Vĩ Văn, Hồng Ánh, NSƯT Đức Khuê, Charlie Nguyễn,...',
            duration_minutes: 130,
            release_date: '2026-04-24',
            age_rating: 'P',
            status: 'now_showing',
            is_featured: 0
        },
        {
            title: 'Hẹn Em Ngày Nhật Thực',
            slug: 'hen-em-ngay-nhat-thuc',
            description: 'Năm 1995, khi đang đứng trước một quyết định quan trọng của cuộc đời, Ân bất ngờ bị kéo trở lại quá khứ bởi những bức thư tình chưa từng trao tay. Hành trình tìm gặp Thiên - mối tình đầu từng khắc sâu trong tim - đưa cô về lại thôn xóm Trà Mây năm xưa, nơi những ký ức ngọt ngào xen lẫn tổn thương vẫn chưa hề nguôi ngoai. Trong khoảnh khắc định mệnh khi hai người bất ngờ chạm mặt, những bí mật bị che giấu suốt nhiều năm dần hé lộ, buộc Ân phải đối diện với sự thật và lựa chọn con đường cho riêng mình. “Hẹn Em Ngày Nhật Thực” là câu chuyện tình yêu đầy cảm xúc về những điều chưa nói, về tình yêu vĩnh cửu và câu hỏi day dứt: nếu còn cơ hội, ta có dám tin vào trái tim mình một lần nữa?',
            poster_url: 'https://i.postimg.cc/htKqLBJd/hen-em-ngay-nhat-thuc.jpg',
            backdrop_url: 'https://i.postimg.cc/PJfmbNjL/firstlook-hennt-16x9-225609.jpg',
            trailer_url: 'https://youtu.be/xeuiol66BkA?si=ivWfWd1Ejqr4EKL4',
            genre: 'drama',
            director: 'Lê Thiện Viễn',
            cast_members: 'Đoàn Thiên Ân, Khương Lê, NSND Lê Khanh, Huỳnh Phương, Nguyên Thảo, NSND Kim Xuân, Thanh Sơn, Hứa Vĩ Văn, Lâm Vỹ Dạ, Hứa Minh Đạt.',
            duration_minutes: 118,
            release_date: '2026-03-30',
            age_rating: 'C16',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Bẫy Tiền',
            slug: 'bay-tien',
            description: 'Khi một vụ lừa đảo qua điện thoại bất ngờ ập đến, Đăng Thức tưởng chừng nắm trong tay cuộc sống ổn định bỗng bị cuốn vào vòng xoáy nguy hiểm giữa tiền bạc, tình thân và niềm tin — nơi mỗi lựa chọn không chỉ đánh đổi bằng tiền, mà còn bằng chính những người anh yêu thương.',
            poster_url: 'https://i.postimg.cc/jjZ8pVS2/media-images-2026-04-06-anh-chup-man-hinh-2026-04-06-103100-103137-060426-64.png',
            backdrop_url: 'https://i.postimg.cc/dVvcvYwx/maxresdefault.jpg',
            trailer_url: 'https://youtu.be/baxPTlZ--jE?si=kDps8Nmh4osV9o15',
            genre: 'action,drama',
            director: 'Oscar Dương',
            cast_members: 'Liên Bỉnh Phát, Tam Triều Dâng, Kiều Oanh, Lê Hải, Mai Cát Vi và một số diễn viên khác',
            duration_minutes: 113,
            release_date: '2026-04-10',
            age_rating: 'C16',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Heo Năm Móng',
            slug: 'heo-nam-mong',
            description: 'Dựa trên truyền thuyết rùng rợn về "Cô Năm Hợi" và linh hồn bị mắc kẹt trong thân xác heo.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f08%2fanh%2Dchup%2Dman%2Dhinh%2D2026%2D04%2D08%2D161626%2D161707%2D080426%2D39.png',
            backdrop_url: 'https://i.ytimg.com/vi/GG6Zrjn0UpE/maxresdefault.jpg',
            trailer_url: 'https://youtu.be/ShknvbpzZxg?si=IrFr-nH5k8CSp3aO',
            genre: 'horror',
            director: 'Võ Thanh Hòa',
            cast_members: 'Võ Tấn Phát, Trần Ngọc Vàng, Nhật Ý, Thanh Thủy,...',
            duration_minutes: 103,
            release_date: '2026-04-24',
            age_rating: 'C18',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Bẫy Hồi Sinh',
            slug: 'bay-hoi-sinh',
            description: 'Một nhóm học sinh quyết định quay video dự thi với chủ đề “gọi hồn” tại một bể chứa nước ngầm bỏ hoang. Ban đầu chỉ là một trò đùa mang tính câu view, nhưng mọi thứ nhanh chóng vượt khỏi tầm kiểm soát khi một thành viên bất ngờ nôn ra nước đen và gục ngã giữa nghi lễ.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f09%2fposter%2Drerun%2D165843%2D090426%2D23.jpg',
            backdrop_url: 'https://media.lottecinemavn.com/Media/MovieFile/MovieImg/202508/11887_206_100001.jpg',
            trailer_url: 'https://youtu.be/R4uPd2DggPU?si=934lkL4GcF7i1txq',
            genre: 'horror',
            director: 'Son Dong Wan',
            cast_members: 'Kim Ye Rim, Park Seo Yoon, Lee Chan Hyeong',
            duration_minutes: 94,
            release_date: '2026-08-22',
            age_rating: 'C16',
            status: 'coming_soon',
            is_featured: 1
        },
        {
            title: 'Song Hỷ Lâm Nguy',
            slug: 'song-hy-lam-nguy',
            description: 'Hai lễ cưới, một sang trọng sa hoa, một đạm bạc dân dã, đáng lý sẽ được tổ chức đối diện nhau. Rắc rối bắt đầu khi đội ngũ tổ chức của hai lễ cưới phát hiện ra danh sách khách mời của hai bên là giống nhau.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f01%2f400x633%2D1%2D104642%2D010426%2D93.jpg',
            backdrop_url: 'https://i.postimg.cc/DzWYzwbj/640x396-shln-1.jpg',
            trailer_url: 'https://youtu.be/EozrwuDXccI?si=y3bCBvQ7C5vpXC2i',
            genre: 'action,comedy',
            director: 'Vũ Hà',
            cast_members: 'Dustin Nguyễn, Misthy, Trung Anh, Đinh Y Nhung, Jun Vũ, Hoàng Phi, Hynee, Khoai Vũ',
            duration_minutes: 113,
            release_date: '2026-04-03',
            age_rating: 'C13',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Cú Nhảy Kỳ Diệu',
            slug: 'cu-nhay-ky-dieu',
            description: 'Câu chuyện xoay quanh Mabel, nữ sinh đại học 19 tuổi với tình yêu mãnh liệt dành cho động vật, đã nắm bắt cơ hội sử dụng công nghệ cho phép ý thức “nhảy” vào một chú hải ly rô-bốt, từ đó xâm nhập thế giới động vật. Tại đây, cô dần kết nối với muôn loài và trở thành thủ lĩnh bất đắc dĩ trong cuộc chiến bảo vệ vùng đất trước sự tàn phá của con người.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f02%2f26%2fanh%2Dchup%2Dman%2Dhinh%2D2026%2D02%2D26%2D151006%2D151102%2D260226%2D84.png',
            backdrop_url: 'https://i.postimg.cc/8ckRjZ0f/hq720.jpg',
            trailer_url: 'https://youtu.be/CHINiUp2L0g?si=sjTYuV2YkYLJOFQo',
            genre: 'comedy,animation',
            director: 'Daniel Chong',
            cast_members: '',
            duration_minutes: 105,
            release_date: '2026-03-13',
            age_rating: 'P',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Cô Bé Coraline',
            slug: 'co-be-coraline',
            description: 'Khi gia đình chuyển đến một lâu đài cổ, Coraline vô tình mở ra cánh cửa dẫn tới một thế giới song song, nơi mọi thứ rực rỡ và hoàn hảo một cách đáng ngờ. Nhưng càng đắm mình trong sự “hoàn hảo” ấy, cô càng nhận ra phía sau lớp vỏ dịu dàng là một vực sâu nguy hiểm đang chực chờ nuốt chửng tất cả. Thế giới kia không phải phép màu, mà là chiếc bẫy được giăng bằng những bí mật đen tối. Để cứu gia đình và chính mình, Coraline buộc phải đối diện với thực thể tà ác đang ẩn sau vẻ ngoài rực rỡ và đôi mắt trống rỗng vô hồn.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f03%2f20%2fmain%2Dposter%2Dcoraline%2Dv2%2D135152%2D200326%2D37.jpg',
            backdrop_url: 'https://images.spiderum.com/sp-images/798366b0863711eba2869186629911eb.jpg',
            trailer_url: 'https://youtu.be/3y73es0LRl4?si=yWP7zPQl-KYDXgnz',
            genre: 'animation',
            director: 'Henry Selick',
            cast_members: 'Dakota Fanning, Teri Hatcher, Keith David, Jennifer Saunders',
            duration_minutes: 101,
            release_date: '2026-03-27',
            age_rating: 'C13',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Quỷ Dữ Từ Luyện Ngục',
            slug: 'quy-du-tu-luyen-nguc',
            description: 'Kingkaew lấy cảm hứng từ vụ án có thật năm 1978, tại nhà tù Bang Kwang khét tiếng. Một người phụ nữ mắc bệnh tâm thần bị buộc tội bắt cóc và sát hại trẻ em gây chấn động. Dù chứng cứ dồn dập, cô vẫn khẳng định “Tôi vô tội”. Cuối cùng, tòa tuyên án tử hình, Kingkaew chết trong oán hận tột cùng.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f02%2f400x633%2D1%2D154656%2D020426%2D18.jpg',
            backdrop_url: 'https://cdn.galaxycine.vn/media/2026/4/1/kingkaew-750_1775014038737.jpg',
            trailer_url: 'https://youtu.be/rxDp0TO5_qE?si=NwoIzpb4sEA0udtp',
            genre: 'horror',
            director: 'Ekkachai Srivichai',
            cast_members: 'Sai Charoenpura, Saiparn Apinya, Gun Napat Injaieua,...',
            duration_minutes: 100,
            release_date: '2026-04-10',
            age_rating: 'C18',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Anh Hùng',
            slug: 'anh-hung',
            description: 'Câu chuyện phim theo chân Hùng (Thái Hòa) - người cha đơn thân kiêm tài xế taxi và đồng nghiệp hãng xe là Tuấn (Võ Tấn Phát) bị cuốn vào một phi vụ lừa đảo từ thiện tiền tỉ trong khi sinh mạng cô con gái nhỏ của anh đang nằm gọn trong tay tử thần.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f03%2f31%2f400wx633h%2D113142%2D310326%2D81.jpg',
            backdrop_url: 'https://i.ytimg.com/vi/QaCMCybtyfI/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLAAI2OfN5YDdbi1sXdjIRmwjO_xmg',
            trailer_url: 'https://youtu.be/P74tpiZ8kuU?si=nv2drTyJDgi1dvXZ',
            genre: 'drama',
            director: 'Võ Thạch Thảo',
            cast_members: 'Thái Hoà, Võ Tấn Phát, Đoàn Thế Vinh, Phương Thanh, Hồng Ánh, NSƯT Lê Thiện, Hoàng Minh Triết, Gia Tuệ...',
            duration_minutes: 122,
            release_date: '2026-04-24',
            age_rating: 'C13',
            status: 'now_showing',
            is_featured: 0
        },
        {
            title: 'Phim Điện Ảnh Doraemon: Nobita Và Lâu Đài Dưới Đáy Biển - Phiên Bản Mới',
            slug: 'phim-ien-anh-doraemon-nobita-va-lau-ai-duoi-ay-bien-phien-ban-moi',
            description: 'Trong kỳ nghỉ hè, Nobita và các bạn tranh cãi về việc đi cắm trại ở đâu. Theo ý kiến ​​của Doraemon, họ quyết định cắm trại giữa đại dương! Sử dụng những món đồ bí mật "Xe địa hình dưới nước" và "Đèn thích ứng", năm người bạn tận hưởng chuyến cắm trại dưới đáy biển và gặp gỡ nhiều sinh vật khác nhau. Họ phát hiện ra một con tàu đắm, dẫn họ đến gặp một chàng trai trẻ bí ẩn tên là El. Điều đáng kinh ngạc là anh ta là "người đáy biển" đến từ Liên bang Mu, một nền văn minh sống dưới đáy biển! Người đáy biển không thích người sống trên mặt đất và không tin tưởng Nobita và những người khác. Giữa lúc căng thẳng này, một tin nhắn gây sốc đến: "Lâu đài Đá Quỷ... đã bắt đầu di chuyển!!" "Lâu đài Đá Quỷ" mà người đáy biển sợ hãi đến vậy rốt cuộc là gì...? Với niềm tin vào bạn bè luôn giữ vững trong lòng, họ bắt đầu một cuộc phiêu lưu vĩ đại để cứu Trái đất!',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f13%2fdora26%2Dhon%2Dposter%2Dcopy%2D3%2D100%2D115842%2D130426%2D82.jpg',
            backdrop_url: 'https://cdn2.tuoitre.vn/thumb_w/1200/471584752817336320/2025/11/25/filtersquality95formatwebp-2-176404502590251185802-587-0-1351-1460-crop-17640457983851724537997.png',
            trailer_url: 'https://youtu.be/u3JgYkmuK78?si=nMkajCk9PMMgiZNv',
            genre: 'animation',
            director: 'Tetsuo Yajima',
            cast_members: 'Wasabi Mizuta, Megumi Oohara, Yumi Kakazu, Subaru Kimura, Tomokazu Seki,...',
            duration_minutes: 101,
            release_date: '2026-05-22',
            age_rating: 'P',
            status: 'now_showing',
            is_featured: 1
        },
        {
            title: 'Làng Quỷ Quái',
            slug: 'lang-quy-quai',
            description: 'Một làn sóng các vụ giết người hàng loạt rùng rợn nổi lên, được đánh dấu bằng sự phân hủy ghê tởm bộ phận sinh dục của các nạn nhân nam. Khi cảnh sát điều tra, họ đối mặt với những truyền thuyết địa phương kỳ lạ và những bí mật đen tối. Liệu một hồn ma báo thù đang ám ảnh ngôi làng, như một số người tin tưởng, hay là một kẻ giết người hàng loạt xảo quyệt đang hoạt động?',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f05%2f07%2fsocial%2Dsize%2Dposter%2D153031%2D070526%2D51.png',
            backdrop_url: '',
            trailer_url: 'https://youtu.be/rrcyqvSWrk0?si=9DFABPq-PiIrv-yk',
            genre: 'action,horror',
            director: 'Poj Arnon, Nicky Na Chat Juntapun, Kapol Thongplub',
            cast_members: 'Padung Songsang, Kapol Thongplub,...',
            duration_minutes: 100,
            release_date: '2026-05-15',
            age_rating: 'C18',
            status: 'now_showing',
            is_featured: 0
        },
        {
            title: 'Tạm Biệt Gohan',
            slug: 'tam-biet-gohan',
            description: 'Suốt mười năm đằng đẵng, chú chó hoang lông trắng với chiếc mũi đỏ mang tên \'GOHAN\' cứ thế phiêu dạt giữa cuộc đời, ôm trọn những ký ức chẳng thể phai nhòa. Đó là sự ấm áp bình lặng bên người chủ đầu tiên – một kỹ sư ô tô người Nhật sắp sửa nghỉ hưu. Là những ngày tháng rộn ràng bên người chủ thứ hai – cô giúp việc trẻ người Miến Điện làm việc tại trạm cứu hộ thú cưng. Và cuối cùng, là những bài học thầm lặng chú dạy cho người chủ hiện tại – một sinh viên mỹ thuật, người lần đầu tiên trong đời học cách định nghĩa thế nào là tình yêu. Một câu chuyện về thời gian, về những cuộc hội ngộ và chia ly, và về một chú chó ghi nhớ tất cả',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f04%2f23%2fanh%2Dchup%2Dman%2Dhinh%2D2026%2D04%2D23%2D182138%2D182222%2D230426%2D90.png',
            backdrop_url: '',
            trailer_url: 'https://youtu.be/nGDfPEvD5Sg?si=QcfONOtp3hAK4C83',
            genre: 'drama',
            director: 'Chayanop Boonprakob - Baz Poonpiriya - Atta Hemwadee',
            cast_members: 'Yasushi Kitajima, Poe Mamhe Thar, Jinjett Wattanasin, Tontawan Tantivejakul',
            duration_minutes: 140,
            release_date: '2026-05-15',
            age_rating: 'P',
            status: 'now_showing',
            is_featured: 0
        },
        {
            title: 'Đội Thám Tử Cừu: Án Mạng Lúc Nửa Đêm',
            slug: 'oi-tham-tu-cuu-an-mang-luc-nua-em',
            description: 'Trong bộ phim trinh thám hài hước, độc đáo này, George (Hugh Jackman) là một người chăn cừu, mỗi tối đều đọc tiểu thuyết trinh thám cho đàn cừu yêu quý nghe, nghĩ rằng chúng không thể hiểu được. Nhưng khi George bất ngờ qua đời trong một sự cố bí ẩn trên trang trại, đàn cừu quyết định tự mình trở thành thám tử. Lần theo manh mối và điều tra các nghi phạm là con người, chúng chứng minh rằng ngay cả cừu cũng có thể phá án xuất sắc.',
            poster_url: 'https://files.betacorp.vn/media%2fimages%2f2026%2f05%2f04%2f400x633%2D151326%2D040526%2D43.jpg',
            backdrop_url: '',
            trailer_url: 'https://youtu.be/rDbNvxVwr44',
            genre: 'comedy,animation',
            director: 'Kyle Balda',
            cast_members: 'Hugh Jackman, Emma Thompson, Nicholas Braun, Nicholas Galitzine, Molly Gordon. Hong Chau, Tosin Cole, Kobna Holdbrook-Smith, Conleth Hill, Mandeep Dhillon, Bryan Cranston, Julia Louis-Dreyfus, Patrick Stewart',
            duration_minutes: 109,
            release_date: '2026-05-10',
            age_rating: 'P',
            status: 'now_showing',
            is_featured: 0
        }
    ];

    const movieIdsBySlug = new Map();
    movies.forEach(movie => {
        const result = insertMovie.run(
            movie.title,
            movie.slug,
            movie.description,
            movie.poster_url,
            movie.backdrop_url,
            movie.trailer_url,
            movie.genre,
            movie.director,
            movie.cast_members,
            movie.duration_minutes,
            movie.release_date,
            movie.age_rating,
            movie.status,
            movie.is_featured
        );
        movieIdsBySlug.set(movie.slug, result.lastInsertRowid);
    });

    // ========== SHOWTIMES ==========
    const insertShowtime = db.prepare('INSERT INTO showtimes (movie_id, room_id, show_date, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?, ?)');
    
    const sampleShowtimes = [
        { slug: 'phi-phong-quy-mau-rung-thieng', roomId: room1, start: '12:30', end: '14:30', price: 85000 },
        { slug: 'quy-du-tu-luyen-nguc', roomId: room3, start: '12:30', end: '14:10', price: 85000 },
        { slug: 'co-be-coraline', roomId: room1, start: '12:30', end: '14:11', price: 100000 },
        { slug: 'co-be-coraline', roomId: room2, start: '16:30', end: '18:11', price: 85000 },
        { slug: 'tam-biet-gohan', roomId: room1, start: '12:30', end: '14:50', price: 85000 },
        { slug: 'oi-tham-tu-cuu-an-mang-luc-nua-em', roomId: room3, start: '22:30', end: '00:19', price: 200000 },
        { slug: 'hen-em-ngay-nhat-thuc', roomId: room2, start: '19:30', end: '21:28', price: 100000 },
        { slug: 'phim-ien-anh-doraemon-nobita-va-lau-ai-duoi-ay-bien-phien-ban-moi', roomId: room2, start: '10:00', end: '11:41', price: 85000 }
    ];

    // Generate showtimes for today and next 3 days.
    for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        const dateStr = toLocalDateString(d);
        sampleShowtimes.forEach(showtime => {
            insertShowtime.run(
                movieIdsBySlug.get(showtime.slug),
                showtime.roomId,
                dateStr,
                showtime.start,
                showtime.end,
                showtime.price
            );
        });
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
        'https://szjy-led.com/wp-content/uploads/2024/09/Traumplast-Leonberg-Cinema-IMAX-Screen.jpg',
        'text_left', 1, 1
    );
    insertEvent.run(
        'THẺ', 'QUÀ TẶNG', 'ƯU ĐÃI REX',
        'Món quà phù hợp cho người mê điện ảnh. Tặng bạn bè, người thân hoặc đồng nghiệp một trải nghiệm xem phim trọn vẹn tại Rex Cinemas.',
        'MUA NGAY', '#',
        'https://i.postimg.cc/CxGB3W74/Gemini-Generated-Image-kt1u12kt1u12kt1u.png',
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
    insertMedia.run('Trailer Phí Phông', 'trailer', 'https://i.postimg.cc/zfb9qcmj/phiphong.png', 'https://youtu.be/LDvCnwE6TtA?si=RgAOxVwaCDNd-T9c', 1, 1);
    insertMedia.run('Clip hậu trường Lật Mặt 9', 'clip', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/73_1biulkYk', 2, 1);
    insertMedia.run('Trailer Thám Tử Kiên', 'trailer', 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/lV1OOlGwExM', 3, 1);
    insertMedia.run('Clip Nhà Gia Tiên', 'clip', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop', 'https://www.youtube.com/embed/xy8aJw1vYHo', 4, 1);
    insertMedia.run('Clip Út Lan', 'clip', 'https://images.unsplash.com/photo-1460881680858-30d872d5b530?q=80&w=800&auto=format&fit=crop', 'https://youtu.be/4P_pYwuaRDM?si=n-g000DcG6E-jFyo', 6, 1);

    console.log('[Seed] Database initialized with complete sample data.');
};

seedData();
console.log('[Seed] Done!');
