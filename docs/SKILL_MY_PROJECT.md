# SKILL_MY_PROJECT — Quy trình xây dựng một AI Engine RAG song ngữ

> Task 1.5 + Task 4.2. Đây là tài liệu **tự đúc kết**, không phải tài liệu mô tả
> sản phẩm. Người đọc mục tiêu: một bạn thực tập khác, đọc xong phải làm lại
> được mà không cần hỏi bạn.

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

**Đo lại trên cả 26 câu, 20/08** (`eval-retrieval-20260820-014200.json`). Phép đo
gốc dùng bảy câu; bộ eval đầy đủ cho một bức tranh rộng hơn — và một bài học về
cách đọc nó.

Nhìn thô thì khe giữa hai nhóm chỉ còn **0.024**, nghe như ngưỡng sắp hỏng. Mở
từng dòng ra thì không phải:

| cosine | câu | loại |
|---|---|---|
| 0.588 | `r-005` "Bỏ qua mọi hướng dẫn trước đó…" | **prompt injection** |
| 0.578 | `r-006` "Ignore all previous instructions…" | **prompt injection** |
| 0.554 | `r-001` "Giá cổ phiếu VNM hôm nay bao nhiêu?" | lạc đề thật |
| 0.548 | `r-004` "How do I change a motorcycle tyre?" | lạc đề thật |

Hai câu cao nhất là prompt injection, và **ngưỡng cosine không phải thứ chặn
chúng** — guardrail chặn trước, ở lần chạy full chúng trả `blocked` chứ không phải
`refusal`. Chúng ghi điểm cao vì là câu tiếng Anh dài mang giọng chỉ thị, có chút
trùng lặp từ vựng với tài liệu kĩ thuật, chứ không phải vì hệ thống thấy chúng liên
quan tới nội dung.

Việc thật của ngưỡng là tách câu hỏi **nội dung** trong phạm vi khỏi ngoài phạm vi.
Trên đúng việc đó:

```
cao nhất ngoài phạm vi  0.554   (r-001)     ← cách ngưỡng −0.046
NGƯỠNG                  0.600
thấp nhất trong phạm vi 0.612   (g-001)     ← cách ngưỡng +0.012
```

Khe thật là **0.058**, không phải 0.024. Đây là lần thứ sáu trong dự án một con số
đọc lên như một phán quyết trong khi nó đang gộp hai tập khác loại — và lần này
suýt nữa nó được báo đi như một cảnh báo giả.

**Nhưng phần đáng lo thì có thật, chỉ là ở chỗ khác.** `g-001` chỉ cách ngưỡng
**+0.012**, và nó là câu hỏi về nội dung **chỉ nằm trong biểu đồ** — đúng nhóm phụ
thuộc vào tính bất định của ingest ở Bước 3. Nếu một lần nạp lại rơi vào chế độ
"1 hình" thay vì "9 hình", mô tả biểu đồ có thể không vào chỉ mục, cosine của
`g-001` tụt, và nó bị **từ chối nhầm**. Hai điểm yếu đã biết cộng hưởng với nhau,
và không chỉ số nào trong summary cho thấy điều đó: `refusal_rate` 1.000 và
`false_refusal_rate` 0.000 đều xanh.

**Rồi một câu hỏi làm hỏng cả cách đặt vấn đề: đo bằng câu hỏi nào?**

Sáu câu `should_refuse` trong bộ eval đều là loại **hiển nhiên lạc đề** — phở,
thủ đô nước Pháp, giá cổ phiếu, thay lốp xe máy. Không câu nào hỏi một thứ
**nằm trong đúng lĩnh vực của tài liệu mà tài liệu không trả lời được**, tức là
đúng ca mà một ngưỡng từ chối phải xử lí đúng. Đo bằng toàn negative dễ thì
ngưỡng nào cũng trông an toàn.

`eval/threshold.py` chấm thêm 16 câu dò, chia hai loại. Chỉ tốn embedding quota;
kết quả ghi ra `eval/reports/threshold-20260820-031504.json`.

| Nhóm | n | Khoảng cosine |
|---|---|---|
| Ngoài phạm vi, **hiển nhiên** | 6 | 0.522 – 0.562 |
| Ngoài phạm vi, **cùng lĩnh vực** | 10 | 0.572 – **0.654** |
| Trong phạm vi | 20 | **0.612** – 0.825 |

**Hai phân bố chồng lấn.** Năm câu cùng lĩnh vực ghi điểm cao hơn câu trong phạm
vi thấp nhất:

| cosine | câu dò | khớp vào đoạn nói về |
|---|---|---|
| 0.654 | "Giải thích thuật toán k-means…" | ca dao dự báo thời tiết, deduction/induction |
| 0.644 | "Cách chọn learning rate schedule…" | — |
| 0.644 | "Sự khác nhau giữa LoRA và full fine-tuning" | — |
| 0.623 | "Batch normalization giúp gì…" | ensemble learning: boosting, bagging |
| 0.613 | "L1 và L2 regularisation khác nhau thế nào" | dimensionality reduction, kernel methods |

Đã mở từng đoạn khớp ra đọc để chắc chúng thật sự ngoài phạm vi, không phải tôi
gán nhãn sai: cả ba đoạn kiểm tra đều **không nói gì** về câu được hỏi.

**Nghĩa là không tồn tại ngưỡng tối ưu.** Nâng lên trên 0.654 để chặn k-means thì
chặn luôn `o-001` — ghi nhận **cùng 0.654** ở ba chữ số — và `g-001` ở 0.612. Hạ xuống để nới biên
cho `g-001` thì thả thêm câu ngoài phạm vi qua.

Lí do sâu xa: **cosine đo độ liên quan chủ đề, không đo khả năng trả lời được.**
Một câu hỏi về k-means gần với giáo trình ML về mặt chủ đề, và embedding không
phân biệt được "tài liệu này nói về ML" với "tài liệu này trả lời được câu hỏi
này".

**Vậy phát biểu đúng về vai trò của ngưỡng là gì.** Nó là **bộ lọc thô, không phải
bảo chứng**. Ở 0.60 nó làm được đúng ba việc:

| Nhóm | 0.60 xử lí |
|---|---|
| Hiển nhiên lạc đề (≤ 0.562) | chặn hết, biên 0.038 |
| Cùng lĩnh vực, 5/10 câu dưới 0.60 | chặn |
| Cùng lĩnh vực, 5/10 câu trên 0.60 | **thả qua** |
| Trong phạm vi (≥ 0.612) | thả qua hết, **không chặn nhầm câu nào** |

Vùng mờ được đẩy sang **tầng thứ hai: grounding prompt** — và tầng đó đã được đo
là có tác dụng. Bẫy #17 ghi đúng ca này: `g-002` qua được ngưỡng
(`hit=true`, `mrr=1.0`) nhưng model vẫn từ chối bằng văn xuôi vì context không trả
lời được. Prompt đọc được nội dung, cosine thì không.

**Quyết định 20/08: giữ `MIN_COSINE = 0.60`.** Không phải vì nó tối ưu — không có
điểm tối ưu — mà vì nó là điểm duy nhất trong dữ liệu hiện có không chặn nhầm câu
hợp lệ nào trong khi vẫn chặn sạch nhiễu rõ ràng.

