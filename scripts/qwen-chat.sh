#!/usr/bin/env bash
# Send a chat prompt to a local Qwen model THROUGH the LAAM logging proxy, so it
# shows up in the LAAM dashboard. Choose the model as the first argument.
#
# Usage:
#   scripts/qwen-chat.sh                 # default model, default prompt
#   scripts/qwen-chat.sh qwen2.5-coder:14b "Write a quicksort in Python"
#   MODEL=qwen2.5-coder:14b scripts/qwen-chat.sh
#
# Env:
#   PROXY_URL  (default http://localhost:11435)   LAAM proxy base URL
#   SESSION    (default qwen-cli)                  groups requests in LAAM
set -euo pipefail

MODEL="${1:-${MODEL:-qwen2.5-coder:7b}}"
PROMPT="${2:-Viết một hàm Python đảo ngược chuỗi và giải thích ngắn gọn.}"
PROXY_URL="${PROXY_URL:-http://localhost:11435}"
SESSION="${SESSION:-qwen-cli}"

curl -s "${PROXY_URL}/api/chat" \
  -H "x-laam-session: ${SESSION}" \
  -d "$(printf '{"model":"%s","stream":false,"messages":[{"role":"user","content":"%s"}]}' "$MODEL" "$PROMPT")" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0));console.log(d.message?.content||JSON.stringify(d));if(d.eval_count)console.error(`\n[${d.model}] in=${d.prompt_eval_count} out=${d.eval_count} tok/s=${(d.eval_count/(d.eval_duration/1e9)).toFixed(1)}`)'
