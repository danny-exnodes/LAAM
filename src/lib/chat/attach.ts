// Phân loại file đính kèm chat để đọc-as-text AN TOÀN. File nhị phân (PDF, docx, zip,
// ảnh sai-mime…) khi đọc bằng `file.text()` ra rác nhị phân chứa NUL (byte 0); NUL không
// lưu được trong Postgres TEXT → insert message ném → 500 "Lỗi server". Các helper thuần
// này được test riêng + dùng ở cả client (ChatClient) lẫn server (chat route, defense).

// NUL (byte 0) viết qua fromCharCode để source chỉ chứa ASCII (literal NUL không an toàn để lưu/sửa).
const NUL = String.fromCharCode(0);

/** File là PDF? (qua MIME hoặc đuôi .pdf — trình duyệt có thể bỏ trống type khi kéo-thả). */
export function isPdfFile(name: string, type: string): boolean {
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

/** File là Word .docx? (.doc nhị phân cũ KHÔNG tính — không phải zip, server không bóc được). */
export function isDocxFile(name: string, type: string): boolean {
  return (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(name)
  );
}

/** Văn bản đọc-được KHÔNG chứa NUL; nội dung nhị phân đọc-nhầm-thành-text thì có. */
export function looksBinaryText(s: string): boolean {
  return s.includes(NUL);
}

/** Bỏ NUL — Postgres TEXT không lưu được null byte. Defense ở cả client lẫn server. */
export function stripNul(s: string): string {
  return s.split(NUL).join("");
}
