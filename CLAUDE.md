@AGENTS.md

# Claude / Agent Notes

This is the open-source Clockin Lite repository. Follow `AGENTS.md` first.

## Local Development

```bash
cp .env.example .env.local
docker compose up -d db
npm install
npm run dev
```

Open `http://localhost:3000/setup`.

## Verification

Use:

```bash
npm.cmd run build
```

Do not commit secrets, private notes, production snapshots, local backups, generated caches, or real `.env` files.
