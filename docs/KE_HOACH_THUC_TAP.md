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
- [x] **21/08 (làm sớm 18/08, trên local — chưa tính là số chính thức)**
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
- [x] **19/08** Sửa trần 60s (bẫy #21). Hạn chót **cho cả request**
      (`REQUEST_BUDGET_MS = 50_000`) đo từ `started`, không phải từ lúc gọi
      model — guardrail và truy hồi đã tiêu thời gian trước đó. Thêm nhánh
      `reason: "timeout"` vì gộp chung với `rate_limited` sẽ khuyên người dùng
      "đợi một phút" trong khi chẳng có gì bị bóp.
      **Bản vá đầu của tôi sai và test bắt được.** Tôi truyền `abortSignal` cho
      `streamText` rồi cho là xong; đo bằng model không bao giờ resolve với
      signal 120ms thì **test treo đủ 10 giây**. `abortSignal` chỉ đi xuống
      fetch — provider không đọc thì chỗ `await` vẫn treo. Hạn chót phải đặt
      đúng chỗ đang đợi, trong `openTextStream`. Giữ `abortSignal` làm lớp thứ
      hai vì nó huỷ thật lượt gọi khi provider có đọc, đỡ tốn quota.
      12 test mới, trong đó có một ca **cố ý pin lại** việc `abortSignal` một
      mình không đủ. Chưa kiểm được đường có đăng nhập vì cần session người
      dùng — cách kiểm 0 quota đã ghi lại để chạy khi tiện
- [x] **19/08** Người dùng test tay và tìm ra bẫy #22, thứ không test nào và
      không lần eval nào chạm tới: xoá khung chat đang mở thì rơi vào trạng
      thái `null`, mà `null` mang **hai nghĩa** — sidebar hiểu là "chưa chọn
      khung", truy hồi hiểu là "tìm trong mọi tài liệu". Hai lối đi tới hai
      trạng thái nhìn giống hệt nhau. Đã cho `null` một nghĩa duy nhất: **khung
      chat mới chưa lưu**. Hàng database chỉ sinh khi hỏi câu đầu hoặc tải tài
      liệu đầu, nên mở app và bấm "+ Chat mới" không tạo rác.
      Hai hệ quả phải xử lí kèm: **(a)** `loadHistory` sẽ chạy khi id vừa được
      tạo và xoá mất câu hỏi đang hiện trên màn hình — chặn bằng ref
      `selfCreated`; **(b)** nút "Xoá hẳn" tài liệu trước đây chỉ nằm ở trạng
      thái `null`, nên sau khi đổi nghĩa thì **không còn đường tới** — đã tách
      thành hai nút "Bỏ ra" và "Xoá hẳn" ngay trong khung chat, nếu không thì
      chính bản vá dọn Storage sáng nay thành code chết
- [x] **20/08** Hai quyết định phạm vi và một phát hiện.
      **(1) Bỏ TXT/DOCX khỏi phạm vi**, vì lí do kĩ thuật chứ không phải thiếu
      thời gian: cả hai không có số trang nên buộc phải đổi đơn vị trích dẫn —
      chính lời hứa trung tâm — và chúng không đi qua đường vision, tức không
      dùng tới phần lõi của đồ án. Ghi vào mục "Không làm" để bảo vệ khi phản
      biện. Tuần 4 vì thế trống, dồn cho báo cáo.
      **(2) Chốt `MIN_COSINE` — và câu hỏi ban đầu hoá ra đặt sai.** Tôi định
      tìm ngưỡng tối ưu; đo rộng hơn thì thấy **không tồn tại ngưỡng tối ưu**.
      Viết `eval/threshold.py` chấm thêm 16 câu dò chia hai loại (chỉ tốn
      embedding quota): ngoài phạm vi **hiển nhiên** 0.522–0.562, ngoài phạm vi
      **cùng lĩnh vực** 0.572–**0.654**, trong phạm vi **0.612**–0.825. Hai
      phân bố chồng lấn, và `o-001` ghi nhận cùng 0.654 với câu dò cao nhất. Cosine đo
      độ liên quan chủ đề, không đo khả năng trả lời được. Giữ 0.60, phát biểu
      lại vai trò của nó là **bộ lọc thô chứ không phải bảo chứng** — bảo chứng
      nằm ở grounding prompt, tầng đã đo là có tác dụng ở bẫy #17.
      **(3) Lỗ hổng thật nằm ở bộ đo, không ở ngưỡng:** cả 6 câu `should_refuse`
      đều hiển nhiên lạc đề, nên `refusal_rate = 1.000` nói ít hơn nó có vẻ nói.
      Việc còn nợ: chạy 5 câu vùng chồng lấn qua `/api/chat` thật xem model có
      từ chối không (~10 request). Ghi thành bẫy #23
- [x] **20/08 chiều** Hai lần chạy, hai kết quả ngược chiều.
      **(1) `n_timeout` = 0 — bẫy #21 đóng.** Bản vá hạn chót 50s xác nhận
      được, và xác nhận trong điều kiện *khắc nghiệt hơn* lần vi phạm: 5 câu
      chạm rate limit phải thử lại, câu chậm nhất 22.6s, mà không câu nào chạm
      trần 60s.
      **(2) `p90_ttft_ms` 12069 → 18368, hỏng ngưỡng tôi tự đặt hôm qua.** Đáng
      ghi vì lí do: lúc đặt tôi ghi rõ `p90 < 15s` "thừa nhận có nhìn vào phân
      bố", còn `p50 < 10s` lấy từ mốc UX bên ngoài. Đúng một lần chạy sau,
      **ngưỡng lấy từ dữ liệu hỏng, ngưỡng lấy từ bên ngoài vẫn đạt**. Thêm lí
      do kĩ thuật: `p90` trên 19 mẫu là giá trị thứ 18/19 — chỉ một câu đứng
      trên nó, gần như "câu chậm nhì". **Giữ nguyên 15s và ghi là chưa đạt**;
      dời lần thứ hai ngay sau vi phạm đầu tiên thì nó thôi là ngưỡng.
      **(3) Phép thử từ chối: 5/5 câu khó đều bị từ chối** — và tất cả do
      `gemini-3.5-flash-lite`, model yếu nhất chain. Hai câu còn tìm ra bằng
      chứng một phần rồi giải thích vì sao không đủ (LoRA chỉ có trong mục tham
      khảo; L1 có nhắc nhưng không có L2). Nghĩa là `refusal_rate = 1.000`
      **nói ít hơn** hệ thống làm được, và kiến trúc hai tầng đúng: tầng thứ
      hai gánh được phần tầng thứ nhất về nguyên tắc không làm được
- [x] **20/08** Đưa 5 câu khó vào `eval_dataset.json` thành nhóm
      `hard_negative` — để mọi lần chạy sau đều đo, thay vì dựa vào một phép
      thử rời. **Thêm ẩu sẽ phá chỉ số:** cả năm câu **vượt được ngưỡng
      cosine**, nên nếu xếp chúng vào `should_refuse` thì `refusal_rate` rơi từ
      1.000 xuống **0.545** trong khi hệ thống vẫn chạy đúng — đúng dạng "chỉ
      số sai theo hướng bi quan" của bẫy #14. Ba chỗ phải tách riêng:
      **(a)** `refusal_rate` chỉ đo đường từ chối **có cấu trúc**, nhóm mới
      không thuộc về nó; **(b)** `citation_validity` loại nhóm mới ra, vì câu
      trả lời đúng cho chúng là một lời từ chối và hàm chấm trả 0.0 khi không
      thấy marker — bẫy #17 nhân lên năm lần mỗi lần chạy; **(c)** chấm chúng
      bằng `faithfulness`, công cụ duy nhất **đọc được** nội dung: trả lời từ
      kiến thức riêng thì có khẳng định không được ngữ cảnh đỡ, còn từ chối thì
      chính prompt chấm là trung thực hoàn toàn.
      Cũng phải sửa `eval/threshold.py`: nó lọc "trong phạm vi" bằng
      `category != "should_refuse"`, nên nhóm mới sẽ bị đếm nhầm thành trong
      phạm vi và **nâng chính cái sàn mà nó dùng để so sánh**.
      Xác minh bằng lần chạy retrieval-only 31 câu: mọi chỉ số cũ giữ nguyên
      đến từng chữ số (`mrr` 0.926, `refusal_rate` 1.000), `n_hard_negative` =
      5, và cosine 5 câu khớp đúng lần đo threshold. 4 test mới.
      **Hệ quả ngân sách:** full eval giờ 31 câu = **62 request**, nên
      full + `--judge` (~86) **không còn vừa một ngày**. Chạy `--judge` riêng
- [x] **20/08** Thêm cờ `--only` cho `run_eval`: chạy đúng một nhóm hoặc vài
      id thay vì cả bộ. Lí do cụ thể: `--limit` lấy **N câu đầu**, mà nhóm
      `hard_negative` nằm ở vị trí 27–31, nên không giá trị `--limit` nào chạm
      tới nó ngoài 31 — tức đúng bằng full run. Kèm hai thứ nhỏ mà quan trọng:
      **(a)** `--only` gõ sai thì **dừng hẳn và liệt kê nhóm hợp lệ**, thay vì
      chạy 0 câu rồi ghi ra một report toàn null trông như đã chạy xong;
      **(b)** chế độ full in số request ước tính **trước** khi tiêu gì. 3 test
      mới (49 test Python)
- [x] **20/08** Chạy `--only hard_negative` qua production (10 request) để kiểm
      đường full mode của nhóm mới. Ba phép tách đều đúng như thiết kế:
      `citation_validity` = `null` (đã loại nhóm này ra), `refusal_rate` =
      `null` (lần chạy không có câu `should_refuse` nào), `hit@8`/`mrr` =
      `null` (nhóm không thuộc `RETRIEVABLE`), `n_hard_negative` = 5.
      **Và kết quả model lặp lại: 5/5 từ chối**, 46 phút sau lần đo sáng, qua
      một đường code khác. Câu chữ khác đi nhưng nội dung trùng, kể cả hai ca
      tìm ra bằng chứng một phần — `h-005` độc lập tìm lại câu về L1 và độc lập
      chỉ ra không có gì về L2. Một lần 5/5 có thể là may; hai lần thì không
- [x] **21/08** Chạy full **31 câu** lần đầu — lần duy nhất kiểm được ba phép
      tách của nhóm `hard_negative`, vì là lần đầu mọi nhóm chạy cùng lúc.
      **Cả ba đúng:** `refusal_rate` giữ **1.000** (không rơi xuống 0.545),
      `citation_validity` giữ **1.000** (không bị pha loãng), `n_hard_negative`
      = 5. `n_timeout` = 0 lần xác nhận thứ hai, trong lần chạy có 4 lần chạm
      rate limit và 3 câu degraded.
      **Nhưng `p90` suýt tự "sửa" mình bằng một cách không có thật.** Harness
      báo 13358 — đạt. Thật ra đó là lần đầu 5 câu `hard_negative` được tính
      vào thống kê TTFT, mà chúng là **câu từ chối**: ngắn, quyết định nhanh,
      2749–3190ms so với trung vị 8592 của phần còn lại. Năm giá trị nhanh gia
      nhập mẫu (19 → 24) đủ kéo `p90` xuống dưới ngưỡng **mà không có gì về
      tốc độ thay đổi**. Tính lại trên 26 câu gốc: **15879, vẫn chưa đạt**.
      Đã loại `hard_negative` khỏi thống kê TTFT, thêm test, ghi thành bẫy #24.
      Đây là **lần thứ sáu** một con số trông như kết quả mà không phải — và
      lần đầu do chính việc cải tiến phép đo tạo ra
- [x] **21/08** Viết `SKILL` §5 (Nếu làm lại) và §6 (Checklist tái sử dụng) —
      cả hai vốn xếp tuần 8, nhưng nguyên liệu là 24 bẫy đã ghi và chúng không
      cần số liệu cuối cùng. §5 chia bốn phần: giữ nguyên, làm khác, bỏ hẳn, và
      điều không lường trước. §6 là 30 mục xếp theo đúng thứ tự làm, mỗi mục
      truy được về một bẫy cụ thể. Còn **§0 (tóm tắt)** để tuần 8, vì nó phải
      tóm cả số liệu cuối
- [x] **21/08** Viết mục *Nguồn tài liệu* trong `README.md`. Tra giấy phép thật
      của `2402.00253v2` thay vì đoán: **arXiv.org perpetual non-exclusive
      license** — cho arXiv quyền phân phối, **không** cấp quyền phát hành lại
      cho bên thứ ba, nên PDF gốc nằm ngoài repo là bắt buộc chứ không phải tuỳ
      chọn. Hai file slide bài giảng thì ghi rõ là **chưa xác định giấy phép**,
      không bịa
- [x] **21/08** Viết chương 5 — Kết luận. Báo cáo **đủ 5/5 chương**, 11.225 từ.
      Chương trả lời từng lời hứa ở chương 1 bằng số đo: công thức và biểu đồ
      (2/2 câu `figure` truy hồi đúng), song ngữ (`hit_cross_lingual` 1.000 trên
      6 câu), trích dẫn (1.000, và ablation cho thấy bỏ quy tắc thì rơi xuống
      0.333), từ chối (1.000 trên negative dễ **cộng** 5/5 trên negative khó,
      hai lần độc lập). Mục 5.2 ghi thẳng `p90` chưa đạt và **giữ nguyên ngưỡng**
      chứ không dời lần thứ hai. Mục 5.4 xếp ba ưu tiên phát triển theo đúng gốc
      rễ: làm ingest ổn định trước, vì nó là nguyên nhân của hai trong ba hạn chế
- [x] **21/08** Thêm đường **dán ảnh vào ô chat**. Chọn cách nạp ảnh thành tài
      liệu một trang thay vì gửi thẳng ảnh cho model, vì cách sau bỏ qua truy
      hồi, trích dẫn và ngưỡng từ chối — tức phá ba trong bốn lời hứa ở chương 1.
      Rẻ hơn nhiều so với vẻ ngoài: `/api/ingest/step` vốn **không biết gì về
      PDF**, nó chỉ nhận ảnh trang, nên một ảnh dán chính là thứ nó đang chờ.
      Ràng buộc PDF chỉ nằm ở 3 chỗ và đều đã gỡ.
      **Hai lỗi bắt được khi kiểm, cả hai trước khi ship:**
      **(a)** comment tôi viết ghi *"thu nhỏ 2000px rồi PNG là lọt 3MB"* —
      đo thật trong trình duyệt: ảnh nhiễu 2000×1500 ra **10.32MB**, vượt hơn ba
      lần; JPEG q0.85 chỉ 2.14MB. Ảnh tổng hợp thử lúc đầu (0.39MB) đã **xác
      nhận nhầm** giả định. Sửa: PNG trước, không lọt mới lùi JPEG.
      **(b)** kéo theo — `/api/ingest/step` dựng `PageImage` không kèm
      `mimeType`, mà `extractBatch` mặc định `image/png`, nên byte JPEG sẽ bị
      khai là PNG. Đã truyền type thật xuyên suốt.
      Ghi thành bẫy #25 — **lần đầu một giả định sai bị bắt trước khi ship**.
      11 test mới (72 test JS). Đã cập nhật `REQUIREMENTS` §3 và 3 ngoại lệ mới
      (E28–E30), sơ đồ 1, chương 2 báo cáo, README
- [x] **24/08** Thêm 3 câu hỏi về ảnh vào `eval_dataset.json` — **và tìm ra
      bẫy nghiêm trọng nhất tính đến giờ trong lúc kiểm chúng.** Chọn ảnh biểu
      đồ giá vàng SJC (giavang.org), thoả điều kiện đặt ra ngày 21/08: nội
      dung không có trong corpus, cần vision đọc, có dữ kiện tuỳ tiện. Sửa
      `eval/run_eval.py` để nhóm `image` có thống kê riêng
      (`image_hit_at_8`, `image_mrr`, `image_citation_validity`,
      `image_refusal_rate`), không trộn vào `hit@8`/`MRR` chung — smoke-test
      trước khi ảnh tồn tại xác nhận cách li hoạt động đúng.
      **Chạy thật thì cả 3 câu trả lời rỗng**, dù `image_hit_at_8 = 1.0` (đúng
      trang được trích). Tra ngược: `g-001`/`g-002` — hai câu `figure` trong bộ
      26 câu gốc, có từ 11/08 — cũng rỗng y hệt kiểu này ở **mọi lần chạy full
      mode từ trước tới giờ**, và không chỉ số nào trong 15 lần chạy bắt được.
      Gốc rễ: `display_text` (trường đưa vào `buildContext` để sinh câu trả
      lời) giữ nguyên placeholder `[[FIGURE:id]]` thay vì dữ liệu thật — trong
      khi `embed_text` đã được thay đúng từ đầu. Không nơi nào trong frontend
      đọc placeholder đó để render thành gì, nên thiết kế "giữ nguyên để hiển
      thị" phục vụ một mục đích không tồn tại. Quét corpus: **46/90 chunk
      (51%)** mang placeholder chưa thay thế. Đã sửa `buildContext`
      (`src/lib/prompt.ts`) dùng lại đúng logic `toEmbedText` đã có, xuất
      `FIGURE_REF` từ `chunk.ts` để không viết lại regex lần hai. 3 test mới,
      dùng chính dữ liệu đo được từ database làm ca kiểm. Ghi thành bẫy #28,
      cập nhật `REQUIREMENTS.md` §7. **Đã xác nhận trên production cùng
      ngày:** đẩy lên (`1f4ced4`), đợi Vercel deploy (~45s), chạy lại cả 3
      câu — không tin mỗi việc câu trả lời hết chứa cụm "không có thông tin",
      đọc nguyên văn cả ba. `i-001` (en, xuyên ngôn ngữ): *"...was 134.5
      million VND/tael"* — đúng. `i-002` (vi): *"...là 139.5 triệu
      đồng/lượng"* — đúng. `i-003` (phải từ chối): *"tài liệu không có thông
      tin về giá vàng thế giới... biểu đồ chỉ có giá SJC trong nước"* — từ
      chối đúng, có giải thích, không bịa. `image_hit_at_8`/`image_mrr`/
      `image_citation_validity` đều 1.0, nhưng con số đó không còn là thứ
      duy nhất được tin — bẫy #28 chính là bài học vì sao
- [x] **24/08 Chạy `--judge` chốt số trên 26 câu — và tìm ra bẫy nghiêm trọng
      hơn cả #28.** `hit@8` rớt **1.000 → 0.667**, `false_refusal_rate`
      **0.000 → 0.824**. Không phải do bản sửa bẫy #28 (kiểm trực tiếp: DB vẫn
      khoẻ, cosine 0.79 cho `testtv1.pdf`). Gọi thẳng `/api/chat` bằng token
      thật thì tái hiện y hệt, tra `documents.owner_id` thì lộ ra **corpus 3
      tài liệu khai báo đang thuộc về hai tài khoản khác nhau**:
      `testtv1.pdf`/`testta1.pdf`/bản gốc `2402.00253v2.pdf` thuộc
      `trantiendat.cl@gmail.com` (10/08, ngày đầu), mọi thứ từ 12/08 trở đi
      thuộc `11a2trantiendat@gmail.com` (token hôm nay). RLS chặn đúng thiết
      kế — không phải lỗi bảo mật, mà hai tài khoản test sở hữu hai nửa không
      giao nhau của cùng một corpus. Điều này cũng giải thích sâu hơn bẫy
      #26/27: 3 bản trùng của `2402.00253v2.pdf` không chỉ vì vision không
      tất định, mà vì đổi tài khoản giữa chừng rồi tải lại file tưởng chưa có.
      **Chưa sửa — cần bạn quyết định thời điểm**, vì sửa (nạp lại 2 file dưới
      tài khoản hiện hành) tốn quota thật dù rẻ (~10 request nhờ batch 8
      trang/request). Ghi thành bẫy #29. Báo cáo `--judge` hôm nay giữ lại làm
      bằng chứng nhưng **`faithfulness = 0.986` KHÔNG dùng làm số chốt `SKILL`
      §0** — đo trên corpus bị thu hẹp bất thường, không phải chất lượng hệ
      thống thật. Phải chạy lại sau khi sửa quyền sở hữu
