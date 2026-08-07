# REQUIREMENTS — Docubo

> Task 1.3. Bản nháp này đã điền sẵn phần thống nhất được ở tuần 1. Các mục
> đánh dấu `TODO` cần bạn tự quyết sau khi chạy spike và chốt bộ tài liệu.

## 1. Bài toán

Người học tài liệu kĩ thuật (giáo trình, paper, tài liệu nội bộ) phải tự đọc và
tự tìm lại thông tin trong hàng trăm trang PDF. Công cụ tìm kiếm thông thường
thất bại ở đúng phần khó nhất: công thức toán và biểu đồ không nằm trong lớp
text của PDF, nên không tìm được.

Docubo là trợ lí hỏi đáp trên bộ tài liệu đó, trả lời có trích dẫn số trang,
đọc được cả công thức lẫn biểu đồ, và hoạt động với tài liệu tiếng Việt lẫn
tiếng Anh.

## 2. Người dùng

| Nhóm | Nhu cầu | Ngôn ngữ hỏi |
|---|---|---|
| Sinh viên / người tự học | Tra cứu khái niệm, hiểu công thức | Tiếng Việt |
| Kĩ sư đọc paper | Tìm nhanh định nghĩa, so sánh phương pháp | Cả hai |

Giả định quan trọng: **người dùng thường hỏi tiếng Việt trên tài liệu tiếng
Anh.** Đây là ca chính, không phải ca biên — nó quyết định thiết kế truy hồi.

## 3. Phạm vi tính năng

### P0 — bắt buộc, xong trước hết tuần 5

- [ ] Nạp tài liệu PDF, cả tiếng Việt và tiếng Anh
- [ ] Trích xuất nội dung bằng vision: văn bản, công thức LaTeX, mô tả biểu đồ
- [ ] Chunk mang hai biểu diễn (`embed_text` / `display_text`)
- [ ] Truy hồi hybrid: vector + full-text hai ngôn ngữ, hợp nhất bằng RRF
- [ ] Trả lời có trích dẫn tới số trang, mọi câu đều có marker `[n]`
- [ ] Từ chối trả lời khi điểm truy hồi dưới ngưỡng
- [ ] Chặn prompt injection ở đầu vào
- [ ] Hiển thị công thức bằng KaTeX, phản hồi dạng stream
- [ ] Trả lời đúng ngôn ngữ người dùng hỏi
- [ ] Bộ eval 20-25 câu, báo cáo 4 chỉ số

### P1 — làm nếu còn thời gian

- [ ] Trích dẫn mở ra ảnh trang gốc
- [ ] Rerank top-20 xuống top-5 bằng Gemini
- [ ] Nạp DOCX / TXT
- [ ] Chọn lọc theo tài liệu (`filter_documents` đã có sẵn trong RPC)
- [ ] Lịch sử hội thoại nhiều lượt

### Không làm — ghi rõ để bảo vệ khi phản biện

| Bỏ | Lí do |
|---|---|
| OCR tài liệu scan | Chất lượng phụ thuộc bản scan, không kiểm soát được, không thêm điểm rubric nào |
| Công thức nhúng OMML trong DOCX | Định dạng phức tạp, chi phí cao, PDF đã phủ hết ca dùng thật |
| Fine-tuning | Không có ngân sách, và RAG đã giải quyết bài toán |
| Agent / multi-hop | Vượt phạm vi MVP 8 tuần |
| Đăng nhập, phân quyền | Không nằm trong tiêu chí chấm |

## 4. Luồng chính (Happy Path)

1. Người dùng nhập câu hỏi tiếng Việt vào ô chat
2. `/api/chat` gọi Gemini một lần: kiểm tra an toàn + nhận diện ngôn ngữ +
   sinh `query_en` / `query_vi` / `keywords`
3. Embed câu hỏi gốc với `task_type=RETRIEVAL_QUERY`
4. Gọi RPC `hybrid_search`: ba nhánh (dense, fts_en, fts_vi), hợp nhất RRF,
   trả về 8 chunk
