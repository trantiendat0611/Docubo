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
      cột 13/08 để đối chiếu. ~~**TTFT production = 2889ms, đạt ngưỡng < 3s**~~
      *(sai — đính chính ở mục 19/08 14:14 bên dưới: 2889ms là số của
      `flash-lite`; với model mạnh là 8444ms và ngưỡng **không đạt**)* (số
      4933 ghi ở mục 18/08 là số local — máy vừa chạy dev server vừa gọi model)
- [x] **19/08** Bẫy #18: `citation_validity` = 0.947 ở **cả hai** lần chạy
      18/08, nhưng câu hỏng là hai câu khác nhau với nguyên nhân khác hẳn. Local
      hỏng ở `g-002` (từ chối bằng văn xuôi — bẫy #17, là câu hỏi thiết kế).
      Production hỏng ở `t-009`: trả lời **đúng nội dung, đủ ba ý, không có
      marker `[n]` nào**, do rơi vào `gemini-3.5-flash-lite` khi các model trên
      đã cạn hạn mức. Cái này là **lỗi thật**, không phải câu hỏi thiết kế.
      *(Đính chính trong ngày: kết luận đầu tiên của tôi — "hai nguyên nhân
      không liên quan gì nhau" — **sai**. Lập bảng chéo model × trích dẫn qua
      cả ba lần chạy đầy đủ thì lộ yếu tố chung: `flash` + `2.5-flash` đạt
      ~~21/21~~ **28/28** câu có trích dẫn *(số 21/21 ghi ở đây lúc đầu là
      sai — tôi cộng tay và bỏ sót cả một lần chạy; xem mục 19/08 cuối tuần
      3)*, `flash-lite` **27/29**, và **cả hai** câu
      hỏng đều do `flash-lite` phục vụ. Đọc hai ca hỏng riêng lẻ thì thấy hai
      câu chuyện; đếm theo model thì thấy một.)* Bài học kép: chỉ số nói *có
      hỏng*, không nói *hỏng ở đâu*; và đọc từng ca hỏng vẫn chưa đủ, phải
      đếm theo chiều có thể là nguyên nhân. Đã ghi vào `README.md` mục giới
      hạn đã biết và bảng nợ kĩ thuật
- [x] **19/08** Suy diễn hụt, ghi lại làm bẫy #18b: `retrieval_mrr` tụt
      0.882 → 0.788 cùng lúc, tôi định gán cho "model yếu sinh biến thể truy
      vấn kém hơn". **Bác bỏ được ngay bằng dữ liệu đã có**: lần chạy local
      cùng ngày cũng gần hết trên `flash-lite` mà `retrieval_mrr` vẫn đúng
      0.882. Cách đọc còn lại: chế độ full sinh biến thể trực tiếp mỗi lần gọi
      nên MRR dao động giữa các lần chạy; muốn so truy hồi giữa hai thời điểm
      phải dùng `--retrieval-only` (biến thể lưu sẵn, lặp lại được)
- [x] **22/08 (làm sớm 19/08)** `SKILL` §4 — bảng tiến triển 10 lần chạy, mỗi
      dòng ghi kèm chế độ, cỡ mẫu và nơi chạy. Khoảng cách full vs
      retrieval-only đã phân tích xong: `retrieval_mrr` 0.926 (retrieval-only,
      biến thể lưu sẵn) vs 0.788 (full, biến thể sinh trực tiếp) — **không so
      được giữa hai chế độ**, muốn so truy hồi giữa hai thời điểm thì phải
      dùng `--retrieval-only`. Dựng bảng còn lộ thêm một điều chưa ai viết ra:
      dòng 1 (hybrid chạy trên câu hỏi thô) **trùng khít** dòng 3 (dense-only)
      — 0.941 / 0.833, cùng trượt đúng `t-005`. Nghĩa là thiếu biến thể tiếng
      Anh thì hai nhánh full-text **đóng góp bằng không** và hệ ba nhánh thoái
      hoá thành một nhánh **mà không báo lỗi gì**. Ô `faithfulness` của dòng 9
      còn trống, chờ lần chạy `--judge` trên production
- [x] **19/08 14:14** Chạy `--judge` trên production ngay sau khi quota reset.
      **`faithfulness` = 1.000, 17/17 câu chấm được — số đo thật đầu tiên**,
      mục tiêu chính của tuần 3 hoàn thành. `citation_validity` về lại 1.000,
      xác nhận đúng kết luận bẫy #18 (0.947 hôm trước là do `flash-lite`, không
      phải hồi quy của prompt). Nhưng lần chạy này **đánh sập một ngưỡng và lộ
      một lỗi mới**, cả hai chưa từng thấy ở 9 lần chạy trước:
      **(a)** `median_ttft_ms` = 8155ms, vượt ngưỡng < 3s **2.7 lần**. Số 2889ms
      hôm 18/08 mà chính tôi ghi "đạt" sáng nay là số đo khi `flash-lite` phục
      vụ 17/19 câu — mắt xích cuối chain, và cũng là mắt xích **nhanh nhất**
      (2860–4225ms so với 8444ms của model mạnh). Nghĩa là ngưỡng chỉ đạt khi
      hệ thống chạy ở **chế độ chất lượng thấp nhất**. Ghi thành bẫy #20. Phải
      chốt: sửa ngưỡng cho khớp thực tế, hay giữ nguyên và ghi là chưa đạt.
      **(b)** `t-001` và `f-003` chết ở 62.4s/62.6s — chạm trần
      `maxDuration = 60` của Vercel. Không phải quota: `f-001` cùng lần chạy
      mất 27s và thành công. Đường sinh không có timeout riêng nên client nhận
      một 504 rỗng. Bẫy #21, cùng họ với bẫy #14. Rà lại 11 lần chạy trước
      thì không lần nào vượt 55s, nhưng 13/08 đã có câu mất **44.2s = 74% của
      trần** — rủi ro tích sẵn từ lâu mà không chỉ số nào trong summary cho
      thấy