- [x] **24/08** Sửa quyền sở hữu `testtv1.pdf`/`testta1.pdf` — nạp lại dưới
      `11a2trantiendat@gmail.com` qua `ingest.main all --owner`. **Tốn 0
      quota**: cả 73 trang đều lấy từ cache trích xuất 10/08 (`0 need vision,
      X cached`), hash trùng khớp nên `upsert_document` cập nhật đúng hàng cũ
      thay vì tạo bản trùng. Corpus giờ chỉ còn lệch đúng 1 tài liệu mồ côi
      (`baddf715`, bản gốc `2402.00253v2.pdf` dưới tài khoản cũ) — chưa xoá,
      chờ quyết định
- [x] **24/08** Restyle giao diện theo bố cục một mẫu AI SaaS tham khảo
      (uideck "AI Agent"), **giữ nguyên** bảng màu/font Docubo — không đổi gì
      trong `:root` của `globals.css`. Đổi: tài liệu sang trái/hội thoại sang
      phải (mẫu không có tương đương "Products" của Docubo), bubble câu hỏi bo
      phải/câu trả lời bo trái có "đuôi", nút gửi tròn thay nút chữ, nút Sao
      chép hoạt động thật dưới mỗi câu trả lời (bỏ like/dislike — không có nơi
      lưu phản hồi, nút không làm gì tệ hơn không có nút), danh sách hội thoại
      thêm tìm kiếm + nhóm theo Hôm nay/Hôm qua/7 ngày qua tính hoàn toàn phía
      trình duyệt từ `updated_at` sẵn có. Không đăng nhập được cục bộ để xem
      trực tiếp (không có mật khẩu) nên dựng bản HTML tĩnh dùng đúng CSS thật,
      đặt tạm trong `public/` để dev server phục vụ, chụp ảnh sáng/tối/di
      động rồi xoá sạch. Một chỗ tưởng là bug (khoảng trắng lạ ở bố cục di
      động) hoá ra do file test thiếu `<meta viewport>` — xác nhận bằng `curl`
      rằng Next.js tự thêm thẻ này nên app thật không dính
