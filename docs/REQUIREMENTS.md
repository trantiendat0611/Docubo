# REQUIREMENTS — Docubo

> Task 1.3. Cập nhật 11/08 sau khi phạm vi sản phẩm đổi từ **corpus cố định do
> lập trình viên nạp** sang **người dùng tự tải tài liệu lên**. Thay đổi đó kéo
> theo xác thực, cô lập dữ liệu, và một đường ingest chạy trong trình duyệt —
> phần lớn tài liệu này được viết lại vì lí do đó.

## 1. Bài toán

Người đọc tài liệu kĩ thuật phải tự lần tìm thông tin trong hàng trăm trang PDF.
Công cụ tìm kiếm thông thường thất bại ở đúng phần khó nhất: công thức toán là
các glyph đặt theo toạ độ, trích ra thành chuỗi rác; biểu đồ trích ra thành
chuỗi rỗng.

Docubo là trợ lí hỏi đáp trên **tài liệu do chính người dùng tải lên**. Nó đọc
được công thức và biểu đồ, trả lời có trích dẫn số trang, làm việc với cả tiếng
Việt lẫn tiếng Anh, và **từ chối trả lời** khi tài liệu không chứa câu trả lời.

Điều cuối cùng là tính chất đáng bảo vệ nhất. Không hệ RAG nào trả lời đúng mọi
câu hỏi; hệ thống nói "không có trong tài liệu" đáng tin hơn hệ thống trả lời
trơn tru mọi thứ.

## 2. Người dùng

| Nhóm | Nhu cầu | Ngôn ngữ hỏi |
|---|---|---|
| Sinh viên / người tự học | Tra cứu khái niệm, hiểu công thức | Tiếng Việt |
| Kĩ sư đọc paper | Tìm nhanh định nghĩa, tóm tắt bài báo | Cả hai |

Hai giả định định hình thiết kế:

**Người dùng thường hỏi tiếng Việt trên tài liệu tiếng Anh.** Ca chính, không
phải ca biên — nó quyết định toàn bộ thiết kế truy hồi.

**Tài liệu của mỗi người là riêng tư.** Người A không được thấy tài liệu người B
trong bất kì câu trả lời nào.

## 3. Phạm vi tính năng

### P0 — bắt buộc

**Tải lên và xử lí**
- [x] Đăng nhập bằng email/mật khẩu
- [x] Tải lên PDF, giới hạn 25 trang mỗi tài liệu
- [x] Trình duyệt render từng trang, gửi theo lô lên server
- [x] Trích xuất bằng vision: văn bản, công thức LaTeX, mô tả biểu đồ
- [x] Hiện tiến độ thật theo số trang server đã xử lí
- [x] Xem và xoá tài liệu của mình

**Hội thoại**
- [x] Nhiều khung chat, mỗi khung có lịch sử riêng, lưu trong database
- [x] Tài liệu tải lên gắn vào khung đang mở; câu hỏi chỉ được trả lời từ tài
      liệu của khung đó
- [x] Một tài liệu dùng lại được ở nhiều khung, không phải nạp lại
- [x] Đặt tên khung theo câu hỏi đầu tiên, đổi tên và xoá khung
- [x] Hội thoại nhiều lượt — 3 lượt gần nhất đi kèm làm ngữ cảnh
- [x] Dừng khi đang sinh, và sinh lại câu trả lời

**Truy hồi và trả lời**
- [x] Chunk mang hai biểu diễn (`embed_text` / `display_text`)
- [x] Truy hồi hybrid: vector + full-text hai ngôn ngữ, hợp nhất bằng RRF
- [x] Giới hạn câu hỏi theo tài liệu — chọn tay hoặc nhắc tên trong câu hỏi
- [x] Câu hỏi mức tài liệu (tóm tắt, tổng quan) đi đường `document_overview`
- [x] Trả lời có trích dẫn số trang, mọi câu có marker `[n]`
- [x] Từ chối khi điểm truy hồi dưới `MIN_COSINE`
- [x] Hiển thị công thức bằng KaTeX, phản hồi dạng stream
- [x] Trả lời đúng ngôn ngữ người dùng hỏi

