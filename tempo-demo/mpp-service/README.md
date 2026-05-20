# tempo-pump-mpp

MPP-paid endpoint that lets AI agents launch a memecoin on Tempo mainnet
through Arc Pump's `MemeFactoryTempoV2`.

## Architecture

```
Claude / agent (with Tempo CLI)
    │  tempo request -X POST .../launch --json '{"name":"$CLD",...}'
    ▼
HTTP 402 + WWW-Authenticate (MPP challenge)
    │  amount: 0.10 pathUSD, recipient: deployer
    ▼
Agent's Tempo wallet auto-pays
    │  retries with Authorization: Payment ...
    ▼
Worker verifies receipt → calls factory.createToken via deployer key
    ▼
Returns { token, curve, txHash, explorer }
```

## Local dev

```bash
cp .dev.vars.example .dev.vars   # fill DEPLOYER_KEY + MPP_SECRET_KEY
npm install
npm run dev                       # starts wrangler dev at localhost:8787
```

## Deploy

```bash
wrangler secret put DEPLOYER_KEY
wrangler secret put MPP_SECRET_KEY
wrangler deploy
```

## Endpoints

- `GET /` — service info + price
- `POST /launch` — paid endpoint. Body: `{ name, symbol, supply?, fee?, description? }`. Price: 0.10 pathUSD.

## Configuration

`wrangler.toml` env vars (public):
- `FACTORY_ADDRESS`: MemeFactoryTempoV2 contract address
- `PATHUSD_ADDRESS`: pathUSD TIP-20 contract
- `DEPLOYER_ADDRESS`: deployer EOA (factory owner + pathUSD recipient)
- `RPC_URL`: Tempo mainnet RPC
- `PRICE_PATHUSD`: per-launch price in pathUSD whole units

Secrets (set via `wrangler secret put`):
- `DEPLOYER_KEY`: deployer EOA private key
- `MPP_SECRET_KEY`: HMAC secret for MPP challenge IDs (any random 32-char string)