- [x] **25/08 Đảo quyết định 20/08 — thêm DOCX/TXT.** Hỏi lại và tra nguyên
      văn file hướng dẫn mentor: Task 2.1 có nhắc "PDF/DOCX/TXT", nhưng nằm ở
      checklist lộ trình tuần, không phải bảng 5 tiêu chí chấm điểm. Quyết
      định làm thêm, giữ nguyên hai lý do kĩ thuật cũ nhưng đổi cách xử lý:
      **(1)** "không có số trang thật" → đánh **trang giả** (~3000 kí tự/trang,
      cắt theo ranh giới đoạn văn) đưa thẳng vào `buildChunks()` không sửa gì
      — hàm đó vốn tính `page_start`/`page_end` bằng `Math.min/max` trên số
      trang các `Page` đưa vào, nên không cần đổi schema, không đổi
      `CitationList.tsx`, không đổi eval harness. **(2)** "không đi qua vision"
      giờ là điểm tốt — 0 quota vision, chỉ tốn embedding. Phạm vi **chỉ web
      app (TypeScript)**, không đụng `ingest/main.py`.
      Dùng 2 agent con (Explore rồi Plan) kiểm chứng thiết kế trước khi viết
      code — agent Plan bắt được thiết kế route ban đầu của tôi **viết lại
      logic chunk/embed/lưu lần hai**, trong khi route `/api/ingest/finish` đã
      tách sẵn đúng việc đó — sửa thành route mới chỉ lo trích xuất + đánh
      trang giả + `savePages`, gọi lại `/api/ingest/finish` có sẵn. Cũng bắt
      2 lỗi cụ thể trước khi viết: `Buffer#toString("utf-8")` không throw khi
      gặp byte hỏng mà âm thầm thay `U+FFFD` (phải dùng `TextDecoder` với
      `fatal: true`), và regex đuôi file phải neo `\.docx$` chứ không phải
      `\.docx?$` — mammoth không đọc được `.doc` cũ, lẫn vào sẽ crash giữa
      chừng chứ không báo lỗi sạch.
      Test bằng chính file mẫu thật của `mammoth` (`single-paragraph.docx`,
      `tables.docx`, `empty.docx`) chạy qua nguyên vẹn pipeline thật
      (mammoth → làm sạch → đoán ngôn ngữ → đánh trang giả) — không chỉ tin
      unit test trên chuỗi tự viết — xác nhận cả đường thường lẫn đường lỗi
      (file rỗng) đúng như thiết kế, tốn 0 mạng/quota. `npm run build` sạch,
      route mới build đúng cùng mọi route khác. 87/87 test JS, cập nhật
      `REQUIREMENTS.md` (thêm mục có ngày, không xoá quyết định 20/08 —
      đúng quy ước sửa-bằng-cách-thêm-mục-mới của bẫy #26/27) và README
- [x] **25/08** Chạy `--judge` chốt số thì `faithfulness` rớt **0.835**, dưới
      ngưỡng 0.90 và thấp hơn hẳn mọi lần đo trước (luôn 1.000). Đọc từng câu
      điểm thấp thay vì tin thẳng con số: `g-001`/`g-002` — hai câu `figure`
      duy nhất trong bộ — bị chấm **0.0** dù trả lời khớp gần nguyên văn
      `expected_points`. Model không bịa, bộ đo bịa: `eval/judge.py` có một
      `build_context()` **Python riêng** (tránh gọi lại retrieval — bẫy #17),
      đọc thẳng `display_text` từ database — nơi bẫy #28 hôm qua **chưa từng
      chạm tới** vì bản sửa đó chỉ tác động lúc dựng prompt (TS), không tác
      động dữ liệu đã lưu. Sửa một bên, quên bên song song — đúng bài học vừa
      ghi 24 giờ trước, tự mắc lại. Thêm `_resolve_figures()` vào `judge.py`,
      cổng đúng logic `resolveFigures()` bên TS, cộng cột `figure_refs` vào
      `chunks_by_id()`. Xác minh bằng dữ liệu thật không tốn quota: đọc thẳng
      chunk có `has_figure=True`, thấy bảng dữ liệu hiện đúng thay vì
      placeholder. 2 test mới. Ghi thành bẫy #30. **Chưa chạy lại `--judge`**
      — hôm nay đã tốn 78 request, để mai lấy số đúng
- [x] **25/08** Xác nhận thủ công trên production, đúng việc đã hẹn người
      dùng tự làm: tải `Kien_Thuc_ML.docx` (nội dung ML tiếng Việt, có công
      thức) — báo *"Đã đọc xong 2 trang thành 3 đoạn"*, hỏi *"Cách khắc phục
      Overfitting"* trả lời đúng, trích dẫn `[1]` khớp nội dung thật, không
      bịa thêm. Trước khi test, đã dự đoán bằng cách chạy thẳng
      `cleanText`/`paginate` thật (không phải đoán) trên đúng nội dung file
      `.txt` người dùng gửi: file đó **không có dòng trống nào** trong toàn
      văn bản, mà `paginate()` chỉ cắt theo ranh giới dòng trống (cố ý —
      không bao giờ cắt giữa câu) — nên `.txt` sẽ gộp thành **đúng 1 trang
      giả** dù `.docx` cùng nội dung (mammoth tự chèn dòng trống giữa mỗi
      paragraph Word) chia được nhiều trang hơn. Không sửa — người dùng chọn
      giữ nguyên hành vi, biết trước lý do là đủ. Giao diện mới (redesign
      24/08) cũng lần đầu thấy chạy thật trên production qua ảnh chụp màn
      hình người dùng gửi: bubble, nút Sao chép, "+ Chat mới", tìm kiếm, nhóm
      Hôm nay/Hôm qua/7 ngày qua — đúng như thiết kế
- [x] **26/08 Thêm trang chủ công khai — mentor phản hồi 25/08 rằng bấm vào
      link live thì rơi thẳng vào `/login`, không có gì giới thiệu dự án.**
      Chuyển route: `/` giờ là trang chủ công khai (không cần đăng nhập),
      ứng dụng cũ dời sang `/app` (nguyên vẹn, chỉ đổi đường dẫn — vẫn
      redirect `/login` nếu chưa đăng nhập). `login/page.tsx` sửa đích
      chuyển hướng sau đăng nhập thành `/app`.
      Tham khảo bố cục/hiệu ứng của một trang case-study kỹ thuật người dùng
      gửi (đọc DOM + CSS thật của trang đó trước khi làm, không đoán): thẻ
      hover nâng nhẹ + viền sáng màu nhấn, hiệu ứng fade-up khi cuộn tới,
      thanh điều hướng dính có nút chuyển ngôn ngữ và chuyển giao diện riêng
      biệt. **Giữ nguyên bảng màu/font Docubo**, chỉ học cấu trúc và tương
      tác — nhất quán với quyết định đã chọn lúc redesign UI 24/08.
      Nội dung trang chủ lấy từ chính dự án, không bịa: 4 quyết định thiết kế
      cốt lõi, stack công nghệ (từ README), 2 sơ đồ kiến trúc (copy PNG vào
      `public/architecture/`), bảng chỉ số nghiệm thu, 6 bẫy chọn lọc từ 30
      bẫy đã ghi trong `SKILL_MY_PROJECT.md`. Cố ý **không đưa `faithfulness`
      vào số liệu nổi bật** — con số đó đang chờ đo lại sau bẫy #30.
      Nút chuyển giao diện là **thủ công** (3 trạng thái: hệ thống → tối →
      sáng → hệ thống), không chỉ dựa `prefers-color-scheme` như phần còn lại
      của app — thêm cặp khối `[data-theme="dark"]`/`:not([data-theme="light"])`
      vào `globals.css` để lựa chọn tường minh luôn thắng OS, và một script
      inline chạy trước khi vẽ trang (đặt ở `layout.tsx`, áp dụng cho mọi
      route) để không nhấp nháy sai giao diện. Nút chuyển ngôn ngữ VI/EN lưu
      `localStorage`, chỉ áp dụng cho trang chủ — phần ứng dụng đã đăng nhập
      vẫn thuần tiếng Việt như cũ, không mở rộng phạm vi song ngữ ra ngoài
      yêu cầu.
      Đặt tên toàn bộ class CSS mới với tiền tố `l-` để không đụng
      `.btn-secondary` app đang dùng — cùng tên lớp, khác ý nghĩa, sẽ vỡ cả
      hai nơi nếu dùng chung.
      Kiểm bằng dữ liệu thật, không chỉ tin build sạch: `npm run build` qua
      cả hai route lẫn route `/api/ingest/text`; bấm nút chuyển ngôn ngữ và
      chuyển giao diện qua trình duyệt thật, đọc `localStorage`/
      `document.documentElement.dataset.theme` sau mỗi lần bấm để xác nhận
      đúng chu trình 3 trạng thái; xác nhận `/app` vẫn redirect `/login` khi
      chưa đăng nhập; kiểm ảnh kiến trúc tải đúng kích thước thật qua
      `naturalWidth/naturalHeight`; kiểm di động không tràn ngang
      (`scrollWidth === innerWidth`)
- [x] **26/08 Mở rộng nút chuyển ngôn ngữ/giao diện ra `/login` và `/app`,
      xoá dòng mô tả thừa ở khung chat.** Người dùng phản hồi sau khi thấy
      trang chủ mới: hai nút chuyển vừa làm chỉ có ở trang chủ, còn phần đăng
      nhập và ứng dụng chính vẫn thuần tiếng Việt không có nút gì. Thay vì
      copy state cục bộ của trang chủ sang từng trang, dựng `src/lib/i18n.tsx`
      — một Context dùng chung toàn site (`LanguageProvider`/`useLang()`),
      gắn vào `layout.tsx` một lần, thay cho state+localStorage riêng của
      `LandingPage.tsx` trước đó. Gặp lỗi TypeScript ngay khi viết: `as const`
      trên object từ điển song ngữ đóng băng mỗi chuỗi thành kiểu literal
      riêng, khiến nhánh `vi` và `en` thành hai kiểu không tương thích dù
      cùng một hình dạng — bỏ `as const` để kiểu nới rộng về `string` là sửa
      xong, kèm comment giải thích tại sao không dùng nó ở đây.
      Ranh giới phạm vi cố ý giữ hẹp, ghi thẳng trong doc comment đầu file:
      chỉ dịch chuỗi hiển thị tĩnh phía client. **Không đụng** hai cơ chế
      "ngôn ngữ" khác đã có sẵn — câu trả lời của model vẫn theo ngôn ngữ câu
      hỏi (`prompt.ts`, một cam kết sản phẩm đang đo, không phải sở thích hiển
      thị), và các thông báo lỗi `.error` phía server vẫn giữ tiếng Việt (dịch
      chúng cần truyền ngôn ngữ UI vào từng request và sửa mọi route, không
      đáng làm cho lỗi hiếm gặp).
      Dịch toàn bộ `ChatPanel`, `ConversationList`, `UploadPanel`,
      `DocumentList`, `ScopePicker`, `CitationList`, `SignOutButton`,
      `login/page.tsx`; tận dụng lại `ThemeToggle` đã có từ 26/08 sáng cho
      trang chủ — nhưng phát hiện chính nó vẫn hardcode tiếng Việt
      ("Theo hệ thống"/"Tối"/"Sáng"), sẽ lộ ra ngay khi trang login chuyển
      sang EN mà nút giao diện bên cạnh vẫn tiếng Việt, nên dịch nốt component
      này dù không nằm trong yêu cầu ban đầu. `ConversationList.bucketOf()`
      trước đó trả thẳng nhãn tiếng Việt ("Hôm nay"/"Hôm qua"...) dùng làm cả
      khoá `Map` lẫn chữ hiển thị — đổi thành trả khoá trừu tượng
      (`"today"`/`"yesterday"`/...), dịch riêng lúc render, để nhóm hội thoại
      cũng đổi ngôn ngữ được. Xoá đúng dòng mô tả trong khung chat rỗng mà
      người dùng chỉ trong ảnh chụp màn hình
      ("Tải một PDF lên ở khu vực tải tài liệu...").
      Kiểm: `npx tsc --noEmit`, `npm run lint`, `npm test` (87/87), `npm run
      build` đều sạch. Gặp một lần dev server báo lỗi
      `Cannot find module './873.js'` sau khi chạy `next build` trong lúc
      `next dev` vẫn sống — cả hai lệnh dùng chung thư mục `.next`, khởi động
      lại `next dev` là hết. Bấm thật trên `/login`: chuyển VI↔EN đổi đúng
      toàn bộ chữ kể cả nhãn nút giao diện, bấm nút giao diện đổi đúng chu
      trình hệ thống→tối→sáng. **Chưa** đăng nhập thử `/app` bằng trình
      duyệt tự động — không có tài khoản test sẵn và việc tự nhập mật khẩu
      để đăng nhập nằm ngoài phạm vi được phép tự làm; xác nhận `/app` bằng
      đọc code (cùng `useLang()`/`LangToggle`/`ThemeToggle` đã kiểm chứng ở
      `/login`) cộng `tsc`/`build` sạch, không phải bằng mắt trên trình duyệt.
      Người dùng gửi ảnh chụp `/app` thật: hai heading "Tải tài liệu"/"Tài
      liệu trong khung này" vẫn tiếng Việt dù đã chuyển EN — sót vì chúng nằm
      thẳng trong `Workspace.tsx`, không thuộc component con nào đã dịch.
      Thêm `t.upload.heading`/`t.docs.heading`, sửa xong, `tsc`/`lint`/`test`
      lại sạch.
- [x] **26/08 14:20 Chạy lại `--judge` sau bẫy #30, chốt số `faithfulness`
      cho `SKILL_MY_PROJECT.md` §0.** Đợi qua mốc reset quota (14:00 giờ VN),
      lấy token mới (`eval.get_token`), chạy đúng cấu hình đã dùng hôm qua —
      26 câu gốc, full mode, production
      (`eval/reports/eval-full-20260826-072025.json`). Kết quả:
      `faithfulness` **về đúng 1.000**, `n_faithfulness_unscored = 0` —
      xác nhận bản sửa `_resolve_figures()` trong `judge.py` (bẫy #30) đúng.
      `refusal_rate` ra 0.833 thay vì 1.000 quen thuộc — tra riêng thì không
      phải hồi quy: `r-001` lặp lại đúng mẫu bẫy #17 (hỏi giá cổ phiếu, hệ
      thống từ chối bằng văn xuôi "tài liệu hiện tại không chứa..." thay vì đi
      nhánh cấu trúc), và `faithfulness_score` của chính câu đó vẫn 1.0 nên
      không phải câu trả lời sai.
      Nhân dịp có số thật, rà lại luôn **số `faithfulness = 1.000` đang trích
      dẫn trong `REQUIREMENTS.md` §7 từ lần chạy 19/08** — hoá ra số đó
      **đúng nhưng đúng vì may**: đọc lại report 19/08 thì hai câu `figure`
      (`g-001`/`g-002`) lúc đó cũng trả lời kiểu "ngữ liệu không mô tả..." do
      bẫy #28 (context sinh câu trả lời còn giữ nguyên placeholder
      `[[FIGURE:id]]`, chưa sửa cho tới 24/08) — một câu không khẳng định gì
      thì `FAITHFULNESS_PROMPT` mặc nhiên chấm faithful, nên bẫy #30 (bug ở
      phía chấm điểm) khi đó **chưa có gì để lộ ra**: cả hai bên (sinh câu trả
      lời và chấm điểm) cùng hỏng nên tình cờ khớp nhau. Chỉ sau khi bẫy #28
      sửa xong, hai câu này bắt đầu trả lời có nội dung thật, và đúng lúc đó
      bẫy #30 mới lộ diện (report 25/08, `faithfulness = 0.835`). Cập nhật
      `REQUIREMENTS.md` §7 trỏ về report 26/08 kèm đoạn giải thích, để không
      ai đọc sau tưởng nhầm 19/08 là bằng chứng độc lập với hai bẫy này.
      Điền §0 (Tóm tắt) của `SKILL_MY_PROJECT.md` — mục cuối cùng còn trống
      trong Task 1.5 của checklist mentor.
