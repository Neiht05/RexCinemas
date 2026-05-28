# Rex Cinemas

Rex Cinemas là website đặt vé xem phim dùng Node.js, Express và SQLite. Dự án gồm giao diện khách hàng, quy trình chọn suất chiếu/chọn ghế/đặt vé, thanh toán tiền mặt hoặc MoMo, lịch sử đặt vé, đánh giá phim và trang quản trị nội dung.

## Tính năng chính

- Trang chủ hiển thị phim đang chiếu, phim sắp chiếu, sự kiện, tin tức và trailer/clip.
- Đăng ký, đăng nhập, xác thực bằng JWT và phân quyền admin/khách hàng.
- Xem chi tiết phim, lịch chiếu, sơ đồ ghế và giữ ghế tạm thời khi đặt vé.
- Đặt vé kèm bắp nước/snack, tạo mã đặt vé và theo dõi trạng thái thanh toán.
- Thanh toán tiền mặt hoặc tích hợp MoMo sandbox/production qua biến môi trường.
- Hồ sơ người dùng, đổi mật khẩu, lịch sử đặt vé và điểm thành viên.
- Trang quản trị để quản lý phim, rạp, phòng chiếu, suất chiếu, snack, booking, người dùng, review, sự kiện, bài viết và media.
- Dashboard admin có thống kê doanh thu, đơn đặt vé và bộ lọc theo thời gian/rạp/phim/phương thức thanh toán.

## Công nghệ sử dụng

- Backend: Node.js, Express 5
- Database: SQLite với `better-sqlite3`
- Authentication: JSON Web Token, bcrypt
- Frontend: HTML, CSS, JavaScript thuần
- Payment: MoMo API

## Cấu trúc thư mục

```text
.
├── public/                 # Giao diện, CSS, JS, font và hình ảnh tĩnh
│   ├── index.html          # Trang chủ
│   ├── booking.html        # Trang đặt vé
│   ├── profile.html        # Hồ sơ khách hàng
│   ├── admin.html          # Trang quản trị
│   └── js/                 # Logic frontend
├── database.js             # Khởi tạo schema, migration nhẹ và admin mặc định
├── init_db.js              # Seed dữ liệu mẫu
├── payments.js             # Tích hợp MoMo
├── server.js               # Express server và API routes
├── package.json
└── README.md
```

## Yêu cầu môi trường

- Node.js 18 trở lên
- npm

> Lưu ý: Node.js 18+ có sẵn `fetch`, được dùng trong phần gọi API MoMo.

## Cài đặt và chạy dự án

1. Clone repository:

```bash
git clone https://github.com/Neiht05/RexCinemas.git
cd RexCinemas
```

2. Cài dependencies:

```bash
npm install
```

3. Tạo file `.env` từ file mẫu:

```bash
cp .env.example .env
```

4. Mở `.env` và cập nhật tối thiểu:

```env
PORT=3000
APP_BASE_URL=http://localhost:3000
JWT_SECRET=replace_with_a_strong_random_secret
```

5. Khởi tạo dữ liệu mẫu:

```bash
npm run seed
```

Nếu muốn xóa dữ liệu mẫu cũ và seed lại từ đầu:

```bash
npm run seed:force
```

6. Chạy server:

```bash
npm start
```

7. Mở trình duyệt:

```text
http://localhost:3000
```

## Tài khoản admin mặc định

Khi database được khởi tạo, hệ thống tự tạo tài khoản admin mặc định nếu chưa tồn tại:

```text
Email: admin@rex.com
Password: admin123
```

Sau khi chạy dự án thật, nên đăng nhập và đổi mật khẩu hoặc chỉnh logic tạo admin mặc định để dùng thông tin an toàn hơn.

## Cấu hình biến môi trường

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `PORT` | Không | Port chạy server, mặc định `3000`. |
| `APP_BASE_URL` | Không | Base URL của ứng dụng, dùng để tạo callback thanh toán. |
| `JWT_SECRET` | Có | Khóa bí mật để ký JWT. Không dùng giá trị mặc định khi deploy. |
| `MOMO_PARTNER_CODE` | Khi dùng MoMo | Partner code do MoMo cung cấp. |
| `MOMO_ACCESS_KEY` | Khi dùng MoMo | Access key do MoMo cung cấp. |
| `MOMO_SECRET_KEY` | Khi dùng MoMo | Secret key do MoMo cung cấp. |
| `MOMO_ENDPOINT` | Không | Endpoint tạo thanh toán MoMo. Mặc định là test endpoint. |
| `MOMO_QUERY_ENDPOINT` | Không | Endpoint truy vấn giao dịch MoMo. Mặc định là test endpoint. |
| `MOMO_REDIRECT_URL` | Không | URL MoMo chuyển người dùng về sau thanh toán. |
| `MOMO_IPN_URL` | Không | URL MoMo gọi server để thông báo kết quả thanh toán. |
| `MOMO_REQUEST_TYPE` | Không | Loại request MoMo, ví dụ `captureWallet`, `payWithMethod`, `payWithATM`. |

## Thanh toán MoMo

Để test MoMo local, cần cấu hình thông tin sandbox trong `.env`. Vì MoMo cần gọi callback về server, khi test IPN từ internet bạn cần public local server bằng công cụ như ngrok và cập nhật:

