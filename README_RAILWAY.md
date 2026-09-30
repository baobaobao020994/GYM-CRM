# CRM PRO - Bản Online Railway

## Tài khoản mặc định
- Tài khoản: `admin`
- Mật khẩu: `kpmf0209@admin`

## Deploy trên Railway
1. Đưa toàn bộ thư mục này lên một GitHub repository.
2. Trong Railway chọn **New Project** → **Deploy from GitHub Repo** → chọn repository.
3. Thêm **PostgreSQL** vào cùng project.
4. Trong service CRM, kiểm tra biến `DATABASE_URL` đã được kết nối từ PostgreSQL. Nếu Railway chưa tự nối, thêm biến tham chiếu tới `DATABASE_URL` của PostgreSQL service.
5. Thêm biến `JWT_SECRET` với một chuỗi bí mật dài.
6. Deploy. Railway sẽ build bằng `npm run build` và chạy `npm start`.
7. Vào Settings/Networking của service → Generate Domain để lấy link public dùng trên máy tính và điện thoại.

## Lưu ý
- Database dùng PostgreSQL, phù hợp hơn SQLite khi nhiều thiết bị truy cập.
- Server tự tạo bảng và tài khoản admin khi khởi động lần đầu.
- Không cần chạy Vite riêng khi online; Express phục vụ luôn frontend đã build.
