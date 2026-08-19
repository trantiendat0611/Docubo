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
   lập chỉ mục toàn văn ra token rác, nên nhánh lexical không khớp được câu
   hỏi nào. (Đo lại ở §1.2: khác biệt trên vector chỉ ±0.03 — khẳng định
   ban đầu về vector là sai, cơ chế thật nằm ở chỉ mục toàn văn.)

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
      (0.833 → 1.000). *(Đính chính 19/08: `0.833` = `5/6` — toàn bộ chênh lệch
      là một câu duy nhất, `t-005`. Độ phân giải của phép đo là ±1 câu, đúng
      bằng 16.7 điểm, nên con số này chứng minh **có** ca dense không tự lo
      được, chứ không đo được nhánh lexical đáng bao nhiêu. Xem `SKILL` §1.3)*
- [x] **Deploy Vercel** — sớm hơn lộ trình 5 tuần. https://docubo.vercel.app,
      region Singapore để cùng khu vực với Supabase (0.76s → 0.34s mỗi request)
- [x] **Bật CI trên GitHub** — sớm hơn lộ trình 2 tuần. Hai job (Python và web):
      lint, format, typecheck, test, build. Không dùng secret nào nên CI không
      bao giờ tiêu quota Gemini
- [x] `SKILL_MY_PROJECT.md` §1.1 — đo pypdf/pymupdf so với vision trên cùng
      một trang công thức
- [x] **Chạy full eval 26 câu trên production** — 13/08, 26/26 câu, không câu nào
      hỏng. `hit@8` 1.000 · `citation_validity` 1.000 · `refusal_rate` 1.000 ·
      xuyên ngôn ngữ 1.000. `faithfulness` vẫn thiếu, chuyển sang tuần 3

### Giai đoạn 2 — Đo lường & đúc kết (Tuần 3–5)

Trọng tâm đổi hẳn so với bản tuần 1: sản phẩm P0 đã xong, nên ba tuần này dùng
để **đo cho đúng** và **viết cho đủ**, không xây thêm tính năng.

> **Cập nhật 18/08:** lộ trình Tuần 3–8 dưới đây viết chi tiết đến từng đầu
> việc — file cụ thể, cách xác minh cụ thể, ngày dự kiến — thay cho gạch đầu
> dòng cấp-tuần trước đó. `BAO_CAO_TIEN_DO.md` §9 chỉ tóm tắt và trỏ về đây,
> không lặp lại, để tránh hai nguồn lệch nhau. Bốn câu hỏi mở gửi mentor
> (`BAO_CAO_TIEN_DO.md` §10) **chưa có trả lời** tính đến 18/08 — kế hoạch này
> đi theo giả định mặc định (vẫn làm TXT/DOCX, vẫn giữ `faithfulness`) và ghi
> rõ chỗ co giãn nếu mentor trả lời khác.

**Tuần 3 · 17/08 – 23/08** — đóng nốt phần đo

Đã xong: `SKILL` §1.1–1.3 (đo pypdf/pymupdf vs vision, đo cosine LaTeX thô vs
diễn giải, thí nghiệm truy hồi xuyên ngôn ngữ có/không `query_en`).

- [x] **18/08** Thêm `id` chunk vào citation: `Citation.chunkId` ở
      `src/lib/types.ts`, gán ở `buildCitations` (`src/lib/prompt.ts`) —
      `RetrievedChunk.id` đã có sẵn nên route chat không cần sửa. Xác minh bằng
      `src/lib/prompt.test.ts` thay vì gọi `/api/chat` thật, để không tốn quota
      Gemini cho một thay đổi kiểu dữ liệu; `npx tsc --noEmit` và toàn bộ 37
      test đều xanh
- [x] **19/08** Nối `faithfulness` vào harness: `eval/judge.py` (mới) gọi
      `FAITHFULNESS_PROMPT` qua cùng chain 4 model chat (`config.VISION_MODELS`),
      xoay model khi cạn quota ngày y hệt `vision.py`; `store.chunks_by_id`
      (mới) dựng lại đúng context từ `chunkId` trong citation; cờ `--judge` ở
      `eval/run_eval.py`, gộp vào `summarise()` là `faithfulness` +
      `n_faithfulness_unscored`. Vá luôn một bẫy suy ra được từ
      `SKILL_MY_PROJECT.md`: câu trả lời có thể chứa LaTeX thô, nên trích dẫn
      "unsupported" của giám khảo có thể chứa backslash chưa escape — tái dùng
      `_repair_escapes` của `vision.py`. Xác minh bằng 9 test offline
      (`eval/tests/test_judge.py`, `test_run_eval.py`, mock model + Supabase,
      không tốn quota) thay vì chạy 3–5 câu thật — cần `EVAL_ACCESS_TOKEN` từ
      đăng nhập thật nên để dành cho lần chạy `--judge` thật ở mục 21/08 dưới.
      `ruff check/format`, `pytest` (27 test), CI (`ci.yml`) đều cập nhật để
      chạy `eval/tests`. **Xác minh thật 18/08:** `--judge --limit 3` trên
      local chạy sạch, `faithfulness=1.0`, `n_faithfulness_unscored=0` —
      `eval/reports/eval-full-20260818-073349.json`. t-003 gặp rate limit,
      tự retry sau 30s rồi qua — đúng hành vi thiết kế
