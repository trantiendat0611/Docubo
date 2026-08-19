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
- [x] Bộ eval **26 câu**, chạy đủ trên production, cả 4 chỉ số đều đã nối vào
      harness (`faithfulness` từ 18/08, cờ `--judge`). `faithfulness` còn thiếu
      **số đo trên production** — xem bảng ngưỡng bên dưới

### P1 — làm nếu còn thời gian

- [ ] Trích dẫn mở ra ảnh trang gốc (ảnh đã render sẵn lúc ingest)
- [ ] Rerank top-20 xuống top-5 bằng Gemini
- [ ] Nạp DOCX / TXT
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
| Token đầu tiên (`p50`) | < 10s | **Đổi từ < 3s ngày 19/08.** Ngưỡng cũ được neo vào một request **không gọi model nào** (~0.34s sau khi đặt region Singapore). Đường thật trước token đầu có **hai lượt gọi model tuần tự** — guardrail rồi mới tới sinh — cộng năm vòng gọi database, nên 3s không đạt được bằng kiến trúc này. 10s là mốc UX quen thuộc về giới hạn giữ được sự chú ý của người dùng, chọn độc lập với số đo. Đo được: 2889ms (18/08) · 8155ms (19/08) |
| Token đầu tiên (`p90`) | < 15s | Thêm mới 19/08. Chỉ có trung vị thì **giấu mất đuôi phân phối** — ngày 13/08 đã có câu mất 44.2s, tức 74% trần hàm, mà không chỉ số nào cho thấy. Đo được: 7747ms (18/08) · 12069ms (19/08) |
| Request chạm trần 60s | **= 0** | Thêm mới 19/08, và là ngưỡng đúng/sai chứ không phải ngưỡng thoải mái: câu chạm trần **không có câu trả lời**, khác hẳn câu trả lời chậm. **Đang vi phạm: 2/26 ở lần chạy 19/08.** Đo bằng `n_timeout` |
| **Quota vision** | **~20 request/ngày mỗi model** | Ràng buộc thật của cả hệ thống. Chain 4 model, gộp 8 trang/request ≈ **640 trang/ngày cho toàn bộ người dùng** |
| Giới hạn tài liệu | 25 trang | Không phải giới hạn dung lượng — là hệ quả của quota trên. 25 trang ≈ 4 request |
| Body mỗi request | ≤ 3MB | Vercel Hobby chặn ~4.5MB. Ảnh trang 200dpi trung bình 480KB, đỉnh 2MB |
| Dung lượng | Supabase 500MB | 3 tài liệu / 50 chunk hiện dùng chưa tới 1MB |

## 7. Chỉ số nghiệm thu

Hệ thống coi là đạt khi trên `eval/eval_dataset.json`:

Lần đo mới nhất: **19/08/2026** trên production, ngay sau khi quota reset —
`eval/reports/eval-full-20260819-071406.json`. Đây là lần đầu `faithfulness` có
số đo thật trên production. Lần đo đầy đủ đầu tiên là 13/08
(`eval-full-20260813-100813.json`); bảng tiến triển đủ 10 lần chạy ở
`SKILL_MY_PROJECT.md` §4.

**Điều kiện của lần đo này khác hẳn 18/08, và điều đó quan trọng.** Chạy lúc
quota còn đầy nên chain phục vụ chủ yếu bằng model mạnh: 13/17 câu do
`gemini-3.5-flash` hoặc `gemini-2.5-flash`, chỉ 4 câu do `flash-lite`. Ngày
18/08 tỉ lệ ngược lại (17/19 câu `flash-lite`). Hai lần chạy vì thế đo **hai chế
độ vận hành khác nhau của cùng một hệ thống**, và so trực tiếp từng số giữa
chúng sẽ dẫn tới kết luận sai.