**An toàn**
- [x] Chặn prompt injection ở đầu vào
- [x] Cô lập dữ liệu theo người dùng ở tầng database (RLS)
- [x] Giới hạn 5 lượt tải lên mỗi người mỗi ngày

**Đánh giá**
- [x] Bộ eval **26 câu**, chạy đủ trên production, báo cáo 3/4 chỉ số
      (`faithfulness` còn thiếu — xem bảng ngưỡng bên dưới)

### P1 — làm nếu còn thời gian

- [ ] Trích dẫn mở ra ảnh trang gốc (ảnh đã render sẵn lúc ingest)
- [ ] Rerank top-20 xuống top-5 bằng Gemini
- [ ] Nạp DOCX / TXT
- [ ] Dọn `document_pages` và file Storage khi xoá tài liệu
- [ ] Đính tài liệu có sẵn vào khung chat từ giao diện — hiện chỉ gắn được
      bằng cách tải lên trong khung đó, dù schema đã hỗ trợ dùng lại

### Không làm — ghi rõ để bảo vệ khi phản biện

| Bỏ | Lí do |
|---|---|
| OCR tài liệu scan | Chất lượng phụ thuộc bản scan, không kiểm soát được |
| Công thức nhúng OMML trong DOCX | Định dạng phức tạp, PDF đã phủ hết ca dùng thật |
| Fine-tuning | Không có ngân sách, và RAG đã giải quyết bài toán |
| Agent / multi-hop | Vượt phạm vi MVP 8 tuần |
| Render PDF phía server | Cần native canvas binding — thứ serverless xử lí tệ nhất. Trình duyệt đã có sẵn canvas và có sẵn file |
| Xác nhận email khi đăng ký | Free tier không có SMTP; bật lại chỉ là một công tắc khi triển khai thật |

## 4. Luồng chính

### 4.1 Tải tài liệu lên

1. Người dùng chọn file PDF
2. `pdfjs` trong trình duyệt đọc số trang; quá 25 thì chặn ngay, không tải lên
3. `POST /api/upload` — lưu PDF vào Storage, tạo `ingest_jobs`, trả `jobId`
4. Lặp: trình duyệt render trang thành PNG, gom theo **ngân sách 3MB**, gửi
   `POST /api/ingest/step`
5. Server gọi Gemini vision theo lô, lưu vào `document_pages`, cập nhật tiến độ
6. `POST /api/ingest/finish` — chunk, embed, ghi vào `documents` + `chunks`
7. Danh sách tài liệu tự làm mới

### 4.2 Đặt câu hỏi

1. Người dùng nhập câu hỏi, tuỳ chọn giới hạn phạm vi ở ô "Hỏi trong"
2. `/api/chat` gọi Gemini **một lần** làm bốn việc: kiểm tra an toàn, nhận diện
   ngôn ngữ, sinh `query_en`/`query_vi`/`keywords`, và xác định đây có phải câu
   hỏi mức tài liệu không
3. Xác định phạm vi: lựa chọn tường minh → tên tài liệu nhắc trong câu hỏi →
   toàn corpus
4. **Nếu là câu hỏi mức tài liệu:** gọi `document_overview` lấy 12 chunk trải
   đều theo thứ tự đọc. Nếu chưa rõ tài liệu nào thì hỏi lại
5. **Nếu là câu hỏi cụ thể:** embed câu hỏi với `task_type=RETRIEVAL_QUERY`,
   gọi `hybrid_search` ba nhánh, hợp nhất RRF, lấy 8 chunk
6. Kiểm tra `cosine_sim` chunk đầu so với `MIN_COSINE`
7. Dựng grounding prompt, stream câu trả lời
8. Client render markdown + KaTeX, panel nguồn hiện số trang
9. Ghi `query_log`

## 5. Trường hợp ngoại lệ

