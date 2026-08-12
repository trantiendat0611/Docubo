# KẾ HOẠCH THỰC TẬP 8 TUẦN — Docubo

> Task 1.2. Cập nhật 11/08.
>
> **Thay đổi phạm vi so với bản gửi mentor tuần 1:** đề tài ban đầu là trợ lí
> hỏi đáp trên **corpus cố định do lập trình viên nạp sẵn**. Sau khi làm rõ yêu
> cầu, sản phẩm là trợ lí hỏi đáp trên **tài liệu do người dùng tự tải lên** —
> kéo theo xác thực, cô lập dữ liệu đa người dùng, và một đường ingest chạy
> trong trình duyệt. Lộ trình bên dưới phản ánh phạm vi mới.

**Đề tài:** Trợ lí hỏi đáp tài liệu do người dùng tải lên, song ngữ Việt – Anh,
đọc được công thức toán và biểu đồ, trả lời có trích dẫn số trang.

**Thời gian:** 03/08/2026 – 27/09/2026 (8 tuần)

**Ràng buộc:** toàn bộ hạ tầng free tier, chi phí 0 đồng.

---

## Điểm khác biệt kĩ thuật

Năm quyết định làm nên đề tài này, cần bảo vệ được khi phản biện:

1. **Ingest bằng vision thay vì parse text.** Thư viện parse PDF thông thường
   phá huỷ công thức toán và bỏ qua hoàn toàn biểu đồ. Pipeline render từng
   trang thành ảnh rồi để Gemini đọc ra Markdown + LaTeX + mô tả hình.

2. **Mỗi chunk mang hai biểu diễn.** `embed_text` là văn xuôi thuần dùng để
   tìm kiếm, `display_text` giữ nguyên LaTeX để hiển thị. Lí do: chuỗi LaTeX
   embed ra vector gần như vô nghĩa, không câu hỏi nào truy hồi được.

3. **Truy hồi hybrid ba nhánh cho song ngữ.** Vector đơn ngữ không đủ vì
   Postgres không có từ điển tiếng Việt; hệ thống giữ hai cột full-text riêng
   và sinh biến thể truy vấn cho cả hai ngôn ngữ trong cùng một lần gọi model.

4. **Cô lập dữ liệu đặt ở database, không ở code.** Truy vấn chạy dưới JWT của
   người dùng và `hybrid_search` là `SECURITY INVOKER`, nên policy quyết định
   thấy gì. Route handler quên lọc chủ sở hữu trả về rỗng, không phải tài liệu
   người khác.

5. **Trình duyệt render PDF.** Render phía server cần native canvas binding —
   thứ serverless xử lí tệ nhất — và đặt phần chậm nhất của ingest vào hàm 60
   giây. Trình duyệt đã có sẵn canvas và có sẵn file.

---

## Ràng buộc chi phối toàn bộ thiết kế

Đo ngày 10/08: free tier cấp **~20 request vision mỗi ngày cho mỗi model**, chứ
không phải 15 request/phút như tài liệu hướng dẫn ghi (con số đó là của
`gemini-2.0-flash`, model đã bị rút khỏi free tier).

Hệ quả dây chuyền:

| Đối phó | Kết quả |
|---|---|
| Gộp 8 trang mỗi request | 68 trang: 68 → **9 request** |
| Xoay vòng 4 model, mỗi model một ngân sách ngày | ~80 → **~640 trang/ngày** |
| Giới hạn 25 trang mỗi tài liệu | Một lượt tải = 4 request |
| Giới hạn 5 lượt/người/ngày | Quota là ngân sách chung của cả deployment |

Đây là lí do tồn tại của gần hết các giới hạn trong sản phẩm — không phải giới
hạn dung lượng.

---

## Lộ trình

### Giai đoạn 1 — Kế hoạch & thiết kế (Tuần 1–2)

**Tuần 1 · 03/08 – 09/08** — xong
- [x] Đọc tài liệu hướng dẫn, chốt đề tài và stack
- [x] Khởi tạo repo, dựng khung thư mục, viết schema và khung pipeline
- [x] Spike: Gemini đọc 6 trang khó nhất trên 2 tài liệu, 2 ngôn ngữ
- [x] Xác nhận kiến trúc — spike lôi ra 4 lỗi runtime, đã sửa hết
- [x] `KE_HOACH_THUC_TAP.md` gửi mentor duyệt

