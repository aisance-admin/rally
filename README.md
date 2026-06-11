# 🏓 RALLY — Table Tennis Leagues

A private, single-admin league & leaderboard manager for table tennis, with a FACEIT-style dark UI. Built with **React + Vite + TypeScript + Tailwind**, backed by **Supabase**.

**Live:** https://aisance-admin.github.io/rally/

## Features
- **Leaderboard** — ELO ratings with 1–10 skill badges, divisions, form, rating-trend sparklines
- **Roster** — add / edit / delete players, paste-to-bulk-add
- **Events** — run a league night end to end:
  - **By ELO rank** — seed leagues directly from current ratings
  - **Random + qualifier** — random calibration round, then split into leagues by result
  - Auto-sized leagues (3–6 players), timing engine balances finish times to the table count
  - League cards with inline score entry → live ELO updates + standings
- **Divisions** — tiered standings with promotion / relegation zones
- **Matches** — recent results feed with ELO deltas

## Develop
```bash
npm install
cp .env.example .env   # fill in your Supabase URL + publishable key
npm run dev
```

## Deploy
Pushing to `main` triggers a GitHub Actions build that deploys to GitHub Pages (see `.github/workflows/deploy.yml`).

## Notes
- Data lives in Supabase (`rally_*` tables). The publishable key is client-safe.
- ⚠️ **Security:** RLS currently allows anonymous writes (single-admin MVP). Add an admin auth gate before sharing publicly.