| # | Tình huống | Xử lí | Ở đâu |
|---|---|---|---|
| E1 | Câu hỏi ngoài phạm vi | Từ chối, gợi ý hỏi lại | `isUngrounded()` |
| E2 | Prompt injection trong câu hỏi | Chặn trước khi truy hồi | `guardrail.ts` |
| E3 | Prompt injection **nằm trong tài liệu** | System prompt coi context là dữ liệu | `prompt.ts` |
| E4 | Hỏi tiếng Việt, nguồn tiếng Anh | Sinh `query_en` cho nhánh lexical | `guardrail.ts` |
| E5 | Vision đọc lỗi schema | Lưu raw, bỏ qua trang, không dừng cả tài liệu | `vision.ts` |
| E6 | Chạm rate limit theo phút | Đợi đúng `retryDelay` API trả về | `apierrors.py` |
| E7 | Trang bìa / mục lục / tham khảo | `is_boilerplate`, chunker bỏ qua | `chunk.ts` |
| E8 | Công thức bị cắt khỏi đoạn giải thích | Block "attachment" dính vào block trước | `chunk.ts` |
| E9 | Câu hỏi quá dài | Chặn ở `MAX_CHARS`, không tốn quota | `guardrail.ts` |
| E10 | Supabase / Gemini lỗi giữa chừng | Route trả JSON lỗi, UI hiện thông báo | `UploadPanel.tsx` |
| E11 | Nạp lại tài liệu đã có | So `content_hash`, thay toàn bộ chunk | `store.ts` |
| E12 | Trích dẫn block không tồn tại | Đo bằng `citation_validity` | `metrics.py` |
| E13 | Model từ chối trang vì `RECITATION` | Thử lại primary, rồi xoay sang model khác | `vision.ts` |
| E14 | Trang trả markdown không có dòng trống | Cắt theo ranh giới câu | `chunk.ts` |
| E15 | Model không có quota free tier | Nhận `limit: 0`, không retry, chỉ dẫn đổi model | `apierrors.py` |
| **E16** | **Cạn quota ngày giữa lúc ingest** | Xoay model; hết cả chain thì báo rõ, trang đã đọc vẫn giữ | `vision.ts` |
| **E17** | **Người dùng chuyển tab khi đang upload** | Trình duyệt đình chỉ `requestAnimationFrame` → render treo. Timeout 45s kèm giải thích, và nhắc giữ tab hiển thị | `pdf.ts` |
| **E18** | **Client gửi lại một lô đã xử lí** | Bỏ qua trang đã có trong cache, vẫn trả 200 | `ingest/step` |
| **E19** | **Client khai sai số trang** | Chặn ở 25 lúc upload; step bỏ qua trang vượt `n_pages` | `upload`, `ingest/step` |
| **E20** | **Hỏi tóm tắt mà chưa rõ tài liệu nào** | Hỏi lại kèm danh sách, không đoán | `api/chat` |
| **E21** | **Tài liệu người khác** | RLS chặn ở database, không phải ở code | `004_multi_tenant.sql` |
| **E22** | **Tải lên quá nhiều trong ngày** | Chặn ở 5 lượt/24h — quota vision là ngân sách chung | `api/upload` |
| **E23** | **Hỏi trong khung chat chưa có tài liệu nào** | Trả `needs_document` ngay, không gọi model | `api/chat` |
| **E24** | **Gửi `conversationId` của người khác** | RLS trả rỗng → route trả 404, không lộ sự tồn tại | `conversation.ts` |
| **E25** | **Xoá khung chat** | Lịch sử mất theo, tài liệu vẫn còn ở các khung khác | `007_conversations.sql` |
| **E26** | **Người thứ hai tải lên đúng file người thứ nhất đã có** | `content_hash` unique theo từng chủ sở hữu, không toàn cục | `007_conversations.sql` |

## 6. Ràng buộc phi chức năng

