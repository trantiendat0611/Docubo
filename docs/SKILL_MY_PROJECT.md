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
| 1 | | | |
| 2 | | | |

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