- [x] **27/08 Mentor góp ý: cho `docubo.vercel.app` tìm được qua
      `site:docubo.vercel.app` trên Google.** Trước đó không có `robots.txt`
      hay `sitemap.xml` — không gì báo cho Google biết trang tồn tại. Thêm
      `src/app/robots.ts` (chỉ cho phép `/`, chặn `/app` và `/login` vì
      Googlebot chưa đăng nhập chỉ thấy form đăng nhập hoặc bị redirect, không
      có nội dung gì đáng lập chỉ mục) và `src/app/sitemap.ts` (một URL: trang
      chủ). Phần còn lại phải làm thủ công qua tài khoản Google của người
      dùng, không tự làm thay được: đăng ký property trên Google Search
      Console, xác minh quyền sở hữu (thử HTML tag trước, chuyển sang HTML
      file giữa chừng — cả hai cách đều hợp lệ, không cần làm lại từ đầu), lấy
      chuỗi/tên file xác minh gửi qua để thêm vào `metadata.verification.google`
      trong `layout.tsx`, nộp sitemap, và bấm "Yêu cầu lập chỉ mục" cho trang
      chủ. Sitemap báo "Không thể tìm nạp" ngay sau khi nộp — kiểm tay bằng
      cách tự tải `https://docubo.vercel.app/sitemap.xml` thì ra đúng XML,
      200 OK, nên đây là Google chưa kịp thử lại chứ không phải trang lỗi.
      Việc còn lại chỉ là chờ Google crawl và lập chỉ mục, không có thao tác
      gì thêm ở phía dự án.
