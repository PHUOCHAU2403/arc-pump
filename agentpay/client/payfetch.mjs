// payAndFetch — the agent-side client for the pay-per-call rail.
//
// Wraps fetch: if a resource replies HTTP 402, it reads the invoice, checks the
// agent's spend limits, pays the invoice through the PaymentRouter using the
// agent's Circle wallet, then retries with proof and returns the unlocked data.
//
// Guardrails so an autonomous agent can't overspend:
//   maxPerCall — reject any single invoice above this price
//   budget     — total the agent may spend across all calls (session cap)
//
// The `circle` client is injected (not imported) so this module stays dependency-free.
//
//   const payer = createPayer({ circle, walletId, maxPerCall: 0.05, budget: 1 });
//   const { data } = await payer.payAndFetch("https://…/premium");

export function createPayer({ circle, walletId, agent, agentName, maxPerCall = 0.05, budget = 1.0, onPurchase } = {}) {
  if (!circle || !walletId) throw new Error("createPayer needs { circle, walletId }");
  let spent = 0;
  const purchases = [];
  // Identity headers so the service's ledger can attribute purchases to this agent.
  const idHeaders = {};
  if (agent) idHeaders["x-agent"] = agent;
  if (agentName) idHeaders["x-agent-name"] = agentName;

  async function payInvoice(inv) {
    const price = Number(inv.amountUSDC);
    if (!(price > 0)) throw new Error("invoice has no price");
    if (price > maxPerCall) throw new Error(`price ${price} USDC exceeds per-call cap ${maxPerCall}`);
    if (spent + price > budget + 1e-9) throw new Error(`budget cap: spent ${spent.toFixed(4)}/${budget} USDC, this call needs ${price}`);

    const tx = await circle.createContractExecutionTransaction({
      walletId,
      contractAddress: inv.router,
      abiFunctionSignature: "pay(bytes32,address)",
      abiParameters: [inv.id, inv.service],
      amount: inv.amountUSDC, // native USDC value = the price
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const id = tx.data.id;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const t = await circle.getTransaction({ id });
      const st = t.data.transaction.state;
      if (["CONFIRMED", "COMPLETE"].includes(st)) return t.data.transaction.txHash;
      if (["FAILED", "CANCELLED", "DENIED"].includes(st)) throw new Error(`payment ${st}: ${t.data.transaction.errorReason ?? ""}`);
    }
    throw new Error("payment did not confirm in time");
  }

  async function payAndFetch(url, init = {}) {
    const withId = { ...init, headers: { ...idHeaders, ...(init.headers || {}) } };
    let res = await fetch(url, withId);
    if (res.status !== 402) return { status: res.status, data: await safeJson(res), paid: false };

    const body = await res.json();
    const inv = body.invoice;
    if (!inv || !inv.id) throw new Error("402 response had no invoice");

    const txHash = await payInvoice(inv); // throws if a guardrail blocks it
    spent += Number(inv.amountUSDC);
    const rec = { url, invoice: inv.id, amountUSDC: inv.amountUSDC, service: inv.service, txHash, at: Date.now() };
    purchases.push(rec);
    if (onPurchase) { try { await onPurchase(rec); } catch {} }

    const sep = url.includes("?") ? "&" : "?";
    res = await fetch(`${url}${sep}invoice=${inv.id}`, withId);
    return { status: res.status, data: await safeJson(res), paid: true, payment: rec };
  }

  return {
    payAndFetch,
    purchases,
    get spent() { return spent; },
    get remaining() { return Math.max(0, budget - spent); },
  };
}

async function safeJson(res) {
  try { return await res.json(); } catch { return await res.text(); }
}