| Tiêu chí | Mục tiêu | Ghi chú |
|---|---|---|
| Chi phí | 0 đồng | Ràng buộc cứng của đề bài |
| Token đầu tiên | < 3s | Vercel Hobby giới hạn 60s mỗi hàm. Đo trên production: request không đụng LLM mất ~0.34s sau khi đặt region Singapore, ~0.76s trước đó |
| **Quota vision** | **~20 request/ngày mỗi model** | Ràng buộc thật của cả hệ thống. Chain 4 model, gộp 8 trang/request ≈ **640 trang/ngày cho toàn bộ người dùng** |
| Giới hạn tài liệu | 25 trang | Không phải giới hạn dung lượng — là hệ quả của quota trên. 25 trang ≈ 4 request |
| Body mỗi request | ≤ 3MB | Vercel Hobby chặn ~4.5MB. Ảnh trang 200dpi trung bình 480KB, đỉnh 2MB |
| Dung lượng | Supabase 500MB | 3 tài liệu / 50 chunk hiện dùng chưa tới 1MB |

## 7. Chỉ số nghiệm thu

Hệ thống coi là đạt khi trên `eval/eval_dataset.json`:

Đo lần đầu đầy đủ ngày **13/08/2026** trên production, 26/26 câu, không câu nào
hỏng: `eval/reports/eval-full-20260813-100813.json`.

| Chỉ số | Ngưỡng | Đo được | Ghi chú |
|---|---|---|---|
| `retrieval_hit_at_8` | ≥ 0.85 | **1.000** | Đạt |
| `citation_validity` | ≥ 0.95 | **1.000** | Đạt. Trích dẫn sai là lỗi nghiêm trọng nhất |
| `refusal_rate` | ≥ 0.90 | **1.000** | Đạt. Trên nhóm `should_refuse`, `false_refusal_rate` = 0 |
| `faithfulness` | ≥ 0.90 | — | **Chưa nối vào harness.** `FAITHFULNESS_PROMPT` đã viết trong `eval/metrics.py` nhưng chưa chỗ nào gọi |
| `latex_exact_match` | Chưa chốt | — | Cần nguồn có `.tex` gốc để so |

Chỉ số phụ trong cùng lần chạy:

| Chỉ số | Đo được | Nghĩa |
|---|---|---|
| `hit_cross_lingual` | 1.000 | Hỏi tiếng Việt trên tài liệu tiếng Anh |
| `retrieval_mrr` | 0.882 | Thứ hạng của đoạn đúng |
| `overview_asked_for_document` | 1.000 | Câu tóm tắt không nêu tài liệu thì hỏi lại (1/1) |
| `overview_answered_when_named` | 1.000 | Câu có nêu tài liệu thì trả lời thẳng (2/2) |
| `median_latency_ms` | 6874 | Thời gian đọc xong **toàn bộ** câu trả lời, đã bỏ 4 câu bị cộng thời gian chờ thử lại. Đây **không phải** thời gian tới token đầu tiên — ngưỡng NFR đó vẫn chưa được đo |

## 8. Câu hỏi còn mở

- [x] `MIN_COSINE` — đo hai lần. Trên corpus 34 chunk song ngữ, 10 câu hỏi:
      trong phạm vi 0.713–0.759, ngoài phạm vi 0.503–0.577, khoảng cách 0.136.
      Đặt **0.60**
- [x] Truy hồi xuyên ngôn ngữ — đã kiểm chứng bằng nội dung: hỏi tiếng Việt về
      mô hình đồ thị xác suất trả về đúng trang tiếng Anh nói về nó
- [x] Ảnh trang lưu ở đâu — PDF gốc vào Supabase Storage; ảnh render chỉ tồn
      tại trong trình duyệt lúc upload, không lưu
- [ ] `CHARS_PER_TOKEN` cho tiếng Việt — hiện ước lượng 2.6, cần hiệu chỉnh
      bằng `countTokens`
- [ ] Dọn `document_pages` và file Storage khi người dùng xoá tài liệu
- [ ] Có nên giới hạn kích thước file, ngoài giới hạn số trang
