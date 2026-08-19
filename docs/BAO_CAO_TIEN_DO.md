# BÁO CÁO TIẾN ĐỘ — Docubo

> Cập nhật trước mỗi buổi review với mentor. Bản này: **18/08/2026, tuần 3/8**.
> Số liệu eval từ lần chạy sạch 13/08; mục 2 đã sửa lại theo phép đo 18/08.
>
> Mọi con số lấy từ dữ liệu thật trong repo — báo cáo trong `eval/reports/`, lịch
> sử Git, kết quả CI. Các chỉ số truy hồi được tính lại bằng
> `eval.run_eval.summarise()` hiện tại, đã loại request hỏng khỏi mẫu, chứ không
> đọc trường `summary` lưu sẵn trong file.

| | |
|---|---|
| Thời gian | 03/08/2026 – 27/09/2026 · đang ở **tuần 3/8** |
| Ứng dụng | https://docubo.vercel.app · region Singapore |
| Commit | 35, đã push hết |
| CI | 23 lần xanh liên tiếp (run #2 → #24) |
| Kiểm thử | 53 test (36 web + 17 Python) |
| Corpus | 4 tài liệu · 69 đoạn |
| Chi phí | 0 đồng |

---

## 1. Đối chiếu với thang điểm

| Tiêu chí | Trọng số | Trạng thái | Căn cứ |
|---|---|---|---|
| Tự lập kế hoạch | 20% | Xong | Lộ trình 8 tuần đặt lại mốc 12/08 cho khớp thực tế, kèm bảng đối chiếu 15 task |
| Thiết kế hệ thống | 20% | Xong | 2 sơ đồ Mermaid, `REQUIREMENTS.md` với 26 edge case E1–E26 |
| Code & `SKILL_MY_PROJECT.md` | 20% | **Một phần** | Code xong, 53 test, CI xanh. Tài liệu đúc kết còn 5 mục trống |
| Live App Vercel | 20% | Đang chạy | Deploy tự động từ `main` |
| Báo cáo & thuyết trình | 20% | **Chưa bắt đầu** | Xếp tuần 5–8 |

**Điều cần nói thẳng:** code xong sớm không có nghĩa đồ án xong sớm. 40% điểm nằm
ở tài liệu và thuyết trình, và đó là phần đang thấp nhất. Vì vậy thời gian dư
không dùng để thêm tính năng mà dồn vào đo lường và viết.

---

## 2. Sản phẩm giải bài toán gì

Thư viện parse PDF thông thường phá huỷ đúng phần khó nhất của tài liệu kĩ thuật.
Đã đo cụ thể trên trang 44 của một tập bài giảng (chi tiết đầy đủ ở
`SKILL_MY_PROJECT.md` §1.1):

- `pypdf` và `pymupdf` đều trả `p(x₁…xₘ) = p(xₖ|paₖ)` — **thiếu hẳn toán tử ∏**.
  Đó không phải chuỗi rác mà là **một phương trình khác và sai**, đọc lên vẫn hợp lệ.
- Văn xuôi quanh công thức thì ra hoàn hảo.
- Trang có ba biểu đồ: hai biểu đồ cho **0 kí tự**.

Nguy hiểm không nằm ở chỗ parser trả rác — rác thì nhìn là biết. Nguy hiểm là nó
trả ra thứ *đọc như đúng* ở đúng chỗ tài liệu có giá trị nhất.

### Năm quyết định kĩ thuật

1. **Ingest bằng vision** — render từng trang thành ảnh rồi để Gemini đọc ra
   Markdown + LaTeX + mô tả hình, thay vì đọc lớp text.
2. **Mỗi đoạn mang hai biểu diễn** — `embed_text` là văn xuôi thuần dùng để tìm
   kiếm, `display_text` giữ LaTeX để hiển thị. Chuỗi LaTeX thô lập chỉ mục toàn
   văn ra token rác (`\langle` → `langl`), nên nhánh tìm theo từ khoá không khớp
   được câu hỏi nào. **Đã đo lại 18/08 và sửa lí do:** khác biệt trên vector chỉ
   ±0.03 — khẳng định ban đầu về vector là sai, cơ chế thật nằm ở chỉ mục toàn
   văn. Quyết định vẫn đúng.
3. **Truy hồi hybrid ba nhánh** — vector đa ngữ, cộng full-text tiếng Anh và tiếng
   Việt tách riêng, hợp nhất bằng RRF. Postgres có từ điển tiếng Anh, không có
   tiếng Việt.
4. **Cô lập dữ liệu đặt ở database** — truy vấn chạy dưới JWT người dùng, RLS
   quyết định thấy gì. Route quên lọc chủ sở hữu trả về rỗng, không phải tài liệu
   người khác.
5. **Trình duyệt render PDF** — render phía server cần native canvas binding và
   đặt phần chậm nhất của ingest vào hàm 60 giây của Vercel.

---

## 3. Số liệu đã đo

Bộ đánh giá **26 câu**, 6 nhóm, 8 câu xuyên ngôn ngữ.

Chạy đầy đủ trên production ngày **18/08**, 26/26 câu, **không câu nào hỏng**
(`eval-full-20260818-085447.json`). Cột 13/08 giữ lại để thấy cái gì đổi.

| Chỉ số | 13/08 | 18/08 | Ngưỡng | Ghi chú |
|---|---|---|---|---|
| `retrieval_hit_at_8` | 1.000 | **1.000** | ≥ 0.85 | Đạt |
| `citation_validity` | 1.000 | **0.947** | ≥ 0.95 | **Chưa đạt.** 1 câu trả lời đúng nội dung nhưng không dẫn nguồn, do model yếu nhất trong chain phục vụ câu đó |
| `refusal_rate` | 1.000 | **1.000** | ≥ 0.90 | Đạt, `false_refusal_rate` = 0 |
| `faithfulness` | — | — | ≥ 0.90 | Đã nối vào harness 18/08. Local cho 1.000; production trả `UNAVAILABLE` cả 19 câu vì cạn hạn mức lúc chạy |
| `hit_cross_lingual` | 1.000 | **1.000** | — | Hỏi tiếng Việt trên tài liệu tiếng Anh |
| `retrieval_mrr` | 0.882 | 0.788 | — | Thứ hạng của đoạn đúng |
| `median_ttft_ms` | — | **2889** | < 3s | Đạt. Thời gian tới token đầu tiên thật, `n = 19` |

Hai điều đáng nói hơn các con số:

**Chỉ số tụt không có nghĩa là sản phẩm xấu đi.** `citation_validity` giảm vì
lần chạy 18/08 rơi vào `gemini-3.5-flash-lite` ở một câu — chain model tự xoay
khi các model trên cạn hạn mức, nên **chất lượng câu trả lời phụ thuộc vào thời
điểm trong ngày**. Đây là cái giá trực tiếp của ràng buộc 0 đồng, và nó phải
được nói ra trong báo cáo chứ không giấu bằng cách chỉ trưng lần chạy đẹp nhất.

**Cùng một con số, hai nguyên nhân khác nhau.** Lần chạy local cùng ngày cũng ra
đúng `0.947`, nhưng hỏng ở câu khác vì lí do khác (một câu từ chối bằng văn xuôi,
không có gì để trích dẫn). Nếu chỉ đọc con số thì đã kết luận nhầm là cùng một
lỗi. Xem `SKILL_MY_PROJECT.md` bẫy #17 và #18.

Lần chạy 13/08 là lần đầu quan sát được **cơ chế xoay model** hoạt động: 9 câu
đầu chạy trên `gemini-3.5-flash`, sau đó tự chuyển sang `gemini-2.5-flash` khi
model đầu cạn hạn mức ngày. Bốn lần gặp giới hạn theo phút, cả bốn đều tự thử lại
thành công.

### Nhánh full-text đáng giá bao nhiêu

Chạy lại đúng bộ 26 câu với `dense_search` thay cho `hybrid_search`. Cả hai chạy ở
chế độ **chỉ-truy-hồi** (không gọi model sinh văn bản), để phép so cô lập đúng
phần truy hồi:

| Chế độ | hit@8 | Xuyên ngôn ngữ | MRR |
|---|---|---|---|
| Hybrid ba nhánh | 1.000 | 1.000 | 0.926 |
| Chỉ vector | 0.941 | 0.833 | 0.868 |
| **Chênh lệch** | +5.9 đ% | **+16.7 đ%** | +0.058 |

> MRR ở đây là 0.926, còn bảng trên ghi 0.882 — không mâu thuẫn. Bảng trên là chế
> độ **full** chạy qua production, nơi biến thể truy vấn được sinh trực tiếp mỗi
> lần gọi; bảng này dùng biến thể đã lưu sẵn trong bộ dữ liệu nên lặp lại được.
> Mọi con số đều ghi kèm chế độ chạy, vì trộn hai chế độ vào một bảng là cách dễ
> nhất để tạo ra một kết quả không ai kiểm chứng lại được.

**Đọc con số 16.7 điểm phần trăm cho đúng.** Bộ eval có 8 câu xuyên ngôn ngữ,
2 câu thuộc nhóm overview không tính điểm truy hồi, còn 6 câu. `0.833` chính là
`5/6` — toàn bộ khoảng cách giữa hai chế độ là **một câu duy nhất**, nên độ phân
giải của phép đo này là ±1 câu ≈ 16.7 điểm. Nó **không** đo được "nhánh lexical
đáng bao nhiêu"; nó chứng minh **có tồn tại ca mà nhánh dense một mình không
đủ**. Đã truy ra đúng câu đó (`t-005`) và đúng lí do bằng một phép thử riêng —
`SKILL_MY_PROJECT.md` §1.3.

Trước khi đo, đó là một lời khẳng định. Sau khi đo, nó là một con số — nhưng một
con số mà nếu báo cáo là "hiệu ứng đo được" thì đã nói quá cỡ mẫu.

### Hai chỗ chưa đủ điều kiện chốt

- `faithfulness` đang được hứa trong `REQUIREMENTS.md` với ngưỡng ≥ 0.90 nhưng
  chưa có code gọi.
- Ngưỡng "token đầu tiên < 3s" chưa có gì đo — harness đo **tổng thời gian đọc
  xong** câu trả lời (trung vị 6.9 giây), không phải thời gian tới token đầu.
  Hai đại lượng khác nhau, nên chưa thể nói ngưỡng đó đạt hay không.

---

## 4. Ràng buộc chi phối toàn bộ thiết kế

Đo ngày 10/08: free tier cấp **~20 request mỗi ngày cho mỗi model**
(`quotaId: GenerateRequestsPerDayPerProjectPerModel`), **không phải 15 request/phút**
như tài liệu hướng dẫn ghi — con số đó là của `gemini-2.0-flash`, model đã bị rút
khỏi free tier.

| Cách đối phó | Kết quả |
|---|---|
| Gộp nhiều trang mỗi request vision | 68 trang: 68 → **9 request** |
| Xoay vòng 4 model, mỗi model một ngân sách ngày | ~80 → **~640 trang/ngày** |
| Giới hạn 25 trang mỗi tài liệu | Một lượt tải ≈ 4 request |
| Giới hạn 5 lượt tải/người/ngày | Quota là ngân sách chung của cả deployment |

Gần hết các giới hạn trong sản phẩm đến từ đây, không phải từ dung lượng lưu trữ.
Một lần chạy eval đầy đủ tốn **52 request ≈ 2.6 model-ngày**, nên mỗi ngày chỉ
chạy được khoảng 1.5 lần và không làm gì khác.

Hạn mức đặt lại lúc **nửa đêm giờ Pacific = 14:00 giờ Việt Nam**, không phải nửa
đêm giờ mình.

---

## 5. Đối chiếu 15 task trong tài liệu hướng dẫn

| Task | Nội dung | Trạng thái | Ở đâu |
|---|---|---|---|
| 1.1 | Chọn đề tài MVP | Xong | Trợ lí hỏi đáp tài liệu chuyên ngành |
| 1.2 | Kế hoạch 8 tuần | Xong | `KE_HOACH_THUC_TAP.md` |
| 1.3 | Requirements, P0/P1, edge case | Xong | `REQUIREMENTS.md`, 26 ca E1–E26 |
| 1.4 | Hai sơ đồ kiến trúc | Xong | `docs/architecture/*.mmd` |
| 1.5 | Khung `SKILL_MY_PROJECT.md` | Xong | Đang viết tiếp, hạn tuần 7 |
| 2.1 | Đọc PDF / DOCX / TXT | **PDF xong** | TXT và DOCX xếp tuần 4 |
| 2.2 | Vector DB + chunking | Xong | Supabase pgvector, HNSW, 768 chiều |
| 2.3 | Retriever + grounding prompt | Xong | Hybrid 3 nhánh RRF, trích dẫn số trang |
| 2.4 | Guardrail + eval 15–20 câu | Xong | `guardrail.ts`; bộ eval **26 câu** |
| 3.1 | Web UI, stream, khung trích dẫn | Xong | Next.js, KaTeX, panel nguồn |
| 3.2 | Deploy Vercel 24/7 | Xong | Sớm hơn lộ trình 5 tuần |
| 3.3 | CI/CD GitHub Actions | Xong | 2 job, chạy mỗi lần push |
| 4.1 | Báo cáo 5 chương | **Chưa** | Tuần 5–7 |
| 4.2 | README + tag `v1.0.0-mvp` | Một phần | GIF demo và tag ở tuần 7–8 |
| 4.3 | Slide demo 15 phút | **Chưa** | Tuần 8 |

---

## 6. Thay đổi phạm vi so với bản gửi tuần 1

| Mốc | Thay đổi | Kéo theo |
|---|---|---|
| Tuần 2 | Corpus cố định do lập trình viên nạp → **người dùng tự tải lên** | Xác thực, cô lập dữ liệu đa người dùng, ingest chạy trong trình duyệt |
| 13/08 | Một khung chat cho cả corpus → **nhiều khung chat, tài liệu thuộc từng khung** | 3 bảng mới, lưu lịch sử, hội thoại nhiều lượt, dừng và sinh lại |

Tài liệu gắn vào khung chat bằng **bảng nối**, không phải cột `conversation_id`.
Lí do là quota: ghim tài liệu vào đúng một khung nghĩa là phải nạp lại và trả phí
vision lần nữa cho những byte đã trích xuất rồi. Một dòng join tốn 0 đồng và dùng
lại nguyên các đoạn cũ.

**Đã kiểm chứng trên giao diện ngày 13/08.** Hai phép thử quan trọng nhất đều
đúng: khung chat thứ hai **từ chối** đúng câu hỏi mà khung thứ nhất trả lời được
— chứng minh tài liệu thật sự bị cô lập theo từng khung; và lịch sử hội thoại
còn nguyên sau khi tải lại trang — chứng minh dữ liệu vào database chứ không nằm
trong bộ nhớ trình duyệt.

Lần kiểm này cũng tìm ra một lỗi: nút "Chat mới" không tạo được khung nào vì
lệnh ghi thiếu `owner_id`, và lỗi bị nuốt mất nên nút bấm không báo gì. Đã sửa.
Đáng nói là **53 test đều xanh trong suốt thời gian đó** — không test nào gọi
Supabase thật, nên toàn bộ nhánh này chưa từng được chạy trước khi bị gọi là xong.

---

## 7. Bốn cái bẫy đáng kể nhất

Bảng đầy đủ **20 dòng** ở `SKILL_MY_PROJECT.md` §3 — 18 bẫy đánh số, cộng 2 dòng đính chính
lại kết luận cũ (`3b`, `14b`).

| Triệu chứng | Nguyên nhân thật |
|---|---|
| Bot không bao giờ từ chối câu hỏi ngoài phạm vi | `MIN_COSINE = 0.35` đặt chay. Đo thật: câu hoàn toàn không liên quan vẫn đạt 0.46–0.58 nên ngưỡng cho lọt tất cả. Không có thang đo phổ quát nào mà 0.35 nghĩa là "không khớp" — bắt buộc phải đo |
| Ingest chết giữa chừng, retry bao nhiêu cũng vô ích | Hạn mức là **20 request mỗi ngày** chứ không phải mỗi phút. Lỗi trả `retryDelay: 35s` gây hiểu nhầm. Quota tính theo từng model nên cách chữa là xoay model, không phải đợi |
| Eval báo `citation_validity = 0.15` mà xem tay thì không trích dẫn nào sai | 17/26 câu có thân response rỗng do hết hạn mức, và hàm đo trả 0.0 khi không thấy marker. Một lỗi truyền tải đội lốt lỗi chất lượng. **Chỉ số sai theo hướng bi quan cũng nguy hiểm ngang chỉ số sai theo hướng lạc quan** — nó dụ mình đi sửa thứ vốn đã đạt 1.000 |
| Bản vá bắt lỗi sinh câu trả lời compile sạch, test xanh, và không bao giờ kích hoạt | Type doc của thư viện ghi "stream sẽ ném lỗi". Đo bằng model giả: nó **không ném**, mà kết thúc êm và báo qua callback khác. Doc của thư viện cũng là một giả định cần đo |

---

## 8. Nợ kĩ thuật và khoảng trống

| Khoảng trống | Ảnh hưởng | Kế hoạch |
|---|---|---|
| `faithfulness` chưa có số đo trên production | Đã nối vào harness 18/08 (cờ `--judge`); local cho 1.000, production trả `UNAVAILABLE` cả 19 câu vì cạn hạn mức lúc chạy | Chạy lại sau khi quota reset |
| `citation_validity` = 0.947, dưới ngưỡng 0.95 | 1 câu (`t-009`) trả lời đúng nội dung nhưng không có marker `[n]` nào — do `gemini-3.5-flash-lite`, model yếu nhất trong chain. Xem bẫy #18 | Tuần 4 |
| `document_pages` và file Storage không được dọn khi xoá tài liệu | Rò rỉ thật với hạn 500MB của Supabase | Tuần 4 |
| Chưa nạp được TXT và DOCX | Task 2.1 ghi rõ cả ba định dạng | Tuần 4 |
| Đường hội thoại chưa kiểm chứng khi chạy thật | Mới qua trình biên dịch và test | Đã chạy thật, xong |

---

## 9. Lộ trình còn lại

| Tuần | Trọng tâm |
|---|---|
| ~~T2 · 10–16/08~~ | **Xong.** Full eval 26 câu trên production, 3/4 chỉ số đạt ngưỡng |
| T3 · 17–23/08 | Nối `faithfulness`, đo TTFT, viết mục lí lẽ trong tài liệu đúc kết |
| T4 · 24–30/08 | Dọn Storage khi xoá, nạp TXT/DOCX, chống Supabase ngủ sau 7 ngày |
| T5 · 31/08–06/09 | Báo cáo chương 1–2: Tổng quan; Phân tích & Thiết kế |
| T6 · 07–13/09 | Báo cáo chương 3–4; kiểm thử với người dùng thật |
| T7 · 14–20/09 | Eval lần cuối, chương 5, GIF demo, đo latency thật |
| T8 · 21–27/09 | Xuất báo cáo, tag `v1.0.0-mvp`, slide và tập thuyết trình |

Đây chỉ là bảng tóm tắt. Kế hoạch cấp-việc — file cụ thể, cách xác minh, ngày
dự kiến trong tuần cho từng mục — nằm ở `KE_HOACH_THUC_TAP.md` mục "Lộ trình",
không lặp lại ở đây để tránh hai nguồn lệch nhau.

---

## 10. Bốn điều muốn hỏi mentor

1. **Phạm vi.** Đề tài đã đổi hai lần — sang mô hình người dùng tự tải lên, rồi
   sang nhiều khung chat. Cả hai đều ghi lí do trong `REQUIREMENTS.md`. Hướng này
   có ổn không, hay nên dừng mở rộng để tập trung vào báo cáo?
2. **TXT và DOCX.** Task 2.1 ghi cả ba định dạng. Nhưng hai định dạng đó *không có
   số trang*, trong khi toàn bộ sản phẩm trích dẫn theo trang. Nên chế số trang
   tổng hợp, hay bảo vệ việc chỉ làm PDF?
3. **`faithfulness`.** Đo bằng LLM làm giám khảo trên 26 câu thì độ tin cậy thấp
   mà tốn thêm 26 request mỗi lần chạy. Nên cứ đo, hay bỏ khỏi tài liệu và ghi rõ
   lí do?
4. **Báo cáo.** Dự định viết bằng Markdown trong repo rồi xuất sang `.docx` ở tuần
   8. Có yêu cầu riêng về định dạng hay bố cục không?
