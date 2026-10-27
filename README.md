# Hood Cabals bot

Telegram bot for Hood Cabals holders. Members link their wallet by signing a
message, the bot reads their Hood Cabals balance on Robinhood Chain, and gives
them a tier. Each tier has a private Telegram group the bot lets them into.

| Tier         | Held | Rooms                     |
| ------------ | ---- | ------------------------- |
| Hood         | 1+   | Hood                      |
| Cabal        | 5+   | Hood, Cabal               |
| Inner Circle | 10+  | Hood, Cabal, Inner Circle |

Holdings are re-checked daily. Anyone who drops below a tier is removed from
that group and gets a DM. Thresholds live in `src/tiers.ts`.

## Token scans

`/scan <address>` in any room, or paste an address in a DM with the bot. The
chain comes from the address: `0x…` is Robinhood Chain, base58 is Solana.

| Source      | Used for                                                   | Chain           |
| ----------- | ---------------------------------------------------------- | --------------- |
| DEXScreener | Price, market cap, liquidity, volume, pair age, chart link | Both            |
| RugCheck    | Mint/freeze authority, top holders, LP lock, bonding curve | Solana          |
| GoPlus      | Honeypot, taxes, mint, owner, top holders, LP holders      | Robinhood Chain |

Results are cached for 60 seconds, so many people scanning the same token cost
one lookup. Holders get 10 scans a minute, everyone else 3. If a source fails,
the card shows what the others returned, and the verdict becomes UNKNOWN
rather than LOW. Scoring rules are in `src/scan/risk.ts`; every scan is saved
to the `scans` table for the alerts and call log later.

## Stack

TypeScript (strict), grammY, Fastify, Postgres with Drizzle, viem, and pg-boss
for the daily job. pg-boss keeps its queue in Postgres, so there's no Redis to
run.

## Run locally

Needs Node 22+ and Docker.

1. Create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. `cp .env.example .env` and fill in `BOT_TOKEN`. `NFT_CONTRACT` is already set to the Hood Cabals collection.
3. `npm install`
4. `npm run db:up` starts Postgres in Docker on `localhost:5432`.
5. `npm run dev`. Migrations run on startup.
6. Message your bot `/start`, tap **Link wallet**, and open the link it sends in a
   desktop browser with MetaMask.

Telegram won't put `http://localhost` links in buttons, so locally the verify
link is sent as plain text. In production with an https `PUBLIC_URL` it's a
button.

### Groups

For each tier group: add the bot as an admin with **Invite users** and **Ban
users**, then send `/chatid` in the group and put the number it replies with in
the matching `TIER_*_CHAT_ID`. Members join through a join-request link and the bot approves
or declines based on tier. Any tier left unset is not gated.

## Deploy on a VPS

```
git clone <this repo> && cd hood-cabals-bot
cp .env.example .env   # PUBLIC_URL=https://verify.yourdomain, POSTGRES_PASSWORD=<long random>
docker compose --profile prod up -d --build
```

The app listens on `127.0.0.1:3000`. Put Caddy or nginx in front for https, e.g.
a Caddyfile of `verify.yourdomain { reverse_proxy 127.0.0.1:3000 }`. The bot
uses long polling, so only the verify page needs to be public.

## Scripts

| Command               | What it does                          |
| --------------------- | ------------------------------------- |
| `npm run dev`         | Run with reload                       |
| `npm test`            | Unit tests                            |
| `npm run typecheck`   | Type-check everything                 |
| `npm run db:generate` | New migration after editing schema.ts |
| `npm run build`       | Compile to `dist/`                    |
| `npm run check:contract -- 0xWallet` | Check the NFT contract and a wallet's balance |

## Branding

`public/brand.css` is copied from the hcwlform whitelist site so the verify page
matches it. Bot copy is in `src/bot/views.ts`. Use `public/hoodcabals.png` as
the bot's profile picture in BotFather (`/setuserpic`).
