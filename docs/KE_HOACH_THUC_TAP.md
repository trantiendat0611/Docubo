# KẾ HOẠCH THỰC TẬP 8 TUẦN — Docubo

> Task 1.2. Cập nhật 12/08.
>
> **Thay đổi phạm vi so với bản gửi mentor tuần 1:** đề tài ban đầu là trợ lí
> hỏi đáp trên **corpus cố định do lập trình viên nạp sẵn**. Sau khi làm rõ yêu
> cầu, sản phẩm là trợ lí hỏi đáp trên **tài liệu do người dùng tự tải lên** —
> kéo theo xác thực, cô lập dữ liệu đa người dùng, và một đường ingest chạy
> trong trình duyệt. Lộ trình bên dưới phản ánh phạm vi mới.
>
> **Lộ trình đặt lại mốc ngày 12/08:** phần kĩ thuật chạy nhanh hơn dự kiến —
> hết tuần 2 thì toàn bộ AI engine, giao diện web, deploy và CI đều đã xong,
> tức là các Task 3.1, 3.2, 3.3 vốn xếp ở tuần 6–7 đã hoàn thành ở tuần 2.
> Thay vì để lộ trình cũ mô tả sai hiện trạng, tuần 3–8 được viết lại quanh
> phần việc thật sự còn lại: **đo lường, đúc kết tài liệu, và báo cáo**. Lí do
> giữ nguyên độ dài 8 tuần thay vì kết thúc sớm được ghi ở mục "Vì sao không
> rút ngắn" bên dưới.

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
- [x] Viết `eval_dataset.json` — 26 câu, 6 nhóm, 8 câu xuyên ngôn ngữ
- [x] Hoàn thiện `run_eval.py` — 3 chế độ: retrieval-only, dense-only, full
- [x] Chạy eval baseline + so sánh `hybrid_search` với `dense_search`:
      nhánh lexical đáng giá **16.7 điểm phần trăm** recall xuyên ngôn ngữ
      (0.833 → 1.000)
- [x] **Deploy Vercel** — sớm hơn lộ trình 5 tuần. https://docubo.vercel.app,
      region Singapore để cùng khu vực với Supabase (0.76s → 0.34s mỗi request)
- [x] **Bật CI trên GitHub** — sớm hơn lộ trình 2 tuần. Hai job (Python và web):
      lint, format, typecheck, test, build. Không dùng secret nào nên CI không
      bao giờ tiêu quota Gemini
- [x] `SKILL_MY_PROJECT.md` §1.1 — đo pypdf/pymupdf so với vision trên cùng
      một trang công thức
- [ ] Chạy full eval 26 câu trên production, đủ 4 chỉ số ← việc còn lại

### Giai đoạn 2 — Đo lường & đúc kết (Tuần 3–5)

Trọng tâm đổi hẳn so với bản tuần 1: sản phẩm P0 đã xong, nên ba tuần này dùng
để **đo cho đúng** và **viết cho đủ**, không xây thêm tính năng.

**Tuần 3 · 17/08 – 23/08** — đóng nốt phần đo
- [ ] Nối `faithfulness` vào harness (cờ `--judge`). Hiện `FAITHFULNESS_PROMPT`
      đã viết trong `eval/metrics.py` nhưng chưa chỗ nào gọi, trong khi
      `REQUIREMENTS.md` đặt ngưỡng ≥ 0.90 cho nó
- [ ] Thêm `id` chunk vào citation để harness dựng lại đúng context đã sinh ra
      câu trả lời
- [ ] `SKILL` §1.2 — đo cosine: LaTeX thô so với bản diễn giải, cùng câu hỏi
- [ ] `SKILL` §1.3 — thí nghiệm truy hồi xuyên ngôn ngữ có và không có `query_en`
- [ ] Phân tích khoảng cách giữa full mode và retrieval-only, ghi vào `SKILL` §4