- [x] **21/08** Xuất PNG cho hai sơ đồ (`mermaid-cli`, không tốn quota model).
      Đây là việc **chặn** bản `.docx`: pandoc không render mermaid nên bản nộp
      sẽ mất trắng cả hai hình. Nối ảnh vào báo cáo và README, kèm đúng lệnh
      dựng lại khi sơ đồ đổi.
      Làm xong mới thấy **sơ đồ 2 cũng đang lệch**: Pha 1 vẫn bắt đầu bằng
      "File PDF" trong khi đường dán ảnh đã có từ sáng. Đã thêm nhánh ảnh và
      đổi tên node cho đúng (`PNG, hoặc JPEG nếu quá 3MB`). Xác minh bằng cách
      render ra SVG rồi tìm chuỗi — không tin mỗi mã thoát 0
- [ ] **23/08** Cập nhật `BAO_CAO_TIEN_DO.md` cuối tuần; gửi 4 câu hỏi mở cho
      mentor nếu chưa gửi
- [x] **Mốc kiểm:** `faithfulness` có số đo thật lần đầu ✓ (1.000, production
      19/08); TTFT có số đo lần đầu ✓ (8155ms — và số đó **không đạt ngưỡng**,
      xem trên); `SKILL` §1 không còn placeholder ✓

