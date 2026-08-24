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
- [x] **Dán hoặc kéo một ảnh** (PNG/JPEG/WebP) — nạp thành tài liệu một trang,
      đi đúng đường vision đang có nên vẫn có trích dẫn và vẫn bị ngưỡng từ
      chối chặn như mọi tài liệu khác
- [x] Trình duyệt render từng trang, gửi theo lô lên server
- [x] Trích xuất bằng vision: văn bản, công thức LaTeX, mô tả biểu đồ
- [x] Hiện tiến độ thật theo số trang server đã xử lí
- [x] Xem và xoá tài liệu của mình

**Hội thoại**
- [x] Nhiều khung chat, mỗi khung có lịch sử riêng, lưu trong database
- [x] Tài liệu tải lên gắn vào khung đang mở; câu hỏi chỉ được trả lời từ tài
      liệu của khung đó
- [x] Một tài liệu dùng lại được ở nhiều khung, không phải nạp lại
- [x] Khung chat mới chỉ được ghi vào database khi người dùng hỏi câu đầu
      hoặc tải tài liệu đầu tiên — mở app không sinh hàng rỗng
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
- [x] Bộ eval **31 câu**, chạy đủ trên production, cả 4 chỉ số đều nối vào
      harness. Nhóm `hard_negative` (5 câu) thêm 20/08: ngoài phạm vi nhưng
      **cùng lĩnh vực**, và cả năm **vượt được ngưỡng cosine** — chúng đo tầng
      phòng thủ thứ hai, thứ mà 26 câu gốc không chạm tới

### P1 — làm nếu còn thời gian

- [ ] Trích dẫn mở ra ảnh trang gốc (ảnh đã render sẵn lúc ingest)
- [ ] Rerank top-20 xuống top-5 bằng Gemini
- [x] ~~Nạp DOCX / TXT~~ — **quyết định 20/08: bỏ khỏi phạm vi.** Hai lí do kĩ
      thuật, không phải thiếu thời gian. **(1)** Cả hai định dạng **không có số
      trang** — `.docx` không lưu ngắt trang, việc chia trang do phần mềm mở nó
      quyết định — nên hỗ trợ chúng buộc phải đổi đơn vị trích dẫn, tức đổi
      chính lời hứa trung tâm của sản phẩm. **(2)** Chúng **không đi qua đường
      vision**: tiền đề của cả đồ án là lớp text của PDF phá huỷ công thức và
      biểu đồ, mà `.txt` thì chỉ là text — vấn đề đó không tồn tại. Nên đây là
      một đường ingest thứ hai chạy song song, không phải phần mở rộng của
      đường hiện có. Ghi lại ở "Không làm" §3 để bảo vệ khi phản biện
- [ ] Đính tài liệu có sẵn vào khung chat từ giao diện — hiện chỉ gắn được
      bằng cách tải lên trong khung đó, dù schema đã hỗ trợ dùng lại

### Không làm — ghi rõ để bảo vệ khi phản biện

| Bỏ | Lí do |
|---|---|
| OCR tài liệu scan | Chất lượng phụ thuộc bản scan, không kiểm soát được |
| Công thức nhúng OMML trong DOCX | Định dạng phức tạp, PDF đã phủ hết ca dùng thật |
| Fine-tuning | Không có ngân sách, và RAG đã giải quyết bài toán |
| **Nạp DOCX / TXT** | Không có số trang nên phải đổi đơn vị trích dẫn — lời hứa trung tâm của sản phẩm. Và chúng không đi qua đường vision, tức không dùng tới phần lõi của đồ án. Quyết định 20/08 |
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
| **E27** | **Xoá đúng khung chat đang mở** | Rơi về khung mới trống, không phải chế độ toàn corpus | `ConversationList.tsx` |
| **E28** | **Dán ảnh lớn hơn ngân sách request** | Thu nhỏ cạnh dài về 2000px; PNG không lọt thì lùi sang JPEG. Đo thật: ảnh nhiễu 2000×1500 ra **10.3MB** dạng PNG, **2.1MB** dạng JPEG | `image.ts` |
| **E29** | **Dán ảnh định dạng trình duyệt không giải mã được** (HEIC) | Từ chối ngay ở bước phân loại, kèm hướng dẫn lưu lại thành PNG/JPEG | `kinds.ts` |
| **E30** | **Dán văn bản, không phải ảnh** | Bỏ qua hoàn toàn, dán chữ vào ô hỏi vẫn chạy bình thường | `Workspace.tsx` |
| **E26** | **Người thứ hai tải lên đúng file người thứ nhất đã có** | `content_hash` unique theo từng chủ sở hữu, không toàn cục | `007_conversations.sql` |