**Tuần 4 · 24/08 – 30/08** — trả nợ kĩ thuật, mở rộng định dạng
- [ ] Dọn `document_pages` và file Storage khi xoá tài liệu (rò rỉ đã biết)
- [ ] Nạp **TXT và DOCX** — đóng nốt Task 2.1 của mentor. Cả hai không cần
      vision; cần chốt trước cách đánh số trang cho định dạng không phân trang
- [ ] Hiệu chỉnh `CHARS_PER_TOKEN` tiếng Việt bằng `countTokens`
- [ ] `/api/health` + GitHub Action hàng tuần, chống Supabase ngủ sau 7 ngày
- [ ] `SKILL` §2 — 8 bước quy trình xây dựng

**Tuần 5 · 31/08 – 06/09** — báo cáo chương 1–2
- [ ] `docs/BAO_CAO.md` chương 1 — Tổng quan
- [ ] Chương 2 — Phân tích & Thiết kế
- [ ] Kiểm tra 2 sơ đồ kiến trúc render đúng và còn khớp code
- [ ] **Mốc kiểm: sản phẩm ổn định trên Vercel, đủ 4 chỉ số eval, xong 2/5 chương**

### Giai đoạn 3 — Hoàn thiện (Tuần 6–7)

**Tuần 6 · 07/09 – 13/09** — báo cáo chương 3–4, người dùng thật
- [ ] Chương 3 — Triển khai kỹ thuật (nguyên liệu: `SKILL` §2 và §3)
- [ ] Chương 4 — Kết quả đánh giá. Một bảng duy nhất, ghi rõ chế độ chạy và cỡ
      mẫu cho từng con số
- [ ] Kiểm thử với ít nhất 2 người ngoài, ghi lại chỗ họ vấp
- [ ] Rà UI theo phản hồi: thông báo lỗi, trạng thái rỗng, giao diện điện thoại

**Tuần 7 · 14/09 – 20/09** — chốt số, chốt sản phẩm
- [ ] Chạy eval lần cuối trên production, đủ 26 câu và đủ 4 chỉ số
- [ ] Chương 5 — Kết luận; `SKILL` §0, §5, §6
- [ ] GIF demo vào `README.md`, bổ sung danh sách nguồn tài liệu
- [ ] Kiểm tra ứng dụng chạy 24/7, đo latency thật
- [ ] Chuẩn bị dữ liệu demo, tập kịch bản

### Giai đoạn 4 — Đóng gói & Demo (Tuần 8)

**Tuần 8 · 21/09 – 27/09**
- [ ] Xuất `BAO_CAO.md` sang `.docx` để nộp, canh lại mục lục và hình bảng
- [ ] Rà `SKILL_MY_PROJECT.md` lần cuối, xoá các dòng hướng dẫn trong ngoặc
- [ ] Release tag `v1.0.0-mvp`
- [ ] Slide + tập thuyết trình 15 phút, có phần dự phòng câu phản biện

---

## Vì sao không rút ngắn kì thực tập

Phần code xong sớm không có nghĩa là đồ án xong sớm. Đối chiếu thang điểm của
mentor, hai tiêu chí nặng nhất còn lại **không phải là code**:

| Tiêu chí | Trọng số | Hiện trạng ngày 12/08 |
|---|---|---|
| Tự lập kế hoạch | 20% | Lộ trình này, cập nhật mentor hằng tuần |
| Thiết kế hệ thống | 20% | Xong — 2 sơ đồ, 22 edge case |
| Code & `SKILL_MY_PROJECT.md` | 20% | Code xong; `SKILL` mới xong khoảng 1/3 |
| Live App Vercel | 20% | Đang chạy; cần giữ sống tới tuần 8 |
| Báo cáo & Thuyết trình | 20% | **Chưa bắt đầu** |