**Tuần 4 · 24/08 – 30/08** — trả nợ kĩ thuật, dồn sang tài liệu

> Ghi chú re-baseline 24/08: điều kiện trong ngoặc ở trên đã tự giải quyết. Tôi
> bỏ TXT/DOCX ngày 20/08 vì lí do kĩ thuật, **không chờ mentor trả lời** — nên
> tuần này trống phần "mở rộng định dạng", và phần trống đó đã bị việc của tuần
> 5–7 lấp từ trước.

- [x] **24/08 Re-baseline lộ trình.** Rà lại toàn bộ ô chưa tick và thấy phần
      lớn mô tả **việc đã làm xong**: chương 3, 4, 5 của báo cáo, `SKILL` §5 và
      §6, `SKILL` §2, kiểm sơ đồ khớp code, mốc kiểm tuần 4 và tuần 5. Đây là
      lỗi tự trừ điểm: tiêu chí *"tự lập kế hoạch và hoàn thành đúng cam kết"*
      chấm trên chính file này, mà một ô chưa tick dưới mắt người chấm là một
      việc chưa làm. Đã tick kèm bằng chứng, và giữ nguyên **chưa tick** những
      ô thật sự còn nợ: `CHARS_PER_TOKEN`, eval lần cuối có `--judge` đủ 31 câu,
      `SKILL` §0, GIF demo, kiểm thử với người ngoài, dữ liệu demo, `.docx`,
      slide. Cũng đã sửa hai chỗ bảng còn nói TXT/DOCX là việc sắp làm, trong
      khi nó đã bị bỏ khỏi phạm vi từ 20/08
