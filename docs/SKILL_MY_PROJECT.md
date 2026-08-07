# SKILL_MY_PROJECT — Quy trình xây dựng một AI Engine RAG song ngữ

> Task 1.5 + Task 4.2. Đây là tài liệu **tự đúc kết**, không phải tài liệu mô tả
> sản phẩm. Người đọc mục tiêu: một bạn thực tập khác, đọc xong phải làm lại
> được mà không cần hỏi bạn.
>
> **Cách dùng file này:** viết dần từ tuần 3, mỗi lần gỡ được một vấn đề thì ghi
> ngay vào mục tương ứng. Ghi cả cái đã thử mà hỏng — phần "hỏng" mới là phần
> người đọc học được nhiều nhất, và cũng là phần mentor hỏi khi phản biện.
>
> Xoá hết các dòng trích dẫn hướng dẫn này trước khi nộp.

---

## 0. Tóm tắt

*(Viết cuối cùng, ở tuần 8. 5-7 câu: bài toán, cách giải, kết quả đo được.)*

---

## 1. Chọn kiến trúc

### 1.1 Vấn đề buộc phải rời bỏ RAG chuẩn

*(Ghi lại: bạn thử `pypdf`/`pdfplumber` trên trang công thức và nhận được gì.
Dán output thật vào đây — đây là bằng chứng mạnh nhất cho quyết định kiến trúc,
và cũng là slide đắt giá nhất trong buổi demo.)*

```
TODO: dán output rác của pypdf trên một trang công thức
TODO: dán output của pipeline vision trên đúng trang đó
```

### 1.2 Vì sao mỗi chunk cần hai biểu diễn

*(Giải thích bằng ví dụ thật: một công thức, vector của LaTeX thô, vector của
bản diễn giải, và điểm cosine với cùng một câu hỏi.)*

### 1.3 Vì sao truy hồi song ngữ cần ba nhánh

*(Postgres không có từ điển tiếng Việt. Ghi lại thí nghiệm: cùng một câu hỏi
tiếng Việt trên tài liệu tiếng Anh, kết quả khi có và không có `query_en`.)*

---

## 2. Quy trình xây dựng — làm lại theo thứ tự này

### Bước 1 — Spike trước, kiến trúc sau
*(Vì sao: nếu model không đọc nổi tài liệu của bạn thì mọi thiết kế phía sau là
vô nghĩa. Ghi lại bạn đã chọn trang nào để spike và vì sao.)*

### Bước 2 — Cache trước khi gọi API lần thứ hai
*(Ghi lại: bạn đã chỉnh prompt ingest bao nhiêu lần? Nếu không có cache thì mỗi
lần chỉnh tốn bao nhiêu request?)*

### Bước 3 — Prompt trích xuất
*(Ghi lại các phiên bản prompt. Câu nào thêm vào thì sửa được lỗi gì. Ví dụ:
thêm "never invent" giảm bao nhiêu ca bịa nội dung ở vùng mờ.)*

### Bước 4 — Chunking
*(Ghi lại: kích thước nào thử, hỏng ra sao. Đặc biệt là ca công thức bị cắt rời
khỏi đoạn giải thích.)*

### Bước 5 — Schema và index
*(Ghi lại: vì sao 768 chiều, vì sao HNSW, vì sao hai cột tsvector.)*

### Bước 6 — Grounding prompt
*(Ghi lại các phiên bản. Câu nào làm model ngừng bịa. Câu nào làm nó từ chối
quá đà.)*

### Bước 7 — Hiệu chỉnh ngưỡng từ chối
*(Ghi lại quá trình dò `MIN_COSINE`: giá trị nào cho refusal_rate bao nhiêu,
đánh đổi với hit rate ra sao. Kèm bảng.)*

### Bước 8 — Đo, rồi mới sửa
*(Ghi lại: chỉ số nào chỉ ra vấn đề gì. Ví dụ hit_at_8 cao nhưng faithfulness
thấp nghĩa là lỗi ở prompt chứ không ở retriever.)*

---

## 3. Những cái bẫy đã dính

