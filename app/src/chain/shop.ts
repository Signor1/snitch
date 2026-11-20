import { parseAbi, type Abi, type Address, type Hex } from "viem";
import addresses from "./abi/addresses.json";
import passAbi from "./abi/SnitchPass.json";
import potsAbi from "./abi/SnitchPots.json";
import wardrobeAbi from "./abi/SnitchWardrobe.json";
import { bool, decryptFor, moverFor, num, retry, revealFor, within, type OnPhase } from "./tx";
import type { Wallet } from "./wallet";

// Money is Zama's cUSDT mock (ERC-7984, 6 decimals). A payment reveals only an encrypted "paid in full" bit.
const A = (addresses as Record<string, Record<string, string | number>>)["11155111"];
export const PASS = A.SnitchPass as Address;
export const WARDROBE = A.SnitchWardrobe as Address;
export const POTS = A.SnitchPots as Address;
export const DOLLAR = A.Dollar as Address;
export const shopReady = () => !!(PASS && WARDROBE && POTS && DOLLAR);

const dollarAbi = parseAbi([
  "function underlying() view returns (address)",
  "function wrap(address to, uint256 amount)",
  "function setOperator(address operator, uint48 until)",
  "function isOperator(address holder, address spender) view returns (bool)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
]);
const usdtAbi = parseAbi(["function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount) returns (bool)"]);

export const USD = 1_000_000;
export const dollars = (units: number) => "$" + (units / USD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quiet: OnPhase = () => {};

const read = <T,>(w: Wallet, address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
  within(retry(() => w.pub.readContract({ address, abi, functionName, args }) as Promise<T>), 30_000, "Reading the shop");

export async function dollarBalance(w: Wallet): Promise<number> {
  const h = await read<Hex>(w, DOLLAR, dollarAbi, "confidentialBalanceOf", [w.address]);
  const get = await decryptFor(w, DOLLAR, [h], quiet);
  return num(get(h));
}

/** Mints test USDT and wraps it into cUSDT. */
export async function getTestDollars(w: Wallet, amount = 20 * USD, on: OnPhase = quiet) {
  const m = moverFor(w);
  const usdt = await read<Address>(w, DOLLAR, dollarAbi, "underlying");
  await m.send(usdt, usdtAbi, "mint", [w.address, BigInt(amount)], on);
  await m.send(usdt, usdtAbi, "approve", [DOLLAR, BigInt(amount)], on);
  await m.send(DOLLAR, dollarAbi, "wrap", [w.address, BigInt(amount)], on);
}

// ERC-7984 has operators instead of allowances; this one expires in an hour.
async function allow(w: Wallet, spender: Address, on: OnPhase) {
  if (await read<boolean>(w, DOLLAR, dollarAbi, "isOperator", [w.address, spender])) return;
  const until = Math.floor(Date.now() / 1000) + 3600;
  await moverFor(w).send(DOLLAR, dollarAbi, "setOperator", [spender, until], on);
}

async function paidProof(w: Wallet, h: Hex) {
  const pub = await revealFor(w, [h]);
  return { ok: bool(pub.clearValues[h]), clears: pub.abiEncodedClearValues, proof: pub.decryptionProof };
}

export interface PassState {
  price: number;
  season: number;
  has: boolean;
  pending: number;
}

export async function passState(w: Wallet): Promise<PassState> {
  const abi = passAbi as Abi;
  const [price, season, has, pending] = await Promise.all([
    read<bigint>(w, PASS, abi, "price"),
    read<number>(w, PASS, abi, "season"),
    read<boolean>(w, PASS, abi, "hasPass", [w.address]),
    read<bigint>(w, PASS, abi, "pendingOf", [w.address]),
  ]);
  return { price: num(price), season: num(season), has, pending: num(pending) };
}

/** Approve, pay, then claim with the proof. Resumes a pending order. */
export async function buyPass(w: Wallet, on: OnPhase = quiet): Promise<boolean> {
  const abi = passAbi as Abi;
  const m = moverFor(w);
  let id = num(await read<bigint>(w, PASS, abi, "pendingOf", [w.address]));
  if (!id) {
    await allow(w, PASS, on);
    await m.send(PASS, abi, "buy", [], on);
    id = num(await retry(() => read<bigint>(w, PASS, abi, "pendingOf", [w.address]).then((x) => (num(x) ? x : Promise.reject(new Error("order not visible yet"))))));
  }
  const [, , , ok] = await read<[Address, number, boolean, Hex]>(w, PASS, abi, "orderOf", [BigInt(id)]);
  on("decrypting");
  const p = await paidProof(w, ok);
  await m.send(PASS, abi, "claim", [BigInt(id), p.clears, p.proof], on);
  return p.ok;
}

export interface Item {
  id: number;
  name: string;
  stars: number;
  owned: boolean;
}

export async function wardrobe(w: Wallet): Promise<Item[]> {
  const abi = wardrobeAbi as Abi;
  const n = num(await read<bigint>(w, WARDROBE, abi, "itemCount"));
  return Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const id = i + 1;
      const [name, stars, owned] = await Promise.all([read<string>(w, WARDROBE, abi, "nameOf", [BigInt(id)]), read<number>(w, WARDROBE, abi, "starsFor", [BigInt(id)]), read<boolean>(w, WARDROBE, abi, "claimed", [w.address, BigInt(id)])]);
      return { id, name, stars: num(stars), owned };
    }),
  );
}