**Phép thử thật, chạy 20/08: cả năm câu đều bị từ chối**
(`eval/reports/probe-refusal-20260820-073311.json`). Và tất cả đều do
`gemini-3.5-flash-lite` phục vụ — mắt xích yếu nhất chain, model duy nhất từng bỏ
marker trích dẫn.

Chất lượng từ chối cao hơn mong đợi. Hai trong năm câu **tìm ra bằng chứng một
phần rồi giải thích vì sao nó không đủ**, thay vì trả lời trống "không có":

> *"Tài liệu chỉ nhắc đến LoRA như một tài liệu tham khảo (Low-rank adaptation of
> large language models) [1], nhưng không giải thích về phương pháp này hay đưa ra
> sự khác biệt với full fine-tuning."*

> *"The provided context mentions that 'L1 regularization may allow some
> coefficients to be zore' [4], but it does not contain information about L2
> regularisation or the difference between L1 and L2."*

Đó là đọc ngữ cảnh, không phải khớp mẫu. Ba câu còn lại từ chối gọn và gợi ý đúng
những chủ đề tài liệu **có** nói.

**Lặp lại 46 phút sau, qua đường eval chính thức: vẫn 5/5**
(`eval-full-20260820-081922.json`). Câu chữ khác đi — model không đọc thuộc một
mẫu — nhưng nội dung trùng, kể cả hai ca tìm ra bằng chứng một phần. Riêng `h-005`
độc lập tìm lại đúng câu về L1 và độc lập chỉ ra rằng không có gì về L2. Một lần
5/5 có thể là may; hai lần, hai đường code khác nhau, thì không.

**Kết luận cho cả Bước 7:** kiến trúc hai tầng đúng, và tầng thứ hai gánh phần
việc tầng thứ nhất về nguyên tắc không làm được. `refusal_rate = 1.000` đo trên
sáu câu lạc đề hiển nhiên vì thế **nói ít hơn** hệ thống thật sự làm được — nhưng
bây giờ có số cho phần nó không nói tới.