*(Mục quan trọng nhất của file. Mỗi mục: triệu chứng → nguyên nhân → cách sửa.
Ghi ngay lúc vừa gỡ xong, đừng để đến tuần 8 mới nhớ lại.)*

| # | Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|---|
| 1 | `429 RESOURCE_EXHAUSTED` ngay lần gọi đầu tiên | Đọc kĩ: `limit: 0`, không phải "dùng hết quota" mà là "model không có quota free tier". `gemini-2.0-flash` đã bị rút khỏi free tier | Thêm lệnh `ingest.main models` để liệt kê model gọi được; đổi `GEMINI_VISION_MODEL` trong `.env` |
| 2 | Trang công thức báo `SCHEMA FAILURE` dù nội dung đọc ra đúng | Model xuất `\prod` một backslash trong JSON. `\p` không phải escape hợp lệ → `json.loads` chết. Ngay dòng dưới nó lại viết đúng `\\frac` | Dùng `response_schema=PageExtraction` để ép JSON đúng chuẩn ở backend. Thêm `_repair_escapes` làm lớp vá dự phòng |
| 3 | Trang trả về **rỗng**, không lỗi gì | `finish_reason=RECITATION` — model từ chối transcribe nội dung nó nhận ra là văn bản đã xuất bản. Tất định: temperature 0/0.3/0.6/0.9 đều bị; 3.6-flash và 3.5-flash-lite cũng bị | Chuỗi fallback sang model thế hệ khác (`gemini-2.5-flash` qua được). Ghi `extracted_by` để đếm được tỉ lệ phải dùng fallback |
| 4 | Một chunk to gấp mấy lần budget | Model fallback trả markdown dính liền, không có dòng trống. `_blocks` tách theo dòng trống nên cả trang thành một block, mà block đơn lẻ thì không bao giờ bị chia | `_split_oversized` cắt theo ranh giới câu khi một block vượt `MAX_TOKENS` |

**Bài học chung của cả bốn:** thông báo lỗi mặc định đều vô dụng — 40 dòng traceback, hoặc chuỗi rỗng không kèm lí do. Thời gian bỏ ra viết `apierrors.explain()` và phân loại `failure` thành `recitation`/`schema` được hoàn vốn ngay trong buổi đầu tiên.

**Bài học về spike:** cả bốn lỗi trên đều lộ ra khi chạy 6 trang. Nếu chạy thẳng `all` trên tài liệu 300 trang thì lỗi 1 đốt quota vô ích, lỗi 3 âm thầm mất trang mà không ai biết.

Một số bẫy đã biết trước khi bắt đầu, xác nhận lại khi gặp:

- `task_type` của embedding: chunk dùng `RETRIEVAL_DOCUMENT`, câu hỏi dùng
  `RETRIEVAL_QUERY`. Sai không báo lỗi, chỉ âm thầm giảm chất lượng.
- Số chiều vector khoá cứng với cột `vector(768)`. Đổi model là re-embed hết.
- `to_tsvector('english')` áp lên tiếng Việt sẽ stem sai.
- Ước lượng token theo ký tự phải khác nhau giữa hai ngôn ngữ.
- Chunk cũ không bị xoá khi re-index sẽ âm thầm đầu độc truy hồi.

---

## 4. Số liệu

*(Bảng tiến triển qua các lần chạy eval. Đây là chương 4 của báo cáo.)*

| Lần chạy | Ngày | Thay đổi | hit@8 | citation | faithful | refusal |
|---|---|---|---|---|---|---|
| 1 | | baseline | | | | |
| 2 | | | | | | |

---

## 5. Nếu làm lại

*(Viết ở tuần 8. Cái gì giữ, cái gì làm khác, cái gì bỏ hẳn.)*

---

## 6. Checklist tái sử dụng

*(Rút gọn toàn bộ file thành một checklist người khác làm theo được.)*

- [ ] Spike model trên 3 trang khó nhất trước khi viết dòng code nào
- [ ] Cache mọi response tốn tiền ra đĩa, khoá theo đơn vị nhỏ nhất
- [ ] Viết bộ eval trước khi tối ưu
- [ ] …
