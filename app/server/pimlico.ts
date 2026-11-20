import addresses from "../src/chain/abi/addresses.json";

// The Pimlico key stays on the server. The browser sends bundler/paymaster calls here and we forward
// them, but only for user operations that call our own contracts, so the key can't sponsor anything else.

const A = (addresses as Record<string, Record<string, string | number>>)["11155111"];
const USDT_MOCK = "0xa7da08fafdc9097cc0e7d4f113a61e31d7e8e9b0";
const TARGETS = new Set(
  [A.Snitch, A.SnitchRooms, A.SnitchPass, A.SnitchWardrobe, A.SnitchPots, A.Dollar, USDT_MOCK].map((a) => String(a).toLowerCase()),
);

const READS = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
]);
const WITH_OP = new Set(["eth_sendUserOperation", "eth_estimateUserOperationGas", "pm_getPaymasterStubData", "pm_getPaymasterData", "pm_sponsorUserOperation"]);

// SimpleAccount.execute(address,uint256,bytes): the target is the first argument.
const EXECUTE = "0xb61d27f6";

type Call = { method?: string; params?: unknown[] };

function allowed(call: Call): boolean {
  if (!call.method) return false;
  if (READS.has(call.method)) return true;
  if (!WITH_OP.has(call.method)) return false;
  const data = String((call.params?.[0] as { callData?: string } | undefined)?.callData ?? "").toLowerCase();
  return data.startsWith(EXECUTE) && TARGETS.has("0x" + data.slice(34, 74));
}

export async function forward(body: unknown, key: string | undefined): Promise<Response> {
  if (!key) return Response.json({ error: "gasless play is not configured" }, { status: 503 });
  const calls = (Array.isArray(body) ? body : [body]) as Call[];
  if (!calls.length || !calls.every(allowed)) return Response.json({ error: "not allowed" }, { status: 403 });
  const res = await fetch(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } });
}
