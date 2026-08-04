# Changelog

Mọi thay đổi đáng chú ý của **LAAM** được ghi ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/),
phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

---

## [Unreleased]

### Đã thêm — Larvis display panel
- **Bảng/biểu đồ của câu trả lời hiện trên panel kính giữa màn hình `/constellation`, giọng nói chỉ đọc phần diễn giải.** Dữ liệu panel do code suy từ tool result (badge nguồn hiện tên agent) hoặc tách từ bảng markdown model tự viết (badge "AI tổng hợp") — hai mức tin cậy khác nhau không được trông giống nhau trên màn hình. Đóng bằng `×`/`Esc`, thu về pill cạnh ô chọn model; click ra ngoài không đóng vì panel không phải modal (`role="region"`, không focus-trap).

### Đã sửa — Voice (Constellation) trả lời nông hoặc BỊA dữ liệu dù có tool đọc dữ liệu thật
- Đo trên `gpt-oss-120b` (cùng câu hỏi, hội thoại mới, chỉ khác `mode`): **3/17 lượt voice hỏng** so với **0/6 lượt text** — 2 lượt dừng ngay sau một tool liệt kê tổng quan rồi trả lời bằng đúng mấy trường có trong danh sách, 1 lượt **không gọi tool nào và bịa nguyên hồ sơ dự án** (kèm cả tên người phụ trách không có thật). Vòng lặp tool không hề chặn sớm (`DEFAULT_MAX_ROUNDS = 25`) — model tự dừng.
- **`VOICE_GUIDE` (`lib/agent/context.ts`) là thủ phạm phía prompt**: "Ưu tiên ngắn gọn và tóm tắt" và "KHÔNG đọc ID, UUID…" bị model hiểu là chỉ dẫn về mức độ TRA CỨU, không chỉ về cách nói — trong khi các tool đi sâu BẮT BUỘC nhận `project_id` dạng UUID. Nay hai câu đó neo rõ vào LỜI NÓI RA, và chỉ dẫn "nói ngắn không được làm giảm số bước tra cứu; vẫn dùng ID/UUID làm tham số tool; một kết quả liệt kê tổng quan thường CHƯA đủ cho câu hỏi chi tiết" được đặt trong KHỐI TOOL (chỉ render khi lượt đó thật sự có tool) để đường không-tool — Claude MVS ở `/api/chat` — vẫn sạch từ ngữ tool như trước.
- **Thêm grounding guard trong `runToolRounds` (`lib/agent/orchestrator.ts`)**: model trả lời ngay ở vòng 0 với 0 tool call trong khi tool đang có sẵn → chèn một lời nhắc rồi hỏi lại **đúng một lần** (latch 1-lần/lượt, cùng cơ chế với nudge `web_read` sẵn có). Điều kiện kích hoạt thuần cấu trúc — không phân loại ý định người dùng bằng model hay danh sách từ khoá (Rule 5). Lời nhắc có đường thoát "nếu không cần thì trả lời trực tiếp" nên chitchat không bị ép gọi tool, chỉ tốn thêm một vòng ngắn (đo: lượt chitchat ~1.5–1.8s).
- Đo lại sau khi sửa (12 lượt voice): **0 lượt không-gọi-tool**; 2 lượt còn nông nhưng đổi dạng — model có đi sâu nhưng chọn **nhầm tool** (`kg_get_node` trên chính id dự án, `laam_query_stats`) thay vì dừng sau danh sách như trước. Cỡ mẫu này chưa đủ để kết luận mức giảm tỉ lệ nông; phần chọn-nhầm-tool được xử lý bằng bước tra cứu xác định bên dưới.

