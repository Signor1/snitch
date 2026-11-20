import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { Snitch, SnitchPass, SnitchPots, SnitchRooms, SnitchWardrobe, TestDollar } from "../../types";

const GAS = 16_000_000;
const USD = 1_000_000; // 6 decimals
const PRICE = 4_990_000; // $4.99

describe("Snitch shop: pass, wardrobe, pots", function () {
  this.timeout(3_600_000);
  let usd: TestDollar;
  let game: Snitch;
  let rooms: SnitchRooms;
  let pass: SnitchPass;
  let wardrobe: SnitchWardrobe;
  let pots: SnitchPots;
  let owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner, dave: HardhatEthersSigner;

  before(async function () {
    if (!fhevm.isMock) this.skip();
    [owner, alice, bob, carol, dave] = await ethers.getSigners();
  });
  beforeEach(async () => {
    usd = (await (await ethers.getContractFactory("TestDollar")).deploy()) as unknown as TestDollar;
    game = (await (await ethers.getContractFactory("Snitch")).deploy()) as unknown as Snitch;
    rooms = (await (await ethers.getContractFactory("SnitchRooms")).deploy(await game.getAddress())) as unknown as SnitchRooms;
    pass = (await (await ethers.getContractFactory("SnitchPass")).deploy(await usd.getAddress(), PRICE)) as unknown as SnitchPass;
    wardrobe = (await (await ethers.getContractFactory("SnitchWardrobe")).deploy(await game.getAddress(), "https://snitch.example/items/{id}.json")) as unknown as SnitchWardrobe;
    pots = (await (await ethers.getContractFactory("SnitchPots")).deploy(await rooms.getAddress(), await usd.getAddress(), owner.address)) as unknown as SnitchPots;
  });

  const tx = async (p: Promise<{ wait(): Promise<unknown> }>) => (await p).wait();
  const balance = async (who: HardhatEthersSigner) => {
    const h = await usd.confidentialBalanceOf(who.address);
    if (h === ethers.ZeroHash) return 0;
    return Number(await fhevm.userDecryptEuint(FhevmType.euint64, h, await usd.getAddress(), who));
  };
  const fund = async (who: HardhatEthersSigner, amount: number, spender: string) => {
    if (amount) await tx(usd.mint(who.address, amount));
    const until = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
    await tx(usd.connect(who).setOperator(spender, until));
  };
  async function buyAndClaim(who: HardhatEthersSigner) {
    await tx(pass.connect(who).buy({ gasLimit: GAS }));
    const id = await pass.pendingOf(who.address);
    const [, , , ok] = await pass.orderOf(id);
    const dec = await fhevm.publicDecrypt([ok]);
    await tx(pass.connect(owner).claim(id, dec.abiEncodedClearValues, dec.decryptionProof, { gasLimit: GAS }));
    return { id, ok: ethers.AbiCoder.defaultAbiCoder().decode(["bool"], dec.abiEncodedClearValues)[0] as boolean };
  }

  it("Boss Pass: paid in full mints a soulbound pass; nobody learns the buyer's balance, only that it went through", async () => {
    await fund(alice, 10 * USD, await pass.getAddress());
    const r = await buyAndClaim(alice);
    expect(r.ok).to.eq(true);
    expect(await pass.ownerOf(1)).to.eq(alice.address);
    expect(await pass.hasPass(alice.address)).to.eq(true);
    expect(await pass.seasonOfPass(1)).to.eq(1n);
    expect(await balance(alice)).to.eq(10 * USD - PRICE);
    // the pass is an identity: it never moves
    await expect(pass.connect(alice).transferFrom(alice.address, bob.address, 1)).to.be.revertedWithCustomError(pass, "Soulbound");
    // one per season
    await expect(pass.connect(alice).buy({ gasLimit: GAS })).to.be.revertedWithCustomError(pass, "HasPass");
    // a new season sells again
    await tx(pass.nextSeason());
    expect(await pass.hasPass(alice.address)).to.eq(false);
    expect((await buyAndClaim(alice)).ok).to.eq(true);
    expect(await pass.ownerOf(2)).to.eq(alice.address);
    expect(await pass.seasonOfPass(2)).to.eq(2n);
  });

  it("Boss Pass: a buyer who is short moves nothing and gets no pass; the order can't be claimed twice or forged", async () => {
    await fund(bob, 1 * USD, await pass.getAddress());
    await tx(pass.connect(bob).buy({ gasLimit: GAS }));
    await expect(pass.connect(bob).buy({ gasLimit: GAS })).to.be.revertedWithCustomError(pass, "OrderPending");
    const id = await pass.pendingOf(bob.address);
    const [, , , ok] = await pass.orderOf(id);
    const dec = await fhevm.publicDecrypt([ok]);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
    await expect(pass.claim(id, forged, dec.decryptionProof)).to.be.reverted;
    await tx(pass.claim(id, dec.abiEncodedClearValues, dec.decryptionProof));
    await expect(pass.claim(id, dec.abiEncodedClearValues, dec.decryptionProof)).to.be.revertedWithCustomError(pass, "BadOrder");
    expect(await pass.hasPass(bob.address)).to.eq(false);
    expect(await pass.balanceOf(bob.address)).to.eq(0n);
    expect(await balance(bob)).to.eq(1 * USD); // nothing moved
    // topped up, the same buyer can try again
    await tx(usd.mint(bob.address, 5 * USD));
    expect((await buyAndClaim(bob)).ok).to.eq(true);
    expect(await balance(bob)).to.eq(6 * USD - PRICE);
  });

  it("Boss Pass: needs the buyer's operator approval; only the owner sets prices and withdraws", async () => {
    await tx(usd.mint(carol.address, 10 * USD));
    await expect(pass.connect(carol).buy({ gasLimit: GAS })).to.be.reverted; // not an operator
    await fund(alice, 10 * USD, await pass.getAddress());
    await buyAndClaim(alice);
    await expect(pass.connect(alice).setPrice(1)).to.be.revertedWithCustomError(pass, "NotOwner");
    await expect(pass.connect(alice).withdraw(alice.address)).to.be.revertedWithCustomError(pass, "NotOwner");
    await tx(pass.withdraw(dave.address, { gasLimit: GAS }));
    expect(await balance(dave)).to.eq(PRICE);
  });
  async function earnStar(chapter: number, who: HardhatEthersSigner) {
    for (let i = 0; i < 40 && (await game.bestStars(who.address, chapter)) === 0n; i++) {
      await tx(game.connect(who).start(chapter, 0, { gasLimit: GAS }));
      await tx(game.connect(who).runJob(0b11, 0, 10_000, { gasLimit: GAS }));
      await tx(game.connect(who).walkAway({ gasLimit: GAS }));
      const dec = await fhevm.publicDecrypt([...(await game.revealHandles(who.address))]);
      await tx(game.settle(who.address, dec.abiEncodedClearValues, dec.decryptionProof, { gasLimit: GAS }));
    }
  }

  it("Wardrobe: items unlock with stars won on-chain, one each", async () => {
    expect(await wardrobe.itemCount()).to.eq(4n);
    await expect(wardrobe.connect(alice).claim(1)).to.be.revertedWithCustomError(wardrobe, "NotEnoughStars");
    await expect(wardrobe.connect(alice).claim(0)).to.be.revertedWithCustomError(wardrobe, "BadItem");
    await expect(wardrobe.connect(alice).claim(5)).to.be.revertedWithCustomError(wardrobe, "BadItem");
    for (const c of [1, 2, 3]) await earnStar(c, alice);
    expect(await game.totalStars(alice.address)).to.be.gte(3n);
    await tx(wardrobe.connect(alice).claim(1));
    expect(await wardrobe.balanceOf(alice.address, 1)).to.eq(1n);
    await expect(wardrobe.connect(alice).claim(1)).to.be.revertedWithCustomError(wardrobe, "AlreadyClaimed");
    if ((await game.totalStars(alice.address)) < 8n) await expect(wardrobe.connect(alice).claim(2)).to.be.revertedWithCustomError(wardrobe, "NotEnoughStars");
    await expect(wardrobe.connect(alice).addItem("Hat", 1)).to.be.revertedWithCustomError(wardrobe, "NotOwner");
    await tx(wardrobe.addItem("Hat", 1));
    await tx(wardrobe.connect(alice).claim(5));
  });
  it("Pots: the table pays in confidentially, the winners split the pot minus 5%, the rake goes to the treasury once", async () => {
    // alice hosts chapter 1; bob takes seat 0, carol seat 1; dave takes seat 2 but can't pay
    await tx(rooms.connect(alice).createRoom(1, 0));
    const id = await rooms.roomCount();
    await tx(rooms.connect(bob).join(id, 0));
    await tx(rooms.connect(carol).join(id, 1));
    await tx(rooms.connect(dave).join(id, 2));
    const BUY = 2 * USD;
    await expect(pots.connect(bob).open(id, BUY)).to.be.revertedWithCustomError(pots, "NotHost");
    await tx(pots.connect(alice).open(id, BUY));
    await expect(pots.connect(alice).open(id, BUY)).to.be.revertedWithCustomError(pots, "PotExists");

    const potAddr = await pots.getAddress();
    for (const [who, amount] of [
      [alice, 5 * USD],
      [bob, 5 * USD],
      [carol, 5 * USD],
      [dave, 1 * USD],
    ] as const)
      await fund(who, amount, potAddr);
    await expect(pots.connect(owner).pay(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "NotAtTable");
    const slots = new Map<HardhatEthersSigner, number>([
      [alice, 15],
      [bob, 0],
      [carol, 1],
      [dave, 2],
    ]);
    for (const [who, slot] of slots) {
      await tx(pots.connect(who).pay(id, { gasLimit: GAS }));
      await expect(pots.connect(who).pay(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "AlreadyPaid");
      const dec = await fhevm.publicDecrypt([await pots.paidOk(id, slot)]);
      await tx(pots.confirm(id, slot, dec.abiEncodedClearValues, dec.decryptionProof));
    }
    const pot = await pots.pots(id);
    expect(pot.paidMask).to.eq(BigInt((1 << 15) | 0b011)); // dave was short: not in
    expect(await balance(dave)).to.eq(1 * USD);

    await expect(pots.connect(bob).claim(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "WrongStage");
    // play: start, walk away at once (an empty bag: the snitch side wins), settle
    await tx(rooms.connect(alice).startRoom(id, { gasLimit: GAS }));
    await expect(pots.connect(bob).pay(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "WrongStage");
    await tx(rooms.connect(alice).walkAway(id, { gasLimit: GAS }));
    const dec = await fhevm.publicDecrypt([...(await rooms.revealHandles(id))]);
    await tx(rooms.settle(id, dec.abiEncodedClearValues, dec.decryptionProof, { gasLimit: GAS }));
    const res = await rooms.resultOf(id);
    expect(res.snitchWon).to.eq(true);

    const pool = 3 * BUY;
    const rake = (pool * 500) / 10_000;
    const snitchSeat = Number(res.snitch);
    // a paying human snitch takes it all; otherwise every payer gets the buy-in back minus the rake
    const winner = snitchSeat === 0 ? bob : snitchSeat === 1 ? carol : undefined;
    const takers = winner ? [winner] : [alice, bob, carol];
    const share = Math.floor((pool - rake) / takers.length);
    const [s, mask] = await pots.shareOf(id);
    expect(Number(s)).to.eq(share);
    for (const who of takers) expect((Number(mask) >> slots.get(who)!) & 1).to.eq(1);

    const before = new Map<HardhatEthersSigner, number>();
    for (const who of [alice, bob, carol, dave]) before.set(who, await balance(who));
    for (const who of [alice, bob, carol, dave]) {
      if (takers.includes(who)) {
        await tx(pots.connect(who).claim(id, { gasLimit: GAS }));
        await expect(pots.connect(who).claim(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "NothingToClaim");
        expect(await balance(who)).to.eq(before.get(who)! + share);
      } else await expect(pots.connect(who).claim(id, { gasLimit: GAS })).to.be.revertedWithCustomError(pots, "NothingToClaim");
    }
    expect(await balance(owner)).to.eq(rake); // the treasury, once
  });
});