## 6. Ràng buộc phi chức năng

| Tiêu chí | Mục tiêu | Ghi chú |
|---|---|---|
| Chi phí | 0 đồng | Ràng buộc cứng của đề bài |
| Token đầu tiên (`p50`) | < 10s | **Đổi từ < 3s ngày 19/08.** Ngưỡng cũ được neo vào một request **không gọi model nào** (~0.34s sau khi đặt region Singapore). Đường thật trước token đầu có **hai lượt gọi model tuần tự** — guardrail rồi mới tới sinh — cộng năm vòng gọi database, nên 3s không đạt được bằng kiến trúc này. 10s là mốc UX quen thuộc về giới hạn giữ được sự chú ý của người dùng, chọn độc lập với số đo. Đo được: 2889ms (18/08) · 8155ms (19/08) |
| Token đầu tiên (`p90`) | < 15s | Thêm mới 19/08. Chỉ có trung vị thì **giấu mất đuôi phân phối** — ngày 13/08 đã có câu mất 44.2s, tức 74% trần hàm, mà không chỉ số nào cho thấy. Đo được: 7747 (18/08) · 12069 (19/08) · **18368 (20/08)** · **15879 (21/08)** — chưa đạt. Ba con số cuối tính trên cùng 26 câu gốc; nhóm `hard_negative` bị loại khỏi thống kê TTFT vì câu trả lời của chúng là lời từ chối, ngắn và nhanh bất thường (bẫy #24). Ngưỡng này chọn sau khi nhìn phân bố, và hỏng sau đúng một lần chạy; giữ nguyên và ghi là chưa đạt thay vì dời lần thứ hai. Xem §7 |
| Request chạm trần 60s | **= 0** | Ngưỡng đúng/sai chứ không phải ngưỡng thoải mái: câu chạm trần **không có câu trả lời**, khác hẳn câu trả lời chậm. 19/08 vi phạm 2/26; sau khi đặt hạn chót 50s cho cả request thì **20/08 đạt 0/26**, xác nhận trong một lần chạy còn bị tải nặng hơn. Đo bằng `n_timeout` |
| **Quota vision** | **~20 request/ngày mỗi model** | Ràng buộc thật của cả hệ thống. Chain 4 model, gộp 8 trang/request ≈ **640 trang/ngày cho toàn bộ người dùng** |
| Giới hạn tài liệu | 25 trang | Không phải giới hạn dung lượng — là hệ quả của quota trên. 25 trang ≈ 4 request |
| Body mỗi request | ≤ 3MB | Vercel Hobby chặn ~4.5MB. Ảnh trang 200dpi trung bình 480KB, đỉnh 2MB |
| Dung lượng | Supabase 500MB | 3 tài liệu / 50 chunk hiện dùng chưa tới 1MB |

## 7. Chỉ số nghiệm thu

Hệ thống coi là đạt khi trên `eval/eval_dataset.json`:

Lần đo mới nhất: **21/08/2026** trên production —
`eval/reports/eval-full-20260821-071023.json`. **Lần đầu chạy đủ 31 câu**, tức
lần đầu nhóm `hard_negative` chạy cùng mọi nhóm khác. Không kèm `--judge`:
`faithfulness` có số production 1.000 từ 19/08, và 62 + 24 request vượt trần một
ngày.

| Chỉ số | Ngưỡng | Đo được | |
|---|---|---|---|
| `retrieval_hit_at_8` | ≥ 0.85 | **1.000** | Đạt |
| `citation_validity` | ≥ 0.95 | **1.000** | Đạt — nhóm mới **không** pha loãng |
| `refusal_rate` | ≥ 0.90 | **1.000** | Đạt — nhóm mới **không** kéo xuống 0.545 |
| `faithfulness` | ≥ 0.90 | **1.000** | Đạt — số đo 19/08 |
| `n_timeout` | **= 0** | **0** | Đạt, lần xác nhận thứ hai |
| `median_ttft_ms` (`p50`) | < 10s | **8592** | Đạt |
| `p90_ttft_ms` | < 15s | **15879** | **Không đạt** — xem dưới |

Chỉ số phụ: `hit_cross_lingual` 1.000 · `retrieval_mrr` 0.882 ·
`overview_asked_for_document` 1.000 · `overview_answered_when_named` 1.000 ·
`n_hard_negative` 5 · `n_generation_failed` 0 · `n_degraded` 3 ·
`median_latency_ms` 5634. Lần chạy có 4 lần chạm giới hạn theo phút phải thử lại.

### Ba phép tách của nhóm `hard_negative` đã được xác nhận

Đây là lần chạy duy nhất kiểm được điều đó, vì nó là lần đầu có **mọi nhóm cùng
lúc**. Năm câu `hard_negative` vượt ngưỡng cosine nên chúng đi đường sinh câu trả
lời; xếp nhầm chúng vào `should_refuse` thì `refusal_rate` rơi xuống 0.545, và để
chúng trong `citation_validity` thì mỗi lời từ chối bị chấm như một lỗi trích dẫn.
Cả hai chỉ số **giữ nguyên 1.000**, đúng thiết kế.

### `p90` — con số harness báo, và con số đúng

Harness báo `p90_ttft_ms` = **13358**, tức đạt. Con số đó **gây hiểu nhầm**.

Đây là lần đầu 5 câu `hard_negative` được tính vào thống kê TTFT. Câu trả lời cho
chúng là **lời từ chối**: ngắn, model quyết định sớm.

| | TTFT |
|---|---|
| 5 câu `hard_negative` | 2749 – 3190ms |
| Trung vị 26 câu còn lại | 8592ms |

Năm giá trị nhanh gia nhập mẫu (19 → 24) đủ để kéo `p90` xuống dưới ngưỡng — **mà
không có gì về tốc độ hệ thống thay đổi**. Tính lại chỉ trên 26 câu gốc, cùng cơ
sở với mọi lần chạy trước: **15879, vẫn chưa đạt**.

Hệ thống có nhanh lên thật — 18368 (20/08) → 15879 (21/08) trên cùng cơ sở — nhưng
không nhiều như 13358 gợi ý. Còn `p50` thì gần như đứng yên: 8594 → 8592.

`hard_negative` vì thế đã bị loại khỏi thống kê TTFT, cùng lí do đã loại khỏi
`citation_validity`. Bảng trên ghi số đã tính lại; file report giữ nguyên con số
lúc chạy, vì nó là bằng chứng của **lần chạy** chứ không phải của luật tính.
Bẫy #24.
*(Lịch sử 20/08)*
### *(20/08)* `n_timeout = 0` — bản vá trần 60 giây đã xác nhận

Ngày 19/08 có 2/26 câu chết ở 62.4s và 62.6s vì Vercel giết hàm ở
`maxDuration = 60`. Sau khi đặt hạn chót 50s cho cả request, lần chạy này
**không câu nào chạm trần** — và nó xác nhận trong điều kiện khắc nghiệt hơn
lần trước, với 5 lần chạm rate limit và câu chậm nhất mất 22.6s.

### *(20/08)* `p90` vừa hỏng, và tôi tự gây ra

Ngưỡng `p90 < 15s` được đặt hôm 19/08. Lúc đặt tôi đã ghi rõ nó **"thừa nhận có
nhìn vào phân bố"** — khác với `p50 < 10s` vốn lấy từ mốc UX bên ngoài. Đúng một
lần chạy sau, con số đó bị vượt: 12069 → **18368**.

Hai điều rút ra, và điều thứ hai quan trọng hơn:

**Một, `p90` trên 19 mẫu không phải một thống kê ổn định.** Theo nearest-rank,
`p90` của 19 giá trị là **giá trị thứ 18**, tức chỉ có đúng **một** câu đứng trên
nó — nó gần như là "câu chậm nhì". Một câu chậm bất thường là đủ để đổi kết quả.

| n | `p90` là giá trị thứ | Số giá trị đứng trên |
|---|---|---|
| 19 | 18 | **1** |
| 26 | 24 | 2 |
| 50 | 45 | 5 |

**Hai, ngưỡng lấy từ dữ liệu thì hỏng, ngưỡng lấy từ bên ngoài thì không.**
`p50 < 10s` chọn từ mốc UX quen thuộc, độc lập với số đo — vẫn đạt (8594).
`p90 < 15s` chọn sau khi nhìn phân bố — hỏng sau một lần chạy. Đây là minh hoạ
do chính dự án tự tạo ra cho điều đã viết ở §3.8: một ngưỡng khớp vào một mẫu là
một ngưỡng chưa được kiểm.

**Ngưỡng giữ nguyên 15s và ghi là chưa đạt.** Dời nó lần thứ hai, ngay sau lần
vi phạm đầu tiên, thì nó thôi không còn là ngưỡng nữa. Cần thêm vài lần chạy để
biết 18368 là mức thật hay là một buổi API bận.

### *(20/08)* Model có từ chối câu ngoài phạm vi cùng lĩnh vực không — **có, 5/5**

Câu hỏi mở quan trọng nhất còn lại, và câu trả lời rõ ràng
(`eval/reports/probe-refusal-20260820-073311.json`).

Năm câu ở §3.8 vượt được ngưỡng cosine — cùng lĩnh vực với tài liệu nhưng tài
liệu không trả lời được — đã được gửi qua `/api/chat` thật. **Cả năm đều bị từ
chối**, và tất cả đều do **`gemini-3.5-flash-lite`** phục vụ, tức mắt xích yếu
nhất chain.

Chất lượng từ chối còn cao hơn mong đợi. Hai trong năm câu **tìm ra bằng chứng
một phần rồi giải thích vì sao nó không đủ**:

> *"Tài liệu chỉ nhắc đến LoRA như một tài liệu tham khảo (Low-rank adaptation
> of large language models) [1], nhưng không giải thích về phương pháp này hay
> đưa ra sự khác biệt với full fine-tuning."*