### Đã thay đổi — Eval `selection-at-scale` đo tới QUY MÔ THẬT (60 tool) và đo đúng provider đang dùng
- Suite trước đây dừng ở **16 tool** và pool distractor chỉ có connector built-in — trong khi production đưa cho model **60 tool**, 48 trong số đó đến từ MCP với JSON Schema thật. Đo thiếu 48 tool đó là đo sai điều kiện. Nay pool gồm cả tool MCP thật, lấy từ fixture `scripts/eval/scale/mcp-pool.json` (chụp bằng `scripts/eval/scale/snapshot-mcp-pool.ts`, dùng đúng `discoverForUser` của prod nên giữ nguyên `inputSchema` gốc); mốc mặc định thành `4,16,32,60`, đổi được qua `EVAL_SIZES`.
- Suite chỉ gọi được Ollama, trong khi model đang dùng thật (`gpt-oss-120b`) chạy qua **BytePlus** — đo sai provider là đo sai model. Thêm `scripts/eval/provider.ts`: `EVAL_PROVIDER=byteplus` + `EVAL_MODEL`, mặc định vẫn Ollama (eval cũ không đổi hành vi), thiếu `BYTEPLUS_API_KEY` thì **ném ngay** thay vì lặng lẽ tụt về Ollama rồi ghi nhầm model vào báo cáo. Tên provider/model được in vào tiêu đề báo cáo.
- Thêm 2 probe MCP, trong đó `mcp-detail` tái hiện đúng ca hỏng đã đo trên production (hỏi chi tiết một đối tượng ⇒ phải liệt kê lấy id rồi đọc bản ghi chi tiết). Drilldown xác định KHÔNG bật trong eval, nên probe này đo đúng khả năng tự chọn tool của model.
- Giá của bề mặt tool, đo bằng chính provider: **5 975 token/round** chỉ riêng schema của 60 tool (6 047 có tool vs 72 không tool).
- **Kết quả lần chạy đầu** (`gpt-oss-120b`, k=3, mốc 4/16/32/60 — `.serena/qa/eval-scale-2026-08-03.md`): pass-rate **phẳng tuyệt đối** ở mọi mốc, kể cả probe 2 bước `mcp-detail` (3/3 ở cả 4 mốc). Tức **số lượng tool không làm giảm độ chính xác chọn tool** với model này — giả thuyết "60 tool khiến model chọn sai" không được dữ liệu ủng hộ; thu hẹp bề mặt tool vẫn đáng làm vì chi phí token, nhưng không nên bán như cải thiện độ chính xác. Đồng thời eval **chưa tái hiện** được ca hỏng ngoài production (eval chưa chạy voice mode, stub payload nhỏ hơn dữ liệu thật hàng trăm lần, không có lịch sử hội thoại) — đó là việc tiếp theo trước khi tin con số 100%.
- Phát hiện phụ, độc lập với quy mô: 3 probe **read→write trong cùng một lượt đều 0%** ở mọi mốc (0/12 run mỗi probe), trong khi mọi probe write đơn lẻ đều 100%. Đã soi trace để loại trừ lỗi harness — model gọi đúng tool đọc rồi dừng hẳn, không gọi tool ghi.
- **Khép 2/3 khác biệt còn lại giữa eval và production**: `Scenario.mode` (mặc định vắng mặt ⇒ y hệt trước — `runner.ts` giờ xuyên `s.mode` xuống `buildSystemPrompt`, nên `mode: "voice"` đo đúng `VOICE_GUIDE` thật thay vì chưa từng chạm tới nó); và `scripts/eval/scale/realistic-payload.ts` (`bigMasterRecord`, deterministic — không `Math.random`/`Date.now`) tạo JSON cỡ ~46k ký tự đúng kích thước đo được thật trên production (Dasin ~46k, Cảng Định An v3 ~78k — số liệu có sẵn trong comment ở `route.ts`), thay cho stub vài trăm byte. Probe mới `mcp-detail-voice` dùng cả hai — kết quả **vẫn 100% ở mọi mốc**.
- **Đọc lại kỹ hơn cho thấy con số 100% không phải bằng chứng mạnh như tưởng**: `runner.ts` gọi thẳng `runToolRounds`/`buildSystemPrompt` THẬT — nghĩa là grounding guard (fix #4) và prompt đã sửa (fix #1) nằm cứng trong mọi lượt eval, kể cả các lần chạy trước đó. Eval vì vậy không có "trước khi vá" để so sánh; 100% chỉ tái xác nhận 2 fix có tác dụng dưới điều kiện harness (một lượt, không lịch sử hội thoại), không phải bằng chứng độc lập mới. Khác biệt còn lại **chưa khép**: eval luôn là lượt đầu, trong khi production replay lịch sử (không mang tool-trace) — đúng cơ chế đã xác nhận bằng tay đầu phiên khiến một câu trả lời nông cũ tự lặp lại. Đây nhiều khả năng là biến chính giải thích khoảng cách 100% (eval) vs ~18% hỏng (production thật) — ghi vào việc còn bỏ ngỏ, xem `.serena/memories/qa/selection-at-scale-2026-08-03.md`.
- **Khép nốt khác biệt còn lại: lịch sử hội thoại.** `Scenario.priorMessages` (mặc định vắng mặt ⇒ y hệt trước — `runner.ts` chèn giữa system và lượt hiện tại, đúng thứ tự route.ts replay, chỉ role+content không tool_calls — đúng shape production thật). Hai probe mới `mcp-detail-poisoned` (voice) và `mcp-detail-poisoned-switch-to-text` (lượt nhiễm ở voice, hỏi lại ở text — đúng kịch bản người dùng báo cáo) dùng câu trả lời nông **copy nguyên văn từ log production thật** ngày 2026-08-03 làm lịch sử, đo model có phục hồi (gọi lại đủ 2 tool để lấy dữ liệu mới) hay lặp lại câu cũ.
- **⚠️ k=3 không đủ mạnh để tin "100%" — chạy lại k=16, chỉ mốc 60, 3 probe rủi ro cao nhất.** Với tỉ lệ hỏng thật đo trên production (~17,6% = 3/17), xác suất k=3 lần liên tiếp ĐỀU ĐẬU thuần do may mắn là 55,9%; cần k≥15,4 để có 95% cơ hội bắt được ít nhất 1 lần hỏng nếu nó còn tồn tại.
- **Kết quả k=16 — bằng chứng thật, khép investigation này**: cả 3 probe rủi ro cao nhất (`mcp-detail-voice`, `mcp-detail-poisoned` — nhiễm hỏi lại cùng voice, `mcp-detail-poisoned-switch-to-text` — nhiễm ở voice rồi hỏi lại ở text, đúng kịch bản gốc người dùng báo cáo) đều đạt **16/16**. P(kết quả này | tỉ lệ hỏng thật vẫn ~17,6%) chỉ **4,5%/probe** — lần này là bằng chứng thống kê thật (α=0,05), không phải may mắn cỡ mẫu nhỏ. Cả 3 probe chạy KHÔNG có drilldown (fix #2 không opt-in trong `runner.ts`), nghĩa là model TỰ chọn đúng nhờ riêng fix #1 (prompt) + fix #4 (grounding guard), không nhờ safety net code. Đã thử hết các biến giả thuyết hợp lý (mode, kích thước payload, lịch sử nhiễm cùng-mode và chuyển-mode) — không còn giả thuyết nào chưa kiểm để giải thích khoảng cách với ~18% hỏng đo trên production TRƯỚC khi có fix. Xem `.serena/memories/qa/selection-at-scale-2026-08-03.md` (bảng tổng hợp cuối) để biết chi tiết.
- **⚠️ Sửa lại kết luận "read→write trong 1 lượt = 0% tuyệt đối" — phần lớn KHÔNG phải bug.** Soi trace phát hiện 3 probe multi-tool đều dùng `trello_create_card` (yêu cầu `idList`, `trello.ts:139`) nhưng câu hỏi không hề cho biết list nào — model đúng ra hỏi lại thay vì bịa ID (Rule 13), không phải hỏng. Thêm `idList` vào câu hỏi (khớp cách probe `write` đơn lẻ đã né từ trước) → xác nhận trong chính suite, k=8, mốc 60: `multi-read-write` **8/8**, `ctx-audit-write` **8/8**. Bài học: một kết quả 0% "quá sạch, mọi điều kiện giống nhau" nên nghi probe trước khi tin là bug thật.
- **`ctx-web-write` vẫn 0/8 sau khi sửa — nguyên nhân KHÁC, hẹp hơn.** Model không kẹt ở việc chọn write tool; nó kẹt ở bước ĐỌC — stub `web_search` luôn trả cùng một kết quả rõ ràng là giả, model không tin nên đổi câu truy vấn tìm lại ~17 vòng, có lúc còn tự bịa URL Reuters để gọi `web_read` (vi phạm Rule 13 — dùng URL bịa thay vì URL thật trong kết quả search) trước khi repeat-guard chặn lại. Đây là vấn đề của stub thiếu thực tế, không phải bug orchestrator.
- **Lead "final-completion trả rỗng" — hoá ra KHÔNG mới, chỉ thiếu test.** Đọc lại `route.ts` phát hiện production đã có sẵn 3 lớp phòng thủ đúng cho hiện tượng này, do team trước đã tự quan sát và ghi comment cẩn thận ("confirmed by manually resending the same question afterward always succeeding"): (1) `SYNTH_NUDGE` chèn khi `hitBackstop`; (2) khi bước hoàn tất đầu tiên ra `full` rỗng → retry đúng 1 lần kèm `SYNTH_NUDGE`; (3) retry cũng rỗng → `EMPTY_REPLY` (Rule 12, không bong bóng trắng lặng lẽ). Cơ chế đúng, nhưng **chưa có test nào xác nhận** (chỉ 2 test trong `describe("BytePlus...")`, không cái nào chạm nhánh này). Thêm 2 test D2b (`route.test.ts`) khép lỗ hổng: retry cứu được lượt khi hoàn tất đầu rỗng; và cả hai đều rỗng → fail loud đúng text, đúng persist. Xác nhận cả 2 đỏ khi tắt thử logic retry (đúng Rule 9 — test phải fail khi logic thật bị xoá), rồi khôi phục lại xanh. Không có thay đổi hành vi, chỉ thêm test.

### Đã thêm — Bước tra cứu XÁC ĐỊNH "liệt kê → chi tiết" (`lib/agent/drilldown.ts`, tuỳ chọn qua env)
- Câu hỏi "chi tiết về &lt;đối tượng&gt;" cần hai bước (liệt kê lấy id → đọc bản ghi chi tiết). Model đang phải chọn giữa **60 tool** (12 LAAM + 48 DAAB) nên bước hai không ổn định — đo được cả hai kiểu hỏng: dừng luôn ở kết quả liệt kê, và gọi sai tool (`laam_query_stats` cho câu hỏi về dự án). Nay bước hai do CODE quyết (Rule 5): sau khi tool liệt kê chạy xong, nếu câu hỏi chứa **đúng tên một mục trong chính kết quả đó**, code tự gọi tool chi tiết với id của mục ấy.
- Trigger là so khớp **tên thật lấy từ dữ liệu tool trả về** (Rule 13), không đoán ý định bằng regex tiếng Việt: không nhắc tên nào → không làm gì, nên câu "liệt kê…" không tốn thêm lượt tra cứu nào. Mơ hồ (hai tên khớp dài bằng nhau) → bỏ qua; tên ngắn dưới 3 ký tự → bỏ qua; chạy tối đa 1 lần/lượt; tool chi tiết lỗi → fail-soft (vẫn trả lời bằng dữ liệu liệt kê), riêng `PendingWriteSignal` vẫn nổ ra ngoài để route hỏi xác nhận.
- Cặp tool khai báo ở env `TOOL_DRILLDOWN_PAIRS` (xem `.env.example`) — **không hardcode tên tool của connector nào trong code**; không đặt env thì tính năng tắt và tool-loop chạy y như trước.
- Đo sau khi bật (server production đã rebuild): **12/12 lượt voice** hỏi chi tiết đều đi `kg_list_projects → kg_get_master_record` và trả lời bằng hồ sơ đầy đủ (2.0–4.1k ký tự, trước đây các lượt hỏng chỉ ~200–400); **2/2 lượt "liệt kê" giữ nguyên 1 tool**, không bị kéo thêm bước chi tiết.

### Đã thêm — Constellation: giọng đọc tiếng Anh riêng ("Emma") khi UI ở chế độ EN
- Trước đây `VOICE_BY_LANG` trong `vieneu-tts/app.py` map cả `vi` lẫn `en` về cùng preset "Thục Đoan" (VieNeu không có sẵn giọng tiếng Anh nào trong 14 preset built-in) — cố ý để dành seam cho sau ("Emma tạm thời chưa cần", spec 2026-07-22). Nay khi UI chuyển sang tiếng Anh, `/constellation` đọc bằng giọng "Emma" (clone từ `tts-samples/piper-en-1.wav` qua tính năng voice cloning của VieNeu), thay vì đọc tiếng Anh bằng giọng Thục Đoan. Embedding được tính sẵn (offline, 1 lần) và lưu ở `vieneu-tts/voices/emma-voice.json` — container vẫn torch-free, không cần tải model lúc chạy; xem `vieneu-tts/voices/README.md` để tạo lại giọng từ mẫu khác.

### Đã thêm — Constellation: chế độ hội thoại voice rảnh tay (Jarvis)
- `/constellation` nay có chế độ nói chuyện liên tục: bật "Giọng nói" là vào vòng lặp nghe → tự gửi khi ngừng nói → Jarvis đọc trả lời → tự nghe lượt tiếp, không cần bấm. Nói chen khi Jarvis đang đọc sẽ ngắt Jarvis ngay (barge-in kiểu ChatGPT), chống tự-ngắt bằng 2 cổng (Silero VAD + ngưỡng động theo mức TTS). STT qua `SttProvider` có thể thay bằng Whisper self-host sau. Vòng tròn lõi báo lượt bằng màu: nghe = đỏ-trắng, xử lý = xanh-trắng, nói = vàng.
- Sửa lỗi voice không nhận được sau khi triển khai: header `Permissions-Policy` toàn site chặn `microphone=()` (giờ `microphone=(self)`); model Silero VAD/onnxruntime-web 404 do không resolve qua Turbopack (giờ tự host ở `public/vad/`). Ngưỡng barge-in (`BARGE_IN_BASE`/`BARGE_IN_TTS_K`) được đo lại từ AEC spike thật (Task 3) — AEC giữ mic nền ~0.02 bất kể TTS to cỡ nào, nên hạ từ (0.14, 0.9) xuống (0.08, 0.12) để giọng nói thật vượt ngưỡng được, thay vì ngưỡng cũ gần như không bao giờ đạt.

### Đã thay đổi — Constellation đọc câu trả lời theo LUỒNG (VieNeu streaming), bỏ Piper
- `/constellation` nay stream cả câu trả lời qua VieNeu `infer_stream` (endpoint `/tts/stream` → PCM Int16LE 48kHz, phát bằng Web Audio `AudioBufferSourceNode`) thay vì cắt chunk ~60 ký tự rồi tải từng WAV. Kết quả: tiếng đầu ra sau ~0.2s (thay vì ~2s), hết đọc-mất-chữ ở biên chunk, hết khựng giữa các đoạn. Một engine VieNeu lo cả tiếng Việt lẫn tiếng Anh — bỏ Piper. Analyser luồng thay `MediaElementAudioSourceNode` (xoá luôn nguồn crash dựng-lại-đồ-thị-mỗi-chunk). (Animation khựng do nghẽn CPU vẫn là việc riêng, chưa xử lý ở đây.)
- **Thay thế 3 mục vá lỗi bên dưới** (`chunkForSpeech`/`speakChunks`/`playUrl`/`attachTts` với `<audio>` đơn): cơ chế chunk WAV mà chúng vá lỗi đã bị xoá hoàn toàn khỏi code, không còn tồn tại để tái phát các lỗi đó — giữ lại 3 mục dưới đây làm lịch sử debug, không phải mô tả code hiện tại.
- **Sửa tiếp (dùng thật, đợt 5): refresh trang thì đơ, kill Chrome mở lại thì không — giải phóng AudioContext ở `pagehide`.** React effect cleanup **KHÔNG chạy khi refresh/rời trang** (trình duyệt phá huỷ document chứ không unmount component), nên `ctx.close()` và `getUserMedia` track chưa bao giờ được giải phóng khi F5: AudioContext cũ vẫn đang giữ thiết bị audio trong lúc trang mới dựng context mới đè lên (lại còn ép 48kHz nên có thể buộc cấu hình lại thiết bị output). Chrome vừa mở thì không có context tồn dư → mượt; refresh thì có → khựng. Đúng với việc kill Chrome rồi mở lại thì hết. `useAudioAnalyser` nay đăng ký `pagehide` để đóng context + dừng mic + null các ref (bfcache khôi phục vẫn dựng lại được graph mới). Test đi kèm phát hiện luôn một lỗi thật trong bản sửa đầu: `close()` không phải lúc nào cũng trả Promise → đã chuẩn hoá qua `Promise.resolve(...)`.
- **Sửa tiếp (dùng thật, đợt 4): vẫn ĐƠ 1-2s tại MỘT chỗ giữa lúc đang đọc — do lỗi trong chính vòng đọc stream, không phải CPU.** Manh mối quyết định từ người dùng: kill Chrome rồi mở lại thì mượt, nhưng chỉ cần F5 là bị lại — CPU không hề phân biệt hai trường hợp đó, nên nguyên nhân phải nằm ở phía trình duyệt. Thủ phạm: vòng `await reader.read()` trong `playPcmStream`. Khi dữ liệu ĐÃ nằm sẵn trong buffer (đúng tình huống của segment được prefetch trong lúc segment trước đang phát), `read()` resolve dưới dạng **microtask** — mà microtask chạy hết sạch trước khi trình duyệt được vẽ lại, nên cả segment (hàng chục `AudioBuffer`) bị dựng trong MỘT task duy nhất → treo main thread 1-2s đúng lúc chuyển segment. Chrome mới mở thì kết nối nguội, dữ liệu về nhỏ giọt theo tốc độ mạng nên mỗi `read()` là I/O thật (macrotask) và có nhả render — nên mới không thấy đơ. Nay `playPcmStream` ngừng rút stream khi đã lên lịch trước quá `SCHEDULE_AHEAD_SECONDS` (6s), chờ bằng `setTimeout` (macrotask thật → trình duyệt được vẽ), đồng thời tạo backpressure cho server tạm ngưng generate. Test đi kèm được kiểm chứng ngược: bỏ pacing thì test fail đúng kiểu "xả cả 20 chunk một lượt".
- **Đổi cách hiện caption khi đọc voice: theo phụ đề, giống phim, thay vì cả câu trả lời.** Trước đây `caption` giữ nguyên toàn bộ câu trả lời suốt lúc đọc — với câu dài (nhiều segment) chữ tràn lên khỏi khung, đè lên phần chào/thời tiết phía trên. Nay `speakReply` xoá `caption` khi bắt đầu chờ đọc, rồi đổi sang đúng text của segment đang phát ngay khi audio của segment đó thực sự bắt đầu (tái dùng tín hiệu `onFirstAudio` đã có từ `playPcmStream`, mở rộng ra cho MỌI segment thay vì chỉ segment đầu); xoá lại khi đọc xong. Fallback sang giọng trình duyệt giữ nguyên segment cuối đang hiện (không có tín hiệu đồng bộ theo từng lời cho SpeechSynthesis).
- **Sửa tiếp (dùng thật, đợt 3): ĐƠ TOÀN BỘ WEB 1-2s mỗi lần tổng hợp giọng — giới hạn CPU *kèm* số thread (`docker-compose.yml`).** Đo được container VieNeu chiếm **1374% CPU (trọn 12/12 core)**, bỏ đói main thread của Chrome ở mức hệ điều hành. Lần trước đã thử cap CPU và phải revert (`94f1d62`) vì playback vỡ — nay đo ra nguyên nhân thật: **cap `cpus` mà KHÔNG giảm số thread** thì engine vẫn tạo 1 thread/core máy chủ, 12+ thread chen trong quota 6 core → bị cgroup throttle mỗi chu kỳ → sụp còn 0.46x thời gian thực. Khớp thread với quota thì capping còn **nhanh hơn cả không cap**: 12 core/thread không giới hạn = 0.98x · 6 core+6 thread = 1.25x · 8+8 = 1.47x · 10+10 = 2.05x. Đo tiếp lúc ấm thì thấy throughput gần như PHẲNG từ 2-6 core (6→3.63x · 4→3.73x · 3→3.58x · 2→3.06x) — model này hầu như không scale, nên gần hết phần trên ~3 core trước đây chỉ là overhead thrashing. Chốt `cpus: 3` + `OMP/MKL/ORT/OPENBLAS/NUMEXPR/TORCH_NUM_THREADS=3`. Đo lại sau khi áp dụng: CPU **306%** (chừa ~9 core cho browser), tốc độ **3.58x** thời gian thực, mô phỏng end-to-end 5 đoạn thật: **0 lần hụt buffer**, tiếng đầu ra 2.47s, đệm tăng dần tới 61s. ⚠️ Nếu sau này chỉnh, phải sửa `cpus` và các biến thread CÙNG NHAU — sửa một cái là tái hiện đúng lỗi đã revert.
- **Sửa tiếp (dùng thật, đợt 2): tiếng bị RÈ/GIẬT liên tục, nặng nhất ở đầu.** Đã loại trừ audio gốc trước (PCM sạch: 7/12.7 triệu mẫu bị clip, không gãy sóng) → lỗi nằm ở khâu lập lịch phát phía client: code cũ lên lịch mỗi chunk NGAY khi nhận, nhưng VieNeu-CPU giao chunk đầu CHẬM hơn thời gian thực (~0.32s audio mỗi ~0.40s thực), nên con trỏ phát tụt lại ngay lập tức và mọi chunk sau đều bắt đầu sau một khoảng hở — cứ ~400ms một lần gãy tiếng. Mô phỏng trên đúng số liệu nhịp chunk đo được của 1 đoạn 17s: prebuffer 0s → **11 lần hụt (1.89s vụn)**; 2s → 2 lần; **3s → 0 lần**. `playPcmStream` nay đệm `TTS_PREBUFFER_SECONDS` (3s) trước khi phát (đoạn ngắn hơn ngưỡng thì phát ngay khi stream kết thúc), cộng lead 50ms cho buffer mở đầu; `useAudioAnalyser` ghim `AudioContext` ở 48kHz (mặc định phần cứng 44100 khiến MỖI buffer nhỏ bị resample riêng → artifact ở từng mối nối). Mô phỏng end-to-end với service thật (5 đoạn, có prefetch + nối cursor): còn 0.14s hụt, toàn bộ ở đoạn đầu; từ đoạn 1 trở đi 0 lần hụt và đệm tăng dần lên 9s/23s/33s. Đánh đổi: tiếng đầu ra lúc ~4.3s thay vì ~0.4s — engine CPU chạy xấp xỉ thời gian thực thì không thể vừa phát ngay vừa liền mạch. (Đã thử phương án hoãn prefetch để đoạn đầu ra tiếng sớm hơn: tệ hơn hẳn — 18 lần hụt/3.58s — nên giữ prefetch sớm.)
- **Sửa tiếp (phát hiện qua dùng thật): câu trả lời dài bị im lặng giữa đường vì hết giờ, và animation "đứng hình" trước khi voice bắt đầu đọc.** Đo thực tế: 1 câu trả lời dài 3651 ký tự cần 149s để tổng hợp ra 266s âm thanh — vượt xa timeout 60s của route, khiến kết nối bị huỷ giữa lúc đang đọc (đây là lỗi MỚI do bản stream-1-request gây ra: bản chunk cũ, dù có lỗi khác, mỗi chunk ~60 ký tự luôn xong trong 20s nên câu dài vẫn đọc hết). `splitForSpeech` (`src/lib/chat/voice.ts`) cắt văn bản đã đọc thành các đoạn theo câu, mỗi đoạn dưới ngưỡng 280 ký tự (~11.5s tổng hợp tối đa) — luôn an toàn với timeout bất kể câu trả lời dài bao nhiêu; `playPcmStream` (`streamingAudio.ts`) nhận thêm cursor chia sẻ để các đoạn nối liền không có khoảng trống; `speakReply` tải sẵn đoạn kế tiếp ngay khi có response của đoạn hiện tại (không chờ đọc xong) để tận dụng VieNeu tổng hợp nhanh hơn thời gian thực ~1.8 lần. Lỗi thất bại thật giờ chỉ đọc lại phần CHƯA đọc qua fallback trình duyệt, không đọc lại từ đầu. Animation: thêm cờ `preparingSpeech` (bật ngay khi speakReply bắt đầu, dùng CHUNG công thức pulse với lúc đang nói thật) để nhịp đập cốt lõi không "phẳng" trong lúc chờ audio đầu tiên về.

### Đã sửa — TTS đọc thiếu/lệch chữ so với văn bản hiển thị (chunk cắt giữa cụm liệt kê) [đã thay bằng streaming, xem mục trên]
- Mỗi chunk TTS tổng hợp ĐỘC LẬP (không có ngữ điệu liên chunk); `chunkForSpeech`'s word-wrap trước đây chỉ cắt ở khoảng trắng gần sát ngân sách ký tự, có thể để rơi một từ ngắn mồ côi ngay trước dấu phẩy ở biên chunk (vd "...M&A, Cảng" | "Định An v3..." tách rời "Cảng" khỏi "Định An v3") — TTS backend đọc từ mồ côi đó sai/mất. `pushWordWrapped` (`src/lib/chat/voice.ts`) nay ưu tiên cắt tại dấu phẩy/chấm phẩy gần ngân sách để giữ nguyên cụm liệt kê, chỉ lùi về cách cắt cũ khi không có dấu phẩy phù hợp hoặc dấu phẩy quá gần đầu chunk.

### Đã sửa — Animation "đang nói" biến mất/đứng hình/chạy trước khi Constellation dùng neural TTS [đã thay bằng streaming, xem mục trên]
- `state`/`getLevel` (animation phản ứng âm thanh + nhãn trạng thái) chỉ dựa vào `voice.speaking` — cờ này chỉ được bật bởi đường fallback browser SpeechSynthesis, không bao giờ được đường TTS thần kinh chính (`speakReply`/`speakChunks`/`playUrl`, qua `/api/tts`) chạm tới. Kết quả: trong lúc Jarvis thực sự đang đọc bằng neural TTS, UI tưởng đang "idle" — animation phẳng (không nhịp đập), nhãn "ĐANG NÓI" không hiện. Thêm cờ `neuralSpeaking`; `speaking = voice.speaking || neuralSpeaking` nay dùng cho cả `state` và `getLevel`. Xử lý cả trường hợp fallback sang browser TTS (giữ `neuralSpeaking` cho đến khi `voice.speaking` thật sự bật, có safety-net 4s tránh kẹt mãi). Sau đó phát hiện thêm: cờ này bật ngay khi bắt đầu tổng hợp (trước khi có âm thanh thật vài giây) khiến animation chạy TRƯỚC âm thanh rồi giật khi âm thanh thật tới — chuyển sang bật ở sự kiện `onplaying` của `<audio>` (âm thanh thực sự phát) thay vì đầu `speakReply`.

### Đã sửa — Chrome crash + animation khựng khi Constellation đọc câu trả lời dài bằng giọng nói [đã thay bằng streaming, xem mục trên]
- `playUrl` tạo mới một `<audio>` cho MỖI chunk TTS (câu trả lời dài chia thành hàng chục chunk ~60 ký tự), và `attachTts` dựng lại toàn bộ đồ thị `MediaElementAudioSourceNode`/`AnalyserNode` trên main thread ở mỗi chunk — vừa gây khựng animation đúng lúc chuyển chunk, vừa tích luỹ tài nguyên WebAudio qua một phiên đọc dài đến mức Chrome crash. `ConstellationClient.tsx` nay tái dùng MỘT `<audio>` cho cả phiên (chỉ đổi `.src`); `useAudioAnalyser.attachTts` (`src/components/constellation/useAudioAnalyser.ts`) nay là no-op khi gọi lại với cùng phần tử — đồ thị chỉ dựng đúng 1 lần/phiên thay vì 1 lần/chunk.

### Đã sửa — Jarvis bỏ qua tool call khi người dùng yêu cầu tìm/tra cứu LẠI (F3)
- Trước đây khi hội thoại đã có sẵn dữ liệu (nguyên văn hoặc trong bản tóm tắt lịch sử), Jarvis có thể trả lời trực tiếp từ dữ liệu cũ thay vì gọi lại công cụ, kể cả khi người dùng yêu cầu rõ ràng "tìm lại"/"tra cứu lại"/"kiểm tra lại" — dữ liệu cũ có thể đã lỗi thời. `buildSystemPrompt` (`src/lib/agent/context.ts`) nay bắt buộc gọi lại công cụ khi phát hiện ý định làm mới, đối xứng với quy tắc bắt buộc gọi công cụ cho write-intent (F1).

### Đã thêm — Constellation (Jarvis) trả lời theo văn nói khi dùng giọng nói
- Bỏ bảng/markdown và ID dài, tóm tắt danh sách dài — qua cờ `mode: "voice"` trong `/api/chat`.

### Đã thêm — Workflow DAG song song (lấy cảm hứng ComfyUI) + template "báo cáo đa nguồn → gửi mail"
Nâng engine workflow từ walker **tuyến tính** (1 con trỏ, 1 cạnh/node) lên **bộ lập lịch DAG song song opt-in** — cho phép nhiều agent research/MCP chạy **đồng thời** rồi hội tụ. Thiết kế + biên bản họp: `docs/superpowers/specs/2026-07-10-comfyui-parallel-workflow-design.md`.
- **Cờ cấp-graph `parallel: true`** (jsonb, **0 migration**). `undefined/false` → giữ nguyên `walkGraph` tuyến tính (BẤT BIẾN); `true` → `scheduleGraph`. Golden test chứng minh graph tuyến tính chạy qua scheduler ở concurrency=1 cho journal + ctx **byte-identical**.
- **Engine song song** (`engine.ts` `scheduleGraph`): fan-out + fan-in/OR-join (chờ MỌI cạnh vào resolved-hoặc-pruned, chạy nếu ≥1 active) + multi-start + condition prune-propagation (tri-state `pending→done|pruned`); **hai semaphore tách biệt** (agent/Ollama=2 · connector/mcp/foreach=6) chống tự-DoS GPU; **seq toàn cục theo dispatch** (topoRank, id); **fail-stop/cancel/budget HỢP TÁC** (cờ `aborted` + `Promise.allSettled` DRAIN in-flight trước finalize → không write đáp sau finalize, WAL đóng sạch); **deadlock detector** fail-loud. `walkGraph` giữ nguyên (foreach body vẫn tuần tự, dùng lại `walkGraph`).
- **Validator nới lỏng** (`validate.ts` `assertRunnableDag`, chỉ khi `parallel`): thay DFS "revisit-throws" (vốn **báo nhầm diamond = cycle**) bằng **Kahn** + reachability union-DFS đa-start; cho phép fan-in/fan-out; **thêm `ref_not_ancestor`** — mọi `{{steps.X}}` phải nối bằng cạnh tới node tổ tiên (scheduler chờ theo CẠNH nhưng interpolate đọc theo THAM CHIẾU → trong DAG phân kỳ; fail loud ở authoring, chống email báo cáo trống mục) + fan-out width cap (≤12). `collectIssues` đồng bộ (drift-guard, code mới `ref_not_ancestor`).
- **Template `multi-source-report-email`** (`parallel:true`, moatLeaning): kim cương brief → 3 nhánh research **song song** (`laam_metrics_digest` verbatim · `web_search` · demo tasks) → synthesis → `gmail_send`. Chạy thử **offline $0** qua dry-run (gmail_send mock trước gate recipient). Recipient **TĨNH** gated bởi `WORKFLOW_RECIPIENT_ALLOWLIST`; **Rule 13**: khối số liệu nối `{{steps.research_laam.output}}` thẳng vào body (một hop, độc lập synthesis) + test mock model **đổi chữ số** vẫn giữ số ground-truth.
- **UI P0 (song song đọc được):** sửa bug auto-pan **giật viewport** khi nhiều node chạy (>1 → `fitView` tập đang chạy 1 lần/đổi tập; =1 → `setCenter` như cũ) · **vòng pulsing** quanh node "running" (CSS, tắt dưới `prefers-reduced-motion`) · chip **"N đang chạy song song"** (`<Panel top-center>`) · **toggle "Song song"** ở toolbar editor (giữ cờ `parallel` qua round-trip `fromReactFlow`). i18n vi/en/zh: `wf.run.parallelCount`, `wf.editor.parallelMode/parallelHint`, `wf.validate.ref_not_ancestor`.
- **Tests:** +engine song song (diamond fan-out/fan-in, concurrency, prune, fail-stop, budget, cancel, multi-start, golden-equivalence) · +validator parallel (fix false-cycle, ref_not_ancestor, fan-out cap, drift-guard parity) · +template (kim cương + Rule-13 body). tsc sạch; full suite xanh **trừ 4 test `search.test.ts` đỏ-sẵn** (drizzle SQL-AST, không liên quan).
- **Hoãn (Lộ trình, ghi rõ trong spec):** node skipped/pruned dimmed · minimap theo run-status · drag-off-slot spawn · cờ per-node `optional`/degrade · wall-clock run timeout · lật mặc định parallel + xoá `walkGraph` sau soak · node mute (cần cờ schema).

### Đã thêm — Trang `/constellation` toàn màn hình (Agent Constellation command-center)
Trang mới `/constellation` (không chrome ứng dụng, yêu cầu đăng nhập) đạt được từ nút **"Bản đồ trợ lý"** trong Chat. Zero migration, không thêm bảng DB.
- **Node dữ liệu thật:** custom agent ở vòng trong; nhóm Connector/MCP/Internal ở vòng ngoài; connector chưa kết nối hiện mờ — tất cả mang object nguồn (Rule 13), bấm để chọn agent/tool.
- **Lệnh & stream thật:** ô nhập lệnh gửi tới `/api/chat` streaming (phân giải frame `splitFrames`, write-gate `pending_write` bảo toàn); phản hồi hiện dạng caption cuộn.
- **Giọng nói (Web Speech + TTS):** bật mic → STT → gửi lệnh; trả lời được đọc to bằng browser SpeechSynthesis. Canvas AnalyserNode phân tích mic/TTS → vẽ sóng âm + ripple phản ứng âm thanh theo thời gian thực.
- **Neural TTS tuỳ chọn:** proxy `/api/tts` (`CONSTELLATION_TTS_URL`, POST `{text,lang}` → `audio/wav`; tương thích VietVoice/VietTTS); nếu không đặt → fallback browser TTS.
- **Thời tiết thật:** Open-Meteo (không cần API key) + lời chào theo giờ + facts xoay vòng.
- **Đã xoá:** modal Constellation cũ trong Chat (nút "Bản đồ trợ lý" + "Orbit" nay là `<Link>` tới `/constellation`); component `Constellation.tsx`, `constellationLayout.ts`, `VoiceWave.tsx` đã được dọn.
- **Reduced motion:** toàn bộ animation (canvas, sóng âm, fact) tắt dưới `prefers-reduced-motion`. SSR-safe (mọi truy cập `window`/`AudioContext`/canvas trong effect hoặc guard `typeof window`).
- **i18n vi/en/zh:** dict `constellation.ts` bao phủ mọi chuỗi; parity test tự bảo vệ.

### Đã thêm — R&D round 4: builder legibility (backlog open-agent-builder)
Bốn pattern adoptable còn lại từ `open-agent-builder`, đều pure-fn + test, **0 dep, 0 migration, hợp engine đông cứng**:
- **NodeIOBadge (`→ output`):** pill `{{steps.<id>.output}}` trên mỗi node (trừ condition), **bấm để copy** — thấy ngay node xuất gì mà không mở panel. Helper thuần `outputRef.ts` + test.
- **Auto-pan tới node đang chạy:** khi 1 node chuyển "running" (Test/run), canvas tự `setCenter` mượt vào node đó để theo dõi thực thi. Chỉ pan khi đổi node, không tranh với pan tay.
- **Edge-cleanup khi load:** `pruneDanglingEdges` (graph-serde) bỏ cạnh trỏ node đã xoá trước khi render — chống ghost-edge/crash từ graph hỏng. Pure + test (giữ nguyên ref khi không có gì để bỏ).
- **Variable picker mở rộng:** `variableSuggestions` nay (a) bung **field của agent.format** JSON-schema → `{{steps.<id>.output.<field>}}` (code-derived, Rule 13) và (b) thêm `{{item}}`/`{{index}}` khi soạn trong body foreach. Pure + test.
- **Tests:** +9 (outputRef 2 · graph-serde prune 2 · variableHints 3 · editor io-badge/auto-pan 2); i18n `wf.node.copyOutputRef` vi/en/zh. tsc sạch; full suite xanh trừ 4 test `search.test.ts` đỏ-sẵn không liên quan.
- **Đã từ chối/hoãn (nêu rõ):** sticky-note node (vi phạm 5 node-kind đông cứng) · ExecutionPanel trong editor (trùng RunWaterfall) · export-to-code/human-approval gate (ngoài phạm vi engine).

### Đã thêm — R&D round 3: workflow exec-legibility + voice/constellation nâng cao
**Workflow builder (legibility):**
- **Popover output/lỗi từng node trên canvas:** khi chọn 1 node đã chạy (Test/run), hiện preview output (hoặc lỗi, nền đỏ) ngay trên node. Frame SSE `workflow_run_step` được mở rộng **additive** với `outputPreview` (cắt ≤280 ký tự **từ output thật** trong `run.ts`, Rule 13) + `error`; module thuần `outputPreview.ts` + `stepsToNodeOutputs` (nodeStatus) đều có test. `BusEvent` vốn open nên 0 đổi hợp đồng.
- **Lưu thành mẫu:** nút "Lưu thành mẫu" ở trang chi tiết → `POST /api/workflows/[id]/save-as-template` (clone nhưng `isTemplate:true`, cột đã có sẵn ⇒ **0 migration**); RBAC gate mutator, owner/template-only. +route test.

**Chat (Jarvis nâng cao):**
- **Constellation là overlay luôn-hiện:** trước chỉ ở empty-state, nay mở được **mọi lúc** (nút Orbit trên header + nút ở empty-state) dưới dạng modal — không tranh chỗ với transcript.
- **Waveform giọng nói:** component `VoiceWave` (SVG bars, keyframe `laam-wave` chia sẻ, tắt dưới `prefers-reduced-motion`) hiện khi đang nghe/đang đọc — đúng tinh thần "SPEAKING" của UI tham khảo.
- **Tests:** +outputPreview 5 · nodeStatus +2 · save-as-template route 5 · editor popover 3; i18n `wf.detail.saveTemplate*` + (constellation/voice đã có). tsc sạch; full suite xanh trừ 4 test `search.test.ts` đỏ-sẵn không liên quan.

### Đã thêm — Chat "Constellation" command-center + giọng nói (R&D round 2)
Lấy cảm hứng từ UI kiểu Jarvis. Dependency-light (SVG/CSS, **không thêm thư viện 3D**), zero migration, **không thêm network call** (dùng lại dữ liệu đã fetch sẵn).
- **Bản đồ trợ lý (Constellation):** ở empty-state của /chat, nút "Bản đồ trợ lý" mở một **radial command-center** — Custom Agent ở vòng trong, nhóm Connector/MCP/Internal ở vòng ngoài, quanh một **orb trợ lý phát sáng** (dùng lại `Bloom` + token `--accent`/`--accent-glow`, 1 filter glow `<defs>` chia sẻ). Node là `<button>` thật mang **đúng object nguồn** (Rule 13): bấm tool → đúng đường `onToolPick` cũ; bấm agent → set `customAgentId`. Điều hướng bàn phím (mũi tên/Enter/Esc), a11y, tôn trọng `prefers-reduced-motion`. Layout là module thuần `constellationLayout.ts` (polar→cartesian, ref giữ-nguyên-định-danh) + test.
- **Giọng nói (Web Speech API):** toggle "Bật giọng nói" + nút mic trong command-center. Mic (SpeechRecognition) → ghép transcript vào composer; trợ lý **đọc to** câu trả lời (SpeechSynthesis) khi stream xong. Module thuần `voice.ts` (`speechSupport` feature-detect · `langToBcp47` map vi/en/zh → BCP-47, Rule 13 · `stripForSpeech`) + test; hook `useVoice` SSR-safe (mọi truy cập `window` trong effect/handler, guard `typeof window`). **Fallback duyên dáng:** trình duyệt không hỗ trợ → ẩn UI giọng nói, chat text như cũ. (Lưu ý: recognition là Chrome/Edge và định tuyến audio qua vendor — caveat hiển thị qua toggle rõ ràng.)
- **Tests/i18n:** +module test thuần (constellationLayout 6 + voice 6) + 4 test tích hợp ChatClient (toggle, pick tool ground-truth, chọn agent persisted, Esc); key i18n `chat.constellation*`/`chat.voice*` vi/en/zh (parity test tự bao phủ). tsc sạch.
- **Follow-up (backlog R&D):** workflow-builder execution-legibility (output/error popover + save-as-template), constellation luôn-hiện (floating launcher), connector ngắt kết nối hiện mờ, waveform AnalyserNode đầy đủ, status SSE trực tiếp trên node.

### Đã thêm — Workflow Builder R&D upgrade (authoring 2.0: Tidy · validation · ⌘K · all/any)
Gói nâng cấp trình dựng workflow (zero-migration, KHÔNG đụng engine — `assertRunnable` vẫn là cổng chạy cứng). Mỗi đơn vị logic là module thuần + test colocated, mọi chuỗi i18n vi/en/zh.
- **Tidy — tự động sắp xếp canvas:** nút "Sắp xếp" (toolbar) trải node thành cây trái→phải. Engine bảo đảm đồ thị LUÔN là cây (≤1 cạnh vào, 1 start), nên dùng layout phân tầng **thuần, không thêm dependency** (`autoLayout.ts`: rank = đường dài nhất, y = thứ tự DFS để 2 nhánh true/false tách hàng). Chỉ chạy khi bấm → không bao giờ ghi đè vị trí đặt tay; Undo hoàn tác được (snapshot có sẵn ghi vị trí).
- **Validation tại thời điểm dựng:** `collectIssues(graph)` (sibling thuần của `assertRunnable`, KHÔNG throw) trả về danh sách lỗi **mã hoá ổn định** (`WfIssueCode`) thay vì 1 chuỗi tiếng Việt ném ra. Surface: **badge "!" cố vấn trên node lỗi** + **panel "Vấn đề (N)"** bấm vào nhảy tới node; lỗi trong foreach-body gắn id lồng (`f1/b1`). Sửa luôn **lỗi i18n thật** (thông điệp validate cũ chỉ tiếng Việt bất kể `laam_lang`). **Cố vấn — KHÔNG chặn Save/Test** (assertRunnable vẫn là cổng cứng).
- **⌘/Ctrl+K — bảng thêm node nhanh:** overlay bàn-phím-trước, lọc **không dấu** (gõ "dieu kien" ra "Điều kiện") qua `nodeSearch.ts` thuần với `labelOf` tiêm vào (i18n-bất-khả-tri, Rule 13); dùng lại `NODE_TYPES` (nguồn chân lý) + đường `addNode` sẵn có, **không thêm dependency** (không cmdk).
- **Trình dựng điều kiện all/any có cấu trúc:** predicate ghép (all/any) trước rơi về textarea JSON thô; nay có **GroupPredicateEditor đệ quy** (chuyển AND/OR, thêm/xoá điều kiện + nhóm con) qua helpers bất biến `predicateForm.ts` — engine đã hiểu all/any sẵn (`evalPredicate`). Giữ toggle JSON "nâng cao" làm lối thoát. Danh sách op build từ `PREDICATE_OPS` (nguồn chung với Op union → có drift-guard test).
- **Tests:** +4 module test thuần (autoLayout/nodeSearch/predicateForm + collectIssues đa-lỗi & drift-guard) + 4 test tích hợp editor (Tidy/⌘K/badge). Sửa 1 test foreach **đã cũ từ trước** (giả định body mặc định JSON — nay là step-builder). tsc sạch.

## [2.5.0] — 2026-06-23 — Cloud-first internal model · message-content search · security guard

### Đã thêm — Workflow UX & độ tin cậy (digest ground-truth · foreach builder · markdown output)
- **Digest dùng số liệu GROUND-TRUTH (Rule 13):** tool mới `laam_metrics_digest` — CODE tính tổng phiên/đang chạy/idle/xong, token vào-ra, chi phí, phiên kẹt, top đốt token và trả sẵn block `summary`. Hai template digest (`digest-overnight-agents`, `digest-judge-verify`) nay yêu cầu chèn NGUYÊN VĂN block đó thay vì để model 8B tự "nhớ" số → hết bịa số liệu. Formatter thuần `formatMetricsDigest` có unit test.
- **Foreach — builder body trực quan:** node `foreach` body trước bắt gõ JSON thô. Nay có **danh sách bước có cấu trúc** (agent/connector/mcp, DÙNG LẠI đúng form + dropdown của node thường) và **tự sinh cạnh nối tuyến tính**; body phân nhánh/nested tự rơi về chế độ JSON (có toggle). Helpers thuần (`linearize`/`buildLinearGraph`/`moveStep`…) + i18n vi/en/zh, có test.
- **Render markdown cho output bước workflow:** `WorkflowDetailClient` StepRow hiển thị output chuỗi (digest agent) qua `MarkdownView` (bold/bullet/emoji) thay vì `<pre>` monospace; output JSON/object giữ `<pre>`.

### Đã đổi — Cloud-first cho tác vụ NỀN (summarize + workflow agent/generate/review)
- Các tác vụ LLM nền (tóm tắt lịch sử chat SP-3, node `agent` trong workflow, AI `generate`/`review` workflow) trước đây **PIN cứng model local** (`DEFAULT_CHAT_MODEL`/Ollama). Sau pivot cloud (tắt Qwen local) chúng **vỡ âm thầm**: mọi hội thoại dài ngừng tóm tắt (fail-soft), mọi workflow có node agent **hard-break** (`Ollama <status>`). Nay đi qua **router chung** `src/lib/llm/internal.ts`: phân giải MỘT model nội bộ theo thứ tự `INTERNAL_MODEL` → có `BYTEPLUS_API_KEY` (cloud-first) → có `ANTHROPIC_API_KEY` → `DEFAULT_CHAT_MODEL` (local $0). Có key cloud thì summarize + workflow agent **chạy tiếp khi local tắt**; deploy local-only (không key cloud) **giữ nguyên đường $0**.
- 3 entry provider-aware: `callModelText` (no-tool: summarize/generate), `callModelChat` (tool-loop: workflow agent), `callModelGenerate` (structured: AI generate) — route BytePlus/Claude/Ollama. Claude là provider no-tool → summarize được nhưng **fail-loud** nếu bị ép chạy node agent (không thể chạy tool). Gộp đường gọi Ollama non-stream về một chỗ (`llm/ollama.ts` `ollamaChat`), bỏ 3 bản sao trùng (chat route + workflow). Thêm env `INTERNAL_MODEL`. **+test** router (ưu tiên phân giải + dispatch từng provider), tsc sạch.

### Đã thêm — Tìm kiếm theo NỘI DUNG tin nhắn + chỉ mục pg_trgm GIN (migration 0016)
- `/api/search` (`lib/search.ts`) nay khớp hội thoại theo **nội dung tin nhắn** (EXISTS trên `chat_message`, scope theo user, **chỉ trả con trỏ** id/title — không lộ body), không chỉ tiêu đề.
- Migration **0016** (idempotent, hand-authored): `CREATE EXTENSION pg_trgm` + **GIN trigram index** trên `chat_message.content`, `chat_conversation.title`, `agent_session.{latestActivity,gitBranch}`, `project.name`, `workflow.name` → tăng tốc các quét ILIKE (gồm tìm nội dung). Chọn **trigram thay vì tsvector** vì LAAM đa ngữ (vi/en/zh) mà Postgres không có cấu hình FTS vi/zh; trigram khớp chuỗi con, ngôn ngữ-bất-khả-tri.

### Bảo mật — guard bất biến "không tạo skill / không exec code tuỳ ý" trong agent tree
- Test guard `src/lib/agent/no-skill-creation.guard.test.ts`: quét `src/lib/agent` + `src/lib/workflow` (đã strip comment/string literal) chặn `child_process` / `eval(` / `new Function(` / module `vm` / `spawn`; khẳng định `INTERNAL_TOOLS` là **allowlist read/write đóng** (không tool nào tạo skill/tool/code) và node-kind workflow **đóng băng** 5 loại. Hợp đồng-hoá bất biến ecosystem (D9; LAAM là tiền lệ mạnh nhất): KHÔNG co-locate agent thực thi code-do-model-sinh với connector mang credential sống.

### Đã đổi — Tool-loop "chạy-tới-xong" (run-until-done) thay cho cap maxRounds=4 cứng
- **Agent giờ HOÀN THÀNH tác vụ nhiều bước** (vd "tổng hợp 10 email rồi gửi báo cáo") thay vì dừng sau 3 tool. `runToolRounds` (`orchestrator.ts`) trước đây cap `maxRounds=4` và **ép-text vòng cuối** (`allowTools = i < maxRounds-1`) → cắt ngang mọi tác vụ cần >3 lượt tool. Nay: thoát theo **hoàn-thành-tự-nhiên** (model ngừng gọi tool — vốn đã là điều kiện break); cap chỉ còn là **chặn runaway** (mặc định **25**, env `CHAT_MAX_ROUNDS`, trần cứng 50).
- **Quản lý ngữ cảnh trong vòng lặp** (`loop-context.ts` mới, thuần): `evictOldToolResults` xoá nội dung tool-result CŨ NHẤT (thay bằng stub, giữ 3 cái gần nhất + pin user/assistant) khi convo vượt ngân sách — chống tràn cửa sổ 16k của Qwen local làm cụt câu trả lời (Ollama không báo lỗi khi cụt). Provider-aware qua `budgetChars`: local = `REPLAY_BUDGET_CHARS`; BytePlus = `BYTEPLUS_TOOL_BUDGET_CHARS` (~400K, cửa sổ lớn nên hiếm khi evict). Per-result cap 8192B (`boundOutput`) GIỮ NGUYÊN.
- **Chặn lặp + báo trung thực:** phát hiện gọi lại cùng tool+args ≥3 lần → ngừng dispatch + nhắc model + kết thúc (key theo tool+**args** nên đọc 10 email khác nhau KHÔNG dính). Khi loop bị ép dừng (backstop/lặp) → chèn notice tri-lingual "đã dừng sau nhiều bước, có thể chưa đầy đủ" (Rule 12, không cụt-im-lặng). **Write-gate GIỮ NGUYÊN** — gửi email vẫn dừng chờ xác nhận.
- Áp cả 3 đường: Ollama + BytePlus (`/api/chat` route, truyền `onBackstop`+budget) + workflow agent-node (default mới). i18n notice vi/en/zh. **+10 test** (loop-context 6 + orchestrator rewrite: natural-completion / backstop / repeat-guard / distinct-args / eviction), **2080 test xanh**, tsc sạch. ⏳ Follow-up: re-baseline `npm run eval` (default 4→25) + wall-clock budget tuỳ chọn.

### Đã thêm — BytePlus là nhà cung cấp model thứ 3 trong chat (full-agent)
- **BytePlus ModelArk (OpenAI-compatible) thành lựa chọn model thứ 3** bên cạnh **Claude** và **Local Qwen/Ollama**: đặt `BYTEPLUS_API_KEY` (key org, server-only) để picker model hiện optgroup **BytePlus** (`seed-1-8-251228` / `seed-1-6-250915` / `seed-1-6-flash-250615`, qua `GET /api/chat/info`). `BYTEPLUS_BASE_URL` phải khớp region của key (mặc định `ap-southeast`; EU = `ark.eu-west`).
- **KHÁC Claude (MVS không tool):** BytePlus chạy **FULL tool-loop** như model local — `runToolRounds` + `withSafety` + write-gate (thẻ xác nhận), connectors, internal tools, citations, persist tool-turn. Adapter mới `src/lib/llm/byteplus.ts` gọi `/chat/completions` bằng **plain fetch (KHÔNG thêm dependency SDK)**; dịch convo Ollama-shaped → OpenAI ở biên (tổng hợp `tool_call` id, ghép `tool_call_id`, hạ message `tool` mồ côi của web_read-nudge xuống `user`), map `arguments` chuỗi-JSON → object cho dispatch (Rule 13). `byteplusStream` parse SSE → `{delta,usage}` (cùng hợp đồng với `claudeStream`/`ollamaStream`).
- **Fail-loud + an toàn:** thiếu key → `BytePlusUnavailableError('auth')` TRƯỚC mọi network → notice tri-lingual (persist), KHÔNG tự fallback Ollama; lỗi 401/403→auth, 429→rate_limit, 503/529→overloaded, network→connection; lỗi ngoài 4 loại → 'api' (fail loud). Khối **suspend write-gate tách helper dùng chung** Ollama+BytePlus (chống drift hợp đồng confirm — Rule 7). Summarize/proactive vẫn PIN model local; confirm-resume narrate bằng đúng model lượt gốc.
- **Còn lại (ghi rõ):** vision BytePlus chưa nối (v1 = text + tools); key per-user (BYOK) là follow-up; workflow vẫn local-only. i18n vi/en/zh cho optgroup mới. **+33 test** (byteplus adapter 27 + route 2 + info 2), **2068 test xanh**, tsc sạch.

### Bảo mật — recipient-gate đa-định-dạng (+flip Slack/WhatsApp/Zalo) · SSRF DNS-pin · HKDF per-user · defense-in-depth (2026-06-16)
- **Recipient-gate nhận biết định dạng + flip 3 write messenger:** gate workflow trước đây chỉ parse email (`parseRecipients`) nên slack/whatsapp/zalo dù khai `recipientField` vẫn fail-closed kép. Thêm `parseRecipientsByFormat` (Slack channel-id chữ HOA / WhatsApp E.164 chỉ chữ số / Zalo OA user-id) — zero-differential với handler từng connector, chặn injection/khoảng-trắng/đa-đích. `ConnectorTool.recipientFormat` tự khai (vắng → email, back-compat gmail). Gate dispatch theo format + **allowlist RIÊNG mỗi format** (`WORKFLOW_SLACK_ALLOWLIST` / `WORKFLOW_WHATSAPP_ALLOWLIST` / `WORKFLOW_ZALO_ALLOWLIST`) — mở một kênh không nới kênh khác; allowlist rỗng → throw (fail-closed mặc định). `slack_send_message` / `whatsapp_send_message` / `zalo_send_message` flip `workflowSafe:true` (CTO duyệt 06-16) — vẫn fail-closed tới khi operator đặt allowlist.
- **SSRF DNS-pin trên MCP client:** guard cũ chỉ kiểm host literal lúc config (`store.ts`); `client.ts connect()` không kiểm gì → hostname public trỏ IP nội bộ/metadata (169.254.169.254) vẫn fetch server-side bằng token user. Thêm `assertSafeUrlResolved` (resolve DNS + validate MỌI IP, fail-closed) wire vào connect TRƯỚC khi mở transport; `isBlockedIp` phủ cả IPv6 (loopback / link-local fe80::/10 / ULA fc00::/7 / IPv4-mapped). KHÔNG thêm dependency. Hạn chế còn lại (ghi rõ): TOCTOU re-resolve của transport — cần pinned-IP dispatcher (undici) ở follow-up.
- **HKDF per-user cho credential lưu trữ:** creds connector (`store.ts`) + cấu hình MCP server gồm authToken (`mcp/store.ts`) trước đây mã hoá bằng MỘT key chung. Chuyển sang key suy ra `HKDF(master, userId)` (blob `v2:…`) — cách ly mật mã chéo-user (blob user A không giải được bằng key user B → bug cross-user fail-closed) + seam cho BYOK. `encryptJson` / `decryptJson` (key chung, blob 3-phần) GIỮ NGUYÊN cho blob tạm (OAuth state cookie, niêm phong write-token SP-2). Lazy migration: blob cũ vẫn đọc được, tự re-encrypt sang v2 ở lần ghi kế (không migration schema). LƯU Ý trung thực: mọi key vẫn suy từ cùng master → KHÔNG chống lộ master env; cần per-user material (KMS/DPAPI/BYOK) ở follow-up.
- **Defense-in-depth:** MCP `listTools` cap 200 tool (server không tin cậy trả hàng ngàn tool → bloat context; log khi cắt); bound error MCP trả về model còn 300 ký tự (error attacker-controlled → chống cost-bloat); collector backoff thêm jitter (`jitteredBackoff` = base + tới +100% ngẫu nhiên) chống thundering-herd khi nhiều collector retry đồng loạt.

### Đã thêm — Quick-tools picker (chat) · MCP node (workflow) · Custom Agents · mobile parity (P1–P4, từ E2E findings 2026-06-12)
- **Chat — bộ chọn công cụ nhanh (P1):** gõ `/` giờ mở menu 2 tầng: **Lệnh nhanh** (5 lệnh cũ) + **Công cụ** gom nhóm *LAAM / từng connector đã kết nối / từng MCP server* (lọc theo tên+mô tả, badge đọc/ghi). Chọn tool → chip trên ô soạn + **form tham số bắt buộc** (chỗ dán `project_id` UUID…, mô tả param làm gợi ý); thiếu tham số bắt buộc thì không gửi được. Backend: `GET /api/chat/tools` (catalog per-user, fail-soft từng nguồn) + body `/api/chat` nhận `requestedTool` → **code gọi tool đó deterministic trước vòng model** (qua đúng `withSafety`: tool ghi vẫn ra thẻ xác nhận; tool-frame/citations/persist nguyên vẹn; model Claude → 400 vì MVS không tool). Đây là đòn bẩy reliability thay cho prompt-tune: hết đoán-UUID, hết chọn-sai-biến-thể, hết narrate-but-stop với tool user đã chỉ định.
- **Workflow — node MCP (P2):** kind mới `mcp` {server, tool, args} gọi tool MCP server per-user trong workflow (engine route qua `mcp__<slug>__<tool>`, args nội suy `{{…}}` như connector). **An toàn fail-closed:** chỉ tool read user đã trust (`trustReadHints` × `readOnlyHint`) chạy thật; write/chưa-trust bị chặn khi chạy thật, dry-run mock để xem trước. Editor: node card + form chọn server→tool (schema-driven args, cảnh báo tool write) ; `GET /api/connectors/mcp` thêm `toolDetails` (tên thật + mô tả + schema + kind). AI-generate **không** sinh node mcp (model không biết slug thật — Rule 13).
- **Custom Agents (P3):** bảng `custom_agent` per-user (migration **0015**, additive) + CRUD `/api/custom-agents` (viewer 403, ownership 404) + trang **Cài đặt → Custom Agents** (tạo/sửa/xoá + 3 mẫu nhanh: Người tóm tắt / Người phân loại / Người soạn nội dung). Node Agent trong workflow chọn **preset** → system prompt lấy từ preset lúc chạy (per-user; preset bị xoá → run **fail-loud** thay vì lặng lẽ dùng default). AI-generate strip `customAgentId` (Rule 13).
- **Editor mobile (P4):** thanh palette mobile giờ derive từ **cùng** danh sách node với thư viện desktop (icon + tên i18n, đủ 5 kind gồm MCP) — kind mới tự xuất hiện cả 2 nơi, hết lệch desktop↔mobile.
- i18n vi/en/zh đầy đủ cho mọi chuỗi mới. **+68 test** (1791 → 1859), tsc sạch. Nguồn: `.serena/memories/decisions/chat-mcp-quicktools-workflow-e2e.md`.

### Đã thêm — OAuth đa-provider + 3 connector mới (Slack / WhatsApp / Zalo OA)
- **Lớp OAuth provider tổng quát** (`src/lib/connectors/oauth/`): Google port nguyên semantics; thêm **Atlassian 3LO** (token endpoint JSON, KHÔNG PKCE, refresh xoay vòng dùng-1-lần), **Slack v2** (lỗi HTTP-200 `{ok:false}`, bot token không hết hạn — không refresh), **Zalo OA v4** (secret qua header `secret_key`, PKCE chỉ `code_challenge`, refresh 3 tháng dùng-1-lần). Callback per-provider `/api/connectors/<provider>/callback`; state cookie **per-connector** `laam_oauth_<id>` (2 flow song song không đè nhau) + assert provider↔connector fail-closed; refresh tại chokepoint `execute()`/`testConnector()` sau **Postgres advisory lock** (dev+prod chung DB — chống đua làm chết refresh token xoay vòng).
- **Jira lên OAuth dual-mode:** nút "Kết nối với Jira" khi operator đặt `ATLASSIAN_OAUTH_CLIENT_ID/SECRET`; fields site/email/API-token **vẫn chạy** (fallback + user cũ không vỡ). Mode-switch rạch ròi: lưu manual đủ bộ → xoá keys OAuth; grant chết (invalid_grant) mà manual còn đủ → tự rơi về manual, không kẹt `needs_reconnect`. Cloud ID + site URL resolve 1 lần qua `accessible-resources`.
- **Trello 1-click authorize (accelerator, vẫn token-mode):** redirect `trello.com/1/authorize` → token trả về qua **URL fragment** → trang capture `/connectors/trello/callback` (scrub hash ngay, Referrer-Policy no-referrer) → POST session-bound + cookie chứng-minh-flow + **verify `/1/members/me` trước khi lưu**. Cần `TRELLO_API_KEY` + origin LAAM trong Allowed Origins. trello.ts chuyển auth sang header `Authorization: OAuth …` (token khỏi query/log); 401 → `needs_reconnect` (thu hồi phát hiện lúc gọi — cơ chế mới dùng chung với Slack).
- **3 connector mới:** `slack` (list_channels / channel_history / send_message — OAuth-only), `whatsapp` (send_message qua Cloud API v25.0 — token System User + Phone Number ID; **chỉ gửi**, trong cửa sổ 24h — cá nhân không có API chính thức, Embedded Signup đòi Tech Provider nên không OAuth được), `zalo` (recent_chats / send_message — OAuth OA; cần OA xác thực + gói API; consent per-OA bởi admin). Mọi write mới: **không** `workflowSafe` (fail-closed trong workflow) + khai `recipientField`. Tổng tool 36→42, write 11→14. i18n vi/en/zh đầy đủ.
- **UI `/connectors`:** nút authorize per-provider chỉ hiện khi env operator đủ (`auth.oauthConfigured`); chưa cấu hình → hiện setup-hint + fields nhập tay (nếu có). `.env.example` + `DEPLOYMENT.md` thêm checklist console 8b–8e per provider.

### Đã sửa — Jira search chết do Atlassian gỡ API (verify live 06-12)
- `jira_search_issues`/`jira_my_issues` hỏng từ ~10/2025: `GET /rest/api/3/search` bị Atlassian **gỡ hẳn (410 Gone**, CHANGE-2046). Chuyển sang `GET /rest/api/3/search/jql` + **bắt buộc truyền `fields`** (mặc định mới chỉ trả id) + JQL mặc định **bounded** `updated >= -30d ORDER BY updated DESC` (endpoint mới từ chối JQL không giới hạn). Response không còn `total` → trả `{count, issues}`. JQL user đưa bị 400 → trả nguyên message Atlassian cho model tự sửa. **Verify live:** 200 + 15 issues trên site thật.
- Phát hiện kèm: trang `trello.com/app-key` đã chết từ ~2023 (key chỉ tạo được qua Power-Up admin; dán nhầm ô "Secret" = lỗi 401 "invalid key" kinh điển) → help text Trello viết lại 3 ngôn ngữ; creds Trello đang lưu trong DB đã chết (401) — kết nối lại bằng nút 1-click sau khi operator đặt env.
### Đã thay đổi — Đồng bộ Node 24 LTS cả hai môi trường (diệt cả class lỗi lock drift)
- **Docker `node:22-alpine` → `node:24-alpine`** (cả 3 stage deps/builder/runner): Node 22 đã rời Active sang Maintenance LTS (EOL 04/2027); Node 24 là Active LTS đến 10/2026, EOL 04/2028. **Host Windows nâng `nvm install/use 24.16.0`** → hai môi trường giờ trùng khớp tuyệt đối **Node v24.16.0 / npm 11.13.0**, xoá hẳn lệch dialect npm 10↔11 từng gây 5 lần @emnapi drift (pin devDependencies vẫn giữ làm phòng tuyến thứ hai).
- **`engines` nâng floor `node >=24`, `npm >=11`** — chặn máy còn npm 10 vô tình regen lock theo dialect cũ.
- Verify: image build pass trên base mới (tesseract 5.5.2 + poppler nguyên vẹn, smoke-test node/npm/tesseract/pdftotext trong image); regen lock **ngay trên host** (thao tác từng gây drift) → 2 entry @emnapi còn nguyên, host + `node:24-alpine` cùng `npm ci` pass; **1791 test xanh** trên Node 24.16. ⚠️ Container prod cần rebuild + redeploy để chạy image Node 24 (image verify: `laam:node24-verify`).

### Đã sửa — Diệt tận gốc @emnapi lockfile drift (tái diễn lần 5)
- `npm ci` trong Docker (alpine, npm 10) vỡ "Missing: @emnapi/runtime@1.11.0 / @emnapi/core@1.11.0 from lock file": npm 11 trên host Windows prune 2 entry này khỏi `package-lock.json` ở mỗi lần `npm install` (npm 10 lại đòi chúng → lệch dialect). Đã tái diễn 5 lần (73e4672 → 64faa06 → f361801 → efb4013 → nay).
- **Fix triệt để:** pin `@emnapi/core` + `@emnapi/runtime` `^1.11.0` vào **`devDependencies`** — dep bắt buộc thì không npm version nào được phép prune khỏi lock. Lưu ý: pin vào `optionalDependencies` **KHÔNG đủ** (đã thử và bị npm 11 prune tiếp — "optional" nghĩa là được phép vắng mặt); lock re-sync trong `node:22-alpine` (`npm install --package-lock-only`, không đụng `node_modules` host).
- Verify 4 chiều: alpine npm ci ✅ · host npm ci ✅ · npm 11 regen lock giữ nguyên 2 entry ✅ · alpine chấp nhận lock do npm 11 sinh ✅. 1757 test xanh.

## [2.4.1] — 2026-06-12

### Đã thêm — Owner/admin cấp access-key cho người dùng khác (hoàn tất yêu cầu key↔user 2 chiều)
- **`POST /api/access-tokens` nhận `forUserId` (tuỳ chọn):** không có / trùng chính mình → self-service như cũ (`requireMutator`). Khác mình → **owner/admin** mới được cấp: kiểm tra target tồn tại (404) + chưa bị vô hiệu hoá (400); **admin KHÔNG cấp được cho owner/admin — chỉ owner mới được** (chặn "rửa danh nghĩa"); `userId` lấy từ bản ghi DB đã xác thực (**KHÔNG** tin `forUserId` echo — Rule 13), `createdByUserId` = người cấp, tên khoá bị gắn hậu tố `(provisioned by <admin>)` (code-set, tự tài liệu hoá để chính chủ thấy là được cấp chứ không tự tạo); token + audit `token_issued_for` trong **một transaction**; **`Cache-Control: no-store`** trên mọi response trả token.
- **`GET /api/access-tokens?userId=<id>` (owner/admin):** xem khoá của một user khác (cho UI). **Role-first**: member truyền `?userId` bị ép về chính mình về mặt cấu trúc (không bao giờ đọc được khoá người khác); projection có `createdByUserId`, **không bao giờ** có `tokenHash`.
- **UI `/settings/users`:** mỗi hàng có nút mở rộng **"Khoá truy cập"** (UserKeysPanel) — liệt kê khoá api/mcp của user + **"Cấp khoá"** (thẻ reveal-once **màu hổ phách**, khác hẳn thẻ xanh self-service) + thu hồi. Hàng của chính admin chỉ hiện gợi ý tự tạo ở `/settings/access`. Cảnh báo trung thực: khoá đọc **giám sát agent org-shared, chỉ đọc**, dưới danh nghĩa người được cấp. `/settings/access` hiển thị badge **"Cấp bởi quản trị viên"** trên khoá được admin cấp (chính chủ thấy rõ). i18n đầy đủ vi/en/zh. Migration **0014** (`access_token.createdByUserId`).

### Bảo mật — 2 vá phòng thủ chiều sâu (phản biện thiết kế bắt được, feature này khuếch đại)
- **`laam_query_audit` lọc theo principal:** trước đây trả **TOÀN BỘ** audit log của tổ chức cho **bất kỳ** token api/mcp (kể cả token member tự tạo) → lộ `role_change` / `user_disabled` / `token_issued_for {actor,subject}`. Nay lọc `eq(auditLog.userId, ctx.userId)` — token chỉ đọc hành động của **chính principal**; token mồ côi (chủ đã xoá → principal rỗng) **fail-closed** (không trả gì) thay vì rơi về org-wide. (Đọc audit toàn tổ chức là năng lực phiên UI, không qua tool. Org-shared read rộng của các laam_* khác — search/timeline/list — vẫn ở backlog.)
- **`verifyAccessToken` tái kiểm `disabledAt`:** trước đây chỉ kiểm revoked/expired/kind — một token sót khỏi đợt thu hồi off-boarding sẽ sống mãi. Nay **từ chối nếu chủ sở hữu bị vô hiệu hoá**, bất kể trạng thái bản ghi token → `disabled` là tối thượng (bỏ qua khi token không có userId — collector provenance).

### Sửa
- Đính chính memory: `userId` trên `access_token` **KHÔNG** phải khoá cô lập dữ liệu MCP đang hoạt động (các tool `laam_*` không lọc theo `ctx.userId`) — nó là attribution/provenance; cô lập per-user cho MCP là **dành sẵn, chưa kích hoạt**. PR này đóng phần rò audit-log; phần còn lại ở backlog.

## [2.4.0] — 2026-06-12

> ⚠️ **Triển khai:** bản này vá 2 lỗ hổng đang sống (RBAC enforce + SSE rò chéo người dùng). Container production **phải rebuild image** để có hiệu lực — image cũ đang chạy vẫn hở.

### Bảo mật — Nền RBAC + cách ly SSE + off-boarding (Phase S)
- **RBAC giờ thực thi thật (trước đây trang trí):** `auth.config.ts authorized()` chỉ kiểm tra đã-đăng-nhập; role-403 trước đó **chỉ** có ở `/api/machines` — viewer/member chạy được **mọi** mutation, kể cả `POST /api/workflows/[id]/run` (dryRun=false → connector ghi **THẬT** với cred live). Thêm `src/lib/auth/rbac.ts` (`requireRole`/`requireMutator`, fail-closed: không session → 401, viewer/role-thiếu → 403) và **gate mọi route mutation**: workflows (POST/PATCH/DELETE/run/schedules/runs-cancel/clone/templates/instantiate), connectors (connect/disconnect/test + OAuth-GET authorize/callback → viewer redirect `/connectors?error=forbidden` + mcp POST/DELETE), conversations (POST/PATCH/DELETE), access-tokens POST, chat POST, sync POST. **viewer = read-only** toàn hệ. Để ngỏ có chủ đích: access-tokens/[id] DELETE (self-revoke = giảm quyền), generate/review/ocr/pdf/docx/fetch-url (không ghi DB/ngoài), route token-auth ingest/mcp/tick.
- **SSE hết rò chéo người dùng:** `/api/events` trước đó snapshot **không WHERE** → broadcast mọi `agent_session` cho mọi client; session `api`/`mcp` mang `userId` thật → user B thấy hoạt động MCP của user A. Nay `visibleForClient` lọc `api|mcp` **per-principal** (chỉ chủ sở hữu thấy), `local`/`claude` **giữ org-shared** (đúng value-prop team — không thu hẹp `/agents`); áp ở cả lúc connect lẫn mỗi lần re-push; `userId` không bao giờ lên wire.
- **Off-boarding (gộp vào F1):** disable một user là **một transaction** = set `user.disabledAt` (migration **0012**) + thu hồi **mọi** `access_token` + xoá legacy `machines.tokenHash WHERE ownerUserId` + ghi audit — đóng cả 2 đường token sống. Đăng nhập bị chặn **sau** bcrypt (không lộ trạng thái tài khoản).

### Đã thêm — Quản lý người dùng & RBAC UI (F1 + F1b)
- **API:** `GET /api/users` (owner/admin, whitelist cột — không lộ passwordHash); `PATCH /api/users/[id]` `{role}` **owner-only** (guard: không tự đổi, không hạ owner cuối cùng còn hoạt động, ghi audit `role_change`); `{disabled}` owner/admin (transaction off-boarding ở trên, guard tự-disable + owner-cuối); `DELETE /api/access-tokens/[id]` mở rộng: owner/admin thu hồi token bất kỳ (off-boarding), member vẫn chỉ self-scope, 404 khi không khớp (không "thành công ngầm").
- **UI:** trang **`/settings/users`** (owner/admin, redirect-gated) quản lý vai trò + bật/tắt; **`/settings/access`** (mọi user) tự quản access-key; hàng mới trong SettingsMenu; i18n vi/en/zh đầy đủ (`users.*`, `access.*`).
- **F1b — đổi role/disable có hiệu lực ngay request kế:** jwt-callback đọc lại user khi token refresh → disabled/đã xoá → trả `null` (huỷ phiên ngay), role thay đổi → cập nhật; **fail-open** khi DB lỗi (không tự khoá toàn bộ user vì sự cố tạm thời).

### Đã thêm — Thông báo trong ứng dụng (F2)
- **Chuông thông báo per-user:** bảng `notification` (migration **0013**) + **chokepoint duy nhất** `create()` (insert dedupe-aware → publish sự kiện SSE `notification` **per-user**); kênh SSE **riêng** với `c.userId === userId` — **tách hẳn** broadcast `sessions` org-shared (chặn cứng, tránh vô tình thu hẹp `/agents`). Dropdown ở header + badge số chưa đọc + trang **`/notifications`** (đánh dấu đọc / đọc tất cả); housekeeping `pruneOld`.
- **Nguồn sự kiện:** workflow chạy xong/thất bại/huỷ (`notifyWorkflowTerminal`, deep-link tới run, dedupe `wfrun:<id>`) và chat write-gate chờ xác nhận (`notifyWritePending`, dedupe theo conversation+tool). Dedupe qua **partial-unique index** `(userId, dedupeKey) WHERE dedupeKey IS NOT NULL` + `onConflictDoUpdate` với `targetWhere` tường minh (re-surface, không nhân bản). Model mở rộng kênh (cột `audience`) nhưng **chỉ** triển khai in-app — email/Slack/org-broadcast defer.

### Đã thêm — Hợp nhất Agents vào Monitoring (F3)
- Trang **Monitoring** giờ là một mặt với 3 tab (agents / chat / workflow); tab **agents** render lại đúng UX/UI giàu của AgentsClient (mặc định); `/agents` → `redirect("/monitoring?tab=agents")` (giữ `/agents/[id]` chi tiết, cập nhật back-link + nav); thêm chỉ báo **độ tươi** dữ liệu + nút Sync. Link `/agents` chết bị gỡ khỏi header + bottom-nav. Tab chat/workflow scope **per-user** (`getMonitoredRuns`) + `isVisible` phòng thủ tầng hai.

### Đã sửa — Parser monitoring đọc output sub-agent (F4)
- Parser transcript bắt thêm **`outputText`** (redact credential **trước** rồi mới bound ≤500 ký tự — không để lộ secret gần ranh giới cắt) + **`isError`** từ `tool_result.content` của Task; chảy vào `agent_sessions.subAgents` jsonb. `SubAgentJson` type 2 field này (optional, tương thích ngược row cũ); trang chi tiết hiện **chấm đỏ** khi sub-agent lỗi. **Bỏ** `parentToolUseId` đã thử ban đầu — `parent_tool_use_id` **không tồn tại** trên sidechain thật (field thật là `parentUuid`/`agentId`); panel output đầy đủ + cây cha→con defer (`backlog/subagent-parent-link.md`).

### Câu trả lời kiến trúc (user hỏi: log local còn ý nghĩa khi mọi thứ đã vào DB?)
- **GIỮ** local-parse cho dev/host: đây là **nguồn duy nhất** của log timeline + tool-call waterfall (DB chỉ lưu summary). Container production **không mount** `~/.claude/projects` → local-parse **đã chết** trên prod; waterfall cho session collector từ xa cần cơ chế events-push (mới, defer).

## [2.3.0] — 2026-06-12

### Đã thêm — Claude trong chat (MVS, tuỳ chọn) (2026-06-11)
- **Switch model Qwen ↔ Claude:** đặt `ANTHROPIC_API_KEY` (key org, server-only) → picker model có thêm optgroup **Claude API** với đúng 2 model `claude-sonnet-4-6` / `claude-opus-4-8` (whitelist chặt, model claude khác → 400). Adapter Messages API (`src/lib/llm/claude.ts`): gộp system messages → param `system`, chỉ gửi `max_tokens` (không sampling params — Opus 4.7+ reject), stream qua frame protocol U+001E sẵn có, usage → frame `{t:"tokens"}`. MVS: **chat thường + stream, CHƯA tools/vision** (tool-loop bị bỏ qua có chủ đích — bật tools cần re-run eval k≥6 trên Claude trước).
- **An toàn & trung thực chi phí:** note cố định khi chọn Claude (tính phí token vào key org — KHÔNG ảnh hưởng subscription Claude cá nhân; ảnh đính kèm không gửi Claude); quy đổi **≈$ (ước tính)** trên tổng token; summarize/proactive **ghim model local** (không bao giờ gọi Claude cho việc nền); guard cửa-sổ-replay (prepend stub user khi window mở đầu bằng assistant — chống 400 lặp trên hội thoại dài); lỗi pre-delta fail-loud trilingual (không bao giờ trả lời rỗng im lặng); Stop huỷ cả request Anthropic (abort signal xuyên SDK — không rò phí); system prompt cho Claude render **không tool** (không dụ model bịa tool).
- **Verdict subscription (nghiên cứu + verify 4 nguồn):** subscription-OAuth bị Anthropic cấm dùng trong app thứ ba (ToS 19/02/2026) + chặn server-side (09/01/2026) → KHÔNG build "authorize tài khoản Claude subscription"; chi tiết `decisions/claude-provider-and-subscription.md`.

### Đã thêm — Workflow patterns đợt 1 (2026-06-11)
- **Structured output cho agent node:** field `format` (JSON-schema, optional, additive) — engine constrain JSON qua Ollama `format`, parse + 1 self-repair retry + strip ```json fence (qwen quirk), fail-loud kèm node id; output là OBJECT nên `{{steps.<id>.output.<field>}}` nội suy được; textarea schema trong NodeConfigPanel (validate inline, i18n vi/en/zh); AI-builder biết field mới + 3 idiom (judge-verify / classify nhị phân / pipeline per-item).
- **2 seed template mới:** "Digest có kiểm chứng (judge-verify)" — summarize → judge `format {verdict: PASS|FAIL, reason}` → condition `eq` trên field enum (KHÔNG contains trên free-text) → Demo connector; "Triage theo lịch" — guard structured-output `{status: stuck|clear}` → tóm tắt → Demo task (dùng với schedule recurrence). Test khoá: không template nào tham chiếu biến `{{trigger.*}}` không tồn tại; mọi connector trong template chỉ Demo. **PIN mới: workflow/scheduled chỉ chạy model local.**
- KHÔNG làm (có chủ đích, ghi plan): switch/loop node, parallel foreach, DAG/tournament/runtime-spawn.

### Đã sửa — Responsive & điều hướng (2026-06-11)
- **/monitoring và /graph vào được trên mobile** (rows mới trong Settings, pattern row /eval; i18n vi/en/zh); active-state desktop nav nhận prefix (`/settings/machines` sáng tab Settings).
- **Bottom-nav hết che nội dung:** /eval (cả empty-state) pb-24; React-Flow Controls nâng đáy trên mobile (globals.css, phủ cả /graph lẫn editor); bottom-sheet editor + safe-area.
- **Editor workflow hết tràn ngang ở 380px** (đo thật 597px→380px): nút top-bar icon-only dưới sm (aria-label động đúng trạng thái Testing…/Saving…), overflow-x-auto.
- Xoá route throwaway `/ui-preview` (Matte Dark đã nghiệm thu).

### Tài liệu — Google MCP & connectors (2026-06-11)
- README: hướng dẫn **mount MCP server ngoài per-user** (tính năng P6 đã ship nhưng chưa truyền thông) + ghi chú Claude provider. Quyết định: **GIỮ Google REST connectors** (official Workspace MCP đang Developer Preview, Gmail MCP không có send → mất write đã gate); PoC official MCP có điều kiện kích hoạt ghi ở `backlog/google-mcp-official-poc.md`; backlog mới `connectors-crypto-hkdf.md` (per-user HKDF + SSRF DNS-pin).

## [2.2.0] — 2026-06-11

### Đã thêm — Chat đọc tài liệu: PDF & DOCX parse server-side (2026-06-11)
- **PDF thật, 3 tầng:** ưu tiên **text-layer** (PDF số) → **OCR** (PDF scan, poppler + tesseract vie/eng/chi_sim) → fallback **AI-vision** — parse **server-side** nên kết quả đồng nhất mọi thiết bị; upload từ iPhone/browser cũ hoạt động (pdfjs legacy build); upload nhị phân không còn 500 (strip NUL).
- **DOCX server-side:** unzip + parse `word/document.xml` — đính kèm .docx đọc được nội dung như PDF/txt.
- **Đính kèm preview + persist:** xem trước file đính kèm trong composer và **sống sót qua refresh** (persist).
- **Build/Docker:** re-sync package-lock trong alpine (drift `@emnapi` musl lần 4) — `npm ci` trong image hết vỡ.

### Đã sửa — Chat tool-selection & độ bền tool-output (2026-06-11)
- **Tool-selection quick wins (QW-1/2/3/5):** system prompt nhóm tool read/write + sort write-first, trigger-cue cho 11 write tool, nudge `web_read`, few-shot demo — khắc phục nhầm lẫn chọn tool của model local (eval k=10: bare-write 100%@16 tool).
- **Tool-output truncation phục hồi được** (`boundOutput` recoverable) + `laam_list_agents` hỗ trợ sort qua param enum (mô tả tool giữ tối giản).

### Đã thêm/sửa — Landing page `/`: responsive P0 + show điểm mạnh platform (đánh giá 6-lens, 2026-06-11)
- **Responsive (P0):** mech exploded-view chỉ chạy desktop ≥ 1100px — mobile/tablet nhận lưới 6 panel đọc được (hết chồng đè, WCAG 1.4.10); hamburger nav 768px (disclosure always-in-DOM, `aria-controls` hợp lệ, guard desktop); nút CTA hết wrap; sticky `100svh` + safe-area; grid phụ 2 bước 1024/640; layout riêng cho desktop thấp (≤1000px height).
- **Nội dung mới:** section **"Cách hoạt động"** thật (3 bước collector → đăng nhập → SSE live) nhận anchor `#how` (trước trỏ nhầm vào grid phụ — nay grid là `#more`); section **"Riêng tư & an toàn"** + dải số liệu ($0 · 6 connector · 3 ngôn ngữ · 4 vai trò · 0 dòng sửa agent); pitch zero-instrumentation vào hero; 2 card mới Tìm kiếm toàn văn + Bản đồ; **ảnh sản phẩm thật** trong HUD panel (dashboard + chat, `public/landing/`); badge "SỐ LIỆU MINH HOẠ" cho telemetry demo; CTA hero/footer auth-aware; metadata marketing + `robots.txt` hợp lệ (hết 307 → /login, thêm `/robots.txt` vào isPublic).
- **Copy trung thực (vi/en/zh):** sửa claim "mã hoá per-user" (code dùng 1 server key) → "AES-256-GCM khi lưu trữ, cách ly theo người dùng trong DB" ở cả 3 vị trí; write-gate scope rõ "trợ lý AI"; connector 7→6 (bỏ Demo khỏi marketing); bỏ hardcode tên model (`VLM 8B`).
- **A11y/Perf:** `<html lang>` sync khi đổi ngôn ngữ client-side (TOÀN APP, WCAG 3.1.1); `--faint` 0.42→0.58 (6.58:1, pass AA); pinch-zoom mở lại RIÊNG trang landing (app giữ khoá theo quyết định cũ); scanline/scroll-cue animate `transform` thay `top` (compositor-only) + pause trên panel ẩn; dot-field bake sprite 1 lần (bỏ ~10k gradient alloc/giây) + height-only resize giữ nguyên hạt (hết "nhảy" khi URL-bar mobile co); scroll mech 380vh→280vh, reveal panel cuối 0.86→0.72.
- Nguồn: đánh giá 6-lens `.serena/qa/landing-eval-2026-06-11.md` + plan `docs/superpowers/plans/2026-06-11-landing-page-improvements.md` (22 finding confirmed, 2 refuted).

### Đã thêm — R2 post-release: Search, chat Vision, huỷ workflow-run, lọc máy + `/api/config` (2026-06-11)
- **Search (port từ v1):** trang **`/search`** + **`GET /api/search?q=`** (session-protected, KHÔNG thêm vào allowlist public) — ILIKE trên **phiên agent** (org-shared, cùng visibility `/api/events`: hoạt động gần nhất + tên project + git branch), **hội thoại chat** (tiêu đề, chỉ của mình) và **workflow** (tên, chỉ của mình); LIMIT 20/nhóm ngay ở SQL, escape `% _ \`, query < 2 ký tự trả rỗng không chạm DB (nâng cấp pg_trgm GIN để dành khi chậm). UI debounce 300ms, đủ 4 trạng thái (gợi ý / đang tìm / lỗi / không kết quả có echo query); link Search thêm vào header + bottom-nav; dict mới `search.*` (12 key vi/en/zh). Kết quả hội thoại tạm link về `/chat` chung (ChatClient chưa có deep-link per-conversation — đã ghi chú ngay trên UI).
- **Chat Vision — gửi ảnh thật cho model:** ảnh đính kèm giờ đi **raw base64** tới `qwen3-vl` qua field `images` của message user cuối (đúng format Ollama), **song song** flow OCR-text cũ (giữ nguyên 100%). Cap theo VRAM 16GB / `CHAT_NUM_CTX=16384`: client tự giới hạn **2 ảnh × 2MB-sau-encode** (vượt → thông báo i18n `chat.imgCapCount`/`chat.imgCapSize` + degrade thân thiện về OCR-text); server validate **sớm** trước mọi I/O DB/Ollama — request vượt trần (> 2 ảnh / > 2.8MB base64/ảnh) → **400 fail-loud**, không strip im lặng (client hợp lệ không bao giờ dính 400). Không ảnh → payload Ollama y hệt trước. Ảnh **không persist** — reload/regenerate chỉ còn OCR-text.
- **Workflow — huỷ run đang chạy:** **`PATCH /api/workflows/runs/[id]` `{action:"cancel"}`** (owner-only 404, 400 action lạ, **409** khi run đã terminal, conditional-update chống race) → engine check `shouldStop` **trước mỗi node** (kể cả body foreach) → status mới **`cancelled`**: step đã xong giữ nguyên, không bị đánh `failed`; run `cancelled` không bao giờ bị tick-resume nhặt lại (claim vẫn lọc đúng `resumable`), cancel-trước-execute không bị "hồi sinh" (`queued→running` là conditional). UI chi tiết workflow: nút **"Huỷ run"** trên run queued/running + **toast** trạng thái terminal qua SSE (succeeded/failed/cancelled, `role=status`, tự ẩn 5s); 5 key i18n mới trong dict `workflows` (vi/en/zh).
- **`GET /api/config` (port từ v1) — ngưỡng "nghi kẹt" cấu hình được:** trả `{stuckMin}` từ env **`LAAM_STUCK_MIN`** (int phút, mặc định 10, clamp 1..120 — helper `readStuckMin`); `useLiveSessions` bỏ hardcode 10′ → fetch config 1 lần khi mount (lỗi/offline → fallback 10), stuck-badge + Notification **re-evaluate** cả khi config về muộn; đổi env cần restart app. Lệch còn lại (follow-up): dropdown lọc "Nghi kẹt" ở `/agents` vẫn ngưỡng 10′ cố định.
- **Lọc Agents theo máy:** select "Mọi máy" (`agents.machineAll`, vi/en/zh) trong FilterBar — danh sách máy từ `GET /api/machines`; `LiveSession.machineId` thêm **additive** (optional) vào snapshot SSE nên payload/consumer cũ không vỡ; máy local luôn có `machineId` (`local:<hostname>`) nên filter phủ cả local lẫn remote. **Lọc theo owner KHÔNG làm** (có chủ đích): cột `agent_sessions.userId` hiện không code path nào ghi → filter sẽ lọc trên field luôn rỗng.
- **Bảo vệ `/api/ingest` + collector retry:** body > **5MB** (theo header `content-length`, check **sau** auth — giữ semantics 401-trước-413) → **413** `Payload too large (max 5MB)`; thiếu header (chunked) → parse như cũ. Collector (vẫn **zero-dep**): push fail → log timestamp + backoff **2s** → retry đúng **1 lần**; fail kép → log `consecutiveFailures=N` rồi đi tiếp (vòng interval không chết), thành công → reset 0.

### Hiệu năng — R2 post-release: scan-cache transcript + SSE shared snapshot (2026-06-11)
- **Cache scan per-file** (`parser.js` + `localParser.js`): Map module-level `path → {mtimeMs, size, parsed}` — file không đổi (mtime+size khớp) → bỏ `readFileSync` + re-parse; file biến mất → prune. Cache hit vẫn đi qua `withFreshStatus()` recompute `status`/`durationMs` theo `now` (agent đã xong không bị hiện "running" vĩnh viễn); stat **trước** read nên append giữa-stat-và-read chỉ gây re-parse lần sau — không bao giờ serve stale. Export test/diagnostics: `clearScanCache`/`scanCacheSize` (parser), `clearLocalScanCache` (localParser).
- **SSE `/api/events` — 1 snapshot cho N client:** registry client module-level + **một** bus-subscription duy nhất (subscribe khi 0→1 client, release khi 1→0 — không query DB khi không ai nghe); mỗi bus event = **1 query + 1 stringify** broadcast cùng chuỗi byte cho mọi client còn sống (trước: N client × M event query/stringify riêng). Initial snapshot per-client, keepalive 25s, cleanup cancel/timer giữ nguyên; **wire format bất biến** (`event: sessions`, `workflow_run`/`workflow_run_step` forward raw).

### Đã sửa — R2 post-release: contrast residual sau Matte Dark (2026-06-11)
- **Token mới `--accent-fill` `#1f6f96`** (mode-invariant, cả `:root` lẫn `.dark`) cho nút fill-accent chữ trắng: trắng-trên-fill **5.57:1** (≥ AA 4.5:1) ở CẢ hai mode — accent dark `#36a6d6` chỉ đạt 2.77:1 dưới chữ trắng. 15 call-site `bg-[var(--color-accent)]` + `text-white` (13 file) chuyển sang `--accent-fill`; link `text-accent`, các tint `/10 /15` và bar non-text giữ nguyên.
- **Retint token trang trí theo accent light:** `:root --accent-muted` → `rgba(31,111,150,.14)`, `--accent-glow` → `rgba(31,111,150,.3)` (base = accent light `#1f6f96`); `.dark` giữ cyan sáng.
- **Palette series chart theo theme** (`useChartTheme` thêm `series`): light `#2a8fbf`/`#0284c7` (≥ 3:1 trên card trắng — WCAG 1.4.11), dark giữ `#36a6d6`/`#0ea5e9` (≈ 6.5:1) — áp vào 6 chart recharts đang hardcode cyan: ActivityTimeline, CostByModel, CostByProject, TokensByDay, Doughnut (2 entry cyan của palette categorical), TrendChart (dims qua theme; `lineStroke` overall giữ nguyên theo `theme.text`).
- **Test guard `src/app/globals-contrast.test.ts`:** parse `globals.css` thật + tính ratio bằng công thức relative-luminance WCAG trong code (không hardcode hex kỳ vọng) — khoá `--accent-fill` ≥ 4.5 cả 2 mode, muted/glow phải là tint của accent light, series ≥ 3:1 trên card đúng theme.
- Doc-drift: số đo secondary trong `decisions/matte-dark-redesign.md` sửa 11.4/6.7 → **8.04/8.12** (số đo live QA — vẫn pass), thêm dòng accent light `#1f6f96` = 5.57:1.

### Đã thêm — R0 hardening: hạ tầng & tài liệu vận hành (2026-06-11)
- **Index DB cho truy vấn nóng (migration `0010`, additive):** `agent_session` (`machineId+updatedAt`, `projectId`, `status`, `source`, `userId`) + `chat_message` (`conversationId+createdAt`). Snapshot drizzle viết tay đối chiếu serializer drizzle-kit đang cài — sau merge chạy `npm run db:generate` trên host để verify **"No schema changes"** (nếu sinh file thừa → snapshot drift, báo lại, đừng commit). **Bước host:** `npm run db:migrate` (áp `0010`).
- **Runbook production `docs/DEPLOYMENT.md`** (kiến trúc Docker + Tailscale — cảnh báo Funnel = public, bảng env đầy đủ, deploy lần đầu/nâng cấp, checklist xác minh sau deploy, vận hành tick/backup/logs, troubleshooting, checklist OAuth Google 6 bước) + **`scripts/install-tick-task.ps1`** (Scheduled Task poke tick mỗi phút, secret từ `-Secret`/`.env` — không hardcode, idempotent) + **`scripts/backup-db.ps1`** (pg_dump → `backups/`, retention 14 ngày, kèm lệnh đăng ký task hằng ngày + restore). README: sửa drift port Postgres `5432→5434` + link runbook. `.env.example`: thêm `LAAM_PROJECTS_DIR`/`LAAM_LOCAL_LOGS` (optional, default `~/.claude/projects` · `~/.laam/local-logs`).
- **i18n trang auth (vi/en/zh):** dict `auth.*` mới (26 key, export `authDict`) — `/login`, `/register`, `AuthShell` hết hardcode tiếng Việt; gỡ string lạc: aria-label bottom-nav, nhóm "Khác" ở Agents (sentinel nội bộ `__other__`, không lộ ra DOM), placeholder/empty-state Machines, empty-state Graph (resolve server-side theo cookie `laam_lang`).
- **Test khoá hành vi (regression guards):** route-protection (`auth.config` — endpoint token-authed vẫn public, sub-path bị chặn vì allowlist match `===`), parser transcript (skip dòng torn mid-write, sub-agent running/done, ngưỡng status, lọc ghost session, error payload khi thiếu thư mục), register 3 mode + 429 + chống enumeration, rate-limit/lockout (clock giả), ChatClient prompt-mẫu auto-send (UX-1), AgentDrawer scrim không-blur.

### Đã sửa — QA R0: giao diện & chat (2026-06-11)
- **A1 — accent light-mode đạt WCAG AA:** `--color-accent` light `#36a6d6` (2.77:1) → **`#1f6f96`** (≥ 4.5:1 trên mọi nền light; trắng-trên-fill 5.57:1), dark giữ nguyên `#36a6d6` qua override `.dark`; `--accent-hover` light → `#1b6285` (6.70:1 — hover nút primary không còn rớt chuẩn). Hue cyan ~199° giữ nguyên; ratio tính bằng code (công thức relative-luminance WCAG).
- **A2 — gỡ `backdrop-blur` còn sót sau Matte Dark:** app-header → bề mặt đặc (`bg-white`/`dark:bg-neutral-900`); scrim modal/drawer (WorkflowsClient template-modal, AgentDrawer) → `bg-black/40` thuần; login/register/AuthShell/bottom-nav → bề mặt đặc — khớp convention scrim không-blur sẵn có (AiReviewPanel/ChatClient).
- **A3 — TrendChart `/eval`:** line "overall" lấy stroke từ theme thay vì hardcode `#111827` (tàng hình trên nền tối) — tách `lineStroke` pure + field `text` vào `ChartTheme`; YAxis 36→44px để nhãn "100%" không bị cụt.
- **Chat — lỗi THẬT giữa tool-loop không còn bị nuốt:** Ollama rớt ở round ≥ 1 trước đây fail-soft chạy tiếp completion (thường chết thêm lần nữa → user không nhận phản hồi nào) → giờ stream thông điệp lỗi thân thiện (vi/en/zh theo cookie `laam_lang`), **persist** assistant message để history còn lượt này, đóng stream sạch (không gọi Ollama lần 3, không unhandled rejection). Thêm log `[chat] client aborted stream (conv=…)` phân biệt "user bấm Stop" với lỗi server.

### Bảo mật — R0: register/login hardening + security headers (2026-06-11)
- **`REGISTER_MODE`** cho `POST /api/register`: `open` (mặc định — hành vi cũ) / `invite` (body phải gửi `inviteCode === REGISTER_INVITE_CODE`; code rỗng/chưa đặt → **fail-closed** từ chối tất cả) / `closed` (chặn tất cả TRỪ khi bảng user rỗng — vẫn bootstrap owner đầu tiên); giá trị không nhận diện → coi như `closed` (fail-closed). Gate chạy **TRƯỚC** email-lookup → 403 không lộ email tồn tại (không có timing signal). Prod public qua Funnel: đặt `invite`/`closed` (xem `docs/DEPLOYMENT.md`).
- **Rate-limit đăng ký:** 10 req/giờ/IP (fixed-window in-memory; IP = hop đầu `x-forwarded-for` → `x-real-ip`); module thuần `src/lib/auth/rate-limit.ts` (clock injectable, giả định single-process).
- **Login lockout chống brute-force:** ≥ 5 fail/10 phút/email → khoá 15 phút; khi khoá `authorize()` trả `null` **y như sai mật khẩu** (không lộ trạng thái khoá); email không tồn tại cũng tính fail (chống probe danh sách email); đăng nhập thành công reset bộ đếm.
- **bcrypt rounds 10 → 12** (hash lúc đăng ký; login chỉ `compare` nên không đổi).
- **Security headers baseline** trên mọi route (`next.config.ts` `headers()`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/micro tắt, `geolocation=(self)` cho chat), HSTS 180 ngày. **CSP hoãn chủ đích** (cần verify browser với inline styles / Leaflet / SSE trước khi enforce).

---

## [2.1.0] — 2026-06-09 — Durable AI Workflows, Gmail-send an toàn & World-Tools

> **LAAM v2.1** biến workflow thành **đáng tin cậy để chạy nền**: tự phục hồi sau
> crash, lập lịch cron, và — lần đầu — **ghi ra ứng dụng ngoài** (tạo card/issue,
> **gửi Gmail**) dưới các cổng an toàn **fail-closed**. Kèm **World-Tools** (web
> search/read, tính toán), loạt nâng cấp **Chat**, **Eval v2** (đo selection-at-scale)
> và **redesign "Matte Dark"** toàn platform. **1337 test xanh**, `tsc` sạch.

### Đã thêm — AI Workflow: connector writes trong workflow (HIGH-blast) + Gmail recipient-gate (2026-06-08/09)
- **Cờ tự-khai `workflowSafe`** (suy từ registry, **fail-closed** mặc định) thay `BLAST_LOW` hardcoded: một connector `write` chỉ chạy trong workflow khi tool tự khai `workflowSafe:true`. **Dry-run** preview mọi write (mock side-effect, không gửi thật); **real-run** enforce gate. Seam `dryRun` là hằng-số/run → không có đường real-run lọt nhánh mock.
- **Recipient-gate cho `gmail_send`** (tool tier-high-exfil **duy nhất** — đã verify gdrive/gcal chỉ ghi tài-nguyên-mình-sở-hữu): trong workflow chỉ gửi khi **mọi** người nhận (đã resolve) khớp **operator allowlist** `WORKFLOW_RECIPIENT_ALLOWLIST` (domain hoặc full-address, **không** author-widenable). **Fail-closed** (G4/G5): allowlist rỗng / 1 recipient ngoài danh sách → throw.
- **Chống RFC 2822 header-injection** — sửa ở tầng connector nên đóng **cả chat lẫn workflow**: **F1** reject CRLF ở `to`/`subject`; **F2** dựng lại `To:` từ parser canonical dùng-chung `parseRecipients` (chỉ chấp địa chỉ trần `local@domain`, loại display-name/comment/nhiều-`@`/CRLF) → "gate-thấy == Gmail-gửi", xoá parser-differential. `body` đa-dòng vẫn hợp lệ (digest).
- `gmail_send` đã **flip `workflowSafe:true`** (defense-in-depth 3 lớp: cờ code ⊥ operator allowlist ⊥ recipient khớp per-run); 9 tool tier-low (github/jira/trello/gcal/gdrive) vẫn fail-closed tới khi flip có chủ đích. Specs: `docs/superpowers/specs/2026-06-08-workflow-high-blast-design.md` + `2026-06-09-gmail-recipient-gate-design.md`.

### Đã đổi — Hạ tầng / vận hành
- **Postgres dev đổi host-port → `5434`** (container vẫn `5432`) tránh đụng Postgres dự án khác trên `:5432`. Cập nhật `DATABASE_URL` (`.env`/`.env.example`); override in-network của app container giữ nguyên `postgres:5432`.
- **Re-sync `package-lock.json` trong `node:22-alpine`** giữ các optional dep musl/WASM (`@emnapi`, `@tailwindcss/oxide`) mà npm host hay rớt → `npm ci` của Docker build không gãy.

### Đã đổi — Redesign giao diện "Matte Dark" (toàn platform, 2026-06-07)
- **Ngôn ngữ thị giác mới "Matte Dark"** (KHÔNG glassmorphism): bề mặt **đặc/matte** ngả cyan, chiều sâu từ **gradient nền + bloom** (không translucency/`backdrop-blur`). Accent thương hiệu **tím `#6d5efc` → cyan `#36a6d6`**; nền tối `#001616`; tránh màu chói (matte, gam lạnh).
- **Đòn bẩy token (áp toàn app, không sửa call-site):** retint cả thang `neutral` (~950 lượt dùng cho surface/border/text) sang họ teal, **giữ nguyên độ sáng từng nấc** ⇒ mọi `*-neutral-*` ngả cyan mà **tỉ lệ tương phản không đổi**. Đầu tối (800/900/950) canh thẳng với token `--surface-*`/`--bg-base`.
- **Token + primitives mới** (`src/app/globals.css`, `src/components/ui/`): `MatteCard` (đặc, khe `bloom`), `Bloom` (quầng sáng trang trí, `aria-hidden`+`pointer-events-none`), `MatteButton` (fill accent matte + focus-ring bắt buộc). Ambient `body::after` đổi xanh-dương → cyan/aqua. Metric tím → aqua (`ram`), node `connector` tím → cyan.
- **a11y là ràng buộc cứng** — đã verify WCAG: primary 17:1 (light) / 14.6:1 (dark), secondary 11.4/6.7:1, muted-500 4.9:1 (light), accent-link 6.1:1 (dark). `prefers-reduced-motion` tắt bloom/drift; bloom thuần trang trí.
- Light mode **giữ chạy được** (token re-map ở `:root`), dark là trọng tâm thiết kế. Preview tạm `/ui-preview`. Verify: **1125 test xanh**, `tsc` sạch. Quyết định: `.serena/memories/decisions/matte-dark-redesign.md`.

### Đã thêm — Eval v2: coverage world-tools + selection-at-scale (tooling, 2026-06-06)
- **E1 coverage:** grader `citesRealUrl` (Rule 13 cho URL → dim grounding) + 6 scenario đo world-tools (web research-loop/restraint, util_calc, laam search_sessions/get_timeline/query_audit). Eval lên **16 scenario**.
- **selection-at-scale:** suite riêng `npm run eval:scale` đo **đường cong selection vs #tool** (8/16/24/40, distractor = union prod THẬT internal+connector, Wilson CI 95%, **tách no-call vs wrong-call**). CTO nâng tầm = **cổng quyết định cho lộ trình connector** (crater → tool-subsetting trước GA).
- Đo-only · `scripts/eval/*` cô lập · **0 dep mới, không đụng harness prod**. Live run = host (`npm run eval` + `eval:scale`, cần Ollama). Verify: **1072 test xanh**, tsc sạch. Plan: `docs/superpowers/plans/2026-06-06-eval-v2-e1-selection-scale.md`.

### Đã thêm — AI Workflow P0a: Durable Resume Spine (reliability, 2026-06-06)
- **Crash-resume**: run bị gián đoạn (crash/restart) **tự tiếp tục** từ journal `workflow_run_step` — KHÔNG chạy lại node đã xong, KHÔNG gửi lại connector write. Phát hiện orphan ở **boot** (`instrumentation.register()`: run còn `running` lúc khởi động = mồ côi → `resumable`; giả định **1 process**), đánh thức qua tick poke.
- **Idempotency per-node (`workflow_node_idempotency`)**: key xác định `UNIQUE(runId, nodeId, iterIndex)` + claim nguyên tử `INSERT ON CONFLICT DO NOTHING RETURNING`. WAL — ghi ở **CẢ** lần chạy đầu (`executeRunRow`) **lẫn** resume → bảng là nguồn-chân-lý-duy-nhất cho writes: write đã `done` → replay output (không re-send); write `claimed`-chưa-record (crash giữa-gửi) → **fail-loud** (không đoán). **KHÔNG** tái dùng nonce `audit_log` (cửa-sổ-10′ + no-unique-index → vỡ với sleep nhiều ngày).
- **Truncation guard (PIN-D4b)**: rebuild ctx từ journal đã cắt 256KB → producer **read** truncated → re-run; **write** truncated → fail-loud (không để `{{steps.x.output.field}}` throw mơ hồ / ra `""`).
- **`tickResume`**: claim `resumable` **bounded + atomic** trong UPDATE (`id IN (SELECT … LIMIT 25 FOR UPDATE SKIP LOCKED)`) → không double-claim, không strand run thừa. Wire vào `POST /api/workflows/tick`.
- Engine A0 **bất biến** (toàn bộ resume ở run-layer). Migration `0008` (additive). Verify: **1085 test xanh**, `tsc` sạch. Plan: `docs/superpowers/plans/2026-06-06-workflow-p0a-resume-spine.md`.
- **Bước host (USER chạy — agent-ops):** `npm run db:migrate` áp **0008** (bảng `workflow_node_idempotency`); không backfill. Resume cưỡi tick poke có sẵn — KHÔNG service mới.
- **⚠️ Deploy precondition (1 lần):** **drain các run đang `running` TRƯỚC lần deploy P0a đầu tiên.** Run mồ côi có-từ-trước-WAL không có idempotency row → boot-sweep đánh `resumable` → resume có thể **re-send write đã commit**. Mọi run tạo sau P0a đều mang WAL → steady-state an toàn. (Review #2.)

### Đã thêm — Harness: World-Tools Layer (web/util tools, 2026-06-06)
- **`web_search`** (SearXNG self-host, **$0**, không SaaS) + **`web_read`** (promote `fetch-url` thành tool model gọi được): agent giờ **tự tìm & đọc web** trong tool-loop. Lõi fetch (`isBlockedHost` SSRF + html→text) tách `src/lib/web/readable.ts` dùng chung route + tool; tool cap text 6000 ký tự (vừa bound guard 8192).
- **`laam_search_sessions`** (tìm phiên theo từ khoá việc-đang-làm) · **`laam_get_timeline`** (timeline 1 phiên, host-only) · **`laam_query_audit`** (audit log gần nhất).
- **`util_calc`**: số học deterministic (shunting-yard parser, KHÔNG `eval`).
- Wiring: `INTERNAL_TOOLS = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS]` — SP-2 gate / SP-4 trace tự áp (tool read-only nên qua gate tự do). **0 migration, 0 đổi hợp đồng SP-1.**
- Hạ tầng: service `searxng` trong `docker-compose` (localhost-only `:8888`) + `searxng/settings.yml` (bật JSON API) + `SEARXNG_URL` trong `.env.example`. **Chạy SearXNG = bước host (user)**; thiếu nó → `web_search` fail-soft.
- **An toàn (sau code-review)**: `web_read` theo dõi redirect **thủ công + re-validate mỗi hop** (chặn SSRF: 302 → host nội bộ / cloud-metadata `169.254.169.254` bị chặn, KHÔNG fetch); `util_calc` ưu tiên `^` theo chuẩn toán (`-2^2 = -4`, nhưng `2^-2 = 0.25`); SearXNG lọc kết quả không-URL **trước** khi cắt `count` (không thiếu hụt thầm lặng).
- Verify: toàn bộ **905 test xanh**, `tsc` sạch. Spec: `docs/superpowers/specs/2026-06-06-world-tools-layer-design.md`.

### Đã thêm — AI Workflow G2: Scheduler (Phase B, backend, 2026-06-05)
- **Lịch định kỳ (`workflow_schedule`)**: cron 5-field tự viết (`min hour dom month dow`; `*`, int, `*/n`, `a-b`, `a,b`), thuần, theo **giờ server-local** (tz/DST hoãn). Migration `0006`.
- **Claim nguyên tử (PIN-D1)**: `POST /api/workflows/tick` → `tickClaim` (INSERT run `queued` + advance `nextRunAt`/`lastRunAt`/`missedCount` trong **CÙNG MỘT transaction** — không có cửa "đã claim nhưng chưa advance" gây kẹt lịch vĩnh viễn) rồi `tickExecute` (chạy run `queued`). `scheduledFor` = `nextRunAt` đã lưu floored-đến-phút → unique `(scheduleId, scheduledFor)` dedupe các poke đua cùng slot.
- **Bỏ-lỡ = skip-realign**: tick trễ → fire **một** run, `nextRunAt` nhảy tới mốc cron strictly sau `now` (không dồn loạt run trễ), `missedCount += skippedSlots-1`.
- **Blast-radius gate (v1 LOW-only)**: `BLAST_LOW = {demo_create_task}`; mọi connector action `write` không thuộc allowlist → **HIGH → fail-closed throw** ở đường connector (cả manual lẫn scheduled). Reads + LOW writes qua.
- **Auth tick**: localhost HOẶC header `x-workflow-tick-secret === WORKFLOW_TICK_SECRET` — **KHÔNG** session (máy gọi). Đặt `WORKFLOW_TICK_SECRET` ở mọi deploy không-local (xem `.env.example`).
- **Observability**: `GET /api/workflows/runs` (?workflowId, ?status) + `GET /api/workflows/runs/[id]` (run + steps), đều kiểm tra sở hữu.
- **Host poke (chưa cài — bước thủ công)**: Windows Task Scheduler chạy mỗi phút gọi `POST http://localhost:3100/api/workflows/tick` (kèm header secret nếu đặt). KHÔNG bật catch-up của OS (app tự realign). Ví dụ tạo task:
  ```powershell
  # Chạy MỖI PHÚT; -UseBasicParsing để không cần IE engine. KHÔNG commit secret thật.
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -Command "Invoke-RestMethod -Method POST -Uri http://localhost:3100/api/workflows/tick -Headers @{''x-workflow-tick-secret''=$env:WORKFLOW_TICK_SECRET} -UseBasicParsing"'
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName 'LAAM-workflow-tick' -Action $action -Trigger $trigger -Description 'Poke LAAM workflow scheduler mỗi phút'
  ```
- Verify: `tsc` sạch; toàn bộ test `src/lib/workflow` xanh (A0+G1+G2). Backend-only, không UI. **`db:migrate` (áp 0006) + cài Task là bước host (user).**

### Đã thêm — Chat: nâng cấp sau E2E (2026-06-05, đợt 2)
- **Dọn dữ liệu cũ (S1)**: `POST /api/conversations {action:"backfill-titles"}` re-derive tiêu đề conv bị lẫn byte file (nút "Dọn tiêu đề" hiện khi có); badge **"trùng"** cảnh báo conv trùng tên (không tự xoá). Helper thuần `src/lib/chat/title.ts` (`retitleFromMessage`).
- **Proactive card (S2)**: dismiss **bền qua localStorage** (TTL 24h) + mỗi cảnh báo **click mở `/agents/[id]`** (thêm `key`+`sessionId` vào frame `proactive`).
- **Tool status realtime (S3)**: refactor `/api/chat` thành **một stream** phát frame tool **LIVE** ngay khi loop dispatch → UI hiện chip "đang gọi `<tool>`…" tức thì (trace hiện cả lúc đang chờ); suspend (`pending_write`) + persist dời vào trong stream; `streamOllama` giữ cho confirm round-trip. Bỏ `suspendForConfirm` (gộp inline).
- **Biểu đồ dễ đọc (S4)**: nhãn giá trị trên cột/đường (single-series), cao hơn (300px), cột bo góc.
- **Parse khoan dung (S5)**: `looseJsonParse` (bỏ dấu phẩy thừa / smart-quote / fence) cho ```chart/```map; lỗi → hiện raw; map có nút **"Thử lại"**.
- **Nearby (S6)**: prompt hướng dẫn `near` vs vị-trí-trình-duyệt; nút "Thử lại" khi từ chối định vị.
- **Token total ở header (S7)**: tổng token (miễn phí local) cho conv hiện hành.
- **Lang a11y (S8)**: aria-label bộ chọn ngôn ngữ i18n (native `<select>` vốn đã accessible bàn phím).
- **Smart rename (S9)**: hành động ✨ mỗi conv → `POST {action:"retitle",id}` đặt lại tên theo tin nhắn đầu.
- Verify: **toàn bộ test xanh**, `tsc` sạch, không đổi schema (pin/dismiss = localStorage).

### Đã sửa — Chat QA E2E (2026-06-05): lỗi giao diện & chức năng
- **U1** Composer lệch 144px + tràn dưới sidebar → thêm `relative` cho `<section>` (composer `absolute` neo đúng cột chat).
- **F1** Slash command `/moi /xoa /xuat /caidat` "chết" → nối handler từ ChatClient (trước chỉ `/dung` chạy). `/xuat` mở menu export (ChatExport thành controlled).
- **F3** OCR chết im lặng → thêm `GET /api/ocr` báo `{available}`; composer **chủ động báo trước** + bỏ qua call OCR khi thiếu tesseract (thay vì fail sau upload). *(Image Docker đã bake tesseract; host trần chạy `next start` thì chưa có — chạy bản Docker hoặc cài native.)*
- **F4** Tiêu đề hội thoại lẫn byte file đính kèm (`%PDF…`) → thêm `titleHint` (text user thật); fallback lấy **tên file**, không bao giờ là byte (Rule 13).
- **U2** Bỏ hardcode "Gemma" (empty-state/placeholder/export, cả vi/en/zh) → **tên model động** từ `/api/chat/info`, fallback trung tính.
- **U3** Nút header (giao diện/đồng bộ/tài khoản) nay **i18n** đủ vi/en/zh.
- **U-minor** Hết nháy "Chưa có cuộc trò chuyện" lúc mount → skeleton tới khi load xong.

### Đã thêm — Chat: rich-render, UX & nâng cấp
- **F2** Khôi phục render **biểu đồ/bản đồ**: dạy model hợp đồng khối ```` ```chart ````/```` ```map ```` trong system prompt; **giải mã địa lý phía client** (`/api/geocode|route|nearby`) từ tên địa điểm → marker + tuyến thật (model chỉ nêu **tên**, không bịa toạ độ — Rule 13). Module thuần `src/lib/chat/geo-resolve.ts`.
- **UX**: prompt mẫu **tự gửi** 1 chạm (UX-1); nhập URL **inline** thay `window.prompt` (UX-2); nút cuộn-đáy hiện khi rời đáy (UX-4); empty-state gợi ý **hội thoại gần đây** (UX-6); message actions hiện khi **focus bàn phím** (UX-7, a11y).
- **FEAT-1** Quản lý hội thoại: **nhóm theo thời gian** (Hôm nay/Hôm qua/7 ngày/Cũ hơn), **chọn nhiều — xoá hàng loạt**, **ghim lên đầu** (localStorage), **tìm theo nội dung tin nhắn** (`/api/conversations?q=`).
- **FEAT-2** Cảnh báo chủ động tách thành **card hệ thống riêng** (frame `proactive`, có nút bỏ qua) thay vì nhét vào câu trả lời của model; ngưỡng cấu hình qua env `PROACTIVE_STUCK_MIN`/`PROACTIVE_COST_USD`.
- **FEAT-3** Export **PDF** + **copy cả hội thoại** + **tổng token** (model local → miễn phí) trong menu xuất.
- **FEAT-4** Composer báo OCR off + chip đính kèm xem trước trích đoạn (hover).
- **FEAT-5** **Demo write-gate không cần credential**: tool `demo_create_task` (connector Demo) chạy đủ luồng gate → Confirm Card → execute offline. Doc: `docs/demo-connector-write-gate.md`.
- Verify: **540 test** xanh (từ 499), `tsc` sạch. Không đổi schema (pin = localStorage; không migration).

### Đã thêm — Agent Harness SP-3 (Memory & Proactive)
- **Lưu tool turns**: bảng mới `chat_tool_call` ghi lại từng lượt gọi công cụ (tên/args/kết quả/ok) trong một lượt chat — trước đây bị bỏ, chỉ lưu câu trả lời cuối. `chat_message` giữ nguyên (consumer hiện có không đổi).
- **Tóm tắt hội thoại dài**: khi lịch sử vượt ngân sách ký tự, các lượt cũ được **model tóm tắt** (cuộn) và giữ nguyên văn các lượt gần nhất — chat không vỡ context trên model local 16GB.
- **Cảnh báo chủ động**: trợ lý tự nêu trong chat khi có agent **đang kẹt** hoặc **chi phí cao** (ngưỡng tuyệt đối/burn-rate + dedupe theo hội thoại + cooldown 6h, không lặp mỗi lượt).
- Hạ tầng: migration **`0003`** (additive — `chat_tool_call` + cột `summary`/`summarizedThroughId`/`proactiveState` trên `chat_conversation`); module thuần `src/lib/agent/{persist,summarize,proactive}.ts` + loader chung `tools/laam/_load.ts`. **435 test** xanh, `tsc` sạch, `next build` xanh.
- ⚠️ **Cần chạy trên host:** `npm run db:migrate` (áp `0003`) trước khi chạy bản này.

### Changed
- **Tái cấu trúc repo:** v2 (Next.js) được đưa lên **root**; v1 (vanilla/Express) archive ở branch `archive/v1`. Root giờ là app v2.
- Gộp `.gitignore`; viết lại `CLAUDE.md`/`README` cho v2.

### Backlog (chưa migrate từ v1)
- Search, Office, proxy log Ollama, `/api/config` — xem `.serena/memories/backlog/v1-unported.md`.

---

## [2.0.0] — 2026-06-03 — Bản viết lại v2 (Next.js + Postgres, đa người dùng)

> **LAAM v2** (`v2/`) là bản viết lại local-first, đa máy, đa người dùng:
> **Next.js 16 + React 19 + Auth.js v5 + Drizzle + Postgres**. Đạt **parity tính
> năng** với app vanilla v1 trên 4 trang trọng tâm (Dashboard, Agents, Chat,
> Connectors) đồng thời thêm auth/RBAC, multi-machine và lưu trữ per-user.
> Thực hiện theo 5 wave (audit → hạ tầng → Agents → Dashboard → Chat → Connectors).
> **375 test** (Vitest + RTL), `next build` xanh.

### Đã thêm — Nền tảng (Wave 0)
- **i18n vi/en/zh** cho App Router (provider + `useT` + cookie `laam_lang`).
- **SSE real-time** `/api/events` + hook `useLiveSessions` (thay đồng bộ thủ công).
- **`/api/stats`** — port `lib/stats.js` thành `computeStats` có kiểu.
- **Rich render**: `MarkdownView` (react-markdown + remark-gfm + rehype-sanitize),
  ```chart``` (recharts), ```map``` (react-leaflet, SSR-safe), code highlight.
- **Export util**: CSV / Markdown / JSON / PDF (jsPDF).

### Đã thêm — Agents (Wave 1)
- Danh sách **live qua SSE** (bỏ "Đồng bộ" thủ công), gom theo project.
- Thanh lọc: tìm kiếm + project/model/status/branch/thời gian + xoá lọc.
- **Badge "nghi kẹt"** + thông báo trình duyệt, đồng hồ chạy theo giây/card.
- Chi tiết sub-agent; **waterfall tool-call** ở `/agents/[id]`; export CSV.

### Đã thêm — Dashboard (Wave 2)
- KPIs đầy đủ; doughnut status/model/branch; **timeline hoạt động 2 trục**.
- Bảng so sánh model; cost theo model; tokens theo project; top sessions.
- Tool leaderboard / errors / slowest; heatmap (hover + chú giải); export CSV/PDF.

### Đã thêm — Chat (Wave 3)
- 8 endpoint: `ollama/models`, `chat/info`, `fetch-url` (chặn SSRF), **`ocr`**
  (tesseract), `geocode/reverse/route/nearby`.
- `/api/chat` nhận **model / temperature / top-p / system prompt**.
- UI: rich render, settings panel, **đính kèm file/URL/ảnh + OCR** (drag-drop),
  message actions (copy/sửa/tạo lại/xoá) + timestamp, composer (slash menu/đếm
  token/phím tắt), sidebar (tìm/đổi tên/xoá), export MD/JSON.

### Đã thêm — Connectors (Wave 4)
- Framework `lib/connectors/`: **mã hoá AES-256-GCM**, lưu **per-user trong
  Postgres** (khác v1 dùng file cục bộ), các hàm user-scoped.
- 7 connector: demo · github · trello · jira · google-drive · google-calendar ·
  gmail (giữ nguyên tên tool như v1).
- Trang `/connectors` (kết nối/ngắt/kiểm tra) + nav link.
- **Vòng tool-calling** trong `/api/chat` (giữ nguyên đường đi khi không có connector).

### Bảo mật
- Credential connector **mã hoá at-rest per-user**; secret luôn **mask** khi hiển
  thị, không trả raw về browser. Khoá từ `CONNECTOR_KEY` (fallback `AUTH_SECRET`).

### Lưu ý nâng cấp
- Cần chạy migration trên host: `cd v2 && npm run db:generate && npm run db:migrate`
  (bảng `connector_credentials`). Đặt `CONNECTOR_KEY` cho production.
- Toàn bộ route hiện **dynamic** (root layout đọc cookie ngôn ngữ).

### Chưa làm (residual)
- Nghiệm thu runtime end-to-end (Ollama `gemma4:e4b` + `tesseract`); luồng OAuth
  thật cho Google; icon Lucide; cost theo project/ngày; relTime đa ngôn ngữ.

---

## [0.9.0] — 2026-06-03

> **Cột mốc "pre-connector".** LAAM đã chuyển hướng từ công cụ giám sát thuần tuý
> sang **trợ lý công việc hằng ngày** chạy hoàn toàn cục bộ (local, miễn phí). Toàn
> bộ nền tảng — giám sát, chat trợ lý đa phương thức, hạ tầng — đã hoàn thiện và
> chạy thật. Phần **connector** (Jira/Trello/GitHub/Google…) là cột mốc kế tiếp
> hướng tới `v1.0.0`, nên bản này là `0.9.0`.

### Đã thêm — Trợ lý Chat (`/chat`)
- **Chọn model** ngay trong chat: mặc định **`qwen3-vl:8b`** (general + tool-calling
  ổn định 18/18 + vision), kèm `gemma4:e4b` (mới nhất, nhanh nhất), `qwen3:8b`,
  `gemma3:4b`, các Qwen2.5 — tự khám phá qua `/api/ollama/models`. Chỉnh
  temperature / top-p / num_predict / system prompt theo từng hội thoại.
- **Render giàu** trong câu trả lời: Markdown (marked + DOMPurify chống XSS),
  **biểu đồ** (Chart.js), **bảng** GFM, **bản đồ** (Leaflet/OSM) với **marker SVG
  tự vẽ** (không phụ thuộc ảnh, chạy offline).
- **Bản đồ & chỉ đường thật**: geocode tên địa điểm (Nominatim), **định tuyến theo
  đường bộ thật** (OSRM), link mở Google Maps.
- **Nhận biết vị trí (location-awareness)**: tự xin GPS khi câu hỏi cần ("quanh
  đây / gần tôi / chỉ đường từ đây / toạ độ hiện tại"), reverse-geocode ra địa chỉ
  và **tiêm vào ngữ cảnh model** để trả lời thật; **tìm địa điểm quanh đây** (POI
  thật qua OSM Overpass) → marker + danh sách kèm khoảng cách.
- **OCR**: đọc **ảnh** (png/jpg/webp…) và **PDF scan** (không có lớp text) qua
  `tesseract` (vie + eng + chi_sim) để model text đọc được nội dung.
- **Đính kèm**: tải lên file (txt/md/csv/json/pdf/ảnh) và **đọc nội dung URL**
  (fetch phía server, có chặn SSRF).
- **Xuất hội thoại** ra Markdown / JSON; copy từng khối mã.
- **Lịch sử nhiều hội thoại** (đổi tên, tìm, xoá) lưu cục bộ.
- Kiến trúc **kernel + module** (`chat.js` + các `chat-*.js`) cho dễ mở rộng.

### Đã thêm — Giám sát (Monitoring)
- **Dashboard** (`/`): KPI tổng hợp, biểu đồ trạng thái/model/branch, **heatmap**
  giờ × thứ, bảng xếp hạng tool, so sánh model, **chi phí USD ước tính**, banner
  cảnh báo agent nghi kẹt, xuất **CSV / PDF**.
- **Agents** (`/agents`): theo dõi thời gian thực, gom theo project, **bộ lọc**
  (project/model/trạng thái/branch/thời gian), badge nguồn local, cảnh báo kẹt +
  thông báo trình duyệt.
- **Graph** (`/graph`): sơ đồ orchestrator → sub-agents (vis-network).
- **Session** (`/session`): chi tiết phiên + **waterfall** dòng thời gian tool-call.
- **Office** (`/office`): văn phòng **isometric** v2 — phòng theo project, agent đi
  lại/ghép cặp, kéo-thả xoay góc, HUD bật/tắt.
- Hai nguồn dữ liệu: transcript Claude Code (`~/.claude/projects`) **và** log model
  local (qua proxy) — đều gắn nhãn nguồn; model local chi phí **$0**.
- **Live update** qua SSE + file watcher (chokidar).

### Đã thêm — Hạ tầng & vận hành
- **Docker Compose**: Ollama + proxy ghi log + LAAM; override macOS giữ **GPU**
  (Ollama native) + proxy/laam trong Docker.
- **Proxy ghi log Ollama** (zero-dependency) trên `:11435` → đưa mọi lượt chat local
  vào LAAM như nguồn dữ liệu thứ hai.
- **HTTPS qua Tailscale serve** (`tailscale serve`) — cert Let's Encrypt hợp lệ trong
  tailnet → **secure context** cho GPS trên điện thoại (thay cho ngrok, đã tắt).
- **OCR**: cài `tesseract-ocr` + data vie/eng/chi_sim trong image.

### Đã thêm — Giao diện & quốc tế hoá
- **Đa ngôn ngữ** Tiếng Việt / English / 中文 (engine i18n nhẹ, đổi tức thì, lưu lựa
  chọn; font CJK fallback) — phủ mọi trang.
- **Bộ icon Lucide** vendored offline thay toàn bộ emoji/SVG tự chế, hợp theme
  sáng/tối, đồng nhất.
- **Responsive mobile** xuyên suốt; sửa loạt lỗi mobile của Chat (drawer nuốt click,
  map đè sidebar, route, ngôn ngữ trả lời).

### Kỹ thuật
- **Stack**: Node.js ≥ 18 (ESM) + Express; client **vanilla JS, không build step**;
  phụ thuộc runtime tối thiểu (`express`, `chokidar`). Mọi thư viện front-end vendored
  offline trong `public/vendor/` (Chart.js, vis-network, jsPDF, marked, DOMPurify,
  Leaflet, pdf.js, Lucide). Model local qua **Ollama** (GPU) + proxy.
- **Bảo mật**: DOMPurify cho mọi HTML từ model; `/api/fetch-url` chặn SSRF; geocode
  có User-Agent định danh + throttle; `.env`/secret **không commit** (đã .gitignore).

### Cách chạy nhanh
```bash
# Native (dev)
npm install && npm start            # → http://localhost:4317
# Model local: cài Ollama, `ollama pull qwen3-vl:8b`, chạy proxy/server.js (:11435)

# Docker (macOS, giữ GPU): Ollama native + proxy/laam trong Docker
ollama serve &
docker compose -f docker-compose.yml -f docker-compose.macos.yml up -d --build
# HTTPS qua tailnet: tailscale serve --bg http://127.0.0.1:4317
```

### Chưa có (kế tiếp → v1.0.0)
- **Connector thật**: trang `/connectors`, framework đăng ký connector như bộ *tools*
  cho model gọi qua chat (GitHub / Trello / Jira bằng token; Google Drive / Calendar /
  Gmail qua OAuth). Credential do người dùng cung cấp, lưu server-side, không commit.

---

[2.1.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v2.1.0
[2.0.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v2.0.0
[0.9.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v0.9.0
