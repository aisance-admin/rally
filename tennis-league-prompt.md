# Build Prompt — Private Table-Tennis League & Leaderboard App

**Role:** You are building a private **table-tennis league & leaderboard web app**, mobile-first, operated by a **single admin**. There are no player logins — the admin runs the whole evening from their phone.

## 1. Core concept
A recurring, skill-tiered league night. Players are split into **leagues (divisions)** by skill level. Each match updates every player's **rating**, and the leaderboard continuously **re-shuffles** people up and down divisions so everyone ends up playing opponents of their own strength. Model the rating, promotion, and seeding logic on **tennis/ATP-style tiered ladders**.

## 2. Roles
- **Admin (only role):** creates the event, enters every played set and its score, controls the schedule, and reads the live leaderboard. Everything is operated from a phone.
- **Players:** tracked as records only (name + history + rating). No accounts.

## 3. Event lifecycle
**a) Setup** — admin enters event config:
- Number of tables available (**default 15**, range up to ~18; must support smaller halls too)
- Total event duration (**default 2 hours**)
- List/number of participants (~20 typical)

**b) Seeding — two paths:**
- *Players known:* admin places them straight into leagues by known rating.
- *Players unknown (ideal default):* run **one qualification round** — a single set (~15 min), randomized distribution. Weaker players get to play a strong player once per evening; it's fast, no 3-set grind, everyone gets a fun calibration game. The qualifier seeds initial ratings.

**c) League formation** — after qualification, auto-split players into leagues:
- League size is **dynamic, 3–6 players** (e.g. 3 one night, 6 the next).
- Number of leagues derives from **# participants ÷ # tables ÷ time budget**.
- **First and last leagues = 5 players, run as pools → playoff:** two pools play, top finishers cross over for a placement/final match.
- Replace manual grouping with **automatic skill-based matching**.

**d) League play** — round-robin within each league. Matches kept short to keep the evening fast.

**e) Promotion / relegation (the "shuffle"):**
- Each result re-sorts the leaderboard live.
- **Win too much in your group → promote to the next league up, after as little as one match.**
- Shuffle rule: a weak player who beats another weak player moves up to face a slightly stronger one, and so on — everyone climbs until they meet their level.

## 4. Scoring — custom per league
- Admin sets the scoring format **per division**.
- Example defaults: qualifier = **1 set to 11** (win by 2); top league = **best of 3 to 11**.
- Every match updates both players' ratings (ELO/tennis-style, configurable K-factor). Initial rating seeded from the qualification round. Ratings persist across events.

## 5. Match type — singles only
- All matches are 1v1. One rating per person. (Doubles out of scope for v1.)

## 6. Scheduling / timing engine (important)
Given **# players, # tables, duration**, compute a schedule so that:
- All leagues **finish at roughly the same time** (±a small window) — minimize idle waiting.
- Provide tight **defaults plus min/max bounds** for league size, match length, and round count.
- Recalculate timing whenever tables/players/duration change.

## 7. Player tracking
Per-player profile: current rating, rating history, league history, matches played, win/loss, promotions/relegations — visible across events ("series").

## 8. Series / seasons
Support multiple recurring **series** segmented by skill bracket, with persistent standings between nights.

## 9. UI / UX
- **Phone-first.** Primary view is a live **leaderboard table**.
- Admin flow: create event → seed/qualify → auto-form leagues → enter set scores → watch shuffle happen → see final standings.
- Score entry in a couple of taps.

## 10. Defaults
| Setting | Default | Range |
|---|---|---|
| Tables | 15 | up to ~18, smaller allowed |
| Event duration | 2 h | configurable |
| League size | 4–5 | 3–6 |
| First/last league | 5 (pools → playoff) | — |
| Qualifier match | 1 set to 11, ~15 min | — |
| Scoring | custom per league | per division |
| Match type | singles | — |
