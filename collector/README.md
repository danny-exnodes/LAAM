# LAAM Collector (remote, multi-machine)

A tiny **zero-dependency** Node script that ships a dev machine's Claude
transcripts + local-model logs to a central LAAM v2 instance — so one LAAM can
monitor **many machines** over your tailnet.

## How it works

```
each dev machine:  ~/.claude/projects + ~/.laam/local-logs
                       │  (same parser as the server)
                       ▼
   node laam-collector.mjs ──POST /api/ingest (Bearer machine-token)──► central LAAM → Postgres
```

The host running LAAM itself doesn't need the collector — its **Đồng bộ** button
already scans locally. Use the collector on *other* machines.

## Setup

1. On the central LAAM, sign in as **owner/admin** → open **Machines** → **Tạo máy mới**, give it a name → copy the **token** (shown once).
2. On the dev machine you want to monitor (Node ≥ 18 installed), from the `v2/` folder:

   ```bash
   LAAM_URL=https://laam.<your-tailnet>.ts.net \
   LAAM_MACHINE_TOKEN=laam_xxxxxxxx \
   node collector/laam-collector.mjs
   ```

   Push continuously every 60s:

   ```bash
   LAAM_INTERVAL_SEC=60 LAAM_URL=... LAAM_MACHINE_TOKEN=... node collector/laam-collector.mjs
   ```

3. Refresh **Agents / Dashboard** on the central LAAM — that machine's sessions appear (filterable by machine, coming next).

## Env vars

| Var | Default | Meaning |
|---|---|---|
| `LAAM_URL` | `http://localhost:3000` | Central LAAM base URL (tailnet HTTPS in practice) |
| `LAAM_MACHINE_TOKEN` | — (required) | Token from **Machines → Tạo máy mới** |
| `LAAM_INTERVAL_SEC` | `0` (run once) | Re-push interval in seconds |
| `LAAM_PROJECTS_DIR` | `~/.claude/projects` | Override transcripts dir |
| `LAAM_LOCAL_LOGS` | `~/.laam/local-logs` | Override local-logs dir |

## Notes

- Remote sessions show summary + tool/cost; their **per-message timeline** isn't
  live-readable on the server (the transcript lives on the dev machine). Pushing
  full events is a later enhancement.
- The token is a bearer secret — keep it out of shell history / version control.
- Revoke a machine's token anytime from **Machines** (the collector then gets 401).