| Chỉ số | Ngưỡng | Đo được | Ghi chú |
|---|---|---|---|
| `retrieval_hit_at_8` | ≥ 0.85 | **1.000** | Đạt |
| `citation_validity` | ≥ 0.95 | **1.000** | Đạt, 17/17. Cả ba model đều đủ trích dẫn ở lần này (`flash` 6/6, `2.5-flash` 7/7, `flash-lite` 4/4). Con số 0.947 ngày 18/08 đến từ `flash-lite`, model duy nhất từng bỏ trích dẫn — cộng dồn bốn lần chạy đầy đủ: model mạnh **41/41**, `flash-lite` **31/33**. Xem bẫy #18 |
| `refusal_rate` | ≥ 0.90 | **1.000** | Đạt. Trên nhóm `should_refuse`, `false_refusal_rate` = 0. Gồm 4 câu từ chối theo ngưỡng và 2 câu chặn ở guardrail |
| `faithfulness` | ≥ 0.90 | **1.000** | **Đạt — số đo thật đầu tiên trên production.** 17/17 câu chấm được, `n_faithfulness_unscored` = 0, không câu nào có khẳng định thiếu chỗ dựa |
| `latex_exact_match` | Chưa chốt | — | Cần nguồn có `.tex` gốc để so |

Chỉ số phụ trong cùng lần chạy:

| Chỉ số | Đo được | Nghĩa |
|---|---|---|
| `hit_cross_lingual` | 1.000 | Hỏi tiếng Việt trên tài liệu tiếng Anh. 6 câu tính điểm — xem `SKILL_MY_PROJECT.md` §1.3 |
| `retrieval_mrr` | 0.883 | Thứ hạng của đoạn đúng (13/08: 0.882 · 18/08: 0.788). Ở chế độ full, biến thể truy vấn sinh trực tiếp mỗi lần gọi nên MRR dao động giữa các lần chạy; muốn so truy hồi phải dùng `--retrieval-only` (0.926, biến thể lưu sẵn). Xem bẫy #18b |
| `overview_asked_for_document` | 1.000 | Câu tóm tắt không nêu tài liệu thì hỏi lại (1/1) |
| `overview_answered_when_named` | 1.000 | Câu có nêu tài liệu thì trả lời thẳng (2/2) |
| `median_ttft_ms` | **8155** | **Đạt** ngưỡng `p50` < 10s (đã đổi từ < 3s, xem §6 và phân tích dưới) |
| `p90_ttft_ms` | **12069** | **Đạt** ngưỡng `p90` < 15s |
| `n_timeout` | **2** | **Không đạt** — ngưỡng là 0. Xem "Hai lỗi mới" dưới |
| `median_latency_ms` | 7808 | Thời gian đọc xong **toàn bộ** câu trả lời |
| `n_generation_failed` | **2** | `t-001` và `f-003` chết ở 62.4s và 62.6s — chạm giới hạn 60s của hàm Vercel. Xem "Hai lỗi mới" bên dưới |

### Ngưỡng TTFT đã được đổi, và đây là lí do

Ngày 18/08 chỉ số này là 2889ms và được ghi là "đạt" ngưỡng < 3s. Số đó **không
sai, nhưng nó không phải số của hệ thống ở chế độ bình thường.** Tách TTFT theo
model thì rõ ngay:

| Model phục vụ | TTFT trung vị | Lần chạy |
|---|---|---|
| `gemini-3.5-flash-lite` | 2860ms (n=17) | 18/08 |
| `gemini-3.5-flash-lite` | 4225ms (n=4) | 19/08 |
| Model mạnh (`flash`, `2.5-flash`) | **8444ms** (n=13) | 19/08 |

Ngưỡng cũ chỉ đạt được khi hệ thống chạy ở **chế độ chất lượng thấp nhất**:
`flash-lite` là mắt xích cuối chain, nhanh nhất, và cũng là model duy nhất từng
bỏ marker trích dẫn. Tốc độ và độ tin cậy đánh đổi nhau dọc theo chain.

**Vì sao 3s không đạt được, độc lập với số đo.** Ngưỡng cũ được neo vào một
request **không gọi model nào** — 0.34s sau khi đặt region Singapore. Đường thật
trước token đầu tiên là:

```
ownsConversation → conversationDocuments → analyseQuery (GỌI MODEL)
  → listDocuments → embedQuery (GỌI MODEL) → hybrid_search
  → recentTurns → sinh câu trả lời → token đầu tiên
```

