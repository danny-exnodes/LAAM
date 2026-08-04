import { describe, expect, test, vi } from "vitest";
import { parseDrilldownPairs, planDrilldown, MIN_NAME_CHARS } from "./drilldown";

// D2 — bước tra cứu XÁC ĐỊNH sau một tool liệt kê. WHY: đo trên gpt-oss-120b, câu
// "chi tiết về <đối tượng>" hay dừng ở kết quả liệt kê tổng quan hoặc đi tiếp bằng
// SAI tool (model đang phải chọn giữa 60 tool). Bước này do CODE quyết (Rule 5):
// trigger là so khớp TÊN THẬT lấy từ chính kết quả tool, không đoán ý định bằng regex.
const PAIR = {
  listTool: "x_list_projects",
  idField: "id",
  nameField: "name",
  detailTool: "x_get_master_record",
  idArg: "project_id",
};

// Shape thật của MCP: dispatch trả { text: "<chuỗi JSON>" }, không phải object thuần.
const mcpResult = (obj: unknown) => ({ text: JSON.stringify(obj) });
const PROJECTS = {
  projects: [
    { id: "id-dasin", name: "Dasin", status: "active" },
    { id: "id-cda", name: "Cảng Định An v3", status: "active" },
    { id: "id-sala", name: "Sala Food", status: "active" },
  ],
};

describe("parseDrilldownPairs", () => {
  test("JSON hợp lệ → danh sách cặp", () => {
    const pairs = parseDrilldownPairs(JSON.stringify([PAIR]));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].detailTool).toBe("x_get_master_record");
  });

  test("fail-soft: config rỗng/hỏng/thiếu trường → [] chứ không ném (chat không được chết vì config)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseDrilldownPairs(undefined)).toEqual([]);
    expect(parseDrilldownPairs("")).toEqual([]);
    expect(parseDrilldownPairs("{khong-phai-json")).toEqual([]);
    expect(parseDrilldownPairs(JSON.stringify([{ listTool: "a" }]))).toEqual([]); // thiếu detailTool/idArg/…
    warn.mockRestore();
  });
});

describe("planDrilldown", () => {
  test("câu hỏi có ĐÚNG tên một mục trong kết quả → gọi tool chi tiết với id của mục đó", () => {
    const plan = planDrilldown(PAIR, mcpResult(PROJECTS), "Cho mình thông tin chi tiết project Dasin");
    expect(plan).toEqual({ name: "x_get_master_record", args: { project_id: "id-dasin" } });
  });

  test("khớp KHÔNG phân biệt hoa thường, và đọc được cả result dạng object thuần (không bọc text)", () => {
    const plan = planDrilldown(PAIR, PROJECTS, "chi tiết dự án SALA FOOD giúp mình");
    expect(plan).toEqual({ name: "x_get_master_record", args: { project_id: "id-sala" } });
  });

  test("câu hỏi không nhắc tên nào → null (câu 'liệt kê' KHÔNG bị kéo thêm 1 lượt tra cứu)", () => {
    expect(planDrilldown(PAIR, mcpResult(PROJECTS), "Liệt kê các project có trong DAAB")).toBeNull();
  });

  test("nhắc tên KHÔNG có trong kết quả → null (không bịa id)", () => {
    expect(planDrilldown(PAIR, mcpResult(PROJECTS), "chi tiết project Khong Ton Tai")).toBeNull();
  });

  test("hai tên cùng khớp → lấy tên DÀI hơn (cụ thể hơn), không phải tên bị lồng bên trong", () => {
    const nested = { projects: [{ id: "id-a", name: "Dasin" }, { id: "id-b", name: "Dasin v2" }] };
    const plan = planDrilldown(PAIR, mcpResult(nested), "chi tiết project Dasin v2");
    expect(plan).toEqual({ name: "x_get_master_record", args: { project_id: "id-b" } });
  });

  test("hai tên khớp DÀI BẰNG NHAU → null (mơ hồ thì không đoán)", () => {
    const tie = { projects: [{ id: "id-a", name: "Alpha" }, { id: "id-b", name: "Gamma" }] };
    expect(planDrilldown(PAIR, mcpResult(tie), "so sánh Alpha và Gamma")).toBeNull();
  });

  test(`tên quá ngắn (< ${MIN_NAME_CHARS} ký tự) → bỏ qua: tên 1-2 ký tự khớp bừa vào chữ bất kỳ`, () => {
    const short = { projects: [{ id: "id-a", name: "An" }] };
    expect(planDrilldown(PAIR, mcpResult(short), "cho mình thông tin chi tiết")).toBeNull();
  });

  test("kết quả không phải danh sách entity (lỗi tool, mảng rỗng) → null", () => {
    expect(planDrilldown(PAIR, mcpResult({ error: "boom" }), "chi tiết Dasin")).toBeNull();
    expect(planDrilldown(PAIR, mcpResult({ projects: [] }), "chi tiết Dasin")).toBeNull();
    expect(planDrilldown(PAIR, null, "chi tiết Dasin")).toBeNull();
  });

  test("tự tìm mảng entity ở bất kỳ khoá nào (không neo cứng vào tên khoá 'projects')", () => {
    const other = { items: [{ id: "id-x", name: "Salonbookly v3" }] };
    const plan = planDrilldown(PAIR, mcpResult(other), "chi tiết Salonbookly v3");
    expect(plan).toEqual({ name: "x_get_master_record", args: { project_id: "id-x" } });
  });
});