> *"The provided context mentions that 'L1 regularization may allow some
> coefficients to be zore' [4], but it does not contain information about L2
> regularisation or the difference between L1 and L2."*

Đó là đọc ngữ cảnh, không phải khớp mẫu. Ba câu còn lại từ chối gọn và gợi ý
đúng những chủ đề tài liệu **có** nói.

**Hệ quả cho cách đọc `refusal_rate`.** Chỉ số 1.000 được đo trên sáu câu lạc đề
hiển nhiên, nên nó **nói ít hơn** hệ thống thật sự làm được. Phép thử này cho
thấy tầng phòng thủ thứ hai — grounding prompt — giữ được đúng nhóm câu mà ngưỡng
cosine **không thể** phân biệt, ngay cả trên model yếu nhất.

### *(Lịch sử 19/08)* Ngưỡng TTFT đã được đổi, và đây là lí do

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

### *(Lịch sử 19/08)* Hai lỗi mới lộ ra ở lần chạy đó — cả hai nay đã xử lí

**Hàm chat chạm trần 60 giây.** `t-001` và `f-003` trả về sau 62.4s và 62.6s với
thân rỗng và không có `reason` — đúng dấu hiệu Vercel giết hàm ở `maxDuration =
60`. Đây **không phải** lỗi quota: `f-001` cùng lần chạy mất 27s và thành công.
Đường sinh câu trả lời hiện không có timeout riêng, nên khi Gemini chậm bất
thường thì giới hạn duy nhất là trần của Vercel — và thứ client nhận được là một
504 không mang thông tin gì. Tỉ lệ quan sát được: **2/26 câu**.

