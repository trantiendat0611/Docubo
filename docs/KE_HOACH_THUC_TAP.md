# KẾ HOẠCH THỰC TẬP 8 TUẦN — Docubo

> Task 1.2. Gửi mentor duyệt trước khi bắt đầu Giai đoạn 2.

**Đề tài:** Trợ lí hỏi đáp tài liệu chuyên ngành song ngữ, đọc được công thức
toán và biểu đồ, trả lời có trích dẫn số trang.

**Thời gian:** 03/08/2026 – 27/09/2026 (8 tuần)

**Ràng buộc:** toàn bộ hạ tầng free tier, chi phí 0 đồng.

---

## Điểm khác biệt kĩ thuật

Ba quyết định làm nên đề tài này, cần bảo vệ được khi phản biện:

1. **Ingest bằng vision thay vì parse text.** Thư viện parse PDF thông thường
   phá huỷ công thức toán và bỏ qua hoàn toàn biểu đồ. Pipeline render từng
   trang thành ảnh rồi để Gemini đọc ra Markdown + LaTeX + mô tả hình.

2. **Mỗi chunk mang hai biểu diễn.** `embed_text` là văn xuôi thuần dùng để
   tìm kiếm, `display_text` giữ nguyên LaTeX để hiển thị. Lí do: chuỗi LaTeX
   embed ra vector gần như vô nghĩa, không câu hỏi nào truy hồi được.

3. **Truy hồi hybrid ba nhánh cho song ngữ.** Vector đơn ngữ không đủ vì
   Postgres không có từ điển tiếng Việt; hệ thống giữ hai cột full-text riêng
   và sinh biến thể truy vấn cho cả hai ngôn ngữ trong cùng một lần gọi model.

---

## Lộ trình

### Giai đoạn 1 — Kế hoạch & thiết kế (Tuần 1–2)

**Tuần 1 · 03/08 – 09/08**
- [x] Đọc tài liệu hướng dẫn, chốt đề tài và stack
- [x] Khởi tạo repo, dựng khung thư mục, viết schema và khung pipeline
- [ ] Chạy spike: Gemini đọc 3 trang khó nhất (công thức / biểu đồ / văn xuôi)
- [ ] Đọc kết quả spike, xác nhận hoặc điều chỉnh kiến trúc
- [ ] `KE_HOACH_THUC_TAP.md` gửi mentor duyệt

**Tuần 2 · 10/08 – 16/08**
- [ ] Hoàn thiện `REQUIREMENTS.md`: chốt P0/P1, edge case, chỉ số nghiệm thu
- [ ] Hai sơ đồ Mermaid trong `docs/architecture/`
- [ ] Chốt bộ tài liệu, kiểm tra giấy phép, tính quota cần cho ingest
- [ ] **Viết `eval_dataset.json` 20-25 câu — trước khi code AI engine**
- [ ] Dựng project Supabase, chạy `db/001` và `db/002`

> Vì sao eval viết ở tuần 2 chứ không tuần 5 như đề bài gợi ý: bộ eval viết sau
> khi hệ thống đã chạy chỉ xác nhận lại chính nó. Viết trước thì nó là tiêu chí
> nghiệm thu thật, và mọi quyết định chunking sau đó đều có số để so.

### Giai đoạn 2 — AI Engine core (Tuần 3–5)

**Tuần 3 · 17/08 – 23/08**
- [ ] Hoàn thiện `render.py`, `vision.py`, `cache.py`
- [ ] Ingest tài liệu đầu tiên trọn vẹn, kiểm tra tỉ lệ trang lỗi schema
- [ ] Hiệu chỉnh `CHARS_PER_TOKEN` bằng `countTokens` trên mẫu hai ngôn ngữ
- [ ] Bắt đầu `SKILL_MY_PROJECT.md` — ghi song song từ đây

**Tuần 4 · 24/08 – 30/08**
- [ ] Hoàn thiện `chunk.py`, kiểm tra bằng mắt 10 chunk hai biểu diễn
- [ ] `embed.py` + `store.py`, nạp đủ corpus lên Supabase
- [ ] Chạy `run_eval --retrieval-only`, lấy số nền cho retrieval
- [ ] So sánh hybrid với `dense_search` để định lượng đóng góp của nhánh lexical

**Tuần 5 · 31/08 – 06/09**
- [ ] `guardrail.ts`, `retrieve.ts`, `prompt.ts`
- [ ] Hiệu chỉnh `MIN_COSINE` trên nhóm `should_refuse`
- [ ] Hoàn thiện `run_eval.py`, chạy full eval, ghi báo cáo lần 1
- [ ] **Mốc kiểm: toàn bộ P0 của AI engine phải xong**

### Giai đoạn 3 — Web UI & Deploy (Tuần 6–7)

**Tuần 6 · 07/09 – 13/09**
- [ ] `/api/chat` chạy được ở local, stream ổn định
- [ ] UI: ô chat, render KaTeX, panel trích dẫn, trạng thái từ chối
- [ ] Xử lí lỗi mạng và lỗi API ở phía client (E10)

**Tuần 7 · 14/09 – 20/09**
- [ ] Deploy Vercel, cấu hình environment variables
- [ ] Kiểm tra ứng dụng chạy 24/7, đo latency thật
- [ ] Bật CI, sửa cho xanh
- [ ] Chạy eval lần cuối trên bản production, ghi báo cáo lần 2

### Giai đoạn 4 — Đóng gói & Demo (Tuần 8)

**Tuần 8 · 21/09 – 27/09**
- [ ] Báo cáo 5 chương
- [ ] `README.md`: GIF demo, sơ đồ, link live app
- [ ] Hoàn thiện `SKILL_MY_PROJECT.md`
- [ ] Release tag `v1.0.0-mvp`
- [ ] Slide + tập thuyết trình 15 phút

---

## Rủi ro và phương án

| Rủi ro | Dấu hiệu sớm | Phương án |
|---|---|---|
| Gemini đọc sai công thức | Spike tuần 1 cho kết quả kém | Tăng DPI lên 300; nếu vẫn kém, thu hẹp P0 còn văn bản + biểu đồ, bỏ công thức |
| Cháy quota giữa ingest | Hàng loạt 429 | Cache đã có sẵn; giảm corpus; chia ingest qua nhiều ngày |
| Truy hồi chéo ngôn ngữ kém | `retrieval_hit_at_8` thấp trên nhóm cross-lingual | Embed thêm biến thể dịch, lấy điểm max giữa hai vector |
| Vercel Hobby timeout | Request 60s bị cắt | Đã tách ingest ra offline; giảm `MATCH_LIMIT` nếu prompt quá dài |
| Chậm tiến độ tuần 5 | Chưa xong AI engine | Cắt toàn bộ P1, giữ đúng P0 |

## Cam kết

- Cập nhật tiến độ cho mentor mỗi cuối tuần
- Mọi thay đổi phạm vi đều ghi vào `REQUIREMENTS.md` kèm lí do
- `SKILL_MY_PROJECT.md` viết dần từ tuần 3, không dồn về tuần 8