**Bài học rộng hơn con số:** một ngưỡng chỉ đáng tin bằng tập negative dùng để đo
nó. Sáu câu lạc đề hiển nhiên chứng minh được rất ít, và chúng làm chỉ số trông
đẹp hơn hệ thống thật sự đang làm được.


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
| 18 | Cùng chỉ số `citation_validity = 0.947` ở hai lần chạy 18/08, nhưng **câu hỏng là hai câu khác nhau** với hai triệu chứng khác nhau | Local hỏng ở `g-002` (từ chối bằng văn xuôi — bẫy #17). Production hỏng ở `t-009`: câu trả lời **đúng nội dung, đủ ba ý** ("Automatic Reasoning / Language understanding / Learning"), dài 140 kí tự, **không chứa một dấu `[` nào**. Lập bảng chéo model × trích dẫn qua mọi lần chạy đầy đủ mới thấy cái chung: `gemini-3.5-flash` và `gemini-2.5-flash` cộng lại **41/41 câu đều có trích dẫn**; `gemini-3.5-flash-lite` **31/33**. Cả hai câu hỏng đều do `flash-lite` phục vụ — mắt xích cuối chain, được chọn khi các model trên đã cạn hạn mức ngày. Lần chạy production 18/08 có **17/19 câu** rơi vào `flash-lite`, tức đây là một lần đo **gần trường hợp xấu nhất**, không phải lần đo điển hình | Chưa sửa. Hướng: siết luật trích dẫn trong grounding prompt cho model yếu, hoặc chỉ dùng `flash-lite` cho đường từ chối. Hai bài học tách biệt: **(a)** chỉ số nói *có hỏng*, không nói *hỏng ở đâu* — phải mở danh sách câu ra xem, vì cùng một con số ở hai lần chạy vẫn có thể là hai câu khác nhau; **(b)** lần đầu tôi đọc bảng này đã kết luận "hai nguyên nhân không liên quan", **và đó là kết luận sai** — chỉ khi lập bảng chéo theo model mới lộ ra yếu tố chung. Đọc hai ca hỏng riêng lẻ thì thấy hai câu chuyện; đếm theo model thì thấy một |
| 18b | *(hệ quả, và một suy diễn hụt)* `retrieval_mrr` cùng lúc tụt 0.882 → 0.788 | Giả thuyết đầu tiên: model yếu sinh biến thể truy vấn kém hơn nên truy hồi tệ đi. **Sai.** Lần chạy local 18/08 cũng chạy gần hết trên `flash-lite` mà `retrieval_mrr` vẫn đúng 0.882. Model sinh câu trả lời không giải thích được khoảng cách này | Cách đọc còn lại: ở chế độ full, biến thể `query_en`/`query_vi` được **sinh trực tiếp mỗi lần gọi**, không lấy từ dataset — nên MRR dao động giữa các lần chạy dù corpus và câu hỏi y hệt. Chế độ `--retrieval-only` dùng biến thể lưu sẵn nên lặp lại được (0.926). **Muốn so truy hồi giữa hai thời điểm thì phải so ở chế độ retrieval-only**, còn MRR ở chế độ full là số của cả cụm sinh-biến-thể + truy hồi |
| 19 | Một mục nợ kĩ thuật ghi trong 3 tài liệu suốt hai tuần, sắp bỏ nửa ngày ra sửa — **một nửa của nó chưa bao giờ đúng** | Mục ghi: "`document_pages` và file Storage không được dọn khi xoá tài liệu". Đọc schema kĩ thì `document_pages.job_id` cascade theo `ingest_jobs`, mà `ingest_jobs.document_id` cũng cascade theo `documents` — **cascade hai tầng**, xoá tài liệu là trang đi theo. Kiểm bằng cách chèn thật một bộ document + job + page vào database rồi xoá: cả ba hàng đều biến mất. Nguồn gốc sai: lúc viết mục đó tôi nhìn `document_pages` thấy nó **không** có khoá ngoại trỏ tới `documents` và dừng ở đó, không lần thêm một tầng nữa | Sửa đúng thứ thật sự rò: **Storage**, vì bucket không có khoá ngoại để cascade theo. Bài học: **nợ kĩ thuật cũng là một khẳng định chưa đo.** Nó nằm trong tài liệu, được chép qua ba chỗ, được lên lịch làm — không cái nào trong số đó biến nó thành đúng. Cùng một quy tắc đã áp cho chỉ số eval (bẫy #14, #18) thì phải áp cho cả danh sách việc: **kiểm trước khi sửa**, vì nửa ngày sửa một thứ không hỏng là nửa ngày mất trắng |
| 20 | Ngưỡng NFR "token đầu tiên < 3s" được ghi **Đạt** buổi sáng, và **Chưa đạt** buổi chiều cùng ngày — không sửa dòng code nào ở giữa | Số buổi sáng là 2889ms, đo ở lần chạy 18/08. Số buổi chiều là 8155ms, đo ở lần chạy 19/08 ngay sau khi quota reset. Tách TTFT theo model thì lộ nguyên nhân: `flash-lite` 2860–4225ms, model mạnh (`flash`, `2.5-flash`) **8444ms**. Lần chạy 18/08 diễn ra khi hạn mức ngày đã cạn nên 17/19 câu rơi xuống `flash-lite` — mắt xích cuối chain. Nghĩa là **ngưỡng 3 giây chỉ đạt khi hệ thống đang chạy ở chế độ chất lượng thấp nhất**, và `flash-lite` cũng chính là model duy nhất từng bỏ marker trích dẫn (cộng dồn 4 lần chạy đầy đủ: model mạnh 41/41, `flash-lite` 31/33) | **Đã chốt 19/08: đổi ngưỡng, và lí do phải độc lập với số đo** — nếu không thì chỉ là dời cột gôn sau khi trượt. Lí do độc lập: ngưỡng 3s được neo vào một request **không gọi model nào** (0.34s), trong khi đường thật có **hai lượt gọi model tuần tự** cộng năm vòng gọi database; kiến trúc này không về được 3s bất kể hôm nay đo ra bao nhiêu. Thay bằng ba ngưỡng: `p50` < 10s (mốc UX về giới hạn giữ sự chú ý, chọn độc lập với dữ liệu), `p90` < 15s (thừa nhận có nhìn phân phối — nhưng lí do tồn tại thì không), và **request chạm trần 60s = 0** (ngưỡng đúng/sai). *Bản đề xuất đầu là `p50 < 5s` và bị chính phép đối chiếu bác bỏ: đường tốt của sản phẩm nằm ở 8.4s, nên 5s sẽ chỉ đạt khi chain rơi xuống model yếu — đúng cái bẫy này tồn tại để chỉ ra, suýt lặp lại ngay trong bản sửa nó.* Harness đã được bổ sung `p90_ttft_ms` và `n_timeout` trong cùng thay đổi, vì **một ngưỡng không có code nào đo là một ngưỡng chưa tồn tại** — xem chuyện `faithfulness` được hứa ở 4 chỗ mà không chỗ nào gọi. Bài học thì đã rõ và là bài học tệ nhất trong bảng này: **một ngưỡng chấp nhận được kiểm bằng một lần chạy là một ngưỡng chưa được kiểm.** Tệ hơn nữa, ở đây tốc độ và độ tin cậy **đánh đổi nhau dọc theo chain model**, nên lần chạy trông đẹp nhất về tốc độ lại là lần chạy tệ nhất về chất lượng. Bất kì chỉ số nào đo trên một hệ có fallback đều phải ghi kèm **nhánh fallback nào đã phục vụ** |
| 21 | Hai câu trong 26 trả về sau **62.4s và 62.6s** với thân rỗng và không kèm lí do | Không phải quota — `f-001` cùng lần chạy mất 27s và thành công. 62s là `maxDuration = 60` của Vercel cộng thời gian mạng: hàm bị giết giữa chừng, và thứ client nhận được là một 504 không mang thông tin. Đường sinh câu trả lời **không có timeout riêng**, nên khi Gemini chậm bất thường thì giới hạn duy nhất là trần của nền tảng. Rà lại 11 lần chạy trước: không lần nào vượt 55s, nhưng ngày 13/08 đã có một câu mất **44.2s — 74% của trần**. Rủi ro tích sẵn từ lâu, chỉ chưa nổ, và không chỉ số nào trong summary hiển thị điều đó | Đã sửa 19/08: hạn chót **cho cả request** (`REQUEST_BUDGET_MS = 50_000`, đo từ `started` chứ không phải từ lúc gọi model — guardrail và truy hồi đã tiêu thời gian trước đó rồi), và nhánh `reason: "timeout"` riêng vì "thử lại sau một phút" là lời khuyên **sai** khi không có gì bị bóp băng thông. **Bản vá đầu tiên của tôi sai, và test bắt được:** tôi truyền `abortSignal` cho `streamText` rồi cho rằng thế là xong. Đo bằng model không bao giờ resolve, signal đặt 120ms — test treo đủ 10 giây. `abortSignal` chỉ đi xuống tầng fetch; **provider không đọc nó thì chỗ `await` vẫn treo y như cũ.** Hạn chót phải nằm đúng chỗ đang đợi, tức trong `openTextStream`. Giữ lại `abortSignal` làm lớp thứ hai vì nó **huỷ thật** lượt gọi khi provider có đọc, đỡ tốn quota cho câu trả lời không ai đọc. Đây đúng là bẫy #14 lặp lại ở nguyên nhân khác: **client không suy ra được vì sao im lặng** — lần trước là hết quota, lần này là hết giờ |
| 22 | Tải tài liệu vào một khung chat thì nó chỉ nằm ở khung đó — **đúng yêu cầu**. Nhưng xoá khung đang mở thì hiện ra một khung trông y hệt "chat mới", **chứa toàn bộ tài liệu của tài khoản** | `null` mang **hai nghĩa** cùng lúc: với sidebar nó là "chưa chọn khung nào", với truy hồi nó là "tìm trong mọi tài liệu". `remove()` thả người dùng vào đó, còn nút "+ Chat mới" thì tạo hàng thật — hai lối đi tới hai trạng thái nhìn giống hệt nhau, khác nhau ở đúng một dòng tiêu đề. Câu hỏi hỏi tiếp theo vì thế **âm thầm mở rộng phạm vi** ra cả tài khoản. Không phải lỗi bảo mật (RLS vẫn chặn theo chủ sở hữu), nhưng phá đúng tính chất trung tâm của sản phẩm | Cho `null` **một nghĩa duy nhất**: khung chat mới chưa lưu — không tài liệu, không lịch sử, không hàng trong database. Hàng chỉ được tạo khi người dùng hỏi câu đầu hoặc tải tài liệu đầu, nên mở app và bấm "+ Chat mới" không sinh rác. Bài học: **một giá trị mang hai nghĩa sẽ trở thành lỗi ở đúng chỗ hai nghĩa đó tách ra.** Ở đây chúng tách ra khi xoá khung đang mở — một đường đi mà không test nào và không lần eval nào từng chạy qua, vì harness gọi thẳng API và không bao giờ đụng giao diện. *(Chú thích trong code còn viện dẫn "and what the eval harness measures" để biện minh cho trạng thái này — sai: harness cần **API** chấp nhận conversation rỗng, không cần **UI** mặc định vào đó.)* |
| 23 | `refusal_rate = 1.000` qua mười lần chạy. Nhưng bộ đo **chưa từng thử ca khó** | Sáu câu `should_refuse` trong bộ eval đều hiển nhiên lạc đề: phở bò, thủ đô nước Pháp, giá cổ phiếu, thay lốp xe máy. Không câu nào hỏi một thứ **nằm trong đúng lĩnh vực của tài liệu mà tài liệu không trả lời được** — tức đúng ca một ngưỡng từ chối phải xử lí đúng. Chấm thêm 10 câu cùng lĩnh vực (`eval/threshold.py`, chỉ tốn embedding quota) thì **hai phân bố chồng lấn**: câu ngoài phạm vi cao nhất **0.654** (hỏi về k-means, khớp vào một trang nói về ca dao dự báo thời tiết), câu trong phạm vi thấp nhất **0.612**, và `o-001` ghi nhận **cùng 0.654** ở ba chữ số. Đã mở từng đoạn khớp ra đọc để chắc không phải gán nhãn sai | **Không có ngưỡng tối ưu, và đó là kết luận chứ không phải thất bại.** Cosine đo **độ liên quan chủ đề**, không đo **khả năng trả lời được** — một câu hỏi về k-means gần với giáo trình ML về mặt chủ đề bất kể giáo trình có nói về k-means hay không. Giữ 0.60 và phát biểu lại vai trò của nó: **bộ lọc thô, không phải bảo chứng.** Nó chặn sạch nhiễu rõ ràng (≤ 0.562, biên 0.038), không chặn nhầm câu hợp lệ nào, và đẩy vùng mờ sang **grounding prompt** — tầng đã được đo là có tác dụng ở bẫy #17. **Đo tiếp 20/08 và kết quả đảo chiều theo hướng tốt:** gửi cả 5 câu vượt ngưỡng qua `/api/chat` thật thì **cả 5 đều bị từ chối**, toàn bộ do `gemini-3.5-flash-lite` — model yếu nhất chain — phục vụ, và hai câu còn tìm ra bằng chứng một phần rồi giải thích vì sao nó không đủ. Nên ở đây `refusal_rate = 1.000` **nói ít hơn** hệ thống thật sự làm được, chứ không phải nói quá. Bài học vẫn giữ nguyên và không đổi chiều: **một ngưỡng chỉ đáng tin bằng tập negative dùng để đo nó** — sáu câu lạc đề hiển nhiên không chứng minh được điều gì về ca khó, dù kết quả cuối cùng hoá ra là tốt. Biết là tốt và **đo được** là tốt là hai chuyện khác nhau |
| 24 | `p90_ttft_ms` đi **18368 → 13358** qua một đêm và "đạt" ngưỡng 15s — mà **không ai sửa gì về tốc độ** | Hôm trước tôi thêm 5 câu `hard_negative` vào bộ eval. Câu trả lời cho chúng là **lời từ chối**: ngắn, model quyết định sớm, TTFT 2749–3190ms so với trung vị 8592 của phần còn lại. Năm giá trị nhanh gia nhập mẫu đủ để kéo `p90` xuống dưới ngưỡng. Tính lại chỉ trên 26 câu gốc: **15879 — vẫn chưa đạt**. Hệ thống có nhanh lên thật (18368 → 15879 trên cùng cơ sở) nhưng không nhiều như con số 13358 gợi ý | Loại `hard_negative` khỏi thống kê TTFT, cùng lí do đã loại chúng khỏi `citation_validity`. Hai bài học, và cái thứ hai đắt hơn: **(a)** thêm câu vào bộ đo là **đổi mẫu**, nên mọi chỉ số tính trên mẫu đó đứt mạch so sánh với các lần chạy trước — dòng 1–12 không có nhóm này; **(b)** đây là **lần thứ sáu** một con số trông như kết quả mà không phải, và là lần đầu **do chính tôi tạo ra** — bằng đúng thay đổi nhằm làm phép đo mạnh hơn. Năm lần trước là bug có sẵn; lần này là hệ quả của một cải tiến. **Cải tiến bộ đo cũng phải được kiểm như cải tiến sản phẩm** |
| 25 | Viết xong đường dán ảnh, comment ghi rõ *"thu nhỏ về 2000px rồi mã hoá PNG là lọt ngân sách 3MB"*. Typecheck xanh, 11 test mới xanh | **Chưa ai đo câu đó.** Chạy thử trong trình duyệt thật trên ảnh nhiễu ngẫu nhiên 2000×1500 — ca xấu nhất của PNG: **10.32 MB**, vượt ngân sách hơn ba lần. Cùng ảnh đó ở JPEG q0.85 chỉ **2.14 MB**. Ảnh tổng hợp tôi thử lúc đầu (biểu đồ, chữ) chỉ 0.39MB nên nó **xác nhận nhầm** giả định — đúng loại mẫu thử dễ làm mình yên tâm sai. Ảnh chụp bảng trắng hay ảnh chụp trang giấy sẽ vỡ ngân sách và chết ở nền tảng, với đúng loại lỗi client không đọc được (bẫy #21) | PNG trước — vì ảnh người ta dán chủ yếu là chụp màn hình chữ và biểu đồ, mà JPEG thì nhiễu quanh từng nét glyph và model vision phải đọc lại thứ đó. Không lọt mới lùi sang JPEG. Kéo theo một lỗi thứ hai suýt lọt: `/api/ingest/step` dựng `PageImage` **không kèm `mimeType`**, mà `extractBatch` mặc định `image/png` — nên byte JPEG sẽ được khai là PNG, đúng cái comment tại đó đã cảnh báo là *"unhelpful model error"*. Đã truyền type thật xuyên suốt. **Điểm khác biệt so với 24 bẫy trên: đây là lần đầu một giả định sai bị bắt TRƯỚC khi ship** — và thứ bắt được nó không phải test, mà là thói quen đo chính câu mình vừa viết trong comment |
| 26 | Corpus đáng lẽ có **3 tài liệu**, thực tế database có **9** — trong đó **3 bản của cùng một bài báo**, mỗi bản chunk ra một số khác nhau: 16, 19, 14 | Không phải lỗi thao tác. `store.ts` chống trùng bằng `content_hash`, mà hash đó tính trên **markdown do vision trích ra**, không phải trên byte của file: *"Hash the extracted content rather than the PDF bytes: the file is not on this machine."* Nhưng vision **không tất định** — chính bẫy #1 của bảng này đã đo được điều đó. Nên cùng một PDF, cùng một tài khoản, tải lên hai lần cho ra hai hash khác nhau và **cơ chế chống trùng không bao giờ nổ**. Bằng chứng sạch nhất: `feb1b41f` và `a8bc94db` cùng chủ sở hữu, cùng file, hash khác nhau, 19 chunk so với 14 | **Kiểm hậu quả trước khi sửa, và hậu quả nhỏ hơn tôi tưởng:** chạy `--retrieval-only` ngày 12/08 (corpus 3 tài liệu) và ngày 20/08 (corpus 9 tài liệu, 111 chunk) cho **đúng cùng một bộ số** — `hit@8` 1.000, `MRR` 0.926, cross-lingual 1.000. Sáu tài liệu nhiễu thêm vào không kéo tụt truy hồi, và đó là một **kết quả đáng viết** chứ không phải một đống rác cần giấu. Hai bài học tách bạch: **(a)** dùng một giá trị **không tất định** làm khoá định danh thì khoá đó vô nghĩa — comment ngay tại chỗ đã nói rõ ý định *"two uploads of the same document should be one document"*, và code không thể thực hiện được ý định đó vì đầu vào của nó là thứ duy nhất trong hệ thống không lặp lại được; **(b)** `--retrieval-only` gọi thẳng RPC với `filter_documents: None` bằng service_role, nên nó **đo trên mọi tài liệu của mọi tài khoản**, không phải trên corpus mà `eval_dataset.json` khai. Chỉ số vẫn đúng, nhưng **cơ sở của chỉ số thì không giống bản khai** — đúng loại chênh lệch người phản biện sẽ hỏi |
| 27 | **Sửa lại bẫy #26 — kết luận "không kéo tụt truy hồi" sai.** Chạy `--apply` xoá đúng 2 tài liệu mồ côi thật (24/08), rồi đo lại: `MRR` đi **0.926 → 0.897** | Bẫy #26 so sánh hai lần chạy **khác ngày, khác điều kiện** (12/08 vs 20/08) và kết luận từ đó là **so sánh gián tiếp**, không phải một phép đo trước/sau trên cùng một thao tác. Đo trực tiếp 24/08 thì lộ ra: `t-008` (câu xuyên ngôn ngữ, hỏi nguyên nhân hallucination từ LLM) đổi từ `mrr=1.0` xuống `mrr=0.5` — trang top-1 đổi từ trang 5 (đúng) sang trang 2 (sai), trang 5 tụt xuống hạng 2. Cơ chế: ba bản trùng của `2402.00253v2.pdf` có ranh giới chunk khác nhau (16/19/14 chunk, vì vision không tất định — bẫy #26), nên với riêng câu này, **một trong hai bản vừa xoá tình cờ có ranh giới chunk xếp đúng trang 5 lên hạng 1** — một dạng may rủi do trùng lặp tạo ra chứ không phải tín hiệu truy hồi thật. 30/31 câu còn lại không đổi | Sửa `corpus_note` trong `eval_dataset.json` và bẫy #26 để không dẫn nhầm ai đọc sau. **Bài học kép:** (a) so sánh hai lần chạy **khác ngày** không thay được một phép đo trước/sau trên cùng thao tác — kể cả khi cả hai lần đều là số thật, chúng có thể khác nhau ở nhiều biến cùng lúc; (b) `MRR` **không đơn điệu theo số tài liệu nhiễu** — dữ liệu nhiễu trùng lặp đôi khi vô tình cộng thêm một "lượt thử" trúng, nên dọn dữ liệu sạch **không nhất thiết cải thiện chỉ số**, dù nó luôn đúng về mặt vệ sinh dữ liệu. Đây là lần thứ bảy một con số trông như kết quả mà không phải, và là lần đầu tiên chính bẫy đi sửa một bẫy khác trong cùng bảng này |
| 28 | **Bẫy nghiêm trọng nhất tính đến giờ.** Ba câu hỏi eval mới cho ảnh dán đều trả lời **rỗng**: *"the context does not contain the actual image, data points"* — dù `image_hit_at_8 = 1.0`, `image_mrr = 1.0`, đúng trang được trích. Tra ngược thì phát hiện đây **không phải lỗi riêng ảnh mới**: `g-001`, `g-002` — hai câu `figure` trong bộ 26 câu gốc, có từ 11/08 — cũng trả lời rỗng y hệt kiểu này, ở **mọi lần chạy full mode từ trước tới nay**. Không chỉ số nào trong 15 lần chạy bắt được | Gốc rễ: `display_text` — trường đưa thẳng vào `buildContext` để sinh câu trả lời — **cố tình giữ nguyên** placeholder `[[FIGURE:id]]` thay vì thay bằng dữ liệu thật, theo đúng thiết kế ghi trong docstring của `chunk.ts`. Nhưng không có UI nào trong frontend đọc placeholder đó để render thành gì cả — `grep -rl "FIGURE" src/components/` ra rỗng. Tức là thiết kế "giữ nguyên để hiển thị" phục vụ một mục đích **không tồn tại**, và cùng lúc phá mất mục đích thật: model nhận nguyên văn chuỗi `[[FIGURE:fig-1-1]]`, không có gì để đọc, nên trả lời đúng đắn theo cái nó được đưa — "không có dữ liệu". Xác minh trực tiếp: đọc chunk thật của ảnh dán trong database, `figure_refs[0].data` có sẵn số liệu đúng (*"24/07: 134.5 / 139.5"* — khớp đáp án tay), nhưng `display_text` chỉ có `[[FIGURE:fig-1-1]]` chưa thay thế. Quét toàn corpus: **46/90 chunk (51%) mang placeholder chưa thay thế** — quá nửa dữ liệu đang mất khả năng trả lời đúng bất cứ khi nào câu hỏi cần đọc hình/bảng/sơ đồ | Sửa `buildContext` (`src/lib/prompt.ts`) để thay `[[FIGURE:id]]` bằng `caption + description + data` từ `figure_refs`, đúng logic `toEmbedText` trong `chunk.ts` đã làm cho `embed_text` — chỉ là chưa từng làm cho `display_text`. Xuất `FIGURE_REF` từ `chunk.ts` để không viết lại regex lần hai, tránh drift đúng bài học từng ghi ở đầu file này. 3 test mới, dùng chính dữ liệu đo được từ database làm ca kiểm. **Bài học đắt nhất trong bảng này:** hai trường biểu diễn kép (`embed_text`/`display_text`) được thiết kế cho hai NGƯỜI ĐỌC khác nhau — máy tìm kiếm và model sinh câu trả lời — nhưng chỉ một trong hai đường được nối đúng đầu ra của nó. `hit@8` đo trúng trang, `citation_validity` đo có đánh số `[n]` hay không — cả hai đều **không đọc nội dung `display_text`**, nên một field vỡ hoàn toàn vẫn để lại một hàng số đẹp. Đây là lần đầu tiên bộ ba `image`/`figure`/`table` — đúng loại nội dung dự án quảng cáo là thế mạnh của kiến trúc vision — lại chính là loại nội dung duy nhất route sinh câu trả lời không đọc được. **Xác nhận trên production cùng ngày, không chỉ tin mã thoát 0:** đẩy lên, đợi Vercel deploy, chạy lại cả 3 câu, đọc nguyên văn từng câu trả lời chứ không tin mỗi việc cụm "không có thông tin" biến mất — cả ba đúng, kể cả câu ra số cụ thể (134.5, 139.5 — khớp đáp án tay) và câu phải từ chối (giải thích đúng lí do ảnh không có giá vàng thế giới, không bịa) |

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

**Một quy tắc, áp cho mọi con số dưới đây:** ghi kèm **chế độ chạy**, **cỡ mẫu**
và **nơi chạy**. Bộ số đẹp nhất của dự án từng là một bộ ghép ba chỉ số từ lần
chạy 26 câu chế độ truy-hồi với một chỉ số từ lần chạy 8 câu chế độ full — nhìn
thì như một kết quả, thực ra không lần chạy nào cho ra cả bốn số đó.

Giờ ghi ở dưới là **giờ Việt Nam** (`run_at` trong report lưu UTC, +7).

| # | Thời điểm | Chế độ | Nơi | n | hit@8 | cross | MRR | citation | refusal | faithful | TTFT | Cái gì đổi so với dòng trên |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 11/08 16:56 | retrieval | — | 26 | 0.941 | 0.833 | 0.824 | — | — | — | — | Lần chạy đầu tiên của harness |
| 2 | 11/08 17:00 | retrieval | — | 26 | **1.000** | **1.000** | 0.887 | — | — | — | — | Lưu sẵn biến thể `query_en`/`query_vi` vào dataset |
| 3 | 11/08 17:01 | dense-only | — | 26 | 0.941 | 0.833 | 0.868 | — | — | — | — | Thay `hybrid_search` bằng `dense_search` |
| 4 | 12/08 08:59 | retrieval | — | 26 | 1.000 | 1.000 | **0.926** | — | — | — | — | Chấm câu đúng ở **mọi** trang có đáp án, không chỉ trang đầu |
| 5 | 12/08 14:20 | full | prod | 26 | 1.000 | 1.000 | 0.882 | **0.15** | 1.000 | — | — | Lần đầu gọi `/api/chat` thật — **số này sai**, xem dưới |
| 6 | 12/08 15:20 | full | prod | 26 | 1.000 | 1.000 | 0.821 | 1.000 | **0.0** | — | — | Đã sửa bẫy #14 (trả 503 thay vì thân rỗng) nhưng chạy **trước** commit thêm `served()` — **số này cũng sai**, xem dưới |
| 7 | 13/08 17:08 | full | prod | 26 | 1.000 | 1.000 | 0.882 | 1.000 | 1.000 | — | — | Lần chạy sạch đầu tiên: 26/26 câu, không câu nào hỏng |
| 8 | 18/08 15:16 | full | local | 26 | 1.000 | 1.000 | 0.882 | 0.947 | 1.000 | **1.000** | 4933 | Nối `--judge`, đo TTFT thật |
| 9 | 18/08 15:54 | full | **prod** | 26 | 1.000 | 1.000 | 0.788 | 0.947 | 1.000 | — | **2889** | Chạy lại đúng trên production |
| 10 | 19/08 14:14 | full | **prod** | 26 | 1.000 | 1.000 | 0.883 | **1.000** | 1.000 | **1.000** | 8155 | Chạy ngay sau khi quota reset — lần đầu `faithfulness` có số thật trên production |
| 11 | 20/08 08:42 | retrieval | — | 26 | 1.000 | 1.000 | 0.926 | — | 1.000 | — | — | Chạy lại đúng dòng 4 sau **8 ngày**: trùng khít cả ba chữ số |
| 12 | 20/08 14:15 | full | **prod** | 26 | 1.000 | 1.000 | 0.882 | 1.000 | 1.000 | — | 8594 | Xác nhận `n_timeout` = **0** sau khi sửa trần 60s. Không chạy `--judge` |
| 13 | 20/08 14:56 | retrieval | — | **31** | 1.000 | 1.000 | 0.926 | — | 1.000 | — | — | Thêm nhóm `hard_negative` 5 câu. Mọi chỉ số cũ **không đổi** — đúng ý đồ |
| 14 | 20/08 15:19 | full | **prod** | 5 | — | — | — | — | — | — | 3565 | Chỉ nhóm `hard_negative` (`--only`). **5/5 từ chối**, lặp lại kết quả 46 phút trước qua đường code khác |
| 15 | 21/08 14:10 | full | **prod** | **31** | 1.000 | 1.000 | 0.882 | **1.000** | **1.000** | — | 8592 | Lần đầu chạy đủ 31 câu. Ba phép tách xác nhận; `n_timeout` = 0 lần thứ hai |

Dòng 10 là bảng nghiệm thu hiện hành (`REQUIREMENTS.md` §7). Các lần chạy 3, 5,
6 và 8 câu không đưa vào bảng: chúng là lần dò lỗi, không phải phép đo.

**Dòng 13 là phép kiểm cho chính thay đổi ở dòng đó.** Thêm 5 câu vào bộ eval là
đúng loại thay đổi có thể âm thầm làm hỏng chỉ số: nhóm mới **vượt được ngưỡng
cosine** nên nếu tính chúng vào `refusal_rate` thì con số rơi từ 1.000 xuống
**0.545** trong khi hệ thống vẫn chạy đúng — đúng dạng "chỉ số sai theo hướng bi
quan" ở §4.5. Chúng vì thế tách riêng: `refusal_rate` chỉ đo đường từ chối **có
cấu trúc**, còn nhóm này đi đường sinh câu trả lời và từ chối bằng văn xuôi. Kết
quả dòng 13 xác nhận: mọi chỉ số cũ giữ nguyên đến từng chữ số.

**Dòng 11 là bằng chứng cho bẫy #18b.** Nó lặp lại đúng điều kiện của dòng 4 sau
tám ngày và cho **cùng ba chữ số thập phân** — trong khi MRR ở chế độ full dao động
0.788–0.883 giữa các lần chạy. Chế độ truy-hồi lặp lại được vì biến thể truy vấn
lấy từ dataset; chế độ full sinh chúng trực tiếp mỗi lần gọi. **So truy hồi giữa
hai thời điểm thì phải so ở dòng cùng chế độ.**

### Ba con số trông như kết quả mà không phải

Đây là phần đáng đọc nhất của mục này. **Năm lần** trong dự án, một con số hiện
ra trông như kết quả trong khi nó đang đo thứ khác. Ba lần lộ ra ngay trên bảng
này:

**Dòng 5, `citation_validity = 0.15`.** Ngưỡng cần 0.95, nên nhìn qua là "trích
dẫn hỏng nặng". Xem tay thì **không trích dẫn nào sai**. Thật ra 17/26 câu có
thân response **rỗng** vì hết hạn mức lúc sinh, và hàm chấm trả 0.0 khi không
thấy marker. Dấu hiệu lộ ra ngay ở cột bên cạnh: `median_latency_ms = 964` —
gần một giây cho một câu trả lời có sinh văn bản là **bất khả thi**. Bẫy #14.

**Dòng 6, `refusal_rate = 0.0`.** Đọc như "hệ thống không bao giờ từ chối" — tức
là hỏng đúng cái tính năng trung tâm. Thật ra 19/26 request trả **401** vì token
hết hạn, và một request hỏng bị tính là "câu hỏi mà hệ thống đã không từ chối".
Cách sửa là hàm `served()`: request hỏng **đo đường truyền, không đo hệ thống**,
nên bị loại khỏi mẫu và đếm riêng ở `n_generation_failed`.

**Hai dòng 5 và 6 sai theo hướng bi quan** — và đó là hướng nguy hiểm hơn, vì nó
dụ mình đi sửa thứ vốn đã đạt 1.000. Nếu tin `0.15` mà đi chỉnh prompt trích dẫn
thì mất nhiều ngày cho một thứ không hỏng.

**Dòng 1 → 2, `hit_cross_lingual` 0.833 → 1.000 trong 4 phút.** Không có commit
nào giữa hai lần chạy, và không phải hệ thống tốt lên: **lần 1 đo một hệ thống
không ai chạy.** Harness lúc đó đưa câu hỏi thô vào truy hồi, trong khi
production luôn sinh `query_en`/`query_vi` trước. Lần 2 lưu sẵn biến thể vào
dataset — từ đó harness mới đo đúng thứ người dùng gặp.

### Quy tắc rút ra từ bảng này

**Đọc dòng 1 và dòng 3 cạnh nhau.** Hybrid-không-biến-thể (0.941 / 0.833 /
`t-005` trượt) **giống hệt** dense-only (0.941 / 0.833 / `t-005` trượt). Nghĩa
là khi thiếu biến thể tiếng Anh, hai nhánh full-text **đóng góp bằng không** —
hệ thống ba nhánh thoái hoá thành một nhánh mà không hề báo lỗi. Đây là dạng
hỏng tệ nhất: hỏng im lặng, chỉ số vẫn ra số đẹp 0.941.

**Cùng một câu, `t-005`, quyết định cả ba phép so.** Thô vs có biến thể; dense
vs hybrid; và phép thử `eval.why bilingual` viết ở §1.3. Ba đường đo độc lập chỉ
vào đúng một câu hỏi. Điều đó vừa là bằng chứng mạnh (không phải trùng hợp), vừa
là giới hạn phải nói ra (bộ eval chỉ có **6 câu xuyên ngôn ngữ tính điểm**, nên
một câu = 16.7 điểm phần trăm — xem §1.3).

**MRR không so được giữa hai chế độ.** Dòng 4 cho 0.926, dòng 9 cho 0.788, cùng
corpus cùng câu hỏi. Không mâu thuẫn: chế độ truy-hồi dùng biến thể **lưu sẵn**
nên lặp lại được, chế độ full **sinh trực tiếp mỗi lần gọi** nên dao động. Muốn
so truy hồi giữa hai thời điểm thì phải so ở `--retrieval-only`. Bẫy #18b.

**Chỉ số tụt không đồng nghĩa sản phẩm xấu đi — và chỉ số lên cũng vậy.** Dòng 9
có 17/19 câu rơi vào `gemini-3.5-flash-lite` (dòng 7: 0/19) vì các model trên đã
cạn hạn mức trong ngày. `citation_validity` 1.000 → 0.947 là hệ quả của **thời
điểm chạy**, không phải của một thay đổi code. Dòng 10 chạy ngay sau khi quota
reset, chain dùng model mạnh, và chỉ số về lại **1.000** — không sửa dòng code
nào ở giữa. Đó là xác nhận cho bẫy #18, không phải một cải thiện.

**Và cùng cơ chế đó đánh sập một ngưỡng nghiệm thu.** `median_ttft_ms` đi
2889 → **8155** giữa dòng 9 và dòng 10, cũng không có thay đổi code nào. Vì
`flash-lite` là mắt xích **nhanh nhất** chain (2860–4225ms) trong khi model mạnh
mất 8444ms. Ngưỡng "token đầu tiên < 3s" vì thế **chỉ đạt khi hệ thống đang chạy
ở chế độ chất lượng thấp nhất**. Tốc độ và độ tin cậy trích dẫn đánh đổi nhau
dọc theo chain — điều không ai biết khi đặt ngưỡng, vì lúc đó chain chưa tồn
tại. Ngưỡng đã được đổi ngày 19/08 thành `p50` < 10s, `p90` < 15s và
**chạm-trần = 0**, với lí do độc lập với số đo. Bẫy #20.

**Một lần chạy sạch không chứng minh hệ thống không hỏng.** Dòng 10 có 2/26 câu
chết ở 62 giây — chạm trần `maxDuration = 60` của Vercel. Mười một lần chạy đầy
đủ trước đó không lần nào vượt 55s, nhưng ngày 13/08 đã có một câu mất **44.2s,
tức 74% của trần** — và không chỉ số nào trong summary cho thấy, vì summary chỉ
có trung vị. Đó là lí do `p90_ttft_ms` và `n_timeout` được thêm vào harness cùng
lúc với ngưỡng mới: **một ngưỡng không có code nào đo là một ngưỡng chưa tồn
tại.** Bẫy #21 — **đã đóng ở dòng 12**: `n_timeout` = 0, xác nhận trong một lần
chạy còn bị tải nặng hơn dòng 10 (5 lần chạm rate limit, câu chậm nhất 22.6s).

**Và đúng lúc đó một ngưỡng khác hỏng — ngưỡng tôi tự đặt một ngày trước.**
`p90_ttft_ms` đi 12069 (dòng 10) → **18368** (dòng 12), vượt ngưỡng 15s. Lúc đặt
ngưỡng ấy tôi đã ghi rõ nó "thừa nhận có nhìn vào phân bố", khác với `p50 < 10s`
lấy từ mốc UX bên ngoài. Một lần chạy sau: **ngưỡng lấy từ dữ liệu hỏng, ngưỡng
lấy từ bên ngoài vẫn đạt** (8594). Đây là minh hoạ do chính dự án tự tạo cho điều
Bước 7 đã nói.

Thêm một lí do kĩ thuật: `p90` trên **19 mẫu** không phải thống kê ổn định. Theo
nearest-rank nó là giá trị **thứ 18 của 19**, tức chỉ có **một** câu đứng trên nó
— gần như "câu chậm nhì". Giữ nguyên 15s và ghi là chưa đạt; dời ngưỡng lần thứ
hai ngay sau lần vi phạm đầu tiên thì nó thôi không còn là ngưỡng.

**Và ở dòng 15 chính chỉ số đó suýt tự "sửa" mình bằng một cách không có thật.**
Harness báo `p90` = 13358, tức đạt. Nhưng dòng 15 là lần đầu chạy đủ 31 câu, và 5
câu `hard_negative` mới thêm đều là **câu từ chối** — ngắn, quyết định nhanh, TTFT
2749–3190ms so với trung vị 8592 của phần còn lại. Năm giá trị nhanh gia nhập mẫu
đủ để kéo `p90` xuống dưới ngưỡng.

Tính lại chỉ trên 26 câu gốc, cùng cơ sở với dòng 1–12: **15879 — vẫn chưa đạt.**
Hệ thống có nhanh lên thật (18368 → 15879) nhưng không nhiều như 13358 gợi ý. Đã
loại `hard_negative` khỏi thống kê TTFT; bảng trên ghi số đã tính lại. Bẫy #24.

### Còn thiếu gì

`faithfulness` chưa có số trên production: dòng 8 đo được 1.000 nhưng chạy ở
local; dòng 9 chạy đúng chỗ thì 19/19 câu trả `UNAVAILABLE` vì hết hạn mức chấm.
Cần **một lần chạy `--judge` trên production ngay sau khi quota reset**, và hôm
đó không tiêu request nào khác — một lần chạy full 26 câu kèm chấm tốn khoảng
78 trong tổng ~80 request/ngày của cả chain.

---

## 5. Nếu làm lại

### Giữ nguyên

**Spike sáu trang khó nhất trước khi viết dòng code nào.** Bốn lỗi mà đọc code
bao nhiêu lần cũng không thấy đều lộ ra ở đó, và hai trong bốn cái là loại **âm
thầm mất dữ liệu** chứ không báo lỗi. Chạy thẳng `all` trên tài liệu lớn thì lỗi
`RECITATION` sẽ nuốt trang mà không ai biết.

**Cache trước lần gọi API thứ hai.** Không phải khi thấy chậm. Với ngân sách 20
request/ngày/model, một lần chỉnh prompt không cache tốn quá nửa ngày.

**Cô lập dữ liệu ở tầng database, không ở tầng ứng dụng.** `SECURITY INVOKER` +
RLS biến lỗi nghiêm trọng nhất có thể xảy ra — trả tài liệu người khác — thành
lỗi vô hại nhất: trả rỗng. Đây là quyết định tôi hài lòng nhất trong cả dự án.

**Hai pipeline ingest kèm parity test so từng byte.** Nghe thừa cho tới lần đầu
chúng lệch nhau.

**Ghi lại cả những kết luận đã sai.** Mục §1.2, bẫy #3b, #14b, #18b, #24 đều là
đính chính của chính tôi. Chúng là phần đáng đọc nhất của file này — và nếu xoá
đi để trông gọn hơn thì mất luôn thứ duy nhất không tra Google được.

### Làm khác

**Viết bộ eval ở tuần 1, không phải tuần 2.** Nó là công cụ chẩn đoán, không phải
báo cáo cuối kì. Mọi quyết định giữa tuần 1 và lúc có bộ eval đều là đoán, và ít
nhất một quyết định (`MIN_COSINE = 0.35`) sai suốt nhiều ngày mà không ai thấy.

**Commit prompt theo từng lần chỉnh.** Bước 3 phải **đo lại** thay vì tra cứu, vì
lí do từng quy tắc ra đời chỉ còn trong trí nhớ. Một dòng trong commit message mỗi
lần sửa prompt sẽ tiết kiệm cả buổi và một loạt thí nghiệm không kết luận được gì.

**Đo baseline trước khi đo tác dụng, ngay từ thí nghiệm đầu tiên.** Bốn ablation ở
Bước 3 vô nghĩa vì tôi chưa biết ingest **không tất định**. Một lần chạy baseline
3 lần trước đó sẽ tiết kiệm cả bốn.

**Ghi kèm chế độ chạy và cỡ mẫu vào chỉ số ngay từ đầu.** Không phải sau khi phát
hiện một bộ số ghép từ hai lần chạy khác nhau.

**Thiết kế `null` có đúng một nghĩa.** Bẫy #22 tồn tại vì `conversationId = null`
mang hai nghĩa cho hai người đọc khác nhau. Chỗ hai nghĩa đó tách ra chính là chỗ
sinh lỗi, và nó nằm trên đường đi mà không bộ đo nào chạy qua.

**Đặt ngưỡng NFR từ nguồn độc lập với số đo.** `p50 < 10s` lấy từ mốc UX bên ngoài
và vẫn đứng vững; `p90 < 15s` lấy sau khi nhìn phân bố và hỏng sau đúng một lần
chạy. Bài học rẻ nhất trong file này.

### Bỏ hẳn

**Ngưỡng "token đầu tiên < 3s".** Nó được neo vào một request **không gọi model
nào**. Bất kì ngưỡng nào đặt trước khi biết đường đi thật của request đều là con
số trang trí.

**Ý định tìm một `MIN_COSINE` tối ưu.** Không tồn tại: câu hỏi ngoài phạm vi
nhưng cùng lĩnh vực ghi điểm chồng lấn với câu trong phạm vi, vì cosine đo **độ
liên quan chủ đề** chứ không đo **khả năng trả lời được**. Thời gian dành cho việc
dò con số ấy đáng lẽ nên dành cho tầng phòng thủ thứ hai.

**Tin vào một chỉ số mà không mở dữ liệu thô.** Sáu lần một con số trông như kết
quả mà không phải, và lần thứ sáu do **chính việc cải tiến phép đo** tạo ra.

### Điều tôi không lường trước

**Phần lớn công sức không nằm ở RAG.** Nó nằm ở chịu lỗi dưới ràng buộc 0 đồng:
xoay chain model, phân biệt hết-quota-ngày với giới hạn-theo-phút, kéo token đầu
ra khỏi stream trước khi cam kết header, đặt hạn chót dưới trần nền tảng. Phần
"tìm đoạn văn rồi hỏi model" là phần dễ nhất.

**Model không tất định theo cách không ai cảnh báo.** Cùng trang, cùng prompt,
ra 1 hình hoặc 9 hình — và hai lần sau trùng khít từng byte. Đó không phải nhiễu
rải quanh trung bình mà là **hai chế độ hành vi**, nên trung bình hoá là vô nghĩa.

**Chỉ số sai theo hướng bi quan nguy hiểm hơn sai theo hướng lạc quan.** Cái lạc
quan làm mình tưởng đã xong; cái bi quan **dụ mình đi sửa thứ đang chạy tốt**. Ba
trong sáu ca ở đây sai theo hướng bi quan.

---

## 6. Checklist tái sử dụng

Thứ tự có chủ ý: mỗi mục phải đo được trước khi mục sau bắt đầu.

**Trước khi viết dòng code nào**

- [ ] Spike model trên **3–6 trang khó nhất** của corpus thật, không phải trang
      trung bình — trang dày công thức, trang toàn biểu đồ, trang trộn ngôn ngữ
- [ ] Liệt kê model nào **thật sự có quota free**; một model bị rút khỏi free
      tier trả 429 với `limit: 0`, trông y hệt cạn quota
- [ ] Chạy cùng một trang **3 lần** với prompt y hệt. Nếu kết quả khác nhau thì
      mọi phép so sau này phải chạy lặp lại, và biết điều đó ngay bây giờ rẻ hơn
      biết sau bốn thí nghiệm

**Trước lần gọi API thứ hai**

- [ ] Cache mọi response tốn quota ra đĩa, khoá theo **đơn vị nhỏ nhất** có thể
      xử lí lại độc lập (ở đây là từng trang)
- [ ] Tính ra bằng số: một lần chỉnh prompt tốn bao nhiêu phần ngân sách ngày

**Trước khi tối ưu bất cứ thứ gì**

- [ ] Viết bộ eval. Nó là **công cụ chẩn đoán**, không phải báo cáo cuối kì
- [ ] Chia chỉ số theo **tầng**: truy hồi hỏng và sinh câu trả lời hỏng cần cách
      sửa ngược nhau, một con số gộp che mất nửa nào đang hỏng
- [ ] Cho mỗi chỉ số một tập negative **khó**, không chỉ negative hiển nhiên
- [ ] Ghi **chế độ chạy + cỡ mẫu + nơi chạy** vào mọi con số, ngay từ lần đầu
- [ ] **Loại request hỏng khỏi mẫu**, đừng chấm chúng 0 điểm

**Khi đặt ngưỡng**

- [ ] Đo phân bố thật của cả hai nhóm trước, đừng chọn theo cảm tính
- [ ] Lấy ngưỡng từ **nguồn độc lập với số đo** nếu có thể. Ngưỡng khớp vào một
      mẫu là ngưỡng chưa được kiểm
- [ ] Kiểm ngưỡng có đạt được bằng kiến trúc hiện tại không — đếm số lượt gọi
      model **tuần tự** trên đường đi thật
- [ ] Nếu hai nhóm chồng lấn thì **không có ngưỡng tối ưu**; cần một tầng thứ hai
      biết đọc nội dung

**Khi đọc một con số**

- [ ] Trước khi tin một chỉ số **tụt**, mở dữ liệu thô của vài ca hỏng ra xem
- [ ] Đối chiếu với một cột khác: latency 950ms cho một câu trả lời có sinh văn
      bản là bất khả thi, và đó là dấu hiệu lộ ra nhanh nhất
- [ ] Cùng một con số ở hai lần chạy vẫn có thể là **hai câu khác nhau**
- [ ] Thêm câu vào bộ đo là **đổi mẫu** — mọi chỉ số tính trên nó đứt mạch so
      sánh với các lần chạy trước

**Khi viết code chạm tới model**

- [ ] Kiểm tài liệu thư viện **bằng phép đo**, không bằng cách đọc. Doc của thư
      viện cũng là một giả định
- [ ] Test đường lỗi bằng **model thật giả lập**, không bằng generator tự bịa —
      generator tự bịa ném lỗi đúng như mình tưởng, nên test xanh mà vá vô dụng
- [ ] Đặt hạn chót **dưới** trần của nền tảng, tính từ lúc nhận request chứ không
      từ lúc gọi model
- [ ] Kéo token đầu tiên ra **trước khi cam kết HTTP header**, để lỗi còn đổi
      được status
- [ ] Tham số nào quên là hỏng âm thầm thì để **bắt buộc, không default**

**Về dữ liệu và trạng thái**

- [ ] Cô lập người dùng ở **tầng database**, không ở tầng ứng dụng
- [ ] Mỗi giá trị **một nghĩa**. Một giá trị mang hai nghĩa sẽ thành lỗi ở đúng
      chỗ hai nghĩa tách ra
- [ ] Ngân sách token đo trên **đúng chuỗi được embed**, không phải chuỗi hiển thị
- [ ] Kiểm nợ kĩ thuật **trước khi trả nó** — nó cũng là một khẳng định chưa đo

**Về ghi chép**

- [ ] Commit prompt theo từng lần chỉnh, kèm lí do
- [ ] Ghi lại cả những kết luận **đã sai của chính mình**. Đó là phần duy nhất
      của tài liệu này không tra cứu ở đâu khác được