- [x] **19/08** Kiểm lại trước khi push và bắt được lỗi của chính mình: con số
      cộng dồn "model mạnh 21/21" (viết sáng 19/08) và "34/34" (viết chiều
      19/08) **đều sai**. Tôi lập bảng chéo bằng script nhưng **cộng tổng bằng
      tay**, và bỏ sót cả một lần chạy. Số đúng: **41/41** qua 4 lần chạy đầy
      đủ (`flash-lite` 31/33 thì đúng từ đầu). Đã sửa ở 5 tài liệu. Quy tắc bổ
      sung cho bản thân: **script đã đếm được từng dòng thì để script in luôn
      cả tổng** — chỗ nào chuyển từ máy sang tay là chỗ đó sinh lỗi
- [x] **19/08** Chốt ngưỡng TTFT. Bỏ `< 3s`, thay bằng ba ngưỡng: `p50` < 10s,
      `p90` < 15s, và **request chạm trần 60s = 0**. Lí do đổi phải độc lập với
      số đo, nếu không thì chỉ là dời cột gôn: ngưỡng cũ neo vào một request
      **không gọi model nào** (0.34s), còn đường thật có hai lượt gọi model
      tuần tự cộng năm vòng gọi database.
      **Kiểm trước khi sửa đã bác bỏ chính đề xuất đầu của tôi:** bản đầu là
      `p50 < 5s`, nhưng lần chạy 19/08 cho 8155ms — nghĩa là 5s **không đạt ở
      đường tốt** của sản phẩm và chỉ đạt khi chain rơi xuống model yếu. Đúng
      cái lỗi vừa phê phán, suýt lặp lại ngay trong bản sửa nó.
      Và trước khi viết ngưỡng vào tài liệu thì **sửa harness đo được đã**:
      thêm `p90_ttft_ms` và `n_timeout` vào `summarise()`, giữ `http_status`
      trong record (trước đó mã 504 bị bỏ, nên 504 và "stream rỗng" nhìn giống
      hệt nhau). `n_timeout` đếm theo **hai** dấu hiệu — mã 502/504, và độ trễ
      ≥ 55s — vì nếu chỉ đếm theo mã thì report cũ sẽ ra 0 và làm một ngưỡng
      **đang vi phạm** trông như đã đạt. 5 test mới, và chạy lại trên 5 report
      thật để đối chiếu: 19/08 ra `n_timeout` = 2 đúng như quan sát
- [ ] **23/08** Cập nhật `BAO_CAO_TIEN_DO.md` cuối tuần; gửi 4 câu hỏi mở cho
      mentor nếu chưa gửi
