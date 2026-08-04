// Payload cỡ THẬT cho probe `kg_get_master_record` — kích thước neo vào số đo thật đã ghi
// trong repo (route.ts:112-113: Dasin ~46k, Cảng Định An v3 ~78k ký tự). Một stub vài trăm
// byte không tạo áp lực ngữ cảnh giống production; eval dựa trên nó không nói được gì về
// hành vi model khi tool result thật sự lớn.
//
// Deterministic (không Math.random/Date.now — script eval chạy lại phải ra cùng kết quả).

const PARAGRAPH =
  "Công ty hoạt động trong lĩnh vực sản xuất và chế biến, với nhiều dây chuyền vận hành " +
  "song song tại các cơ sở khác nhau. Ban lãnh đạo đã triển khai một loạt biện pháp kiểm " +
  "soát chất lượng, tối ưu chi phí vận hành, và mở rộng thị trường xuất khẩu sang các khu " +
  "vực lân cận trong hai năm gần đây. ";

function repeatTo(text: string, minChars: number): string {
  const times = Math.ceil(minChars / text.length);
  return text.repeat(times);
}

// JSON hợp lệ, giữ đúng các trường thật của kg_get_master_record (summary/strengths/risks/
// recommendations — xem CHANGELOG mục "grounding guard") — model phải THẤY được cấu trúc
// quen thuộc, không phải một khối text bất kỳ.
export function bigMasterRecord(minChars: number): string {
  const perField = Math.ceil(minChars / 4);
  return JSON.stringify({
    summary: repeatTo(PARAGRAPH, perField),
    strengths: repeatTo("Đội ngũ vận hành ổn định, chuỗi cung ứng đa dạng. ", perField),
    risks: repeatTo("Phụ thuộc một số khách hàng lớn, biến động chi phí nguyên liệu đầu vào. ", perField),
    recommendations: repeatTo("Đa dạng hoá khách hàng, đàm phán hợp đồng nguyên liệu dài hạn. ", perField),
  });
}
