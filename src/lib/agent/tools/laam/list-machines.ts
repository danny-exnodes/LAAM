import { db } from "@/db";
import { machines } from "@/db/schema";
import type { Tool } from "../../types";

const ONLINE_MIN = 5;

export type MachineRow = {
  id: string;
  name: string;
  hostname: string | null;
  lastSeen: Date | null;
};

export function shapeMachines(rows: MachineRow[], now: number) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hostname: r.hostname,
    lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
    online: r.lastSeen ? now - r.lastSeen.getTime() <= ONLINE_MIN * 60000 : false,
  }));
}

export const listMachines: Tool = {
  name: "laam_list_machines",
  description: "Liệt kê các máy đang được giám sát và trạng thái online (theo lastSeen).",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler(_args, ctx) {
    const rows = await db.select().from(machines);
    return { machines: shapeMachines(rows as unknown as MachineRow[], ctx.now) };
  },
};
