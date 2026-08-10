#!/usr/bin/env bash
# Tempo MPP daily farm — 19-service diverse pool. Each paid call = one on-chain tx
# from the MAIN wallet (0xa8aB) via the authorized access key. Cheap, diverse,
# spread out to look like organic agent usage. Balance-delta = tx ground-truth.
#
# Usage: farm.sh [N]      (N = target successful tx, default 12)
# Env:   GAP_MIN GAP_MAX (s between calls, default 600..1200) · MAX_SPEND (default 0.02)
set -u
export PATH="/root/.tempo/bin:$PATH"
N="${1:-12}"; GAP_MIN="${GAP_MIN:-600}"; GAP_MAX="${GAP_MAX:-1200}"; MAX_SPEND="${MAX_SPEND:-0.02}"
BOT_TOKEN="8484598094:AAGoJ8Ob-yeVPUDwmyr_L-qCpOWOoRabnkI"; CHAT_ID="1857575827"
LOG="/root/tempo-mpp/farm.log"; LOCK="/root/tempo-mpp/.farm.lock"
exec 9>"$LOCK"; if ! flock -n 9; then echo "$(date '+%F %T') overlap skip" >> "$LOG"; exit 0; fi

# "METHOD|URL|JSON" (empty JSON = GET)
POOL=(
  "GET|https://aviationstack.mpp.tempo.xyz/v1/airports|"
  "GET|https://aviationstack.mpp.tempo.xyz/v1/countries|"
  "GET|https://aviationstack.mpp.tempo.xyz/v1/routes|"
  "GET|https://goflightlabs.mpp.tempo.xyz/retrieve-airports|"
  "GET|https://goflightlabs.mpp.tempo.xyz/retrieve-airlines|"
  "GET|https://goflightlabs.mpp.tempo.xyz/retrieve-routes|"
  "GET|https://googlemaps.mpp.tempo.xyz/maps/geocode/json|"
  "GET|https://googlemaps.mpp.tempo.xyz/maps/timezone/json|"
  "GET|https://kicksdb.mpp.tempo.xyz/v3/kream/products|"
  "GET|https://kicksdb.mpp.tempo.xyz/v3/goat/products|"
  "GET|https://serpapi.mpp.tempo.xyz/search|"
  "POST|https://exa.mpp.tempo.xyz/search|{\"query\":\"tempo blockchain payments\",\"numResults\":1}"
  "POST|https://firecrawl.mpp.tempo.xyz/v1/search|{\"query\":\"stablecoin payments\"}"
  "POST|https://modal.mpp.tempo.xyz/sandbox/status|{}"
  "POST|https://brave.mpp.paywithlocus.com/brave/web-search|{\"q\":\"tempo blockchain\"}"
  "POST|https://coingecko.mpp.paywithlocus.com/coingecko/simple-price|{\"ids\":\"bitcoin\",\"vs_currencies\":\"usd\"}"
  "POST|https://coingecko.mpp.paywithlocus.com/coingecko/trending|{\"x\":1}"
  "POST|https://deepl.mpp.paywithlocus.com/deepl/translate|{\"text\":[\"hello world\"],\"target_lang\":\"DE\"}"
  "POST|https://alphavantage.mpp.paywithlocus.com/alphavantage/time-series-daily|{\"symbol\":\"IBM\"}"
  "POST|https://mapbox.mpp.paywithlocus.com/mapbox/geocode-forward|{\"q\":\"paris\"}"
  "POST|https://ipinfo.mpp.paywithlocus.com/ipinfo/ip-lookup|{\"ip\":\"8.8.8.8\"}"
  "POST|https://judge0.mpp.paywithlocus.com/judge0/execute-code|{\"source_code\":\"print(1)\",\"language_id\":71}"
  "POST|https://edgar.mpp.paywithlocus.com/edgar/company-facts|{\"cik\":\"320193\"}"
  "POST|https://groq.mpp.paywithlocus.com/groq/models|{}"
  "POST|https://hunter.mpp.paywithlocus.com/hunter/discover|{}"
)
balance(){ tempo wallet whoami --filter-output balance.available --format json 2>/dev/null | grep -oE '[0-9][0-9.]+' | head -1; }
expiry(){ tempo wallet whoami --filter-output key.expires_at --format json 2>/dev/null | grep -oE '20[0-9-]+T[0-9:]+Z' | head -1; }