- [x] **20/08** Đo thời gian tới token đầu (TTFT): `call_api` trong
      `eval/run_eval.py` đọc response `/api/chat` theo từng đoạn (`read(4096)`)
      thay vì đợi đọc hết một lần, mốc thời gian ghi ở lần đọc đầu tiên có dữ
      liệu — chỉ áp dụng nhánh trả lời stream, không áp dụng JSON (từ chối/lỗi,
      không có "token đầu" để đo). Kết quả `ttft_ms` theo từng câu, gộp thành
      `median_ttft_ms`/`n_ttft_measured` trong `summarise()`, tách hẳn khỏi
      `median_latency_ms` cũ (đo tổng thời gian đọc hết). Không sửa
      `src/lib/stream.ts`/route chat — đo ở phía client eval an toàn hơn cho
      code production, và đúng hơn về mặt UX (tính cả thời gian mạng) so với
      một mốc server tự ghi. Cập nhật cột "Đo được" ở `REQUIREMENTS.md` §6 và
      thêm dòng `median_ttft_ms` vào bảng chỉ số phụ §7 — cả hai đang ghi
      "chưa có số thật", cần chạy full mode với token thật để điền. Xác minh
      bằng 5 test offline mới (`eval/tests/test_call_api.py` mock
      `urllib.request.urlopen` + `time.time`, 2 test `summarise()` mới) —
      32 test Python đều xanh, không tốn quota
