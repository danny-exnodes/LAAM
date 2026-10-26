# Larvis Display Panel — bảng/biểu đồ cho chế độ giọng nói

**Ngày:** 2026-08-04
**Trạng thái:** design đã duyệt, chưa có plan
**Phạm vi:**

- `extractForSpeech` — hàm **mới** trong `src/lib/chat/voice.ts`, **chỉ `/constellation` (v1)** dùng.
- `stripForSpeech` — **giữ nguyên, không đổi hành vi**. `ConstellationV2Client.tsx` tiếp tục dùng nó. Lý do: extract *bỏ* bảng khỏi lời nói, nên client nào không có panel mà dùng extract thì user **mất trắng** dữ liệu — v2 chưa có panel nên phải giữ đường `tablesToProse` cũ.
- `DisplayPanel` + pill — **chỉ v1**, nơi user đang thực sự dùng. v2 nhận cả panel lẫn `extractForSpeech` sau, trong một lượt thay đổi riêng.
- Text chat (`ChatClient.tsx`) **không đụng tới**: nó đã render bảng/chart inline.

## Vấn đề

Larvis trả lời bằng giọng nói, nhưng một phần lớn câu trả lời có dữ liệu chỉ hiểu được khi **nhìn**. Đo trên một hội thoại thật (`98d66697-fdc1-4d27-b7c5-2efb83b5fa7b`, 46 message): 11/21 câu trả lời của assistant chứa bảng markdown, 4 câu chứa block ` ```chart `. Đọc to những thứ đó là vô nghĩa — bảng receipt 10 cột, UUID `428a3084-43da-4edb-…`, hay dãy 5 số variance không thể truyền qua âm thanh.

Hệ quả thứ hai đang có sẵn trong sản phẩm: `VOICE_GUIDE` yêu cầu model đừng xuất markdown, và **model phớt lờ**. Đã sửa prompt hai lần (checkpoint 2026-07-22 và 2026-08-03) đều không dứt điểm. Câu trả lời dài ra vì markdown, rồi TTS phải xử lý cả đống cú pháp.

Hai vấn đề này có chung một lời giải: **tách kênh nói khỏi kênh nhìn.**

## Nguyên tắc

> Giọng nói kể **ý nghĩa**. Màn hình đưa **dữ liệu**. Không bên nào lặp lại bên kia.

Pattern này là chuẩn công nghiệp cho trợ lý giọng nói có màn hình — Alexa APL tách `outputSpeech` khỏi APL document, Google Assistant tách `speech` (SSML) khỏi card, Apple App Intents cho Siri nói một câu kèm snippet view. Ta áp dụng đúng nguyên tắc đó, không phát minh gì mới.

## Kiến trúc

```
                    ┌─ nguồn A: tool result ──► deriveFromToolResult() ──┐
                    │  (server, trong orchestrator)                      │
  câu hỏi ──► agent ┤                                                    ├─► ViewDescriptor ──► DisplayPanel
                    │                                                    │
                    └─ nguồn B: text trả lời ──► extractForSpeech() ─────┘
                       (client, khi KHÔNG có nguồn A)          │
                                                               └──► speech (đã sạch markdown) ──► TTS