TS0="$(TZ='Asia/Ho_Chi_Minh' date '+%F %T %Z')"; B0="$(balance)"; B0="${B0:-0}"
echo "=== $TS0 FARM START target=$N cap=$MAX_SPEND startBal=$B0 pool=${#POOL[@]} ===" >> "$LOG"
mapfile -t ORDER < <(seq 0 $((${#POOL[@]}-1)) | shuf)
tx=0; attempts=0; declare -A dead; i=0
while [ "$tx" -lt "$N" ]; do
  if [ "$i" -ge "${#ORDER[@]}" ]; then mapfile -t ORDER < <(seq 0 $((${#POOL[@]}-1)) | shuf); i=0; fi
  idx="${ORDER[$i]}"; i=$((i+1)); [ -n "${dead[$idx]:-}" ] && continue
  IFS='|' read -r METHOD URL PAYLOAD <<< "${POOL[$idx]}"
  attempts=$((attempts+1)); bpre="$(balance)"; bpre="${bpre:-0}"
  if [ "$METHOD" = "POST" ]; then OUT="$(tempo request --max-spend "$MAX_SPEND" -s -X POST --json "$PAYLOAD" "$URL" 2>&1)"; else OUT="$(tempo request --max-spend "$MAX_SPEND" -s "$URL" 2>&1)"; fi
  rc=$?; bpost="$(balance)"; bpost="${bpost:-$bpre}"
  paid="$(awk -v a="$bpre" -v b="$bpost" 'BEGIN{d=a-b; if(d>0.0000001) printf "%.6f",d; else print "0"}')"
  short="$(echo "$URL"|sed -E 's#https://([^.]+)\..*/([^/]+)$#\1/\2#')"
  if [ "$paid" != "0" ]; then tx=$((tx+1)); echo "$(date '+%T') [$tx/$N] PAID $paid  $short" >> "$LOG"
  elif echo "$OUT"|grep -qiE 'no response|timeout|connect|E_NETWORK|not respond'; then dead[$idx]=1; echo "$(date '+%T') [-] DEAD $short" >> "$LOG"
  else echo "$(date '+%T') [-] nopay rc=$rc $short :: $(echo "$OUT"|grep -oE 'E_[A-Z]+|[0-9]{3}'|head -1)" >> "$LOG"; fi
  [ "$attempts" -ge $((N*3)) ] && { echo "$(date '+%T') attempt cap" >> "$LOG"; break; }
  [ "$tx" -lt "$N" ] && sleep $((GAP_MIN + RANDOM % (GAP_MAX - GAP_MIN + 1)))
done
BF="$(balance)"; BF="${BF:-$B0}"; SPENT="$(awk -v a="$B0" -v b="$BF" 'BEGIN{printf "%.6f",a-b}')"; EXP="$(expiry)"
TS1="$(TZ='Asia/Ho_Chi_Minh' date '+%F %T %Z')"
echo "=== $TS1 FARM DONE tx=$tx attempts=$attempts spent=$SPENT bal=$BF ===" >> "$LOG"
MSG="🌾 Tempo MPP farm done
${TS1}
tx onchain: ${tx}/${N} (attempts ${attempts}) · pool 19 services
spent: ${SPENT} USDC.e · balance: ${BF}
wallet: 0xa8aB… · key expires: ${EXP}"
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" --data-urlencode "chat_id=${CHAT_ID}" --data-urlencode "text=${MSG}" --data-urlencode "disable_web_page_preview=true" >/dev/null