- [ ] **21/08 (làm sớm 18/08, trên local — chưa tính là số chính thức)**
      Chạy full 26 câu kèm `--judge`: `eval-full-20260818-081602.json`.
      26/26 câu chạy, không câu nào hỏng. `hit@8` 1.000 · `hit_cross_lingual`
      1.000 · `refusal_rate` 1.000 · `faithfulness` 1.000
      (`n_faithfulness_unscored=0`) · `citation_validity` **0.947** (1 câu,
      xem bẫy #17 ở trên) · `median_ttft_ms` 4933 (`n=19`, **vượt ngưỡng
      < 3s**) · `median_latency_ms` 3927. **`api` trong report là
      `http://localhost:3000/api/chat`, không phải production** — lệnh chạy
      thiếu `--api https://docubo.vercel.app/api/chat` nên đây là số cục bộ,
      chưa đủ điều kiện ghi vào `REQUIREMENTS.md`/`BAO_CAO_TIEN_DO.md` làm số
      chính thức. **Chạy lại đúng trên production cùng ngày** (`--api
      https://docubo.vercel.app/api/chat`) thì generation vẫn thành công đủ
      26/26 câu, nhưng **cả 19 câu `faithfulness` đều "UNAVAILABLE"** —
      `judge.judge()` lúc đó chỉ trả `None`, không phân biệt được cạn quota
      hay bị `RECITATION` (model từ chối vì nhận diện đang nhại nguyên văn —
      đúng bẫy đã gặp ở `vision.py`, có khả năng cao vì `CONTEXT` lẫn
      `ANSWER` đều gần nguyên văn tài liệu, theo đúng luật "reproduce math
      exactly"). Đã vá: `judge()` giờ trả kèm lý do
      (`daily_quota`/`recitation`/`empty`/`unparseable`), `run_eval.py` in ra
      lý do từng câu và gộp `faithfulness_unavailable_reasons` trong
      `summarise()`. Thêm 6 test offline mới (37 test Python đều xanh). Việc
      còn lại: chạy đúng 1 lần nữa trên production sau khi quota mới (đã tiêu
      rất nhiều quota chat-model hôm nay qua nhiều lần chạy) để xem báo cáo
      chỉ ra đúng nguyên nhân, rồi mới coi là số chính thức
- [x] **19/08** `SKILL` §1.3 — viết xong. Chạy lại `eval.why bilingual` trên 3
      câu (`t-005`, `t-009`, `f-002`; chỉ tốn 3 request **embedding**, ngân sách
      riêng, không đụng generation đang cạn) thay vì chép lại số cũ. Kết quả:
      chỉ `t-005` đổi thứ hạng (ngoài top-8 → hạng 1 khi có `query_en`), hai câu
      còn lại hạng 1 ở cả hai chiều. Đối chiếu với chênh lệch tổng hợp
      dense-only vs hybrid: `hit_cross_lingual` 0.833 → 1.000, mà `0.833` chính
      là `5/6` — **toàn bộ chênh lệch là đúng câu `t-005` đó**. Hai phép đo độc
      lập chỉ vào cùng một chỗ. Hệ quả: **"nhánh lexical đáng 16.7 điểm phần
      trăm" là cách nói quá cỡ mẫu** — độ phân giải của phép đo là ±1 câu ≈ 16.7
      điểm. Đã sửa lại cách diễn đạt đó trong `BAO_CAO_TIEN_DO.md` §3
- [x] **19/08** Rà lại toàn bộ tài liệu, phát hiện **tài liệu đang tự khai là
      chưa làm những việc code đã làm**: `REQUIREMENTS.md` §6/§7 và
      `BAO_CAO_TIEN_DO.md` §3/§8 vẫn ghi "`faithfulness` chưa nối vào harness"
      và "chưa có số TTFT" — cả hai đã xong từ 18/08. Đã re-base cả hai tài liệu
      theo lần chạy production mới nhất (`eval-full-20260818-085447.json`), giữ
      cột 13/08 để đối chiếu. **TTFT production = 2889ms, đạt ngưỡng < 3s** (số
      4933 ghi ở mục 18/08 là số local — máy vừa chạy dev server vừa gọi model)
- [x] **19/08** Bẫy #18: `citation_validity` = 0.947 ở **cả hai** lần chạy
      18/08, nhưng câu hỏng là hai câu khác nhau với nguyên nhân khác hẳn. Local
      hỏng ở `g-002` (từ chối bằng văn xuôi — bẫy #17, là câu hỏi thiết kế).
      Production hỏng ở `t-009`: trả lời **đúng nội dung, đủ ba ý, không có
      marker `[n]` nào**, do rơi vào `gemini-3.5-flash-lite` khi các model trên
      đã cạn hạn mức. Cái này là **lỗi thật**, không phải câu hỏi thiết kế. Bài
      học: cùng một con số có thể đến từ hai nguyên nhân không liên quan — chỉ
      số nói *có hỏng*, không nói *hỏng ở đâu*. Đã ghi vào `README.md` mục giới
      hạn đã biết và bảng nợ kĩ thuật
- [ ] **22/08** `SKILL` §4 — phân tích khoảng cách giữa full mode và
      retrieval-only, dùng số đo ở trên
- [ ] **23/08** Cập nhật `BAO_CAO_TIEN_DO.md` cuối tuần; gửi 4 câu hỏi mở cho
      mentor nếu chưa gửi
- [ ] **Mốc kiểm:** `faithfulness` có số đo thật lần đầu; TTFT có số đo lần
      đầu; `SKILL` §1 không còn placeholder

**Tuần 4 · 24/08 – 30/08** — trả nợ kĩ thuật, mở rộng định dạng

> Nếu mentor trả lời "dừng mở rộng phạm vi" trước tuần này: bỏ mục TXT/DOCX,
> dồn thời gian dư sang bắt đầu chương 1 báo cáo sớm. Các mục còn lại không
> phụ thuộc câu trả lời đó.

- [ ] **24–25/08** Dọn `document_pages` + file Storage khi xoá tài liệu: sửa
      route xoá tài liệu để cascade xoá `document_pages` và gọi
      `.remove()` trên Storage. Xác minh: xoá 1 tài liệu test, `document_pages`
      rỗng theo `document_id`, file biến mất khỏi Storage dashboard
- [ ] **26–28/08** Nạp TXT và DOCX (nếu không bị mentor chặn): chốt cách đánh
      số trang tổng hợp **trước khi viết code** (trang ảo theo ký tự/heading,
      hay bỏ khái niệm trang và trích theo block — ghi lý do vào
      `REQUIREMENTS.md` khi chốt), viết parser mới không cần vision, tái dùng
      `chunk.ts` nếu schema cho phép. Xác minh: upload 1 file mỗi loại, hỏi và
      nhận trích dẫn hợp lý theo quy ước mới
- [ ] **28/08** Hiệu chỉnh `CHARS_PER_TOKEN` tiếng Việt: script gọi
      `countTokens` thật trên mẫu corpus tiếng Việt, so với ước lượng 2.6 hiện
      tại ở `src/lib/ingest/config.ts`. Lệch > 10% thì cập nhật hằng số,
      không thì ghi "đã kiểm chứng, giữ nguyên" — cả hai là kết quả hợp lệ
- [ ] **29/08** `/api/health` (route mới, ping Supabase nhẹ, trả 200) +
      GitHub Action chạy theo `schedule` hàng tuần gọi endpoint đó, không dùng
      secret Gemini. Xác minh bằng `workflow_dispatch` thủ công
- [ ] **30/08** `SKILL` §2 — rà lại 8 bước đã có, bổ sung chỗ còn thiếu
- [ ] **Mốc kiểm:** health check tự chạy hàng tuần; xoá tài liệu không để lại
      rác trong `document_pages`/Storage; cập nhật `BAO_CAO_TIEN_DO.md`

**Tuần 5 · 31/08 – 06/09** — báo cáo chương 1–2
- [ ] `docs/BAO_CAO.md` Chương 1 — Tổng quan, dựng từ `README.md` +
      `REQUIREMENTS.md` §1–2
- [ ] Chương 2 — Phân tích & Thiết kế, dựng từ `REQUIREMENTS.md` §3–6 + 2 sơ đồ
- [ ] Kiểm tra 2 sơ đồ kiến trúc còn khớp route/bảng thật trong code, sửa nếu
      lệch
- [ ] Cuối tuần: cập nhật `BAO_CAO_TIEN_DO.md`
- [ ] **Mốc kiểm: sản phẩm ổn định trên Vercel, đủ 4 chỉ số eval, xong 2/5 chương**

### Giai đoạn 3 — Hoàn thiện (Tuần 6–7)

**Tuần 6 · 07/09 – 13/09** — báo cáo chương 3–4, người dùng thật
- [ ] Chương 3 — Triển khai kỹ thuật (nguyên liệu: `SKILL` §2 và §3)
- [ ] Chương 4 — Kết quả đánh giá. Một bảng duy nhất, ghi rõ chế độ chạy và cỡ
      mẫu cho từng con số — theo nguyên tắc đã dùng ở `BAO_CAO_TIEN_DO.md` §3
- [ ] Kiểm thử với ít nhất 2 người ngoài: chuẩn bị kịch bản trước, ngồi cạnh
      quan sát, ghi lại chỗ họ vấp trước khi sửa
- [ ] Rà UI theo phản hồi thu được: thông báo lỗi, trạng thái rỗng, giao diện
      điện thoại
- [ ] **Mốc kiểm:** có ghi chép phản hồi thật từ ≥ 2 người ngoài; UI đã sửa
      theo đó; 4/5 chương có bản nháp

**Tuần 7 · 14/09 – 20/09** — chốt số, chốt sản phẩm
- [ ] Chạy eval lần cuối trên production, đủ 26 câu và đủ 4 chỉ số (kể cả
      `faithfulness`) — đây là bộ số chốt dùng cho báo cáo và demo
- [ ] Chương 5 — Kết luận
- [ ] `SKILL` §0 (tóm tắt), §5 (nếu làm lại), §6 (checklist tái sử dụng) —
      3 mục cuối cùng chưa viết
- [ ] GIF demo vào `README.md`, bổ sung danh sách nguồn tài liệu
- [ ] Kiểm tra ứng dụng chạy 24/7 (đối chiếu log Action hàng tuần), đo latency
      thật trên nhiều mẫu bằng phép đo TTFT dựng ở tuần 3
- [ ] Chuẩn bị dữ liệu demo cố định (không ingest live khi demo) + kịch bản
      trình bày
- [ ] **Mốc kiểm:** số liệu eval là số cuối cùng, không đổi thêm; 5/5 chương
      có bản nháp; README có GIF

### Giai đoạn 4 — Đóng gói & Demo (Tuần 8)

**Tuần 8 · 21/09 – 27/09**
- [ ] Xuất `BAO_CAO.md` sang `.docx` để nộp, canh lại mục lục và hình bảng
- [ ] Rà `SKILL_MY_PROJECT.md` lần cuối, xoá các dòng hướng dẫn trong ngoặc
      (dấu hiệu: dòng bắt đầu bằng `*(`)
- [ ] Release tag `v1.0.0-mvp`
- [ ] Slide + tập thuyết trình 15 phút — dùng 4 câu hỏi mentor ở
      `BAO_CAO_TIEN_DO.md` §10 và bảng bẫy ở `SKILL` §3 làm nguồn câu hỏi
      phản biện dự phòng
- [ ] **Mốc kiểm (= mốc nộp):** báo cáo `.docx` hoàn chỉnh, tag đã release,
      slide sẵn sàng

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