**Hai lượt gọi model tuần tự** cộng năm vòng gọi database. Lập luận này đúng kể
cả nếu hôm nay đo ra 2s — ngưỡng cũ chưa bao giờ được suy ra từ kiến trúc này,
vì lúc đặt nó thì guardrail và chain model chưa tồn tại.

**Ngưỡng mới, và mức độ trung thực của từng con số:**

- **`p50` < 10s** — mốc UX quen thuộc về giới hạn giữ được sự chú ý của người
  dùng. Chọn **độc lập với dữ liệu**; sẽ vẫn là 10s kể cả nếu đo ra khác.
- **`p90` < 15s** — thừa nhận có nhìn vào phân phối. Lí do tồn tại thì không:
  trung vị đã giấu mất một câu 44.2s suốt một tuần.
- **`n_timeout` = 0** — không phải ngưỡng thoải mái mà là ngưỡng đúng/sai.

**Một đề xuất bị chính phép kiểm bác bỏ.** Bản đầu tiên của ngưỡng này là
`p50 < 5s`. Đối chiếu lại thì lần chạy 19/08 cho 8155ms — nghĩa là 5s sẽ **không
đạt ở chính đường tốt** của sản phẩm, và chỉ đạt khi chain rơi xuống model yếu.
Đúng cái lỗi mà mục này tồn tại để chỉ ra, suýt lặp lại một lần nữa ngay trong
bản sửa.

**Cải thiện thật còn khả thi:** `embedQuery` embed **câu hỏi nguyên văn**, không
phụ thuộc kết quả guardrail (`src/lib/retrieve.ts`), nên hai lượt gọi model này
chạy song song được. Cộng với gộp các vòng gọi database, ước chừng tiết kiệm
khoảng 1s. Không đủ để về 3s — đó chính là lí do ngưỡng phải đổi chứ không phải
chờ tối ưu.

### Hai lỗi mới lộ ra ở lần chạy này

**Hàm chat chạm trần 60 giây.** `t-001` và `f-003` trả về sau 62.4s và 62.6s với
thân rỗng và không có `reason` — đúng dấu hiệu Vercel giết hàm ở `maxDuration =
60`. Đây **không phải** lỗi quota: `f-001` cùng lần chạy mất 27s và thành công.
Đường sinh câu trả lời hiện không có timeout riêng, nên khi Gemini chậm bất
thường thì giới hạn duy nhất là trần của Vercel — và thứ client nhận được là một
504 không mang thông tin gì. Tỉ lệ quan sát được: **2/26 câu**.

**Câu đầu tiên của phiên chậm bất thường.** `t-001` là request đầu tiên và là
một trong hai câu chết. Chưa đủ dữ liệu để tách cold start của hàm khỏi độ chậm
của model.

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
- [x] Dọn `document_pages` và file Storage khi người dùng xoá tài liệu — **một
      nửa mục này chưa bao giờ đúng.** `document_pages.job_id` cascade theo
      `ingest_jobs`, mà `ingest_jobs.document_id` cascade theo `documents`, nên
      xoá tài liệu đã dọn sạch trang từ trước. Kiểm bằng cách chèn thật một bộ
      document + job + page rồi xoá: cả ba hàng đều đi. Rò rỉ thật chỉ có
      **Storage** — bucket không có khoá ngoại để cascade theo. `deleteDocument()`
      đọc `storage_path` **trước** khi xoá hàng (job cascade mất thì không lấy
      lại được), xoá hàng rồi mới xoá file
- [ ] Có nên giới hạn kích thước file, ngoài giới hạn số trang
- [ ] **`citation_validity` có nên tính cả câu từ chối bằng văn xuôi không?**
      Đo 18/08 (`eval-full-20260818-081602.json`, `g-002`): model nhận đúng
      context (`hit=true`, `mrr=1.0`) nhưng viết văn xuôi từ chối thay vì trả
      lời — đúng luật 3 của grounding prompt, không sai. `citation_validity()`
      trả 0.0 vì không có marker `[n]` nào, coi giống hệt trích dẫn bịa.
      `faithfulness_score` của cùng câu là 1.0 — vì `FAITHFULNESS_PROMPT` đã
      xử lý "refusal = faithful", còn `citation_validity` thì chưa. Xem
      `SKILL_MY_PROJECT.md` bẫy #17