```

### Hợp đồng dữ liệu

```ts
export type ViewDescriptor = {
  kind: "table" | "chart" | "record" | "stat";
  title: string;
  source: { type: "tool"; toolName: string; at: number } | { type: "model" };
  columns?: { key: string; label: string; align?: "left" | "right" }[];
  rows?: Record<string, unknown>[];
  chart?: { type: "bar" | "line" | "pie"; labelKey: string; valueKey: string };
  truncated?: { shown: number; total: number };
};
```

`source` không phải metadata trang trí — nó là **ranh giới tin cậy**, điều khiển badge trên panel. Bảng lấy từ DB và bảng model tự nghĩ ra không được trông giống nhau.

### Nguồn A — code suy ra từ tool result (ưu tiên)

Hook vào `orchestrator.ts` ngay sau `dispatch` (`src/lib/agent/orchestrator.ts:151-152`), cạnh chỗ drilldown đang cắm. Dùng lại helper chuẩn hoá của `src/lib/agent/drilldown.ts` để nhận cả `{ text: "<json>" }` (MCP) lẫn object thuần.

Luật thuần cấu trúc — **không** phân loại ý định, **không** gọi model:

| Hình dạng `result` | → `kind` |
|---|---|
| Mảng ≥ 2 object cùng bộ key | `table` |
| …và có ≥1 cột số + 1 cột nhãn, ≤ 25 dòng | `table` + `chart.bar` |
| Object đơn nhiều field | `record` |
| Một con số / một dòng | `stat` |
| Không khớp gì | không phát descriptor |

Ngưỡng cụ thể: **giữ tối đa 50 dòng** trong descriptor, dài hơn thì cắt và ghi `truncated: { shown: 50, total }` — panel phải nói rõ "50/666 dòng", không được im lặng cắt bớt. (Mức `focus` hiển thị 3 dòng đầu, nhưng đó là chuyện render, không cắt dữ liệu.)

`kind: "chart"` **thuần** chỉ sinh từ nguồn B (block ` ```chart ` model viết). Nguồn A không bao giờ tạo chart không kèm bảng — dữ liệu luôn có sẵn dạng dòng nên luôn ra `table`, chart chỉ là trường phụ.

Orchestrator không giữ controller của stream, nên nó nhận thêm callback `onView?: (d: ViewDescriptor) => void` (cùng kiểu với `onBackstop` đang có). **Orchestrator gom descriptor nội bộ suốt lượt và gọi `onView` đúng MỘT lần khi vòng lặp kết thúc**, không gọi sau mỗi `dispatch`. Route nhận callback đó rồi phát frame.

#### Một lượt chỉ được một panel

Một lượt thường có **nhiều** tool result: `drilldown.ts` sinh ra bước hai (list → detail) một cách có chủ đích, và vòng lặp chạy tới `DEFAULT_MAX_ROUNDS = 25`. Câu "cửa hàng nào lệch kho nhất" có thể lần lượt trả về danh sách project, rồi bảng tổng hợp, rồi một bản ghi tra cứu lẻ. Nếu phát frame sau mỗi `dispatch` thì panel nhảy loạn và kết thúc ở kết quả tình cờ cuối cùng.

Luật: **gom trong suốt lượt, chỉ phát một `view` frame ở cuối**, chọn theo thứ tự ưu tiên:

1. Descriptor `table`/`chart` **cuối cùng** trong lượt.
2. Nếu không có: descriptor `record`/`stat` cuối cùng.
3. Không có gì: không phát frame.

Chọn *cuối cùng* chứ không phải *đầu tiên* là vì cặp list → detail của `drilldown.ts`: bước hai mới là thứ user hỏi, bước một chỉ là phương tiện lấy id.

### Nguồn B — tách từ chính câu trả lời (khi không có tool call)

Câu như "so sánh iPhone và Android" không gọi tool nào; model tự viết bảng markdown. Việc của code không phải dựng bảng mà là **cắt bảng ra khỏi lời nói**.

`src/lib/chat/voice.ts` **đã có sẵn parser bảng GFM** — `isTableRow`, `isTableSeparator`, `splitTableCells`. Hiện chúng phục vụ `tablesToProse` (biến bảng thành văn xuôi để TTS đọc). Ta giữ nguyên parser, chỉ đổi đích đến:

```ts
// thay cho stripForSpeech(md): string
export function extractForSpeech(md: string): { speech: string; descriptors: ViewDescriptor[] }
```

`extractForSpeech` là hàm **thêm mới**, không sửa `stripForSpeech`. Phần dọn văn xuôi (gỡ header, `**bold**`, danh sách, link, code fence) **dùng chung** một helper nội bộ để hai hàm không trôi khác nhau — chỉ khác ở chỗ bảng đi đâu: `stripForSpeech` → `tablesToProse`, `extractForSpeech` → descriptor + cắt khỏi lời nói.

