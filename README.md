# CRMPRO — Hệ thống quản lý doanh số nội bộ

## Có sẵn
- Đăng nhập JWT, tài khoản admin mặc định.
- Phân quyền Admin / Manager / Sale / HLV ở backend.
- SQLite database tự tạo tại `server/data/crm.sqlite`.
- CRUD: Doanh số, Data nhận, Bonus, Bảo lưu, Target.
- Tự động tính phí thanh toán, doanh số sau phí, thuế và thực nhận.
- Dashboard + funnel + doanh số tuần + nguồn + check-in.
- Responsive cho laptop, tablet và điện thoại.

## 1. Cài đặt
Cài Node.js 18+ (khuyến nghị Node.js 20 LTS), sau đó mở Terminal/PowerShell trong thư mục này:

```bash
npm install
npm run dev
```

Mở:
- Máy tính: http://localhost:5173
- Điện thoại cùng Wi-Fi: xem địa chỉ IPv4 của máy tính bằng `ipconfig`, sau đó mở `http://IP-MAY-TINH:5173`

Tài khoản ban đầu:
- username: `admin`
- password: `kpmf0209@admin`

## 2. Chạy bản production
```bash
npm install
npm run build
node server/index.js
```
Mở http://localhost:4000

## 3. Công thức
- Phí thanh toán = Đã thanh toán × tỷ lệ phí
- Doanh số sau phí = Đã thanh toán − Phí thanh toán
- Thuế = Doanh số sau phí × tỷ lệ thuế
- Thực nhận = Doanh số sau phí − Thuế

Lưu ý: công thức này diễn giải đúng theo cách tính kinh tế thông thường từ yêu cầu: “doanh số sau phí = đã thanh toán * phí thanh toán” được hiểu là phần phí; nếu bạn muốn “sau phí = đã thanh toán × (1 − phí%)” thì hệ thống hiện tại đang dùng cách này.

## 4. Đưa lên Internet
Có thể deploy backend Node + frontend build lên Railway, Render, VPS hoặc dịch vụ Node tương đương. SQLite phù hợp cho bản nội bộ/nhỏ; nếu nhiều người dùng đồng thời, nên chuyển database sang PostgreSQL.

## 5. Bảo mật
- Đổi `JWT_SECRET` bằng biến môi trường khi deploy.
- Đổi mật khẩu admin ngay sau lần đăng nhập đầu tiên.
- Không dùng mật khẩu mặc định ở môi trường thật.