export const claimItem = (w: Wallet, id: number, on: OnPhase = quiet) => moverFor(w).send(WARDROBE, wardrobeAbi as Abi, "claim", [BigInt(id)], on);

const HOST_SLOT = 15;

export interface PotState {
  buyIn: number;
  paidMask: number;
  pendingMask: number;
  claimedMask: number;
}

export async function potOf(w: Wallet, room: number): Promise<PotState> {
  const p = await read<readonly [bigint, number, number, number, boolean]>(w, POTS, potsAbi as Abi, "pots", [BigInt(room)]);
  return { buyIn: num(p[0]), paidMask: num(p[1]), pendingMask: num(p[2]), claimedMask: num(p[3]) };
}

export const openPot = (w: Wallet, room: number, buyIn: number, on: OnPhase = quiet) => moverFor(w).send(POTS, potsAbi as Abi, "open", [BigInt(room), BigInt(buyIn)], on);

/** `seat` is undefined for the host. */
export async function payPot(w: Wallet, room: number, seat: number | undefined, on: OnPhase = quiet): Promise<boolean> {
  const abi = potsAbi as Abi;
  const slot = seat ?? HOST_SLOT;
  const st = await potOf(w, room);
  const m = moverFor(w);
  if (!(st.pendingMask & (1 << slot))) {
    await allow(w, POTS, on);
    await m.send(POTS, abi, "pay", [BigInt(room)], on);
  }
  const h = await retry(() => read<Hex>(w, POTS, abi, "paidOk", [BigInt(room), slot]).then((x) => (/^0x0+$/.test(x) ? Promise.reject(new Error("payment not visible yet")) : x)));
  on("decrypting");
  const p = await paidProof(w, h);
  await m.send(POTS, abi, "confirm", [BigInt(room), slot, p.clears, p.proof], on);
  return p.ok;
}

export async function potShare(w: Wallet, room: number) {
  const [share, takers] = await read<readonly [bigint, number]>(w, POTS, potsAbi as Abi, "shareOf", [BigInt(room)]);
  return { share: num(share), takers: num(takers) };
}

export const claimPot = (w: Wallet, room: number, on: OnPhase = quiet) => moverFor(w).send(POTS, potsAbi as Abi, "claim", [BigInt(room)], on);
export const slotOf = (seat?: number) => seat ?? HOST_SLOT;