**Tuần 2 · 10/08 – 16/08** — đang làm
- [x] Dựng Supabase, chạy 6 migration, kiểm chứng RLS bằng thực nghiệm
- [x] Nạp corpus thử: 3 tài liệu, 50 chunk, song ngữ
- [x] Hiệu chỉnh `MIN_COSINE` — đo hai lần trên hai cỡ corpus
- [x] Xác thực + cô lập dữ liệu đa người dùng
- [x] Đường tải lên: 3 route, ingest TypeScript, UI, parity test với Python
- [x] Cập nhật `REQUIREMENTS.md` và 2 sơ đồ theo phạm vi mới
- [ ] **Viết `eval_dataset.json` 20–25 câu** ← việc lớn nhất còn lại
- [ ] Hoàn thiện `run_eval.py`

### Giai đoạn 2 — Đo lường & củng cố (Tuần 3–5)

Giai đoạn này đổi trọng tâm: phần lớn AI engine đã chạy sớm hơn kế hoạch, nên
thời gian dồn vào **đo lường** và **triển khai sớm** thay vì xây thêm.

**Tuần 3 · 17/08 – 23/08**
- [ ] Chạy eval baseline, ghi báo cáo lần 1
- [ ] So sánh `hybrid_search` với `dense_search` — định lượng đóng góp nhánh lexical
- [ ] Hiệu chỉnh `CHARS_PER_TOKEN` tiếng Việt bằng `countTokens`
- [x] **Deploy Vercel** — làm ở tuần 2 thay vì tuần 7. https://docubo.vercel.app,
      region Singapore để cùng khu vực với Supabase (0.76s → 0.34s mỗi request)

**Tuần 4 · 24/08 – 30/08**
- [ ] Bật CI trên GitHub (workflow đã viết, mô phỏng local đều xanh)
- [ ] Xử lí lỗi mạng phía client (E10)
- [ ] Dọn `document_pages` và Storage khi xoá tài liệu
- [ ] Viết `SKILL_MY_PROJECT.md` phần quy trình

**Tuần 5 · 31/08 – 06/09**
- [ ] Chạy eval lần 2 sau khi tinh chỉnh, so với baseline
- [ ] P1 nếu còn thời gian: trích dẫn mở ảnh trang gốc
- [ ] **Mốc kiểm: sản phẩm chạy ổn định trên Vercel, có số eval**

### Giai đoạn 3 — Hoàn thiện (Tuần 6–7)

**Tuần 6 · 07/09 – 13/09**
- [ ] Rà UI: thông báo lỗi, trạng thái rỗng, giao diện điện thoại
- [ ] Kiểm thử với người dùng thật ngoài mình
- [ ] Sửa theo phản hồi

**Tuần 7 · 14/09 – 20/09**
- [ ] Chạy eval lần cuối trên bản production
- [ ] Kiểm tra ứng dụng chạy 24/7, đo latency thật
- [ ] Chuẩn bị dữ liệu demo, tập kịch bản

### Giai đoạn 4 — Đóng gói & Demo (Tuần 8)

**Tuần 8 · 21/09 – 27/09**
- [ ] Báo cáo 5 chương
- [ ] `README.md`: GIF demo, link Vercel, danh sách nguồn tài liệu
- [ ] Hoàn thiện `SKILL_MY_PROJECT.md`
- [ ] Release tag `v1.0.0-mvp`
- [ ] Slide + tập thuyết trình 15 phút

---

## Rủi ro và phương án

| Rủi ro | Dấu hiệu sớm | Phương án |
|---|---|---|
| **Supabase free ngủ sau 7 ngày không hoạt động** | Không có | Đánh thức trước demo vài tiếng. Ghi vào slide chuẩn bị |
| Cạn quota vision khi demo | 429 `PerDay` | Nạp sẵn tài liệu demo từ hôm trước, không ingest live |
| Trang bị `RECITATION` từ chối | Báo cáo cuối lệnh vision | Chain model xử lí phần lớn; ghi tỉ lệ mất vào giới hạn đã biết |
| Truy hồi chéo ngôn ngữ kém | `retrieval_hit_at_8` thấp ở nhóm cross-lingual | Đã kiểm chứng hoạt động; nếu tệ thì embed thêm biến thể dịch |
| Chậm tiến độ | Chưa xong eval hết tuần 3 | Cắt toàn bộ P1, giữ đúng P0 |

## Cam kết

- Cập nhật tiến độ cho mentor mỗi cuối tuần
- Mọi thay đổi phạm vi ghi vào `REQUIREMENTS.md` kèm lí do — như thay đổi
  sang mô hình người dùng tự tải lên đã ghi ở đầu tài liệu này
- `SKILL_MY_PROJECT.md` viết dần, không dồn về tuần 8
