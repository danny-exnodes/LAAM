# Claude provider & subscription — verdict (2026-06-11)

## Verdict ToS (verified web 06-11, 4 nguồn độc lập + Claude Help Center)
- **09/01/2026**: Anthropic chặn server-side subscription-OAuth token (sk-ant-oat01 dạng subscription) khỏi Messages API ("This credential is only authorized for use with Claude Code").
- **19/02/2026 ToS**: OAuth Free/Pro/Max KHÔNG được dùng trong third-party tools, KỂ CẢ Agent SDK. Cấm share subscription.
- **15/06/2026**: Agent SDK / `claude -p` chuyển sang credit pool riêng per-user ($20 Pro/$100 Max5x/$200 Max20x — số liệu KHÔNG hardcode vào product copy, chỉ link doc), không pool/share.
- ⇒ **"User authorize tài khoản Claude subscription cho LAAM" = KHÔNG build được hợp lệ.** Mọi đường (setup-token share, OAuth trực tiếp, host-login proxy cho nhiều user) đều vi phạm hoặc bị chặn kỹ thuật.
- Nguồn: support.claude.com/en/articles/15036540 · theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access · winbuzzer 2026/02/19 · techtimes 317625.

## Quyết định kiến trúc Claude trong chat (Epic C, plan 2026-06-11-v23)
- **Messages API `@anthropic-ai/sdk` + org API key trong env (server-only)** — KHÔNG Agent-SDK-subprocess (risk tự gây: RAM/credential-in-env/version-pin), KHÔNG shared-key UI riêng, per-user BYOK = backlog khi cần billing attribution.
- Spec gốc = chat-arch-serena ⊕ phasing model-switch (2 proposal trùng 80% — Rule 7 chọn 1): convo-shape nội bộ = canonical, adapter dịch tại biên 4 fetch-point (route.ts:384/468/802/825); tool_call thêm `id` optional (Rule 13); strip field `kind` khỏi tools body; whitelist options (CHỈ max_tokens); model whitelist CHẶT `claude-sonnet-4-6|claude-opus-4-8` (yêu cầu user).
- MVS = chat thường + stream, KHÔNG tools/vision. **Summarize SP-3 PIN Ollama trong MVS** (nếu không: fetch Ollama với model claude-* → lỗi mỗi lượt dài). Cost-labeling UX trong MVS (không đụng subscription cá nhân + quy đổi $).
- Tools-trên-Claude (FULL) chặn bởi: eval k≥6 re-run trên Claude (~$2-3) — KHÔNG phải gate write-subsetting (đã RESOLVED 06-11, đừng cite lại).

## Ghi chú implement (final review 06-11)
- `provider.ts` (interface ChatProvider) **bỏ có chủ đích** — Rule 2: mới 1 implementation (`claude.ts` adapter function); thêm interface khi có provider thứ 3.
- **Điều kiện C3 (FULL — tools/vision trên Claude):** (1) eval k≥6 re-run trên Claude (~$2-3); (2) contract test "PendingWriteSignal thoát orchestrator với Claude+write tool"; (3) contract test "tools body gửi Anthropic không chứa field `kind`"; (4) vision cần mime channel (client đang giữ mime trong state, chỉ body-build vứt).

## PIN mới: workflow/scheduled = LOCAL MODEL ONLY
Cloud model không bao giờ chạy trong workflow/schedule (cost-runaway unattended) cho tới khi có decision riêng + budget. Field `model` trên WfAgentNode tiếp tục ngủ.

## Backlog phát sinh (panel security)
- connector crypto: 1 global key (CONNECTOR_KEY/AUTH_SECRET) cho mọi credential → cần per-user HKDF/KMS khi chứa secret bậc tiền-mặt (API key). 
- SSRF MCP client: không resolve DNS → nâng severity trung, DNS-pin ~1-2 ngày.
- Data-egress: Claude = transcript nội bộ rời máy — opt-in per-conversation, default Ollama, ghi rõ trong UI.