- [x] **Mốc kiểm:** `faithfulness` có số đo thật lần đầu ✓ (1.000, production
      19/08); TTFT có số đo lần đầu ✓ (8155ms — và số đó **không đạt ngưỡng**,
      xem trên); `SKILL` §1 không còn placeholder ✓

**Tuần 4 · 24/08 – 30/08** — trả nợ kĩ thuật, mở rộng định dạng

> Nếu mentor trả lời "dừng mở rộng phạm vi" trước tuần này: bỏ mục TXT/DOCX,
> dồn thời gian dư sang bắt đầu chương 1 báo cáo sớm. Các mục còn lại không
> phụ thuộc câu trả lời đó.

- [x] **24–25/08 (làm sớm 19/08)** Dọn Storage khi xoá tài liệu. **Kiểm trước
      khi sửa thì mục này sai một nửa:** `document_pages` vẫn luôn được dọn qua
      cascade hai tầng `documents → ingest_jobs → document_pages` — chèn thật
      một bộ document + job + page vào database rồi xoá, cả ba hàng đều đi. Rò
      rỉ thật chỉ có Storage, vì bucket không có khoá ngoại. Đã thêm
      `src/lib/documents.ts` (`deleteDocument`) đọc `storage_path` **trước** khi
      xoá hàng — job cascade mất thì không lấy lại được path — rồi xoá hàng
      trước, xoá file sau (hỏng ở bước cuối thì mất một file thừa, còn thứ tự
      ngược lại để lại tài liệu không có file gốc). 5 test mới. Ghi thành bẫy
      #19. *(Việc gốc ghi ở dòng dưới, giữ lại để đối chiếu:)*
- [ ] ~~**24–25/08**~~ Dọn `document_pages` + file Storage khi xoá tài liệu: sửa
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
- [x] **29/08 (làm sớm 19/08)** `/api/health` + Action `Keep-alive`. Chạy thứ
      Hai và thứ Năm chứ không phải hàng tuần: Supabase ngủ sau 7 ngày, lịch
      hàng tuần đúng sát mép, hai lần/tuần cho khoảng lặng tối đa 4 ngày.
      Không dùng secret nào — URL công khai, và route **không gọi Gemini**
      (một health check hỏi một câu sẽ đốt hạn mức ngày cho không ai cả).
      Hai chi tiết dễ sai: `dynamic = "force-dynamic"`, vì route handler được
      cache sẽ trả 200 vui vẻ mà không hề chạm Postgres — đúng cái nó sinh ra
      để phát hiện, đội lốt thành công; và tách `checkDatabase()` ra
      `src/lib/health.ts` để **test được nhánh 503**, theo đúng bài học bẫy
      #14b. Đo thật trên dev server: 204–288ms ấm, 1423ms lần đầu
- [ ] **30/08** `SKILL` §2 — rà lại 8 bước đã có, bổ sung chỗ còn thiếu
- [ ] **Mốc kiểm:** health check tự chạy hàng tuần; xoá tài liệu không để lại
      rác trong `document_pages`/Storage; cập nhật `BAO_CAO_TIEN_DO.md`

**Tuần 5 · 31/08 – 06/09** — báo cáo chương 1–2
- [x] **(làm sớm 19/08)** `docs/BAO_CAO.md` Chương 1 và Chương 2 viết xong.
      Dựng chương 2 buộc phải đối chiếu 2 sơ đồ với code, và **cả hai đều đã
      lệch**: sơ đồ 1 thiếu hẳn ba bảng của migration 007
      (`conversations`, `conversation_documents`, `messages`) và route
      `/api/health`; sơ đồ 2 thiếu bước kiểm tra khung chat đã có tài liệu chưa
      (trả `needs_document` **trước khi** gọi model) và thiếu nguồn lịch sử 3
      lượt. Đã cập nhật cả hai. Việc còn lại: xuất PNG cho 2 sơ đồ trước khi
      chuyển sang `.docx`, vì pandoc không render mermaid — ghi vào tuần 8.
      *(Mục gốc giữ lại bên dưới để đối chiếu:)*
- [ ] ~~`docs/BAO_CAO.md` Chương 1~~ — Tổng quan, dựng từ `README.md` +
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
