# Docubo

Trợ lí hỏi đáp tài liệu chuyên ngành **song ngữ Việt – Anh**, đọc được công thức
toán và biểu đồ, mọi câu trả lời đều trích dẫn số trang nguồn.

> Đồ án cuối kì thực tập AI Engineer. Toàn bộ hạ tầng chạy trên free tier,
> chi phí 0 đồng.

**Live demo:** *(điền link `.vercel.app` ở tuần 7)*

![demo](docs/demo.gif) *(thêm ở tuần 8)*

---

## Vấn đề

Thư viện parse PDF thông thường phá huỷ đúng phần khó nhất của tài liệu kĩ
thuật. Công thức toán là các glyph đặt theo toạ độ, trích ra thành chuỗi rác;
biểu đồ trích ra thành chuỗi rỗng. Một hệ RAG dựng trên nền đó sẽ trả lời tự
tin về những nội dung nó chưa từng đọc được.

## Cách giải

**Ingest bằng vision.** Mỗi trang được render thành ảnh rồi đưa qua Gemini để
lấy Markdown + LaTeX + mô tả biểu đồ, thay vì parse lớp text.

**Mỗi chunk mang hai biểu diễn.** `embed_text` là văn xuôi thuần — công thức đã
diễn giải thành lời, biểu đồ đã mô tả thành lời — dùng để tìm kiếm.
`display_text` giữ nguyên LaTeX, dùng để hiển thị và làm context cho LLM. Chuỗi
LaTeX thô embed ra vector gần như vô nghĩa nên không thể tìm trực tiếp.

**Truy hồi hybrid ba nhánh.** Vector đa ngữ bắt được ngữ nghĩa xuyên ngôn ngữ,
nhưng full-text thì không: Postgres có từ điển tiếng Anh mà không có tiếng Việt.
Hệ thống giữ hai cột `tsvector` riêng, sinh biến thể truy vấn cho cả hai ngôn
ngữ trong cùng một lần gọi model, rồi hợp nhất ba danh sách bằng RRF.

## Kiến trúc

- [Sơ đồ tổng quan hệ thống](docs/architecture/01-high-level.mmd)
- [Sơ đồ luồng RAG pipeline](docs/architecture/02-rag-pipeline.mmd)

| Thành phần | Công nghệ |
|---|---|
| Frontend & API | Next.js 15 trên Vercel Hobby |
| LLM | Gemini Flash (vision, phân tích truy vấn, sinh câu trả lời) |
| Embedding | Gemini Embedding, 768 chiều |
| Vector DB | Supabase Postgres + pgvector, index HNSW |
| Ingest | Python + PyMuPDF, chạy offline |
| CI | GitHub Actions — lint, typecheck, build |

## Cấu trúc thư mục

```
db/              schema SQL và RPC hybrid_search
docs/            kế hoạch, requirements, sơ đồ, SKILL_MY_PROJECT
ingest/          pipeline Python: render -> vision -> cache -> chunk -> embed -> store
eval/            bộ câu hỏi đánh giá, metrics, harness
src/             ứng dụng Next.js (UI + /api/chat)
data/            PDF nguồn, ảnh trang, cache JSON — gitignored
```

## Chạy tại máy

**1. Chuẩn bị khoá**

```bash
cp .env.example .env
```

Điền `GEMINI_API_KEY` (lấy ở [aistudio.google.com](https://aistudio.google.com)),
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

**2. Dựng cơ sở dữ liệu**

Chạy `db/001_schema.sql` rồi `db/002_hybrid_search.sql` trong Supabase SQL editor.

**3. Cài phụ thuộc**

```bash
pip install -r ingest/requirements.txt
```

```bash
npm install
```

**4. Kiểm tra model đọc được tài liệu của bạn**

```bash
python -m ingest.main spike data/raw/tai-lieu.pdf --pages 12,31,44
```

Đọc kết quả bằng mắt trước khi ingest cả tài liệu. Nếu công thức sai, tăng
`RENDER_DPI` trong `ingest/config.py` rồi chạy lại.

**5. Nạp tài liệu**

```bash
python -m ingest.main all data/raw/tai-lieu.pdf --title "Tên tài liệu"
```

Giai đoạn vision cache từng trang ra `data/cache/`. Lần chạy sau chỉ xử lí
trang chưa có cache, nên chỉnh chunker hay đổi embedding model không tốn thêm
quota vision.

**6. Chạy web**

```bash
npm run dev
```

## Đánh giá

```bash
python -m eval.run_eval --retrieval-only
```

Bốn chỉ số, mỗi cái trả lời một câu hỏi khác nhau:

| Chỉ số | Đo cái gì |
|---|---|
| `retrieval_hit_at_8` | Trang đúng có được truy hồi không — tách riêng retriever khỏi generator |
| `citation_validity` | Marker `[n]` có trỏ đúng block được cấp không |
| `faithfulness` | Mọi khẳng định có nằm trong context không |
| `refusal_rate` | Có từ chối đúng lúc khi tài liệu không chứa câu trả lời không |

## Giới hạn đã biết

- Chỉ hỗ trợ PDF. DOCX/TXT nằm ở P1.
- Không OCR tài liệu scan.
- Full-text tiếng Việt dùng config `simple`, không stem được.
- Ingest chạy tay ở máy cá nhân, không có giao diện upload.

## Nguồn tài liệu

*(Liệt kê tài liệu đã nạp kèm giấy phép. File PDF gốc không được commit.)*
