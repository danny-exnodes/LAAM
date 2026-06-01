// LAAM — model pricing table and USD cost estimation.
//
// ⚠️  GIÁ CÓ THỂ LỖI THỜI. Bảng giá dưới đây là ước tính thủ công (USD cho mỗi
// 1 triệu token), KHÔNG tự cập nhật. Hãy đối chiếu với bảng giá chính thức của
// Anthropic trước khi dùng cho mục đích tài chính. Cập nhật tay khi giá đổi.
// Nguồn tham khảo: https://www.anthropic.com/pricing  (kiểm tra lại định kỳ)
// Cập nhật lần cuối trong code: 2026-06 (theo hiểu biết tại thời điểm viết).

// USD trên 1.000.000 token (input / output). Prompt caching không tính ở đây.
export const PRICE_UPDATED = '2026-06';
export const MODEL_PRICES = [
  // [regex khớp model id, { in, out }]  — khớp theo thứ tự, lấy mục đầu tiên trúng.
  [/opus/i,        { in: 15, out: 75 }],
  [/sonnet/i,      { in: 3, out: 15 }],
  [/haiku/i,       { in: 0.8, out: 4 }],
];
// Giá mặc định khi không nhận diện được model (dùng mức Sonnet cho an toàn-trung bình).
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
