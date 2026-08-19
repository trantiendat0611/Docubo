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

Trang thử: `data/raw/testta1.pdf` trang 44 — hai công thức tích, chỉ số chồng,
một phân số. Cùng một trang chạy qua ba đường: `pypdf 6.15.0`,
`pymupdf 1.28.2`, và pipeline vision (`gemini-3.5-flash`).

**Đường text layer — `pypdf.extract_text()`:**

```
Probabilistic graphical models
Graph theory and Probability theory
 A directed graphical model
consists of a collection of prob.
distributions that factorize as
(pak = set of parent nodes of xk):
𝑝 𝑥1, … , 𝑥𝑚 =  𝑝 (𝑥𝑘|pa𝑘)
𝑘=1..𝑚

 A undirected graphical model
consists of a collection of
probability distributions that
factorize as
𝑝 𝑥1, … , 𝑥𝑚 = 1
𝑍  𝜓𝐶 (𝑥𝐶)
𝐶∈𝒞

𝒞 = {maximal cliques of graph},
𝜓𝐶 is the compatibility function.
```

`pymupdf` cho kết quả gần như trùng khít — khác vài khoảng trắng. Đây **không
phải lỗi của một thư viện**, mà là giới hạn của chính lớp text trong PDF.

**Đường vision — cùng trang 44:**

```markdown
- A directed graphical model consists of a collection of prob. distributions
  that factorize as ($\text{pa}_k$ = set of parent nodes of $x_k$):

$$p(x_1, ..., x_m) = \prod_{k=1..m} p(x_k|\text{pa}_k)$$

- A undirected graphical model consists of a collection of probability
  distributions that factorize as

$$p(x_1, ..., x_m) = \frac{1}{Z} \prod_{C \in \mathcal{C}} \psi_C (x_C)$$
```

kèm `plain` cho mỗi công thức — bản diễn giải thành lời, thứ thật sự được embed:

> The joint probability distribution of variables x 1 through x m is equal to
> the product over k from 1 to m of the conditional probability of x k given
> its parent nodes pa k.

**Cái gì bị phá, chính xác:**

| Hiện tượng | Bằng chứng | Hậu quả |
|---|---|---|
| Toán tử ∏ **biến mất hoàn toàn** | `"∏" in text → False` ở cả hai thư viện | `p(x₁…xₘ) = p(xₖ\|paₖ)` — đây là một **phương trình khác**, và là phương trình sai |
| Cận của tích rơi xuống dòng riêng | `𝑘=1..𝑚` nằm sau thân công thức | Thứ tự đọc vỡ; không ghép lại được bằng heuristic |
| Phân số tách làm hai dòng | `= 1` ⏎ `𝑍` | `1/Z` thành "1" và "Z" rời nhau. `"/" in text → False` |
| Chỉ số dưới bị làm phẳng | `pa_k` → `pak`, `X_A` → `XA` | `pak` là một token không tồn tại trong bất kì câu hỏi nào |
| Biến mã bằng Unicode math-italic | `𝑝` = U+1D45D, không phải `p` = U+0070 | Người dùng gõ `p(x)` không khớp `𝑝(𝑥)`. Cả embedding lẫn `tsvector` đều trượt |
| Mũi tên → mất | `"→" in text → False` | "Consider all A, B, C  all cond. independence assertions" |

Điểm đáng sợ nhất không phải chuỗi rác — mà là **văn xuôi vẫn sạch**. Prose
quanh công thức đọc ra hoàn hảo. Một hệ RAG dựng trên đường này trông vẫn chạy
tốt, chỉ âm thầm dạy sai người dùng đúng ở chỗ tài liệu có giá trị nhất.

**Vật chứng thứ hai — trang 31, ba hình, không công thức:**

```
Structured prediction
An umbrella term for machine learning and
regression techniques that involve predicting
structured objects. (liên quan việc đoán nhận các
đối tượng có cấu trúc).
<U+F06E> Examples
<U+F071> Multi-class labeling
...
31
b r e a c
```

Ba hình trên trang: minh hoạ nhận dạng chữ viết tay, phân đoạn point cloud 3D,
và cây phân tích cú pháp. Hai hình sau đóng góp **0 kí tự**. Hình đầu rò ra
`b r e a c` — các glyph rời của chữ "brace" trong ảnh, sai cả thứ tự. Bullet ra
`U+F06E` / `U+F071`, tức Private Use Area (glyph Wingdings) — vô nghĩa với
embedder và làm bẩn chỉ mục full-text.

Vision trên cùng trang trả về ba mô tả dùng được, ví dụ hình thứ ba:

> Input x is the sentence 'The dog chased the cat'. An arrow points to the
> output y, which is a constituency parse tree. The root node is S, which
> splits into NP and VP…

Đó là toàn bộ lí lẽ cho quyết định ingest bằng vision: trang 44 cho **thông tin
sai**, trang 31 cho **không thông tin gì**, và cả hai đều không kèm dấu hiệu
báo lỗi nào.

*(Tái lập: `pypdf` không nằm trong `ingest/requirements.txt` — nó chỉ dùng cho
phép đo này. Cài rời bằng `pip install pypdf` rồi đọc trang 44 và 31 của
`testta1.pdf`.)*

### 1.2 Vì sao mỗi chunk cần hai biểu diễn

*(Giải thích bằng ví dụ thật: một công thức, vector của LaTeX thô, vector của
bản diễn giải, và điểm cosine với cùng một câu hỏi.)*

Khẳng định ban đầu của tôi, viết trong `KE_HOACH_THUC_TAP.md` từ tuần 1:

> *"chuỗi LaTeX embed ra vector gần như vô nghĩa, không câu hỏi nào truy hồi
> được"*

Đó là **suy luận, không phải số đo**. Khi đo thì nó **sai** — và cách nó sai
đáng giá hơn cả việc nó đúng.

**Phép đo.** So `embed_text` (công thức và hình đã thay bằng lời) với
`display_text` (giữ nguyên LaTeX và placeholder) trên **cùng một chunk thật**,
chấm bằng **câu hỏi thật** trong bộ eval. `display_text` chính xác là thứ sẽ
được embed nếu không làm phép thay đó. Công cụ: `eval/why.py dual-real`.