**Câu đầu tiên của phiên chậm bất thường.** `t-001` là request đầu tiên và là
một trong hai câu chết. Chưa đủ dữ liệu để tách cold start của hàm khỏi độ chậm
của model.

### *(24/08)* Câu hỏi về hình/bảng đã trả lời rỗng từ lần chạy đầu tiên — nay đã sửa

Ba câu eval mới cho đường dán ảnh trả lời rỗng cả ba, dù `hit@8` báo đúng trang.
Tra ngược thì `g-001`/`g-002` — hai câu `figure` trong bộ 26 câu gốc, có từ
11/08 — cũng rỗng y hệt kiểu này ở **mọi lần chạy full mode trước giờ**, và
không chỉ số nào trong 15 lần chạy bắt được: `hit@8` chỉ đo đúng trang,
`citation_validity` chỉ đếm có `[n]` hay không, cả hai không đọc nội dung
`display_text` — trường thực sự đưa vào prompt sinh câu trả lời.

Gốc rễ: `display_text` cố tình giữ nguyên placeholder `[[FIGURE:id]]` thay vì
dữ liệu thật, theo đúng thiết kế ghi trong `chunk.ts` — nhưng không nơi nào
trong frontend đọc placeholder đó để render thành gì cả, nên thiết kế "giữ
nguyên để hiển thị" phục vụ một mục đích không tồn tại, và phá mất mục đích
thật của trường này. Quét toàn corpus: **46/90 chunk (51%) mang placeholder
chưa thay thế**.

