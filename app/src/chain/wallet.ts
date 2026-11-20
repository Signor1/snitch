import { createPublicClient, createWalletClient, custom, fallback, formatEther, http, type Address, type PublicClient, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Game wallet: a key kept in localStorage, gas paid by the paymaster. Own wallet: pays its own gas.
export type Kind = "game" | "own";

export interface Wallet {
  kind: Kind;
  address: Address;
  wallet: WalletClient;
  pub: PublicClient;
}

const KEY = "snitch:gameKey";
const RPC = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;

// Free public nodes stall, so fall back through several.
const rpc = () =>
  fallback([...(RPC ? [http(RPC, { timeout: 20_000 })] : []), http("https://ethereum-sepolia-rpc.publicnode.com", { timeout: 20_000 }), http("https://sepolia.gateway.tenderly.co", { timeout: 20_000 }), http(undefined, { timeout: 20_000 })], { retryCount: 1 });

export const publicClient = () => createPublicClient({ chain: sepolia, transport: rpc() }) as PublicClient;

function gameKey(): `0x${string}` {
  try {
    const k = localStorage.getItem(KEY);
    if (k && /^0x[0-9a-fA-F]{64}$/.test(k)) return k as `0x${string}`;
    const fresh = generatePrivateKey();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return generatePrivateKey(); // private mode: a wallet for this visit only
  }
}

export const gameAccount = () => privateKeyToAccount(gameKey());

export function gameWallet(): Wallet {
  const account = privateKeyToAccount(gameKey());
  return { kind: "game", address: account.address, wallet: createWalletClient({ account, chain: sepolia, transport: rpc() }), pub: publicClient() };
}

export const exportGameKey = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export async function ownWallet(): Promise<Wallet> {
  const eth = (window as unknown as { ethereum?: { request(a: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
  if (!eth) throw new Error("No browser wallet found. Play with the game wallet instead: no setup needed.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
  } catch {
    throw new Error("Please switch your wallet to the Sepolia test network.");
  }
  return { kind: "own", address, wallet: createWalletClient({ account: address, chain: sepolia, transport: custom(eth) }), pub: publicClient() };
}

export async function balance(w: Wallet) {
  return formatEther(await w.pub.getBalance({ address: w.address }));
}
