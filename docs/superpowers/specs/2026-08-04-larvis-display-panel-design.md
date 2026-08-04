# Larvis Display Panel — bảng/biểu đồ cho chế độ giọng nói

**Ngày:** 2026-08-04
**Trạng thái:** design đã duyệt, chưa có plan
**Phạm vi:** `/constellation` và `/constellation-v2` (Larvis). Text chat **không** đụng tới.

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

Mảng dài hơn ngưỡng hiển thị bị cắt và ghi `truncated: { shown, total }` — panel phải nói rõ "5/666 dòng", không được im lặng cắt bớt.

Orchestrator không giữ controller của stream, nên nó nhận thêm callback `onView?: (d: ViewDescriptor) => void` (cùng kiểu với `onBackstop` đang có). Route gọi callback đó để phát frame.

### Nguồn B — tách từ chính câu trả lời (khi không có tool call)

Câu như "so sánh iPhone và Android" không gọi tool nào; model tự viết bảng markdown. Việc của code không phải dựng bảng mà là **cắt bảng ra khỏi lời nói**.

`src/lib/chat/voice.ts` **đã có sẵn parser bảng GFM** — `isTableRow`, `isTableSeparator`, `splitTableCells`. Hiện chúng phục vụ `tablesToProse` (biến bảng thành văn xuôi để TTS đọc). Ta giữ nguyên parser, chỉ đổi đích đến:

```ts
// thay cho stripForSpeech(md): string
export function extractForSpeech(md: string): { speech: string; descriptors: ViewDescriptor[] }
```

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

Client dùng `splitFrames` sẵn có — không đổi gì ở tầng vận chuyển.

## Kênh nói

- `speech` = phần văn xuôi còn lại sau khi tách. **Đây là lời giải cho bug `VOICE_GUIDE`**: thôi năn nỉ model, cắt bằng code.
- Câu chỉ dẫn ("bảng đang hiện trên màn hình") do **code** chèn, lấy từ i18n (`vi`/`en`/`zh`), và **chỉ khi** có descriptor thật đã render. Không có dữ liệu → không nói câu này. Trong hội thoại đo được, 9/21 lượt trả về rỗng; nếu để model tự nói thì user nhìn sang màn hình trống.
- Câu chỉ dẫn **không nhắc vị trí** ("bên phải") vì panel nằm giữa và bố cục đổi theo thiết bị.

**Thứ tự bắt buộc:** `extractForSpeech` → chèn câu chỉ dẫn → `splitForSpeech` → TTS.
Sai thứ tự thì soft cap 280 ký tự của `splitForSpeech` sẽ băm bảng thành mảnh và đọc to `| PH-005 | 1015 |`.

## Giao diện

Component mới `DisplayPanel`, render nội dung bằng `ChartBlock` / `MarkdownView` sẵn có trong `src/components/render/`.

### Hình thức

Panel kính nổi **giữa màn hình**, dùng đúng token của `CommandDock.tsx:41`:

| Thuộc tính | Giá trị |
|---|---|
| Nền | `rgba(8,24,42,.92)` + `backdrop-blur(14px)` |
| Viền | `rgba(91,214,255,.30)` |
| Chữ | `#eaf6ff` |
| Quầng ngoài | **vàng** (`rgba(255,196,80,.30-.45)`) — cùng tông ring, để panel là một phần của Larvis |

Độ đục `.92` là quyết định có chủ ý: bản kính trong hơn nhìn đẹp hơn nhưng orb là vệt sáng **động phản ứng theo âm thanh**, chữ số đè lên sẽ đổi tương phản liên tục trong lúc user đang đọc.

Panel **không kéo full-height** — chừa khoảng trên để các cung nối tới node agent (LAAM, DAAB…) vẫn thấy. Cạnh đang sáng là chỉ dấu "Larvis đang làm việc với nguồn nào", trùng khớp với ranh giới tin cậy của badge nguồn.

Bù cho phần ring bị che: **viền panel thở theo biên độ âm thanh**, dùng lại `useAudioAnalyser` đang có.

### Hành vi