Đã sửa `buildContext` (`src/lib/prompt.ts`) để thay `[[FIGURE:id]]` bằng
`caption + description + data` từ `figure_refs`, đúng logic đã có sẵn cho
`embed_text` trong `chunk.ts` — chỉ chưa từng áp cho `display_text`. 3 test
mới. Xem `SKILL` bẫy #28.

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
- [x] **Model có từ chối 5 câu vùng chồng lấn không?** — **có, 5/5**, đo
      20/08 (`probe-refusal-20260820-073311.json`). Cả năm đều do
      `gemini-3.5-flash-lite` phục vụ, tức mắt xích yếu nhất chain, và hai câu
      còn **tìm ra bằng chứng một phần rồi giải thích vì sao nó không đủ** thay
      vì từ chối trống. Nghĩa là tầng phòng thủ thứ hai giữ được đúng nhóm câu
      mà ngưỡng cosine không phân biệt được, và `refusal_rate = 1.000` **nói ít
      hơn** hệ thống thật sự làm được. Chi tiết ở §7
- [ ] Có nên giới hạn kích thước file, ngoài giới hạn số trang
- [x] **Biên của `MIN_COSINE` có đủ rộng không?** — **câu hỏi sai, đã trả lời
      20/08 bằng một câu khác.** Chấm thêm 16 câu dò (`eval/threshold.py`) thì
      hai phân bố **chồng lấn**: câu ngoài phạm vi **cùng lĩnh vực** cao nhất
      0.654, câu trong phạm vi thấp nhất 0.612, và `o-001` cũng đúng 0.654. Nên
      **không tồn tại ngưỡng tối ưu** — cosine đo độ liên quan chủ đề, không đo
      khả năng trả lời được. Giữ **0.60** và phát biểu lại vai trò: bộ lọc thô,
      không phải bảo chứng; bảo chứng nằm ở grounding prompt. Chi tiết ở
      `SKILL_MY_PROJECT.md` Bước 7 và bẫy #23. *(Nội dung câu hỏi cũ giữ lại bên
      dưới để đối chiếu.)*
- [ ] ~~**Biên của `MIN_COSINE` có đủ rộng không?**~~ Đo lại trên cả 26 câu ngày
      20/08 (`eval-retrieval-20260820-014200.json`): câu ngoài phạm vi cao nhất
      **0.554**, câu trong phạm vi thấp nhất **0.612** — ngưỡng 0.60 nằm giữa,
      nhưng biên phía trên chỉ **+0.012**. *(Hai câu prompt injection ghi 0.588
      và 0.578, cao hơn cả nhóm lạc đề, nhưng guardrail chặn chúng trước nên
      chúng không ràng buộc ngưỡng.)* Câu sát ngưỡng là `g-001` — hỏi về nội
      dung **chỉ nằm trong biểu đồ**, tức đúng nhóm phụ thuộc tính bất định của
      ingest. Một lần nạp lại rơi vào chế độ "1 hình" có thể đẩy nó xuống dưới
      ngưỡng và gây **từ chối nhầm**. Chưa quyết: hạ ngưỡng thì mất khả năng
      chặn câu lạc đề, giữ nguyên thì chấp nhận rủi ro này. Cần đo trên nhiều
      lần nạp trước khi chốt
- [ ] **`citation_validity` có nên tính cả câu từ chối bằng văn xuôi không?**
      Đo 18/08 (`eval-full-20260818-081602.json`, `g-002`): model nhận đúng
      context (`hit=true`, `mrr=1.0`) nhưng viết văn xuôi từ chối thay vì trả
      lời — đúng luật 3 của grounding prompt, không sai. `citation_validity()`
      trả 0.0 vì không có marker `[n]` nào, coi giống hệt trích dẫn bịa.
      `faithfulness_score` của cùng câu là 1.0 — vì `FAITHFULNESS_PROMPT` đã
      xử lý "refusal = faithful", còn `citation_validity` thì chưa. Xem
      `SKILL_MY_PROJECT.md` bẫy #17