```env
APP_BASE_URL=https://your-ngrok-domain.ngrok-free.app
MOMO_REDIRECT_URL=https://your-ngrok-domain.ngrok-free.app/api/payments/momo/return
MOMO_IPN_URL=https://your-ngrok-domain.ngrok-free.app/api/payments/momo/ipn
```

Nếu chưa cấu hình MoMo, hệ thống vẫn có thể chạy các chức năng khác và đặt vé bằng phương thức tiền mặt.

## Một số API chính

### Khách hàng

- `POST /api/register`: đăng ký tài khoản.
- `POST /api/login`: đăng nhập và nhận JWT.
- `GET /api/me`: lấy thông tin người dùng hiện tại.
- `PUT /api/me/password`: đổi mật khẩu.
- `GET /api/movies/now-showing`: danh sách phim đang chiếu.
- `GET /api/movies/coming-soon`: danh sách phim sắp chiếu.
- `GET /api/movies/:slug`: chi tiết phim.
- `GET /api/movies/:slug/showtimes`: lịch chiếu theo phim.
- `GET /api/showtimes/:id/seats`: sơ đồ ghế theo suất chiếu.
- `POST /api/showtimes/:id/seats/hold`: giữ ghế tạm thời.
- `POST /api/showtimes/:id/seats/release`: bỏ giữ ghế.
- `GET /api/snacks`: danh sách snack.
- `POST /api/bookings/checkout`: tạo đặt vé.
- `GET /api/payment-status/:bookingCode`: kiểm tra trạng thái thanh toán.
- `GET /api/me/bookings`: lịch sử đặt vé.
- `GET /api/movies/:id/reviews`: xem review.
- `POST /api/movies/:id/reviews`: gửi review.

### Admin

Các API admin yêu cầu JWT của tài khoản có role `admin`.

- `GET /api/admin/stats`: thống kê dashboard.
- `GET|POST /api/admin/movies`: xem/thêm phim.
- `PUT|DELETE /api/admin/movies/:id`: sửa/xóa phim.
- `GET|POST /api/admin/snacks`: xem/thêm snack.
- `PUT|DELETE /api/admin/snacks/:id`: sửa/xóa snack.
- `GET|POST /api/admin/theaters`: xem/thêm rạp.
- `PUT|DELETE /api/admin/theaters/:id`: sửa/xóa rạp.
- `GET|POST /api/admin/rooms`: xem/thêm phòng chiếu.
- `DELETE /api/admin/rooms/:id`: xóa phòng chiếu.
- `GET|POST /api/admin/showtimes`: xem/thêm suất chiếu.
- `PUT|DELETE /api/admin/showtimes/:id`: sửa/xóa suất chiếu.
- `GET /api/admin/bookings`: quản lý booking.
- `PUT /api/admin/bookings/:id/cancel`: hủy booking.
- `GET /api/admin/users`: danh sách người dùng.
- `GET /api/admin/reviews`: danh sách review.
- `DELETE /api/admin/reviews/:id`: xóa review.
- `GET|POST /api/admin/events`: xem/thêm sự kiện.
- `PUT|DELETE /api/admin/events/:id`: sửa/xóa sự kiện.
- `GET|POST /api/admin/articles`: xem/thêm bài viết.
- `PUT|DELETE /api/admin/articles/:id`: sửa/xóa bài viết.
- `GET|POST /api/admin/media`: xem/thêm trailer hoặc clip.
- `PUT|DELETE /api/admin/media/:id`: sửa/xóa trailer hoặc clip.

## Database

Database SQLite local được tạo tại:

```text
rexcinemas.db
```

Các file database local đã được đưa vào `.gitignore`, gồm:

- `rexcinemas.db`
- `rexcinemas.db-shm`
- `rexcinemas.db-wal`

Người dùng mới chỉ cần chạy `npm run seed` để tạo schema và dữ liệu mẫu.

## Script npm

```bash
npm start       # Chạy server
npm run seed    # Seed dữ liệu nếu database chưa có dữ liệu phim
npm run seed:force # Xóa dữ liệu mẫu cũ và seed lại
```

## Deploy

Khi deploy lên server thật:

1. Cài dependencies bằng `npm install --omit=dev`.
2. Thiết lập biến môi trường thật, đặc biệt là `JWT_SECRET`.
3. Chạy `npm run seed` lần đầu để tạo database nếu cần dữ liệu mẫu.
4. Chạy ứng dụng bằng process manager như PM2 hoặc dịch vụ hosting Node.js.
5. Cấu hình domain thật vào `APP_BASE_URL`, `MOMO_REDIRECT_URL` và `MOMO_IPN_URL` nếu dùng MoMo.

## Bảo mật

- Không commit file `.env`.
- Không commit database local nếu chứa dữ liệu thật.
- Không dùng `JWT_SECRET` mặc định khi chạy production.
- Đổi mật khẩu admin mặc định trước khi public ứng dụng.
- Kiểm tra kỹ thông tin MoMo sandbox/production trước khi deploy.

## Repository

GitHub: https://github.com/Neiht05/RexCinemas.git
