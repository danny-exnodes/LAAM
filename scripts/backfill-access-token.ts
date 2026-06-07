// One-shot backfill (P0 Access spine): copy each legacy machines.tokenHash into
// the unified access_token table as a kind=collector row, so the new ingest
// resolver (access_token first) recognizes existing collectors.
//
// Run ON THE HOST after `npm run db:migrate` applies the access_token table:
//   npx tsx scripts/backfill-access-token.ts
//
// Idempotent: tokenHash is UNIQUE, so re-runs ON CONFLICT DO NOTHING. We cannot
// reconstruct prefix/last4 from a sha256 hash → store sentinels ("legacy"/"----")
// that the display layer tolerates; rotating that token later self-heals them.
import { isNotNull } from "drizzle-orm";
import { db } from "../src/db/index";
import { machines, accessTokens } from "../src/db/schema";

async function main() {
  const legacy = await db
    .select({
      id: machines.id,
      name: machines.name,
      tokenHash: machines.tokenHash,
      ownerUserId: machines.ownerUserId,
    })
    .from(machines)
    .where(isNotNull(machines.tokenHash));

  let inserted = 0;
  for (const m of legacy) {
    if (!m.tokenHash) continue;
    const res = await db
      .insert(accessTokens)
      .values({
        kind: "collector",
        machineId: m.id,
        userId: m.ownerUserId, // provenance/audit (nullable if owner was cleared)
        name: m.name,
        prefix: "legacy",
        last4: "----",
        tokenHash: m.tokenHash,
        scopes: ["ingest"],
      })
      .onConflictDoNothing({ target: accessTokens.tokenHash })
      .returning({ id: accessTokens.id });
    if (res.length > 0) inserted++;
  }

  console.log(
    `Backfill done: ${legacy.length} legacy machine(s) with a token, ${inserted} new access_token row(s) created (rest already present).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