- [x] **24/08 Dọn corpus, và tự sửa một kết luận sai của chính mình.** Xoá 2
      tài liệu mồ côi (bản trùng `2402.00253v2.pdf` và bản trùng NET Roadmap,
      không khung chat nào trỏ tới) bằng script đọc `storage_path` trước, xoá
      hàng trước, xoá file sau — đúng thứ tự `deleteDocument` đã dùng. Còn lại
      **7 tài liệu, 90 chunk** (từ 9/111). Đo trước/sau thật trên cùng thao
      tác, không suy đoán: `--retrieval-only` lúc 03:36 (9 tài liệu) và 03:39
      (7 tài liệu, ngay sau khi xoá) — `MRR` đi **0.926 → 0.897**, `hit@8` và
      `refusal_rate` không đổi. Soi ra đúng 1/31 câu lệch: `t-008` (câu xuyên
      ngôn ngữ) đổi `mrr` 1.0 → 0.5 vì trang top-1 đổi từ trang 5 (đúng) sang
      trang 2 (sai) — một trong hai bản trùng vừa xoá tình cờ có ranh giới
      chunk xếp đúng trang 5 lên hạng 1, tức **may rủi do trùng lặp**, không
      phải tín hiệu truy hồi thật. Điều này **đảo ngược** kết luận tôi viết
      hôm qua ở bẫy #26 (*"sáu tài liệu nhiễu không kéo tụt truy hồi"*) — kết
      luận đó dựa trên so sánh hai lần chạy khác ngày (12/08 vs 20/08), không
      phải một phép đo trước/sau trên cùng thao tác, và hoá ra sai chiều. Đã
      thêm bẫy #27 sửa lại, và cập nhật `corpus_note` trong
      `eval_dataset.json`. Bài học: **so sánh gián tiếp không thay được đo
      trực tiếp**, kể cả khi cả hai vế đều là số thật
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
- [x] **26–28/08 → giải quyết bằng cách bỏ, ngày 20/08.** Không nạp TXT/DOCX.
      Đây là một quyết định đã chốt, không phải việc còn treo: cả hai định dạng
      **không có số trang**, nên nhận chúng là phải đổi đơn vị trích dẫn — chính
      lời hứa trung tâm của sản phẩm — và chúng **không đi qua đường vision**,
      tức không chạm phần lõi của đồ án. Lí do đầy đủ ở mục ngày 20/08; đã ghi
      vào mục "Không làm" của `REQUIREMENTS.md` để bảo vệ khi phản biện.
      Thay vào đó tuần 3 nhận thêm một đường nạp **có** đi qua vision: dán ảnh
      vào ô chat (mục ngày 21/08)
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
- [x] **30/08 (làm sớm)** `SKILL` §2 — đủ 8 bước, không còn chỗ trống. Kiểm
      lại 24/08: 8 tiêu đề "Bước N" từ *Spike trước, kiến trúc sau* tới *Đo, rồi
      mới sửa*, và §2 là mục dài nhất file
- [x] **Mốc kiểm — đạt trước hạn:** health check tự chạy (`.github/workflows/
      health.yml`, thứ Hai và thứ Năm) ✓; xoá tài liệu không để lại rác ✓
      (`deleteDocument`, 5 test) ✓; `BAO_CAO_TIEN_DO.md` cập nhật ✓ (24/08)

**Tuần 5 · 31/08 – 06/09** — báo cáo chương 1–2
- [x] **(làm sớm 19/08)** `docs/BAO_CAO.md` Chương 1 và Chương 2 viết xong.
      Dựng chương 2 buộc phải đối chiếu 2 sơ đồ với code, và **cả hai đều đã
      lệch**: sơ đồ 1 thiếu hẳn ba bảng của migration 007
      (`conversations`, `conversation_documents`, `messages`) và route
      `/api/health`; sơ đồ 2 thiếu bước kiểm tra khung chat đã có tài liệu chưa
      (trả `needs_document` **trước khi** gọi model) và thiếu nguồn lịch sử 3
      lượt. Đã cập nhật cả hai. ~~Việc còn lại: xuất PNG cho 2 sơ đồ~~ —
      **xong 21/08**: `mermaid-cli` dựng `01-high-level.png` và
      `02-rag-pipeline.png`, nhúng vào báo cáo cạnh khối mermaid. Chính lần xuất
      đó lộ ra sơ đồ 2 **lại lệch lần nữa** — Pha 1 vẫn mở đầu bằng "File PDF"
      sau khi đường dán ảnh đã lên. Bài học: sơ đồ lệch **hai lần trong ba
      ngày**, và cả hai lần đều chỉ lộ khi có việc buộc phải nhìn kĩ nó.
      *(Mục gốc giữ lại bên dưới để đối chiếu:)*
- [ ] ~~`docs/BAO_CAO.md` Chương 1~~ — Tổng quan, dựng từ `README.md` +
      `REQUIREMENTS.md` §1–2
- [ ] ~~Chương 2~~ — Phân tích & Thiết kế, dựng từ `REQUIREMENTS.md` §3–6 + 2 sơ đồ
- [ ] ~~Kiểm tra 2 sơ đồ kiến trúc còn khớp route/bảng thật trong code~~, sửa nếu
      lệch
- [x] Cuối tuần: cập nhật `BAO_CAO_TIEN_DO.md` — làm đều từ 19/08, lần gần
      nhất 24/08
- [x] **Mốc kiểm — vượt:** sản phẩm ổn định trên Vercel ✓; đủ 4 chỉ số eval ✓
      (`faithfulness` 1.000 trên 26 câu, 19/08 — chỉ số cuối cùng còn thiếu);
      ~~xong 2/5 chương~~ → **5/5 chương**

### Giai đoạn 3 — Hoàn thiện (Tuần 6–7)

**Tuần 6 · 07/09 – 13/09** — báo cáo chương 3–4, người dùng thật
- [x] **(làm sớm 20/08)** Chương 3 (11 mục) và chương 4 (8 mục) viết xong.
      Chương 4 giữ đúng nguyên tắc đã đặt: mỗi con số ghi kèm chế độ chạy và cỡ
      mẫu, và có hẳn một mục §4.5 *"Ba con số trông như kết quả mà không phải"*.
      *(Mục gốc giữ lại bên dưới để đối chiếu:)*
- [ ] ~~Chương 3~~ — Triển khai kỹ thuật (nguyên liệu: `SKILL` §2 và §3)
- [ ] ~~Chương 4~~ — Kết quả đánh giá. Một bảng duy nhất, ghi rõ chế độ chạy và cỡ
      mẫu cho từng con số — theo nguyên tắc đã dùng ở `BAO_CAO_TIEN_DO.md` §3
- [ ] Kiểm thử với ít nhất 2 người ngoài: chuẩn bị kịch bản trước, ngồi cạnh
      quan sát, ghi lại chỗ họ vấp trước khi sửa
- [ ] Rà UI theo phản hồi thu được: thông báo lỗi, trạng thái rỗng, giao diện
      điện thoại
- [ ] **Mốc kiểm:** có ghi chép phản hồi thật từ ≥ 2 người ngoài; UI đã sửa
      theo đó; 4/5 chương có bản nháp

