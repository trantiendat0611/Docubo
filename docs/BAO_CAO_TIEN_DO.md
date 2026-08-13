# BÁO CÁO TIẾN ĐỘ — Docubo

> Cập nhật trước mỗi buổi review với mentor. Bản này: **13/08/2026, tuần 2/8**.
>
> Mọi con số lấy từ dữ liệu thật trong repo — báo cáo trong `eval/reports/`, lịch
> sử Git, kết quả CI. Các chỉ số truy hồi được tính lại bằng
> `eval.run_eval.summarise()` hiện tại, đã loại request hỏng khỏi mẫu, chứ không
> đọc trường `summary` lưu sẵn trong file.

| | |
|---|---|
| Thời gian | 03/08/2026 – 27/09/2026 · đang ở **tuần 2/8** |
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
   kiếm, `display_text` giữ LaTeX để hiển thị. Chuỗi LaTeX thô embed ra vector gần
   như vô nghĩa.
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

| Chỉ số | Giá trị | Cỡ mẫu | Ghi chú |
|---|---|---|---|
| `retrieval_hit_at_8` | **1.000** | n = 26 | Chế độ truy hồi |
| `hit_cross_lingual` | **1.000** | n = 26 | Hỏi tiếng Việt trên tài liệu tiếng Anh |
| `retrieval_mrr` | **0.926** | n = 26 | |
| `refusal_rate` | **1.000** | nhóm `should_refuse` | |
| `citation_validity` | 1.000 | **n = 5** | Mẫu còn quá nhỏ để chốt |
| `faithfulness` | — | — | **Chưa nối vào harness** |

### Nhánh full-text đáng giá bao nhiêu

Chạy lại đúng bộ 26 câu với `dense_search` thay cho `hybrid_search`:

| Chế độ | hit@8 | Xuyên ngôn ngữ | MRR |
|---|---|---|---|
| Hybrid ba nhánh | 1.000 | 1.000 | 0.926 |
| Chỉ vector | 0.941 | 0.833 | 0.868 |
| **Chênh lệch** | +5.9 đ% | **+16.7 đ%** | +0.058 |

Nhánh lexical đáng giá **16.7 điểm phần trăm** recall xuyên ngôn ngữ. Trước khi
đo, đó là một lời khẳng định; giờ nó là một con số.

### Ba chỗ chưa đủ điều kiện chốt

- `citation_validity` mới có n = 5 vì chế độ full chưa lần nào chạy trọn 26 câu
  trên production — hạn mức ngày cạn giữa chừng.
- `faithfulness` đang được hứa trong `REQUIREMENTS.md` với ngưỡng ≥ 0.90 nhưng
  chưa có code gọi.
- Ngưỡng "token đầu tiên < 3s" chưa có gì đo — harness đo tổng thời gian đọc xong
  câu trả lời, không phải thời gian tới token đầu.

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

**Phần này chưa được kiểm chứng khi chạy thật.** Migration đã chạy, code qua
typecheck, lint và 53 test, CI xanh — nhưng đường tạo khung, chuyển khung, nạp
lịch sử và gắn tài liệu chưa từng được bấm thử trên giao diện.

---

## 7. Bốn cái bẫy đáng kể nhất

Bảng đầy đủ 16 mục ở `SKILL_MY_PROJECT.md` §3.

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
| `faithfulness` hứa ở 4 chỗ, chưa có code gọi | Ngưỡng ≥ 0.90 hiện không đo được | Tuần 3 |
| Ngưỡng "token đầu tiên < 3s" chưa đo | Harness đo tổng thời gian, không phải TTFT | Tuần 3 |
| Chế độ full chưa chạy trọn 26 câu trên production | `citation_validity` mới có n = 5 | Sau 14:00 hôm nay |
| `document_pages` và file Storage không được dọn khi xoá tài liệu | Rò rỉ thật với hạn 500MB của Supabase | Tuần 4 |
| Chưa nạp được TXT và DOCX | Task 2.1 ghi rõ cả ba định dạng | Tuần 4 |
| Đường hội thoại chưa kiểm chứng khi chạy thật | Mới qua trình biên dịch và test | Hôm nay |

---

## 9. Lộ trình còn lại

| Tuần | Trọng tâm |
|---|---|
| **T2 · 10–16/08** | Chạy full eval 26 câu trên production, đủ 4 chỉ số |
| T3 · 17–23/08 | Nối `faithfulness`, đo TTFT, viết mục lí lẽ trong tài liệu đúc kết |
| T4 · 24–30/08 | Dọn Storage khi xoá, nạp TXT/DOCX, chống Supabase ngủ sau 7 ngày |
| T5 · 31/08–06/09 | Báo cáo chương 1–2: Tổng quan; Phân tích & Thiết kế |
| T6 · 07–13/09 | Báo cáo chương 3–4; kiểm thử với người dùng thật |
| T7 · 14–20/09 | Eval lần cuối, chương 5, GIF demo, đo latency thật |
| T8 · 21–27/09 | Xuất báo cáo, tag `v1.0.0-mvp`, slide và tập thuyết trình |

Chi tiết từng đầu việc ở `KE_HOACH_THUC_TAP.md`.

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