- **Không phải modal.** Không focus-trap, không backdrop chặn click. User phải vừa nhìn vừa nói tiếp — panel chặn mic hay chặn dock là hỏng cả luồng.
- **Đóng:** nút `×` góc phải trên, hoặc phím `Esc`. Bấm ra ngoài **không** đóng (tránh đóng nhầm khi chạm màn hình lúc đang nói).
- **Đóng chỉ thu gọn, không xoá.** Descriptor còn nguyên; hiện pill `▦ Xem bảng · N` trong cụm góc dưới phải, **bên trái ô chọn model**, cùng chiều cao và bo tròn với ô đó, accent vàng. Bấm pill → bung lại.
- **Pill chỉ hiện khi panel đang đóng.** Panel mở thì nút `×` đã làm đúng việc đó; cụm góc dưới phải đã có 3 phần tử, không thêm cái thứ 4 thường trực.
- **Luôn hiển thị lượt mới nhất.** Lượt mới có descriptor → panel tự mở, thay nội dung. Lượt mới **không** có descriptor → giữ nguyên trạng thái đang đóng, không để pill cũ sót lại.
- **Badge nguồn:** `DAAB · N dòng · hh:mm` (nguồn A) vs `AI tổng hợp` (nguồn B).

### Mật độ

Hai mức, chọn theo breakpoint + một toggle:

| Mức | Dùng khi | Nội dung |
|---|---|---|
| `focus` | mobile, demo/thuyết trình | 1 số lớn + ≤ 3 dòng + chart đơn |
| `detail` | desktop, ngồi trước màn hình | bảng đầy đủ, cuộn được |

Cùng một descriptor, khác cách render. Model **không** biết gì về mật độ — nếu để model tự quyết "lúc này nói ngắn, lúc kia nói dài" thì vừa đắt vừa không ổn định.

## Kiểm thử

- **Unit `deriveFromToolResult`** — mỗi hình dạng trong bảng ở trên; shape rác → không phát descriptor; mảng dài → có `truncated`.
- **Unit `extractForSpeech`** — bảng GFM, block chart, hỗn hợp cả hai; bảng **sai cú pháp** → không dựng descriptor, rơi về `tablesToProse` (nội dung còn nguyên dưới dạng văn xuôi, không còn ký tự `|`).
- **Regression chốt chặn** — sau extract, `speech` không được chứa `|` đầu dòng hay ` ``` `. Đây đúng chỗ prompt đã thất bại hai lần; test này là thứ giữ nó không tái phát.
- **Guard câu chỉ dẫn** — không descriptor → tuyệt đối không có câu "bảng đang hiện trên màn hình".
- **Luật ưu tiên** — lượt có cả A và B: descriptor phải là của A, và speech vẫn phải sạch bảng.
- **Component** — đóng → hiện pill; bấm pill → mở lại; lượt mới có dữ liệu → tự mở + thay nội dung; lượt mới không dữ liệu → giữ đóng, không sót pill cũ; `Esc` đóng, click ra ngoài không đóng.

## Không làm (YAGNI)

Nhiều panel dạng tab/stack · bấm drill-down trong bảng · export panel · mật độ thứ ba · panel cho text chat (text chat đã render inline, không đụng) · để model tự sinh display spec.

## Rủi ro

- **Thứ tự frame.** Backlog đang có mục `sse-block-ordering-bug`. Frame `view` phải phát đúng thời điểm so với text; plan phải đọc kỹ đường stream ở `route.ts` trước khi cắm.
- **Nguồn A không phủ hết.** Có tool trả dữ liệu ở hình dạng lồng sâu mà luật cấu trúc không nhận ra. Khi đó rơi về nguồn B — vẫn có panel, nhưng badge là `AI tổng hợp` chứ không phải `DAAB`. Chấp nhận được, và đúng về mặt tin cậy.
- **Không sửa được chất lượng trả lời.** 9/21 lượt trong hội thoại đo được trả về rỗng (`Stopped after many tool steps`). Panel làm phần hiển thị đúng hơn, **không** làm agent trả lời đúng hơn. Đó là việc riêng, đang nằm ở `backlog/daab-agent-context-project-resolution-bug` và checkpoint `voice-tool-grounding-2026-08-03`.