**Tuần 7 · 14/09 – 20/09** — chốt số, chốt sản phẩm
- [x] Chạy eval lần cuối trên production, đủ 4 chỉ số (kể cả `faithfulness`)
      — đây là bộ số chốt dùng cho báo cáo và demo.
      **Cảnh báo ngân sách, tính lại 24/08:** 31 câu × 2 request sinh + tối đa
      31 lượt chấm = **93 request**, trong khi trần cả chain chỉ ~80/ngày. Chạy
      thẳng sẽ cạn quota giữa chừng. Cách vừa: bỏ nhóm `hard_negative` khỏi lượt
      chấm (câu trả lời của chúng là lời từ chối, mà prompt của người chấm cho
      từ chối điểm tuyệt đối — chấm chúng là phí quota) → 26 câu = 78 request.
      **Chạy đúng như vậy 26/08 14:20**, sau khi sửa xong bẫy #30:
      `faithfulness` **1.000** (xem mục 26/08 ở trên) — số chốt dùng cho
      `REQUIREMENTS.md` §7 và `SKILL` §0
- [x] **(làm sớm 21/08)** Chương 5 — Kết luận, 5 mục, trả lời từng lời hứa của
      chương 1 bằng số đo và ghi thẳng mục **chưa đạt**
- [x] **(làm sớm 21/08)** `SKILL` §5 (nếu làm lại) và §6 (checklist tái sử dụng)
- [x] `SKILL` §0 (tóm tắt) — điền 26/08 ngay sau khi có số `faithfulness`
      chốt ở trên
- [x] **26/08** GIF demo vào `README.md` (danh sách nguồn tài liệu đã có sẵn
      từ trước). Quay bằng ScreenToGif — mở lại đúng các hội thoại cũ thay vì
      hỏi câu mới nên 0 quota. Bản xuất đầu 7.78MB, nặng cho README; thử giảm
      màu **riêng từng khung hình** thì dung lượng **tăng lên** 12–19MB thay vì
      giảm — vì UI phần lớn là mảng màu tĩnh, GIF nén hiệu quả bằng cách chỉ
      lưu phần khác biệt giữa các khung liền nhau, mà lượng tử hoá riêng từng
      khung làm mỗi khung nhiễu khác nhau một chút, phá mất kiểu nén đó. Sửa
      bằng cách dùng **một bảng màu chung** cho mọi khung hình: còn 4.02MB,
      1100×521 (từ 1840×871). Kiểm bằng mắt hai khung đầu/cuối, chữ và trích
      dẫn `[1]` vẫn nét
- [ ] Kiểm tra ứng dụng chạy 24/7 (đối chiếu log Action hàng tuần) — *phần đo
      latency đã xong 19–21/08: `median_ttft_ms` 8592 (đạt < 10s),
      `p90_ttft_ms` 15879 (**chưa đạt** < 15s), `n_timeout` 0*
- [ ] Chuẩn bị dữ liệu demo cố định (không ingest live khi demo) + kịch bản
      trình bày
- [ ] **Mốc kiểm:** số liệu eval là số cuối cùng, không đổi thêm; 5/5 chương
      có bản nháp; README có GIF

### Giai đoạn 4 — Đóng gói & Demo (Tuần 8)

**Tuần 8 · 21/09 – 27/09**
- [ ] Xuất `BAO_CAO.md` sang `.docx` để nộp, canh lại mục lục và hình bảng.
      **Chặn đã gỡ 24/08** — pandoc 3.10.2 đã cài, chạy thử ra file 308KB:
      mục lục dựng được, 28 bảng giữ nguyên, cả hai PNG sơ đồ nhúng đúng.
      **Một việc phải xử lí trước khi nộp:** báo cáo giữ **cả** khối mermaid
      **lẫn** ảnh PNG — trên GitHub khối mermaid render thành hình, nhưng
      pandoc chép nguyên mã nguồn mermaid vào `.docx`, nên người đọc thấy hình
      rồi thấy thêm một mảng code ngay dưới. Cách xử lí: lọc bỏ khối
      `mermaid` khi xuất (lua filter hoặc một bước tiền xử lí), giữ nguyên file
      gốc để GitHub vẫn render. Lệnh đã chạy thử:
      `pandoc BAO_CAO.md -o BAO_CAO.docx --toc --toc-depth=2 --resource-path=.`
- [x] **(làm sớm 24/08)** Rà `SKILL_MY_PROJECT.md`, xoá các dòng hướng dẫn
      trong ngoặc. Bỏ 4 dòng `*(` nằm **trên phần đã viết đầy đủ** (§1 bước 5,
      §4, §5, §6) cộng đoạn "cách dùng file này" ở đầu. Việc này không chỉ là
      hình thức: dòng *"(Viết ở tuần 8...)"* đứng ngay trên §5 và §6 đã hoàn
      chỉnh khiến người đọc lướt tưởng bốn mục đó còn trống. Giữ lại đúng một
      dòng — §0, vì §0 trống thật
- [x] **(làm sớm 24/08)** Tag `v1.0.0-mvp`, tag chú thích, đặt ở commit
      re-baseline này. Tag đánh dấu **thời điểm phần sản phẩm hoàn chỉnh**:
      mọi việc còn lại là bằng chứng và trình bày, không phải tính năng
- [x] **(làm sớm 25/08)** Tạo **Release** trên GitHub từ tag `v1.0.0-mvp`.
      Cài `gh` xong, xác nhận qua `gh release view v1.0.0-mvp`: `draft: false`,
      đã publish, nội dung khớp đúng mô tả trong tag (kể cả dòng `p90` chưa
      đạt — không lược bớt)
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
| 1.4 Hai sơ đồ kiến trúc | Xong | `docs/architecture/*.mmd` + `*.png` (xuất 21/08) |
| 1.5 Khung `SKILL_MY_PROJECT.md` | **Xong** | §0–§6 viết đủ; §0 điền 26/08 sau khi có số `faithfulness` thật |
| 2.1 Đọc PDF/DOCX/TXT | **Xong cả ba, cộng ảnh dán** | PDF+ảnh qua vision; DOCX/TXT qua trích văn bản thuần + đánh trang giả (25/08, đảo quyết định 20/08) |
| 2.2 Vector DB + chunking | Xong | Supabase pgvector, HNSW, 768 chiều |
| 2.3 Retriever + grounding prompt | Xong | Hybrid 3 nhánh RRF, trích dẫn số trang |
| 2.4 Guardrail + eval 15–20 câu | Xong | `guardrail.ts`; bộ eval **31 câu**, 7 nhóm |
| 3.1 Web UI có stream + trích dẫn | Xong | Next.js, KaTeX, panel nguồn |
| 3.2 Deploy Vercel | Xong | docubo.vercel.app, region `sin1` |
| 3.3 CI/CD | Xong | `.github/workflows/ci.yml`, 2 job, chạy trên mỗi push vào `main` |
| 4.1 Báo cáo 5 chương | **5/5 chương có bản đầy đủ** | `docs/BAO_CAO.md`, ~11.3k từ. Còn: xuất `.docx` |
| 4.2 README + tag `v1.0.0-mvp` | **Xong** | Tag 24/08, Release 25/08, GIF demo 26/08 |
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