| Câu | Nhóm | `embed_text` | `display_text` | Chênh |
|---|---|---|---|---|
| f-001 | formula | 0.722 | 0.717 | +0.004 |
| f-002 | formula | 0.680 | 0.672 | +0.008 |
| f-003 | formula | 0.677 | 0.660 | +0.018 |
| g-001 | figure | 0.472 | 0.475 | **−0.003** |
| g-002 | figure | 0.570 | 0.539 | +0.031 |

Chênh lệch lớn nhất là **0.031**. Không ca nào một bên vượt ngưỡng còn bên kia
rớt. Với **truy hồi vector**, phép thay gần như không đổi gì.

**Nhưng `embed_text` không chỉ đi vào vector.** Nó còn sinh ra hai cột full-text
`fts_en` và `fts_vi`. Chạy `to_tsvector` trên cùng một công thức, hai dạng:

```
LaTeX  →  'f' 'langl' 'phi' 'rangl' 'w' 'x' 'y'
Lời    →  'defin' 'f' 'featur' 'function' 'inner' 'input' 'label' …
```

`\langle` và `
`\langle` và `\rangle` bị cắt gốc thành **`langl`** và **`rangl`** — hai token
không xuất hiện trong bất kì câu hỏi nào của con người. Phần còn lại là chữ cái
đơn: `f`, `w`, `x`, `y`.

Người dùng hỏi *"inner product được định nghĩa thế nào"* thì bản LaTeX khớp
được **0 token**. Bản diễn giải khớp `inner`, `defin`, `function`.

**Kết luận đã sửa: quyết định thiết kế đúng, nhưng lí do ghi trong tài liệu thì
sai.** Thứ bị LaTeX phá không phải không gian vector — mô hình embedding đa ngữ
xử lí ký hiệu toán tốt hơn tôi tưởng. Thứ bị phá là **chỉ mục toàn văn**, nơi
LaTeX biến thành token rác. Vì hệ thống này truy hồi bằng **ba nhánh**, hỏng một
nhánh là mất một phần ba bằng chứng — và đúng ở nhóm câu hỏi mà nhánh lexical
gánh nhiều nhất, tức câu hỏi xuyên ngôn ngữ.

**Bài học phương pháp, đắt hơn con số.** Phép thử đầu tiên của tôi embed **một
chuỗi công thức trần** và chấm bằng câu hỏi tôi tự viết quanh cấu trúc công
thức. Nó cho chênh lệch 0.023 và tôi suýt kết luận từ đó. Nhưng hệ thống **không
bao giờ embed công thức đơn lẻ** — nó embed cả đoạn. Phép thử phải tái hiện thứ
hệ thống thật sự làm, không phải thứ tiện đo.

Và một lỗi nữa trong chính phép thử: lần chạy thứ hai cho ra số khác hẳn lần đầu
(0.722 → 0.553) dù embedding là tất định. Nguyên nhân: tôi chọn chunk bằng "hàng
đầu tiên phủ trang mong đợi", nên khi mở bộ lọc từ 2 lên 39 ứng viên thì thứ tự
đổi và **chunk đem so bị tráo**. Đã sửa thành chọn chunk phủ nhiều trang nhất,
phá hoà bằng id, và in kèm chunk id để đối chiếu được giữa các lần chạy.

*(Cỡ mẫu: 5 câu hỏi, 2 tài liệu. Đủ để bác bỏ khẳng định "vô nghĩa", chưa đủ để
nói phép thay đáng giá chính xác bao nhiêu.)*

### 1.3 Vì sao truy hồi song ngữ cần ba nhánh

*(Postgres không có từ điển tiếng Việt. Ghi lại thí nghiệm: cùng một câu hỏi
tiếng Việt trên tài liệu tiếng Anh, kết quả khi có và không có `query_en`.)*

Người dùng hỏi tiếng Việt, tài liệu viết tiếng Anh. Ba nhánh truy hồi xử lí ca
này rất khác nhau, và khác vì hai lí do tách biệt:

**Nhánh dense vượt được ngôn ngữ.** `gemini-embedding-001` là model đa ngữ:
"học tăng cường" và "reinforcement learning" nằm gần nhau trong không gian
vector mà không cần dịch.

**Hai nhánh full-text thì không, và không phải vì thiếu từ điển.** Full-text
khớp **token theo mặt chữ**. Câu hỏi tiếng Việt không có token nào trùng với
đoạn văn tiếng Anh, nên `fts_en` trả về rỗng bất kể từ điển tốt đến đâu. Việc
Postgres không có từ điển tiếng Việt là một hạn chế **khác**, độc lập: `fts_vi`
phải dùng config `simple`, không stem được, nên ngay cả khi hỏi tiếng Việt trên
tài liệu tiếng Việt thì nhánh này cũng yếu hơn `fts_en` tương ứng.

Vì thế lần gọi guardrail sinh sẵn cả `query_en` lẫn `query_vi` trong **cùng một
request** đã phải gọi để kiểm tra an toàn và nhận diện ngôn ngữ — nhánh thứ ba
không tốn thêm lượt gọi model nào.

**Đo tổng hợp.** So `dense-only` với `hybrid` trên cùng 26 câu, cùng corpus:

| Chế độ | `hit_cross_lingual` | Câu trượt |
|---|---|---|
| `dense-only` | 0.833 | `t-005` |
| `hybrid` (3 nhánh) | **1.000** | — |

Report: `eval-dense-only-20260811-100153.json` và
`eval-retrieval-20260812-015933.json`.

Chênh 16.7 điểm phần trăm nghe như một hiệu ứng đo được. Nó không phải. Bộ eval
có 8 câu xuyên ngôn ngữ, 2 câu thuộc nhóm overview không tính điểm truy hồi, còn
**6 câu**. `0.833` chính là `5/6`. Toàn bộ khoảng cách giữa hai chế độ là **một
câu duy nhất**, và độ phân giải của phép đo này là ±1 câu ≈ 16.7 điểm. Con số
không đo được "nhánh lexical đáng bao nhiêu", nó chỉ nói **có tồn tại ca mà
nhánh dense một mình không đủ**.

**Ca đó là câu nào.** Chạy `eval.why bilingual` — cùng một vector câu hỏi tiếng
Việt cho cả hai lần, chỉ đổi chuỗi đưa vào hai nhánh full-text, nên mọi thay đổi
thứ hạng đều thuộc về chúng:

| Câu | Câu hỏi | Có `query_en` | Chỉ tiếng Việt |
|---|---|---|---|
| `t-005` | "Học tăng cường quan tâm đến điều gì?" | **hạng 1** | **không có trong top-8** |
| `t-009` | "Ba mục tiêu chính của AI được nêu là gì?" | hạng 1 | hạng 1 |
| `f-002` | (công thức, phân tách xác suất đồng thời) | hạng 1 | hạng 1 |

Câu quyết định chỉ số tổng hợp và câu duy nhất đổi thứ hạng trong phép thử là
**cùng một câu**. Hai phép đo độc lập chỉ vào đúng một chỗ.

**Vì sao lại là `t-005`.** Đọc câu hỏi thì thấy: *"quan tâm đến điều gì"* gần
như không mang nội dung — bỏ nó đi thì còn mỗi "học tăng cường". Vector của một
câu hỏi mơ hồ nằm lưng chừng giữa nhiều đoạn, không đủ gần đoạn nào. Biến thể
`what is reinforcement learning objective` đưa cho `fts_en` đúng thuật ngữ gốc
"reinforcement learning" — một cụm khớp mặt chữ, không cần hiểu gì. Hai câu còn
lại giàu danh từ riêng ("AI", ba mục tiêu liệt kê được; công thức có định danh),
nhánh dense tự lo xong.

Quy tắc rút ra: **nhánh lexical không phải thứ làm cho truy hồi xuyên ngôn ngữ
chạy được — nhánh dense làm việc đó.** Nó là lưới an toàn cho đúng nhóm câu mà
dense yếu nhất: câu hỏi mơ hồ mà đáp án nằm dưới một thuật ngữ kĩ thuật có tên
riêng.

*(Cỡ mẫu: 6 câu xuyên ngôn ngữ tính điểm, 2 tài liệu. Đủ để chứng minh nhánh
lexical có ca không thay thế được; không đủ để nói tỉ lệ 1/6 là con số ổn định.)*

---

## 2. Quy trình xây dựng — làm lại theo thứ tự này

### Bước 1 — Spike trước, kiến trúc sau
*(Vì sao: nếu model không đọc nổi tài liệu của bạn thì mọi thiết kế phía sau là
vô nghĩa. Ghi lại bạn đã chọn trang nào để spike và vì sao.)*

Chọn **6 trang, 2 tài liệu, 2 ngôn ngữ** — không phải 6 trang bất kì mà là 6
trang **khó nhất** tìm được: trang dày công thức, trang toàn biểu đồ, trang trộn
Việt–Anh trong cùng một đoạn. Nếu spike chạy được trên những trang này thì phần
còn lại của corpus là chuyện dễ.

Sáu trang đó lôi ra **bốn lỗi** mà đọc code bao nhiêu lần cũng không thấy:

| Lỗi | Triệu chứng | Cách sửa |
|---|---|---|
| Model mặc định không có quota | `gemini-2.0-flash` trả 429 với `limit: 0` — **không phải cạn quota, mà là chưa từng có** | Đổi sang `gemini-3.5-flash`. Thêm lệnh `ingest.main models` để lần sau tự chẩn được |
| LaTeX làm vỡ JSON | Chỉ yêu cầu JSON bằng mime type thì model trả `\prod` với một dấu gạch chéo. `\p` không phải escape hợp lệ trong JSON — **cả trang trích xuất đúng bị mất ở khâu parse** | Ràng buộc bằng `response_schema` để sửa từ gốc, thêm `_repair_escapes` làm lưới đỡ |
| Trang bị `RECITATION` | Một số trang trả về rỗng với `finish_reason=RECITATION` — model từ chối chép lại văn bản nó nhận ra là đã xuất bản | Đổi sang model dự phòng. Ghi lại model nào đọc trang nào, để tỉ lệ này thành **một con số báo cáo được** thay vì một phỏng đoán |
| Khối quá khổ lọt lưới | Model dự phòng đôi khi trả markdown không có dòng trắng, làm cả trang co lại thành **một khối duy nhất** — mà một khối thì chưa bao giờ bị cắt, nên nó thoát khỏi ngân sách token | Cắt theo câu cho khối vượt `MAX_TOKENS` |

**Điều đáng rút ra:** cả bốn lỗi đều chỉ lộ ra khi **chạy trên dữ liệu thật**.
Nếu nhảy thẳng vào chạy `all` trên tài liệu 300 trang thì lỗi thứ nhất đốt quota
vô ích, còn lỗi thứ ba **âm thầm mất trang mà không ai biết**.

### Bước 2 — Cache trước khi gọi API lần thứ hai
*(Ghi lại: bạn đã chỉnh prompt ingest bao nhiêu lần? Nếu không có cache thì mỗi
lần chỉnh tốn bao nhiêu request?)*

Cache đặt ở mức **từng trang**, ghi ra `data/cache/<tài liệu>/pNNNN.json`. Nghĩa
là chỉnh prompt xong chạy lại thì chỉ những trang thật sự cần đọc lại mới tốn
request; phần còn lại đọc từ đĩa.

Giá trị của nó tính được chính xác:

| | |
|---|---|
| Corpus hiện tại | 83 trang |
| Gộp 8 trang mỗi request | **11 request** cho một lần chạy lại toàn bộ |
| Ngân sách | ~20 request/ngày/model |

Tức **một lần chỉnh prompt mà không có cache tốn quá nửa ngân sách ngày của một
model.** Hai lần chỉnh là hết sạch một model, và phải đợi sang hôm sau mới chỉnh
được lần thứ ba.

Số lần chỉnh thực tế **không được ghi lại** — đó chính là khoảng trống mà mục
này lẽ ra phải lấp, và là lí do Bước 3 phải đo lại thay vì tra cứu. Xem §5.

**Quy tắc rút ra:** với bất kì bước nào gọi API tốn tiền hoặc tốn quota, cache
trước khi gọi lần thứ hai — không phải khi thấy chậm. Lần chỉnh prompt đầu tiên
là lúc đã muộn.

### Bước 3 — Prompt trích xuất
*(Ghi lại các phiên bản prompt. Câu nào thêm vào thì sửa được lỗi gì. Ví dụ:
thêm "never invent" giảm bao nhiêu ca bịa nội dung ở vùng mờ.)*

Không có bản ghi nào cho câu hỏi này. Prompt được chỉnh nhiều lần mà **không
commit theo từng lần**, nên lí do từng quy tắc ra đời chỉ còn trong trí nhớ.

Nên tôi đo lại thay vì dựng lại: bỏ từng quy tắc, chạy lại đúng trang đã có
trong cache, so hai bên. Cache giữ sẵn phía "có quy tắc" nên mỗi phép so chỉ tốn
một request. Công cụ ở `ingest/ablate.py`.

| Bỏ quy tắc | Giả thuyết | Đo được |
|---|---|---|
| 2 · *Do not translate* | Model dịch trang tiếng Việt sang tiếng Anh | Không dịch. `lang=vi` cả hai bên, markdown lệch 7 kí tự |
| 5 · *Never invent* | Model bịa nội dung ở vùng mờ | Không bịa. Nhưng số hình tụt **9 → 1** |
| 6 · `is_boilerplate` | Trang mục lục không bị đánh dấu | `True → false`, phần còn lại của trang gần như không đổi |
| 7 · *bỏ header/footer* | Header lọt vào markdown | Không lọt. Dòng ghi nguồn có mặt ở **cả hai** bên |

**Rồi một câu hỏi làm hỏng cả bảng trên:** cùng một prompt chạy hai lần có ra
cùng kết quả không? Quy tắc 5 nói về việc *đừng bịa* — nó không liên quan gì đến
nhận diện hình, mà quy tắc 4 (về hình) có mặt trong mọi lần chạy. Vậy tại sao bỏ
nó lại làm số hình tụt 9 xuống 1?

Chạy ba lần, cùng trang, **prompt không đổi**:

| Lần | Số hình | Kí tự |
|---|---|---|
| 1 | **1** | 527 |
| 2 | **9** | 745 |
| 3 | **9** | 745 |

**Dao động 1–9 hình — đúng bằng "tác dụng" đo được khi bỏ quy tắc 5.** Nghĩa là
ba trong bốn kết quả ở bảng trên **không kết luận được gì**; chúng chỉ là hai
lần bốc thăm trùng hoặc lệch nhau.

Chỉ `boilerplate` sống sót, và lí do nó sống sót đáng ghi: trường đó là **phát
biểu lại trực tiếp** của chính quy tắc bị bỏ, và phần còn lại của trang ổn định
giữa hai lần (212 vs 211 kí tự). Tín hiệu vượt được nhiễu vì nhiễu ở chỗ đó nhỏ.

Chi tiết cuối: lần 2 và 3 **trùng khít từng byte**, lần 1 khác hẳn. Đây không
phải nhiễu rải quanh một giá trị trung bình — nó là **hai chế độ hành vi**:
model hoặc coi tám tấm ảnh là figure riêng, hoặc gộp hết thành gạch đầu dòng.

**Ba điều rút ra:**

1. **Muốn kết luận bất cứ điều gì về một thay đổi trong prompt, phải chạy lặp
   lại.** Một lần mỗi phía đo được may rủi, không đo được prompt.
2. **Đo baseline trước khi đo tác dụng.** Nếu tôi chạy `baseline` trước, tôi đã
   biết ngay bốn thí nghiệm kia thiếu lực mà không phải diễn giải nhầm chúng.
3. Quy tắc 2 và 7 **có thể đã không còn cần thiết** với model hiện tại. Nhưng
   với cỡ mẫu này thì chưa nói được, và bỏ một quy tắc phòng thủ dựa trên một
   lần chạy là đúng loại sai lầm mà mục này tồn tại để ngăn.


### Bước 4 — Chunking
*(Ghi lại: kích thước nào thử, hỏng ra sao. Đặc biệt là ca công thức bị cắt rời
khỏi đoạn giải thích.)*

Lỗi đắt nhất ở bước này không phải chọn sai kích thước, mà là **đo sai thứ**.

Vòng gói chunk tính ngân sách trên **markdown**, trong khi `n_tokens` lại đo trên
**`embed_text`**. Hai độ dài đó không hề gần nhau: `[[FIGURE:x]]` chỉ là **17 kí
tự** markdown, nhưng nở ra hàng trăm kí tự mô tả trong `embed_text`.

Hệ quả: **chỉ những chunk chứa biểu đồ mới tràn**, và tràn khoảng **40%** — tức
đúng loại nội dung mà cả dự án này sinh ra để làm cho truy hồi được.

Đo trên một lần ingest thật, trước và sau khi sửa:

| | Số chunk | Token mỗi chunk |
|---|---|---|
| Tính trên markdown | 3 | 1067, 1233, … |
| Tính trên `embed_text` | 4 | 712, 831, 757, 548 |

Sau khi sửa, biểu đồ nằm trong chunk riêng thay vì bị nhồi chung.

**Quy tắc rút ra: ngân sách phải đo trên đúng chuỗi sẽ được embed và lập chỉ
mục** — không phải chuỗi dùng để hiển thị. Khi một hệ thống có hai biểu diễn cho
cùng một nội dung, mọi phép đếm đều phải nói rõ nó đang đếm bản nào.

### Bước 5 — Schema và index
*(Ghi lại: vì sao 768 chiều, vì sao HNSW, vì sao hai cột tsvector.)*

**Vì sao 768 chiều.** Đây là số chiều `gemini-embedding-001` trả về, và cột được
khai `vector(768)` để **khoá cứng** hai bên với nhau. Đổi model embedding là phải
nạp lại vector cho toàn bộ corpus — không có đường tắt, vì vector của hai model
khác nhau không nằm chung một không gian. Khoá cứng ở schema biến việc đó từ một
lỗi âm thầm thành một lỗi báo ngay khi insert.

**Vì sao HNSW.** Nó là chỉ mục láng giềng gần **xấp xỉ**: thay vì quét toàn bộ
vector, nó đi trên một đồ thị nhiều tầng. Đổi một chút độ chính xác lấy tốc độ
nhanh hơn nhiều bậc. Lưu ý vận hành: nếu corpus vượt khoảng 50 nghìn chunk thì
nên **xoá chỉ mục trước khi nạp lại toàn bộ rồi tạo lại sau** — dựng chỉ mục một
lần nhanh hơn nhiều so với cập nhật nó theo từng dòng insert.

**Vì sao hai cột tsvector.** Đây là chỗ hai loại tìm kiếm hành xử ngược nhau:

| | Đa ngữ | Xử lí thế nào |
|---|---|---|
| Vector | **Có** — model embedding đa ngữ, nên chunk tiếng Anh và câu hỏi tiếng Việt vẫn nằm gần nhau | Một không gian chung cho cả hai ngôn ngữ |
| Full-text | **Không** — hoàn toàn khớp theo mặt chữ | Mỗi ngôn ngữ một cột, cấu hình khác nhau |

Postgres có bộ gốc từ tiếng Anh nhưng **không có từ điển tiếng Việt**. Áp
`'english'` lên tiếng Việt sẽ cắt gốc từ sai. `fts_vi` vì thế dùng `'simple'` —
chỉ hạ chữ thường và tách token, không cắt gốc, không bỏ stopword. Đó là mức tốt
nhất Postgres làm được cho tiếng Việt nếu không cài từ điển riêng.

Cả hai cột đều đánh chỉ mục GIN, và đều được sinh bằng trigger từ `embed_text` —
để không đường ghi nào có thể quên cập nhật chúng.

### Bước 6 — Grounding prompt
*(Ghi lại các phiên bản. Câu nào làm model ngừng bịa. Câu nào làm nó từ chối
quá đà.)*

Cũng không có bản ghi, nên cũng đo lại — nhưng lần này **chạy baseline trước**,
theo đúng bài học của Bước 3.

Baseline không tốn gì: lần chạy sạch ngày 13/08 đã cho `citation_validity`
**1.000** trên sáu câu `t-001`–`t-006`, mỗi câu 1–3 marker. Đó là một mốc ổn
định, đo trên 20 câu trả lời, không phải một lần bốc thăm.

Thí nghiệm: bỏ quy tắc bắt buộc trích dẫn khỏi grounding prompt, chạy lại **đúng
sáu câu ấy** trên dev server tại máy.

Phải bỏ **hai chỗ**, không phải một:

- Quy tắc 2 — *"Every factual sentence carries a citation marker…"*
- Dòng cuối mục Language — *"…keep the citation markers."*

Chỉ bỏ chỗ đầu thì marker còn sót lại có thể là do chỗ sau, và ta lại có thêm
một bảng không diễn giải được.

| | `citation_validity` |
|---|---|
| Có quy tắc (13/08, production) | **1.000** |
| Bỏ quy tắc (18/08, localhost) | **0.333** |

Bốn trong sáu câu **mất hẳn trích dẫn** (`t-002`, `t-003`, `t-004`, `t-006`).
Hai câu vẫn trích dẫn (`t-001`, `t-005`).

**Vì sao hai câu kia vẫn trích dẫn** là phần đáng chú ý hơn con số. Mỗi khối
ngữ cảnh được gói trong `<block n="1" source="…" pages="…">`, nên **cấu trúc của
context tự nó đã gợi ý mạnh** rằng các khối có số và có thể tham chiếu tới. Model
đôi khi tự trích dẫn dù không ai bảo.

Nghĩa là quy tắc trong prompt và cấu trúc trong dữ liệu **cùng đẩy về một hướng**,
và bỏ một cái thì cái kia còn giữ được khoảng một phần ba số ca. Không cái nào
đủ một mình.

**Ba điều rút ra:**

1. **Hiệu ứng đủ lớn để vượt nhiễu**, khác hẳn bốn thí nghiệm ở Bước 3. Lí do:
   chỉ số đo đúng thứ quy tắc yêu cầu, và baseline có cỡ mẫu lớn hơn nhiều.
2. **Quy tắc trích dẫn là quy tắc đắt giá nhất trong prompt.** Bỏ nó thì hai
   phần ba câu trả lời mất hẳn khả năng kiểm chứng — mà trích dẫn nguồn chính là
   lời hứa trung tâm của sản phẩm.
3. **Cấu trúc dữ liệu cũng là một dạng prompt.** Đánh số khối trong `<block n>`
   dạy model cách tham chiếu chúng, độc lập với phần chữ trong prompt. Khi thiết
   kế định dạng context, phải nghĩ nó đang ngầm dạy model điều gì.

*(Cảnh báo khi tái lập: trường `answer` trong report **bị cắt còn 800 kí tự**,
nên đếm marker trực tiếp trên đó sẽ ra thiếu. Dùng `citation_validity` — nó tính
trên câu trả lời đầy đủ. Latency ở lần chạy này cũng cao bất thường vì chạy trên
dev server chưa tối ưu, đừng so với số của production.)*

### Bước 7 — Hiệu chỉnh ngưỡng từ chối
*(Ghi lại quá trình dò `MIN_COSINE`: giá trị nào cho refusal_rate bao nhiêu,
đánh đổi với hit rate ra sao. Kèm bảng.)*

Ngưỡng ban đầu đặt là **0.35**, chọn theo cảm tính. Đo bảy câu hỏi trên corpus
thật:

| Loại câu hỏi | Khoảng cosine đo được |
|---|---|
| Trong phạm vi tài liệu | **0.648 – 0.750** |
| Hoàn toàn không liên quan | **0.462 – 0.566** |

Ở 0.35, **mọi câu hỏi lạc đề đều đi thẳng tới model** trong khi hàng rào trông
vẫn như đang hoạt động. Nâng lên **0.60**, sửa ở cả `config.py` và `retrieve.ts`
để hai đường ingest không lệch nhau.

**Điều chuyển giao được là cái sàn, không phải con số.** `gemini-embedding-001`
chấm văn bản hoàn toàn không liên quan quanh **0.5** — nên không có ngưỡng nào
mang từ trực giác hay từ một model khác sang mà tin được. Với mỗi model và mỗi
corpus, phải đo lại.

Cách đo rẻ nhất: lấy vài câu chắc chắn trong phạm vi và vài câu chắc chắn lạc đề
(kiểu "cách nấu phở bò"), chạy truy hồi, xem cosine cao nhất của từng nhóm. Ngưỡng
nằm ở khe giữa hai nhóm. Nếu hai nhóm chồng lấn thì vấn đề nằm ở chunking hoặc ở
`embed_text`, không phải ở ngưỡng.

### Bước 8 — Đo, rồi mới sửa
*(Ghi lại: chỉ số nào chỉ ra vấn đề gì. Ví dụ hit_at_8 cao nhưng faithfulness
thấp nghĩa là lỗi ở prompt chứ không ở retriever.)*

**Vì sao bốn chỉ số chứ không một.** Một con "độ chính xác" gộp lại che mất nửa
nào của pipeline đang hỏng:

| Chỉ số | Trả lời câu hỏi | Nếu thấp thì sửa ở đâu |
|---|---|---|
| `hit@k` | Trang đúng có được truy hồi về không | **Retriever** — chunking, embedding, ngưỡng |
| `MRR` | Nó nằm ở hạng mấy | Hợp nhất RRF, trọng số các nhánh |
| `citation_validity` | Marker `[n]` có trỏ vào đoạn thật sự được cấp không | **Prompt** |
| `refusal_rate` | Có từ chối đúng lúc không | Ngưỡng cosine |

Quy tắc chẩn đoán: **`hit@k` cao mà chất lượng trả lời thấp → lỗi ở prompt.
`hit@k` thấp → chỉnh prompt là công cốc.** Không tách hai tầng ra thì mọi giờ
tinh chỉnh đều là đoán mò.

**Nhưng bài học đắt nhất của bước này là về chính bộ đo.**

Có lần bộ đo báo `citation_validity = 0.15` trong khi ngưỡng cần là 0.95. Suýt
nữa thì đi sửa phần sinh trích dẫn. Mở dữ liệu thô ra xem: **17/26 câu có thân
response rỗng** vì hết hạn mức, và hàm đo trả 0.0 khi không tìm thấy marker. Trên
những câu thật sự sinh được, trích dẫn đạt **1.000**.

Chuyện tương tự lặp lại ba lần nữa với ba chỉ số khác:

| Hiện ra là | Thực chất là |
|---|---|
| `citation_validity: 0.15` | 17 câu thân rỗng, chấm thành "trả lời thiếu trích dẫn" |
| `refusal_rate: 0.0` | 6 câu `should_refuse` chưa từng chạy tới đường từ chối — token hết hạn giữa chừng |
| `median_latency_ms: 733` | Trung vị của một loạt lỗi 401 tức thời |
| `overview_asked_for_document: 0.333` | Cả 3 câu đều đúng; mẫu số tính cả 2 câu lẽ ra phải trả lời chứ không phải hỏi lại |

Bốn lần, cùng một hình dạng: **một chỉ số tính trên sai tập dòng, đọc lên như một
phán quyết.** Và ba trong bốn sai **theo hướng bi quan**.

**Quy tắc rút ra:** chỉ số sai theo hướng bi quan nguy hiểm ngang chỉ số sai theo
hướng lạc quan. Cái lạc quan làm mình tưởng đã xong; cái bi quan **dụ mình đi sửa
thứ vốn đang chạy tốt**. Trước khi tin một chỉ số tụt, mở vài ca hỏng ra xem đã —
ở đây chỉ cần nhìn cột latency là thấy: 950ms cho một câu trả lời có sinh văn bản
là bất khả thi.

Hệ quả về thiết kế harness: **request hỏng phải bị loại khỏi mẫu, không được chấm
0.** Và mọi tỉ lệ phải kèm cỡ mẫu thật sự chấm được (`n_scored`), chứ không phải
số câu đã gửi đi.

---

## 3. Những cái bẫy đã dính

*(Mục quan trọng nhất của file. Mỗi mục: triệu chứng → nguyên nhân → cách sửa.
Ghi ngay lúc vừa gỡ xong, đừng để đến tuần 8 mới nhớ lại.)*

| # | Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|---|
| 1 | `429 RESOURCE_EXHAUSTED` ngay lần gọi đầu tiên | Đọc kĩ: `limit: 0`, không phải "dùng hết quota" mà là "model không có quota free tier". `gemini-2.0-flash` đã bị rút khỏi free tier | Thêm lệnh `ingest.main models` để liệt kê model gọi được; đổi `GEMINI_VISION_MODEL` trong `.env` |
| 2 | Trang công thức báo `SCHEMA FAILURE` dù nội dung đọc ra đúng | Model xuất `\prod` một backslash trong JSON. `\p` không phải escape hợp lệ → `json.loads` chết. Ngay dòng dưới nó lại viết đúng `\\frac` | Dùng `response_schema=PageExtraction` để ép JSON đúng chuẩn ở backend. Thêm `_repair_escapes` làm lớp vá dự phòng |
| 3 | Trang trả về **rỗng**, không lỗi gì | `finish_reason=RECITATION` — model từ chối transcribe nội dung nó nhận ra là văn bản đã xuất bản | Thử lại primary một lần rồi mới fallback sang model thế hệ khác. Ghi `extracted_by` để đếm được tỉ lệ |
| 3b | *(đính chính mục 3)* Ban đầu kết luận RECITATION là **tất định** | Trong một phiên, cùng trang bị từ chối ở temperature 0/0.3/0.6/0.9 và ở cả `3.6-flash` lẫn `3.5-flash-lite`. Nhưng lần chạy sau, chính trang đó được primary đọc ngay lần đầu. → Nó **không tất định**, chỉ ổn định trong một khoảng thời gian ngắn | Đổi thứ tự thử: primary → primary → fallback. Bài học: đừng kết luận "tất định" từ dữ liệu một phiên |
| 4 | Một chunk to gấp mấy lần budget | Model fallback trả markdown dính liền, không có dòng trống. `_blocks` tách theo dòng trống nên cả trang thành một block, mà block đơn lẻ thì không bao giờ bị chia | `_split_oversized` cắt theo ranh giới câu khi một block vượt `MAX_TOKENS` |
| 5 | Chunk có hình vượt `MAX_TOKENS` 40%, chunk không hình thì bình thường | Vòng đóng gói tính budget trên **markdown**, nhưng `n_tokens` đo trên **embed_text**. `[[FIGURE:x]]` là 17 kí tự markdown nở thành hàng trăm kí tự mô tả. Hai độ dài này không hề gần nhau | Tính budget trên embed_text — thứ thật sự được embed và index. Sau khi sửa: 4 chunk 712/831/757/548 thay vì 3 chunk có 1067 và 1233 |
| 6 | Bot không bao giờ từ chối câu hỏi ngoài phạm vi | `MIN_COSINE = 0.35` đặt chay. Đo thật: câu trong phạm vi 0.648–0.750, câu **hoàn toàn không liên quan** ("cách nấu phở bò", "capital of France") vẫn 0.462–0.566. Ngưỡng 0.35 cho lọt tất cả — đường từ chối bị vô hiệu hoá mà nhìn vẫn như đang chạy | Nâng lên 0.60. Bài học quan trọng hơn: `gemini-embedding-001` cho văn bản không liên quan điểm **quanh 0.5**, không có thang đo phổ quát nào mà 0.35 nghĩa là "không khớp". Bắt buộc phải đo, không được đoán |
| 7 | Ingest chết giữa chừng, retry bao nhiêu cũng vô ích | `quotaId: GenerateRequestsPerDayPerProjectPerModel`, `limit: 20`. Free tier cho **20 request mỗi NGÀY** với `gemini-3.5-flash` — không phải 15 RPM như tài liệu ghi (đó là số của `gemini-2.0-flash` đã hết đời). Lỗi trả `retryDelay: 35s` gây hiểu nhầm là giới hạn theo phút | Vì quota là **per model**, xoay vòng chain 4 model → 68 trang xong trong một buổi. Phân biệt `is_daily_quota` với rate limit thường: cái đầu đổi model, cái sau đợi đúng `retryDelay` mà API trả về thay vì backoff mù |
| 8 | Công thức thứ hai trên trang lấy nhầm lời diễn giải của công thức thứ nhất | `_to_embed_text` chạy **theo từng block**, nhưng bộ đếm công thức khởi tạo lại mỗi lần gọi — nên mọi block đều ánh xạ công thức đầu tiên của trang | Khớp theo chính chuỗi LaTeX thay vì theo vị trí. Ổn định bất kể trang bị chia thế nào |
| 9 | Lệnh LaTeX còn nguyên trong `embed_text` | Regex inline math chỉ bỏ dấu `$` mà giữ nội dung. `$x$` → `x` thì tốt, nhưng `$X \times Y$` → `X \times Y` thì hỏng. Mà `embed_text` **vừa được embed vừa được index full-text**, nên `times` trở thành một token tìm kiếm được mà chẳng mang nghĩa gì | Loại bỏ lệnh LaTeX và dấu câu phục vụ chúng, giữ lại các định danh người đọc thật sự đọc thành lời |
| 10 | `index` in ra `stored 34 chunks` nhưng app không thấy tài liệu | `upsert_document` thấy `content_hash` trùng là `return` sớm, **không cập nhật `owner_id`**. Mà nạp lại tài liệu cũ chính là cách gán chủ sở hữu cho tài liệu nạp trước khi có auth | Cập nhật các trường có thể đổi khi tài liệu đã tồn tại. Kiểu lỗi "báo thành công nhưng không làm gì" là loại tốn thời gian nhất |
| 11 | Upload đứng ở "0/5 trang", không lỗi, không tiến triển | Hai lỗi chồng lên nhau. Một: vòng lặp chạy từ event handler nên rejection bị nuốt im lặng. Hai: pdfjs lập lịch render bằng `requestAnimationFrame`, mà trình duyệt **đình chỉ rAF ở tab nền** | Bọc try/catch để lỗi hiện ra; thêm timeout 45s kèm giải thích; nhắc người dùng giữ tab hiển thị. Đo được: rAF bị chặn → không bao giờ xong, rAF khôi phục → render < 1 giây |
| 12 | Hỏi "tóm tắt tài liệu X" nhưng trả lời từ tài liệu Y | Hai nguyên nhân. Một: `filter_documents` có sẵn trong RPC từ đầu mà chưa chỗ nào truyền vào. Hai: **"tóm tắt toàn bộ" không phải câu hỏi truy hồi** — không đoạn nào mang nghĩa "tất cả", nên nó khớp đoạn na ná chủ đề ở cosine 0.64, vừa vượt ngưỡng 0.60 | Giới hạn phạm vi (chọn tay / nhắc tên trong câu hỏi); và tách nhánh `document_overview` chia tài liệu bằng `ntile` lấy chunk trải đều |
| 13 | Batch 8 trang vỡ giới hạn body của Vercel | Ảnh trang trung bình 480KB nhưng **đỉnh 2MB**. Batch cố định vừa đủ ở mức trung bình và vỡ khi vài trang nặng rơi cùng nhau | Gom theo **ngân sách byte** (3MB) thay vì số trang. Xác nhận trên dữ liệu thật: paper arXiv đi 2–3 trang/request, không phải 8 |
| 14 | Eval đầy đủ trên production báo `citation_validity = 0.15`, ngưỡng cần là 0.95 — mà xem tay thì **không trích dẫn nào sai** | Không phải lỗi trích dẫn. 17/26 câu có thân response **rỗng**, và `citation_validity` trả 0.0 khi không tìm thấy marker `[n]` nào. Gốc rễ: response HTTP chốt status và header **ngay khi thân bắt đầu**, mà route gửi `200` + `X-Citations` trước khi gọi model — nên lỗi 429 lúc sinh chỉ có thể cắt cụt thân, không đổi được status. Client nào cũng phải tự suy ra từ một stream rỗng rằng *đã hỏng* và *hỏng vì gì*. Hai client suy ra hai kiểu: `ChatPanel` đoán hết quota ngày, harness đoán là câu trả lời thiếu trích dẫn | Kéo chunk đầu tiên ra khỏi stream **trước khi** cam kết header (`openTextStream`), rồi trả 503 kèm `reason` phân biệt `daily_quota` với `rate_limited`. Phía harness: thân rỗng là **request hỏng**, loại khỏi mẫu tính chỉ số, đếm riêng trong summary |
| 14b | *(bẫy nằm bên trong cách sửa bẫy 14)* Bản vá đầu tiên bắt lỗi bằng `try/catch` quanh `textStream` — compile sạch, test tự viết xanh, **và không bao giờ kích hoạt** | Type doc của `ai@4.3.19` ghi nguyên văn *"When an error occurs, the stream will throw the error."* Đo thật bằng `MockLanguageModelV1` ném lỗi: `next()` đầu tiên trả `{done: true}`, không ném gì cả; `await result.text` thì **treo vĩnh viễn**. Lỗi đi ra bằng callback `onError`, và nó fire **trước** khi `next()` đầu tiên resolve | Bắt lỗi qua `onError`, stash lại, rồi coi "stream rỗng **và** có lỗi đã báo" là dấu hiệu hỏng. Bài học: **doc của thư viện cũng là một giả định cần đo.** Cái cứu ở đây là viết test chạy `streamText` thật thay vì chỉ chạy generator tự bịa — generator tự bịa thì ném lỗi đúng như mình tưởng, nên test xanh mà bản vá vô dụng |
| 15 | Cùng một trang, cùng prompt, chạy hai lần ra **hai kết quả khác hẳn** | Trang `p0015` chạy 3 lần với prompt y hệt: lần 1 ra **1 hình / 527 kí tự**, lần 2 và 3 ra **9 hình / 745 kí tự** — và hai lần sau trùng khít từng byte. Không phải nhiễu rải quanh một giá trị trung bình mà là **hai chế độ hành vi**: model hoặc coi tám tấm ảnh là figure riêng, hoặc gộp hết thành gạch đầu dòng | Chưa có cách sửa. Nhưng nó đổi cách kết luận: **mọi phép so trên đường ingest phải chạy lặp lại**, và phải đo baseline trước khi đo tác dụng. Xem §2 Bước 3 |
| 16 | Hệ quả sản phẩm của bẫy 15, ít ai nghĩ tới | Cùng một PDF nạp hai lần có thể cho ra **số chunk và nội dung chunk khác nhau**. Nếu trúng lần chạy "1 hình" thì tám mô tả ảnh **không bao giờ vào chỉ mục** — mà mô tả ảnh chính là thứ làm biểu đồ truy hồi được, tức lí do tồn tại của cả dự án | Con số eval `hit@8 = 1.000` đo trên **một lần nạp cụ thể** của corpus, không phải trên mọi lần nạp có thể. Ghi rõ điều đó khi báo cáo, đừng ngầm hiểu là bất biến |
| 17 | Full run 26 câu 18/08: `citation_validity = 0.947`, một câu (`g-002`) đạt **0.0** — mà `hit=true`, `mrr=1.0` (trang đúng **được truy hồi**), và `faithfulness_score=1.0` | Không phải trích dẫn sai — câu trả lời **không có trích dẫn nào cả**. Model nhận đúng context (trang 21, ca khó nhất bộ: hỏi tiếng Việt về nội dung chỉ nằm trong ảnh) nhưng viết văn xuôi từ chối ("tài liệu không chứa thông tin...") thay vì trả lời, đúng luật 3 của grounding prompt ("nếu context không có câu trả lời, nói vậy và dừng"). `citation_validity()` trả `0.0` khi không thấy marker `[n]` nào (`eval/metrics.py`), coi "không trích dẫn gì" giống hệt "bịa trích dẫn" — trong khi một câu từ chối trung thực **không có khẳng định nào cần trích dẫn**. `FAITHFULNESS_PROMPT` đã xử lý đúng ca này ("Refusals count as fully faithful"), `citation_validity` thì chưa | Chưa sửa — đây là câu hỏi thiết kế thật, không phải bug rõ ràng: từ chối bằng văn xuôi giữa luồng "answer" (thay vì qua nhánh `isUngrounded()` có cấu trúc) có nên bị tính vào `citation_validity` không? Ghi lại làm câu hỏi mở ở `REQUIREMENTS.md` §8 |
| 18 | Cùng chỉ số `citation_validity = 0.947` ở hai lần chạy 18/08, nhưng **câu hỏng là hai câu khác nhau** và nguyên nhân khác hẳn | Local hỏng ở `g-002` (từ chối bằng văn xuôi — bẫy #17). Production hỏng ở `t-009`: câu trả lời **đúng nội dung, đủ ba ý** ("Automatic Reasoning / Language understanding / Learning") nhưng **không có một marker `[n]` nào**. Model phục vụ câu đó là `gemini-3.5-flash-lite` — mắt xích yếu nhất trong chain 4 model, được chọn khi các model trên đã cạn hạn mức ngày. Đây **không phải** ca thiết kế mơ hồ như #17: một câu trả lời khẳng định nội dung mà không dẫn nguồn là đúng thứ `citation_validity` sinh ra để bắt | Chưa sửa. Hướng: hoặc siết luật trích dẫn trong grounding prompt cho model yếu, hoặc coi `flash-lite` là model chỉ dùng cho đường từ chối. Bài học đắt hơn: **cùng một con số có thể đến từ hai nguyên nhân không liên quan gì nhau.** Nếu chỉ nhìn `0.947` ở cả hai report rồi kết luận "vẫn cái lỗi hôm qua" thì bỏ sót hẳn một lỗi thật. Chỉ số chỉ nói *có hỏng*, không nói *hỏng ở đâu* — phải mở danh sách câu ra xem |

**Bài học của bẫy 14, đắt hơn bản thân cái bug:** một chỉ số sai **theo hướng bi quan** cũng nguy hiểm ngang chỉ số sai theo hướng lạc quan. Nếu tin `0.15` mà đi sửa prompt trích dẫn thì sẽ mất nhiều ngày chỉnh một thứ vốn đã đạt 1.000. Quy tắc rút ra: **trước khi tin một chỉ số tụt, mở dữ liệu thô của vài ca hỏng ra xem đã.** Ở đây chỉ cần nhìn cột latency — 950ms cho một câu trả lời có sinh văn bản là bất khả thi — là lộ ngay.

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