40% điểm nằm ở tài liệu và thuyết trình. Thời gian dư vì thế dồn vào đó, chứ
không dùng để thêm tính năng — toàn bộ danh sách P1 trong `REQUIREMENTS.md`
chiếm 0% thang điểm. P1 chỉ được đụng tới nếu tuần 7 kết thúc sớm.

## Đối chiếu với checklist của mentor

| Task | Trạng thái | Ở đâu |
|---|---|---|
| 1.1 Chọn đề tài | Xong | Trợ lí hỏi đáp tài liệu chuyên ngành |
| 1.2 `KE_HOACH_THUC_TAP.md` | Xong | File này |
| 1.3 `REQUIREMENTS.md` | Xong | P0/P1, happy path, 22 edge case |
| 1.4 Hai sơ đồ kiến trúc | Xong | `docs/architecture/*.mmd` |
| 1.5 Khung `SKILL_MY_PROJECT.md` | Xong | Đang viết tiếp, hạn tuần 7 |
| 2.1 Đọc PDF/DOCX/TXT | PDF xong | TXT/DOCX xếp tuần 4 |
| 2.2 Vector DB + chunking | Xong | Supabase pgvector, HNSW, 768 chiều |
| 2.3 Retriever + grounding prompt | Xong | Hybrid 3 nhánh RRF, trích dẫn số trang |
| 2.4 Guardrail + eval 15–20 câu | Xong | `guardrail.ts`; bộ eval **26 câu** |
| 3.1 Web UI có stream + trích dẫn | Xong | Next.js, KaTeX, panel nguồn |
| 3.2 Deploy Vercel | Xong | docubo.vercel.app, region `sin1` |
| 3.3 CI/CD | Xong | `.github/workflows/ci.yml`, 2 job, chạy trên mỗi push vào `main` |
| 4.1 Báo cáo 5 chương | Chưa | Tuần 5–7 |
| 4.2 README + tag `v1.0.0-mvp` | Một phần | GIF và tag ở tuần 7–8 |
| 4.3 Slide demo 15 phút | Chưa | Tuần 8 |

---

## Rủi ro và phương án

| Rủi ro | Dấu hiệu sớm | Phương án |
|---|---|---|
| **Supabase free ngủ sau 7 ngày không hoạt động** | Không có | Đánh thức trước demo vài tiếng. Ghi vào slide chuẩn bị |
| Cạn quota vision khi demo | 429 `PerDay` | Nạp sẵn tài liệu demo từ hôm trước, không ingest live |
| Trang bị `RECITATION` từ chối | Báo cáo cuối lệnh vision | Chain model xử lí phần lớn; ghi tỉ lệ mất vào giới hạn đã biết |
| Truy hồi chéo ngôn ngữ kém | `retrieval_hit_at_8` thấp ở nhóm cross-lingual | Đã kiểm chứng hoạt động; nếu tệ thì embed thêm biến thể dịch |
| **App chết lúc mentor vào xem** | Không có dấu hiệu — chỉ biết khi mở ra thấy lỗi | Tuần 4 dựng `/api/health` + Action hàng tuần tự đánh thức. Trước đó tự mở app mỗi thứ Hai |
| **Dồn báo cáo vào tuần 8** | Hết tuần 6 chưa xong 4/5 chương | Báo cáo bắt đầu từ tuần 5 và viết theo chương, không viết một lượt. Nguyên liệu lấy từ `SKILL` đã viết sẵn |
| **Số eval không nhất quán giữa các chế độ** | Bảng chương 4 có số không ghi rõ chế độ và cỡ mẫu | Mỗi con số kèm chế độ chạy và `n`. Report JSON ghi cả endpoint |

## Cam kết

- Cập nhật tiến độ cho mentor mỗi cuối tuần
- Mọi thay đổi phạm vi ghi vào `REQUIREMENTS.md` kèm lí do — như thay đổi
  sang mô hình người dùng tự tải lên đã ghi ở đầu tài liệu này
- `SKILL_MY_PROJECT.md` viết dần, không dồn về tuần 8
