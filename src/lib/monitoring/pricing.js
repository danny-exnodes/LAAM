// LAAM — model pricing table and USD cost estimation.
//
// ⚠️  GIÁ CÓ THỂ LỖI THỜI. Bảng giá dưới đây là số liệu thủ công (USD cho mỗi
// 1 triệu token), KHÔNG tự cập nhật. Hãy đối chiếu bảng giá chính thức và cập
// nhật tay khi giá đổi.
//
// Tra giá lần cuối: 2026-06-01.
// Nguồn (giá API "Base Input Tokens" / "Output Tokens", standard global, KHÔNG
// gồm prompt caching / batch / fast mode):
//   - https://docs.claude.com/en/docs/about-claude/pricing
//   - https://platform.claude.com/docs/en/about-claude/pricing
//   - https://claude.com/pricing
//
// Theo bảng giá chính thức tại thời điểm tra:
//   Opus 4.5 / 4.6 / 4.7 / 4.8 : $5  in  / $25 out
//   Opus 4.1 / 4.0 (deprecated): $15 in  / $75 out
//   Sonnet 4.x (4.5 / 4.6)     : $3  in  / $15 out
//   Haiku 4.5                  : $1  in  / $5  out
//   Haiku 3.5 (retired)        : $0.80 in / $4 out
// (Lưu ý: Opus 4.7+ dùng tokenizer mới, có thể tốn tới ~35% token hơn cho cùng
//  một đoạn text — ảnh hưởng SỐ token, không phải đơn giá.)

// USD trên 1.000.000 token (input / output).
export const PRICE_UPDATED = '2026-06-01';
export const MODEL_PRICES = [
  // [regex khớp model id, { in, out }] — khớp theo thứ tự, lấy mục đầu tiên trúng.
  // Khớp các phiên bản cụ thể trước, rồi mới tới fallback chung.
  [/opus-4-[5-9]/i,                { in: 5, out: 25 }],   // Opus 4.5–4.9 (thế hệ hiện hành)
  [/opus-4-(1|20)/i,               { in: 15, out: 75 }],  // Opus 4.1 và Opus 4.0 (id có ngày, deprecated)
  [/3-opus/i,                      { in: 15, out: 75 }],  // Claude 3 Opus (retired)
  [/opus/i,                        { in: 5, out: 25 }],    // Opus khác/mới hơn → mức thế hệ hiện hành
  [/sonnet/i,                      { in: 3, out: 15 }],    // Sonnet 3.5 / 4.x
  [/haiku-3|3-5-haiku|3-haiku/i,   { in: 0.8, out: 4 }],   // Haiku 3.x (retired; giá Haiku 3 gốc là ước lượng)
  [/haiku/i,                       { in: 1, out: 5 }],     // Haiku 4.5
];
// Giá mặc định khi không nhận diện được model — dùng mức Sonnet làm ước lượng
// trung bình an toàn (ĐÁNH DẤU: đây là giá ƯỚC LƯỢNG, không phải giá công bố).
export const DEFAULT_PRICE = { in: 3, out: 15 };

// Trả về bảng giá {in,out} (USD / 1M token) cho một model id.
export function priceFor(model) {
  if (model) {
    for (const [re, price] of MODEL_PRICES) {
      if (re.test(model)) return price;
    }
  }
  return DEFAULT_PRICE;
}

// Ước tính chi phí USD cho số token input/output của một model.
export function costUSD(model, tokensIn = 0, tokensOut = 0) {
  const p = priceFor(model);
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}