5. Kiểm tra `cosine_sim` của chunk đầu so với ngưỡng `MIN_COSINE`
6. Dựng grounding prompt với 8 context block, stream câu trả lời về client
7. Client render markdown + KaTeX, panel nguồn hiện số trang
8. Ghi `query_log`

## 5. Trường hợp ngoại lệ (Edge Cases)

| # | Tình huống | Xử lí | Đã có ở đâu |
|---|---|---|---|
| E1 | Câu hỏi ngoài phạm vi tài liệu | Từ chối, gợi ý hỏi lại | `isUngrounded()` |
| E2 | Prompt injection trong câu hỏi | Chặn trước khi truy hồi | `guardrail.ts` |
| E3 | Prompt injection **nằm trong tài liệu** | System prompt coi context là dữ liệu | `prompt.ts` mục Safety |
| E4 | Hỏi tiếng Việt, nguồn tiếng Anh | Sinh `query_en` cho nhánh lexical | `guardrail.ts` |
| E5 | Trang vision đọc lỗi schema | Lưu `.raw.txt`, bỏ qua trang, không dừng cả tài liệu | `main.py cmd_vision` |
| E6 | Chạm rate limit Gemini | Sliding-window limiter + backoff | `ratelimit.py` |
| E7 | Trang bìa / mục lục / tài liệu tham khảo | `is_boilerplate`, chunker bỏ qua | `chunk.py` |
| E8 | Công thức bị cắt khỏi đoạn giải thích | Block "attachment" dính vào block trước | `chunk.py _blocks` |
| E9 | Câu hỏi quá dài | Chặn ở `MAX_CHARS`, không tốn quota | `guardrail.ts` |
| E10 | Supabase / Gemini lỗi | Trả JSON lỗi, UI hiện thông báo, không treo | TODO tuần 6 |
| E11 | Nạp lại tài liệu đã có | So `content_hash`, `replace_chunks` xoá bản cũ | `store.py` |
| E12 | Câu trả lời trích dẫn block không tồn tại | Đo bằng `citation_validity` trong eval | `metrics.py` |

## 6. Ràng buộc phi chức năng

| Tiêu chí | Mục tiêu | Ghi chú |
|---|---|---|
| Chi phí | 0 đồng | Ràng buộc cứng của đề bài |
| Thời gian phản hồi | Token đầu tiên < 3s | Vercel Hobby giới hạn thời lượng hàm |
| Kích thước corpus | TODO — chốt sau khi biết tài liệu | Supabase free 500MB |
| Quota ingest | TODO — tính số trang × 1 request | Kiểm tra RPD hiện hành ở AI Studio |

## 7. Chỉ số nghiệm thu

Hệ thống coi là đạt khi trên `eval/eval_dataset.json`:

| Chỉ số | Ngưỡng đề xuất | TODO |
|---|---|---|
| `retrieval_hit_at_8` | ≥ 0.85 | Chốt lại sau lần chạy eval đầu |
| `citation_validity` | ≥ 0.95 | Trích dẫn sai là lỗi nghiêm trọng nhất |
| `faithfulness` | ≥ 0.90 | |
| `refusal_rate` | ≥ 0.90 | Trên nhóm `should_refuse` |
| `latex_exact_match` | TODO | Chỉ đo được nếu dùng nguồn có `.tex` |

## 8. Câu hỏi còn mở

- [ ] Bộ tài liệu cuối cùng gồm những gì, bao nhiêu trang
- [ ] Ngưỡng `MIN_COSINE` thực tế (hiện đặt tạm 0.35)
- [ ] `CHARS_PER_TOKEN` cho tiếng Việt — hiệu chỉnh bằng `countTokens` ở tuần 3
- [ ] Có nạp ảnh trang lên Supabase Storage không, hay chỉ giữ local
