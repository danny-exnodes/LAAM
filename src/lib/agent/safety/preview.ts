// Build a human-readable, CODE-DERIVED description of a pending write for the
// confirm card. Never uses the model's prose (Rule 13: the card must reflect
// exactly what the code will run). All field values are redacted. (Spec §7.2.)
import { redact } from "./redact";

export type WritePreview = {
  title: string;
  summary: string;
  fields: { label: string; value: string }[];
};

export function buildPreview(name: string, args: Record<string, unknown>): WritePreview {
  const safe = redact(args);
  const str = (v: unknown) => (v == null ? "" : String(v));
  switch (name) {
    case "trello_create_card": {
      const card = str(safe.name);
      const list = str(safe.idList);
      const fields = [
        { label: "Danh sách", value: list },
        { label: "Tiêu đề", value: card },
      ];
      if (safe.desc) fields.push({ label: "Mô tả", value: str(safe.desc) });
      return { title: "Tạo card Trello", summary: `Tạo card "${card}" trong danh sách ${list}.`, fields };
    }
    case "demo_create_task": {
      const title = str(safe.title);
      const status = str(safe.status) || "todo";
      return {
        title: "Tạo công việc (demo)",
        summary: `Tạo công việc "${title}" (${status}).`,
        fields: [
          { label: "Tên", value: title },
          { label: "Trạng thái", value: status },
        ],
      };
    }
    default:
      return {
        title: "Hành động ghi",
        summary: `Chạy ${name} với tham số đã cho.`,
        fields: Object.entries(safe).map(([k, v]) => ({ label: k, value: str(v) })),
      };
  }
}