Bổ sung một nhánh bắt block ` ```chart ` (JSON Chart.js — dạng model đang xuất sẵn, xem `ChartBlock.tsx`).

`tablesToProse` **không bị xoá**: nó thành đường lui cho bảng sai cú pháp (thiếu dòng `|---|`, số ô lệch nhau). Bảng hỏng không dựng được descriptor thì vẫn phải thành văn xuôi để TTS đọc, tuyệt đối không để lọt ký tự `|` ra loa và cũng không được nuốt mất nội dung.

### Luật ưu tiên

Một lượt có thể sinh cả A lẫn B — model gọi tool xong thường tự vẽ lại bảng trong câu trả lời. Khi đó:

- Descriptor hiển thị: **chỉ lấy từ A** (dữ liệu code lấy được, không thể bịa).
- Nhưng bảng markdown trong text **vẫn bị cắt khỏi speech** — nếu không TTS lại đọc cú pháp bảng.

Không có A → dùng B.

### Truyền qua stream

`src/lib/chat/frames.ts` đã có giao thức frame (`U+001E` + JSON) với tiền lệ đúng y hệt: `pending_write` và `proactive` đều là **card render riêng, không nối vào câu trả lời của model**, số liệu do code suy ra (Rule 13). Thêm một biến thể:

```ts
| { t: "view"; d: ViewDescriptor }
```

Client dùng `splitFrames` sẵn có — không đổi gì ở tầng vận chuyển. Bán kính ảnh hưởng đã kiểm: cả hai consumer (`ChatClient.tsx:419`, `useConstellationChat.ts:62`) lọc frame bằng `if (f.t === …)`, **không** switch vét cạn, nên thêm biến thể không làm vỡ chỗ nào; text chat lặng lẽ bỏ qua `view`.

Phát ở **cuối lượt**, cùng chỗ với chuỗi frame đuôi đang có (`streamOllama`/`streamText` nhận `frames?: ChatFrame[]` và enqueue sau text: tool trace → cite → tokens). `view` nối vào đúng chuỗi đó — không phải cơ chế mới, và tránh được rủi ro thứ tự đã ghi ở `sse-block-ordering-bug`.

**Không persist.** `chatMessages` chỉ lưu `content` (text); frame không được lưu, nên tải lại hội thoại sẽ **không** có panel. Chấp nhận: descriptor là dữ liệu phù du của một lượt nói. Muốn xem lại thì mở text chat — nơi bảng vẫn nằm nguyên trong nội dung message.

## Kênh nói

- `speech` = phần văn xuôi còn lại sau khi tách. **Đây là lời giải cho bug `VOICE_GUIDE`**: thôi năn nỉ model, cắt bằng code.
- Câu chỉ dẫn ("bảng đang hiện trên màn hình") do **code** chèn, lấy từ i18n (`vi`/`en`/`zh`). Điều kiện chèn là `descriptors.length > 0` **tại thời điểm lắp câu nói** — không phải "panel đã mount". Panel mount ngay khi frame `view` tới, tức là sớm hơn tiếng nói đầu tiên rất nhiều (`TTS_PREBUFFER_SECONDS = 3`, ~4.3s tới audio đầu), nên gate theo descriptor là đủ và là thứ duy nhất biết được trong pipeline nói. Không có descriptor → không nói câu này. Trong hội thoại đo được, 9/21 lượt trả về rỗng; nếu để model tự nói thì user nhìn sang màn hình trống.
- Câu chỉ dẫn **không nhắc vị trí** ("bên phải") vì panel nằm giữa và bố cục đổi theo thiết bị.

**Thứ tự bắt buộc:** `extractForSpeech` → chèn câu chỉ dẫn → `splitForSpeech` → TTS.
Sai thứ tự thì soft cap 280 ký tự của `splitForSpeech` sẽ băm bảng thành mảnh và đọc to `| PH-005 | 1015 |`.

## Giao diện

Component mới `DisplayPanel`.

**Đường render — đã kiểm chữ ký component thật, không dùng lại được nguyên xi:**

| Component | Chữ ký | Kết luận |
|---|---|---|
| `ChartBlock` | `({ raw }: { raw: string })` — tự `looseJsonParse` | **Tái dùng**, nhưng phải serialize descriptor → JSON Chart.js rồi truyền vào `raw`. Không sửa `ChartBlock` (recharts + `useChartTheme` giữ nguyên). |
| `MarkdownView` | `({ source }: { source: string })` | **Không dùng** cho bảng. Dùng nó nghĩa là markdown → descriptor → markdown, vòng vo và mất `truncated` / badge / highlight. |

Bảng render bằng markup riêng trong `DisplayPanel` (`<table>` thuần, ~30 dòng) để kiểm soát được canh cột, định dạng số, dòng nổi bật và dòng "5/666".

### Hình thức

Panel kính nổi **giữa màn hình**:

| Thuộc tính | Giá trị | Lấy từ |
|---|---|---|
| Nền | `bg-[#08182a]/92` + `backdrop-blur-xl` | `CommandDock.tsx:41` |
| Viền | `border-[#5bd6ff]/30` | `CommandDock.tsx:41` |
| Chữ | `#eaf6ff` / `#a9e9ff` | `ConstellationClient.tsx:578` |
| Quầng ngoài | **vàng** `rgba(255,196,80,.30–.45)` | cùng tông ring, để panel là một phần của Larvis |

Độ đục `.92` là quyết định có chủ ý: bản kính trong hơn nhìn đẹp hơn nhưng orb là vệt sáng **động phản ứng theo âm thanh**, chữ số đè lên sẽ đổi tương phản liên tục trong lúc user đang đọc.

Panel **không kéo full-height** — chừa khoảng trên để các cung nối tới node agent (LAAM, DAAB…) vẫn thấy. Cạnh đang sáng là chỉ dấu "Larvis đang làm việc với nguồn nào", trùng khớp với ranh giới tin cậy của badge nguồn.

Bù cho phần ring bị che: **viền panel thở theo biên độ âm thanh**, dùng lại `useAudioAnalyser` đang có.

### Hành vi

- **Không phải modal.** Không focus-trap, không backdrop chặn click. User phải vừa nhìn vừa nói tiếp — panel chặn mic hay chặn dock là hỏng cả luồng.
- **Đóng:** nút `×` góc phải trên, hoặc phím `Esc`. Bấm ra ngoài **không** đóng (tránh đóng nhầm khi chạm màn hình lúc đang nói).
- **Đóng chỉ thu gọn, không xoá.** Descriptor còn nguyên; hiện pill `▦ Xem bảng · N` **bên trái `<select>` model**, là con trực tiếp của cụm ở `ConstellationClient.tsx:572` (`absolute bottom-6 right-4 … flex items-center gap-2 rounded-full border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl`). Style bám theo `<select>` anh em ở dòng 578 — `rounded-full px-3 py-2 text-[12px]` — chỉ đổi accent sang vàng. Bấm pill → bung lại.
- **Pill chỉ hiện khi panel đang đóng.** Panel mở thì nút `×` đã làm đúng việc đó; cụm góc dưới phải đã có 3 phần tử, không thêm cái thứ 4 thường trực.
- **Luôn hiển thị lượt mới nhất.** Lượt mới có descriptor → panel tự mở, thay nội dung. Lượt mới **không** có descriptor → giữ nguyên trạng thái đang đóng, không để pill cũ sót lại.
- **Badge nguồn:** `<nhãn> · N dòng · hh:mm` (nguồn A) vs `AI tổng hợp` (nguồn B).
  `source.toolName` là tên tool (`kg_list_projects`), **không phải** tên agent — nhãn "DAAB" không suy thẳng ra được. Lấy nhãn theo thứ tự: node agent đang chọn ở client (`selectedAgentId`, đã có sẵn) → nếu không có thì hiện chính `toolName`. Tuyệt đối không đoán nhãn từ chuỗi tên tool.

### Mật độ

Hai mức, chọn theo breakpoint + một toggle:

| Mức | Dùng khi | Nội dung |
|---|---|---|
| `focus` | mobile, demo/thuyết trình | 1 số lớn + ≤ 3 dòng + chart đơn |
| `detail` | desktop, ngồi trước màn hình | bảng đầy đủ, cuộn được |

Cùng một descriptor, khác cách render. Model **không** biết gì về mật độ — nếu để model tự quyết "lúc này nói ngắn, lúc kia nói dài" thì vừa đắt vừa không ổn định.

Mặc định theo breakpoint (`< md` → `focus`); toggle đặt **trong header của panel**, cạnh nút `×`, không đẩy thêm phần tử vào cụm dock. Lựa chọn nhớ qua `localStorage` cùng kiểu `laam:chat:model` đang dùng.

### i18n & a11y

- Chuỗi mới (câu chỉ dẫn, nhãn pill, badge, tooltip toggle) phải thêm cho **cả ba** ngôn ngữ `vi`/`en`/`zh` — quy ước bắt buộc của repo.
- Panel **không** dùng `role="dialog"` (nó không modal, gắn role đó là nói dối với screen reader). Dùng `role="region"` + `aria-label` là tiêu đề descriptor.
- `×` và pill là `<button>` thật, có `aria-label`, vào được bằng Tab. Badge nguồn đọc được, không phải chỉ màu sắc.

## Kiểm thử

- **Unit `deriveFromToolResult`** — mỗi hình dạng trong bảng ở trên; shape rác → không phát descriptor; mảng dài → có `truncated`.
- **Unit `extractForSpeech`** — bảng GFM, block chart, hỗn hợp cả hai; bảng **sai cú pháp** → không dựng descriptor, rơi về `tablesToProse` (nội dung còn nguyên dưới dạng văn xuôi, không còn ký tự `|`).
- **Regression chốt chặn** — sau extract, `speech` không được chứa `|` đầu dòng hay ` ``` `. Đây đúng chỗ prompt đã thất bại hai lần; test này là thứ giữ nó không tái phát.
- **Guard câu chỉ dẫn** — không descriptor → tuyệt đối không có câu "bảng đang hiện trên màn hình".
- **Luật ưu tiên** — lượt có cả A và B: descriptor phải là của A, và speech vẫn phải sạch bảng.
- **Một panel một lượt** — lượt có 3 tool result (list → aggregate → detail) chỉ phát đúng 1 frame `view`, và là cái `table`/`chart` cuối cùng.
- **Component** — đóng → hiện pill; bấm pill → mở lại; lượt mới có dữ liệu → tự mở + thay nội dung; lượt mới không dữ liệu → giữ đóng, không sót pill cũ; `Esc` đóng, click ra ngoài không đóng.

## Không làm (YAGNI)

Nhiều panel dạng tab/stack · bấm drill-down trong bảng · export panel · mật độ thứ ba · panel cho text chat (text chat đã render inline, không đụng) · để model tự sinh display spec · lưu descriptor vào DB để xem lại sau.

## Việc theo quy ước repo

Ghi mục vào `CHANGELOG.md` phần `[Unreleased]`; `README.md` chỉ sửa nếu hành vi người dùng thấy được đổi (ở đây là có — Larvis mọc thêm panel).

## Rủi ro

- **Thứ tự frame.** Backlog đang có mục `sse-block-ordering-bug`. Frame `view` phải phát đúng thời điểm so với text; plan phải đọc kỹ đường stream ở `route.ts` trước khi cắm.
- **Nguồn A không phủ hết.** Có tool trả dữ liệu ở hình dạng lồng sâu mà luật cấu trúc không nhận ra. Khi đó rơi về nguồn B — vẫn có panel, nhưng badge là `AI tổng hợp` chứ không phải `DAAB`. Chấp nhận được, và đúng về mặt tin cậy.
- **Không sửa được chất lượng trả lời.** 9/21 lượt trong hội thoại đo được trả về rỗng (`Stopped after many tool steps`). Panel làm phần hiển thị đúng hơn, **không** làm agent trả lời đúng hơn. Đó là việc riêng, đang nằm ở `backlog/daab-agent-context-project-resolution-bug` và checkpoint `voice-tool-grounding-2026-08-03`.
