# microbeta-web

- Design system: **Mono ice**. Read [DESIGN.md](DESIGN.md) before any UI change. Tokens live in
  `src/styles/tokens.css`; use them, never hard-coded colors. Canvas overlay colors (`src/lib/overlay.ts`)
  must match the `--ov-*` tokens. Source artifact: https://claude.ai/artifact/STyFzHX4CzP71sGVpnSg5D
- API contract with the backend: `../microbeta-backend/CONTRACT.md`.
- Public repo: only public values (Supabase URL, anon key, Modal URL) may appear in code or env files.
