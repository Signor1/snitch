# SNITCH

You run a crew of thieves. One of them is feeding the police. You don't know who, and neither does anyone else: the informant is picked inside a smart contract with encrypted randomness and stays encrypted until you walk away.

Built on Zama's FHEVM for the Zama Developer Program, Season 5 (Confidential Gaming). Runs on Ethereum Sepolia.

> This project is not audited, endorsed or operated by Zama. Use at your own risk.

## The story

Ten years ago your partner, Ash, went down in a police raid at the harbour. Someone in the crew had talked. You never found out who, so you left Port Solace.

Now you're back, building a new crew one small job at a time. On the first night a text arrives from a number you don't know, signed Echo: *"One of them is mine."*

Detective Inspector Hale runs the informants. She's Ash's sister, and she thinks you were the one who sold him out. Echo keeps texting after every job, and knows things only the crew should know. Perfect jobs turn up evidence files; pin enough of them to the board and you'll find out who Echo is. There are three endings.

## How to play

Each chapter is a run of jobs. Every job has five steps:

1. **Scout.** Case the place, buy the plans, or pay off a cop.
2. **Plan.** Fill every seat. A driver drives, a safecracker cracks; the right person in the right seat pays more.
3. **The job.** Make the calls when the radio crackles, then do the hands-on part yourself: turn the dial, smash the cases, sweep the table, punch the vault code.
4. **Get out.** If the police were waiting, pick a way out. A bad route costs you someone for a night.
5. **Find the snitch.** Police on a job point at whoever was on it. A rumour after each job, tails and a wiretap tell you more. Accuse the right person and the bag doubles; accuse the wrong one and the heat goes up.

Three heat and the police take everything. Walk away whenever you like: that ends the run and reveals the snitch. Stars come from the bag you carried out.

Difficulties: **Street**, **Made** (x2 payout) and **Kingpin** (x3).

## Chapters

| | Chapter | Crew | Jobs | What changes |
|---|---|---|---|---|
| P | The Harbour | 4 | 3 | Ten years ago. The night Ash went down |
| 1 | The Corner | 5 | 6 | Roles: the right skill in the right seat pays more |
| 2 | Uptown | 6 | 7 | The wiretap: pick two people, learn for certain if the snitch is one of them |
| 3 | The Docks | 6 | 7 | A skimmer: half the take goes missing when they're on a job |
| 4 | Two Wires | 7 | 7 | Two snitches. Catch one and the other keeps talking |
| 5 | The Turn | 7 | 7 | Too slow, and the snitch recruits someone else at job 4 |
| 6 | Blood Money | 7 | 7 | Loyalty: wrong calls cost trust, and the crew votes before the last job |
| 7 | Ash | 8 | 8 | Maybe nobody at the table is the snitch. Knowing when not to accuse is the test |
| 8 | Solace | 8 | 8 | One heist in eight parts. Police on the last part is a raid |

Every chapter rule above is enforced by the contract, not the client.

Other modes: **Daily job** (same table and same snitch for everyone that day), **Endless night** (twenty jobs, each bigger than the last), and **rooms**, where friends join from their own phones and one of them might be the snitch.

## What stays secret

| | Who can read it |
|---|---|
| Which crew member is the snitch | Nobody until you walk away, then everyone (with a KMS proof) |
| Job results, your bag, your heat, tails, the wiretap | You |
| A friend's role in a room | That friend |
| A friend's sealed "talk / stay quiet" | Nobody. The contract only keeps `isSnitch AND talk` |
| Your balance when you pay | You. The shop only learns "paid in full: yes/no" |

Scores are written by `settle`, which checks Zama's decryption proof against the stored handles. Nobody can post a fake score, including us.

## Standards and EIPs

| Standard | Used for |
|---|---|
| **ERC-7984** (confidential fungible token) | The money. Zama's `cUSDTMock` on Sepolia: balances and transfers are encrypted |
| **ERC-721** | The Boss Pass (`SnitchPass`). One per player per season, soulbound |
| **ERC-1155** | Cosmetics (`SnitchWardrobe`). Earned with on-chain stars, tradable |
| **ERC-20** | Only the test USDT that `cUSDTMock` wraps. We don't issue an ERC-20 |
| **EIP-7702** | Turns the player's plain address into a smart account without changing the address |
| **ERC-4337** (EntryPoint v0.8) | Moves go out as user operations, so a paymaster can pay the gas |
| **EIP-712** | The signed permit that lets a player decrypt their own results |
| **EIP-1193** | "Use my wallet": MetaMask or any injected browser wallet |
| **ERC-165** | Interface checks on the token contracts |

## Accounts and gas

Players don't need a wallet, ETH or a seed phrase.

1. **Account.** On first play the browser generates a private key and keeps it in local storage. It can be exported from the on-chain panel in the city screen.
2. **EIP-7702.** The first move carries a signed authorization that delegates the address to a SimpleAccount. The address doesn't change, so `msg.sender` is still the player and Zama's ACL and private decryption work as normal.
3. **ERC-4337.** Each move is a user operation sent to Pimlico's bundler; Pimlico's paymaster pays the gas.
4. **Secret key.** The browser never sees the Pimlico key. It calls `/api/pimlico` on our own site, a Cloudflare Pages Function that adds the key and only forwards operations that call our contracts.
5. **Decryption.** The same browser key signs the EIP-712 permit for Zama's relayer, so results appear without a pop-up.

Players who prefer their own wallet can connect it; they approve each move and pay their own gas.

## Architecture

```
 browser                                        Ethereum Sepolia
 ┌──────────────────────────────┐               ┌───────────────────────────────┐
 │ routes / hud  (React)        │               │ Snitch        solo game       │
 │      │ read state            │               │ SnitchRooms   multiplayer     │
 │ store (zustand)              │   user ops    │ SnitchPass    ERC-721         │
 │      │ calls                 │ ────────────▶ │ SnitchWardrobe ERC-1155       │
 │ actions ──▶ TableEngine      │  /api/pimlico │ SnitchPots    room buy-ins    │
 │             ├ practice table │  (CF Function)│ cUSDTMock     ERC-7984        │
 │             ├ chain table    │               └───────────────┬───────────────┘
 │             └ room table     │ ◀──── decrypt (EIP-712) ──── Zama relayer / KMS
 │ world (three.js)             │
 └──────────────────────────────┘
```

- **One interface for the rules.** Everything that touches the table goes through `TableEngine` (`start`, `runJob`, `tail`, `wiretap`, `accuse`, `walkAway`). There are three implementations: a practice table in the browser, the solo table on `Snitch`, and the room table on `SnitchRooms`. The game, the HUD and the 3D scenes don't know which one they're on.
- **Layers.** Screens arrange HUD pieces; HUD pieces read the store; the store calls actions; actions talk only to the engine. The 3D world reads the store and never writes to it.
- **The contract is the source of truth.** The client works out the public plan (risk and take share) and the contract checks it. Hidden state lives only on-chain. After a reload the game rebuilds the run from the contract, plus a small local save for things the chain doesn't need (clues, crew mood).
- **Static site.** No game server. The only server code is the Pimlico proxy, about forty lines.

Repo layout:

```
contracts/contracts/   Snitch, SnitchRooms, SnitchPass, SnitchWardrobe, SnitchPots
contracts/test/        55 tests on the FHEVM mock, each transaction checked against the HCU limits
contracts/chapters.json chapters 4-8, exported from the app so both sides play the same numbers
app/src/game/          rules, chapters, the practice table, the suspicion meter
app/src/chain/         Sepolia tables, sending, decryption, shop
app/src/story/         scenes, evidence files
app/src/world/         the 3D city and the job sets
app/functions/         Cloudflare Pages Function (the Pimlico proxy)
SPEC.md                the rules, line by line
STORY.md               the full script
```

## Principles we followed

- **Nothing secret in the clear, anywhere.** No `require`, `revert` or event depends on an encrypted value, so a failed transaction can't leak a role. Every handle gets explicit ACL grants.
- **Privacy by default, reveal on purpose.** A value becomes public only through `makePubliclyDecryptable`, and the contract only accepts it back with a KMS proof (`checkSignatures` against stored handles, in a fixed order).
- **One source of truth.** The contract decides; the client explains. Chapter tables are exported from one file to the other and a test fails if they drift.
- **Small, single-purpose pieces.** One handler per player action, one HUD component per job, one engine interface for every table.
- **Test the rules, not the pixels.** 55 contract tests (with HCU limits) and 44 app tests cover every chapter rule, task type and payment path.
- **Fail softly.** Every chain call has a timeout, a retry where it's safe, and a plain message when it fails. Moves are idempotent, so retrying never double-sends.

## Contracts (Sepolia, verified)

| Contract | Address |
|---|---|
| Snitch | [`0x783b0Fffe2162E7d558963A0DEB8526de4fDB5A0`](https://sepolia.etherscan.io/address/0x783b0Fffe2162E7d558963A0DEB8526de4fDB5A0#code) |
| SnitchRooms | [`0xE834cDE9324fEB2093E3f37a2D9fff84e53302F3`](https://sepolia.etherscan.io/address/0xE834cDE9324fEB2093E3f37a2D9fff84e53302F3#code) |
| SnitchPass | [`0x6970c6E0806F54FfF0b80dBfF63914E67f2c18e3`](https://sepolia.etherscan.io/address/0x6970c6E0806F54FfF0b80dBfF63914E67f2c18e3#code) |
| SnitchWardrobe | [`0x9E6a9e46Af57a8ae46DdbaFd1779F040cF9c914a`](https://sepolia.etherscan.io/address/0x9E6a9e46Af57a8ae46DdbaFd1779F040cF9c914a#code) |
| SnitchPots | [`0xba1A7644f68820D39Ea0569fdF6D1A7a297e1c96`](https://sepolia.etherscan.io/address/0xba1A7644f68820D39Ea0569fdF6D1A7a297e1c96#code) |
| cUSDTMock (Zama) | [`0x4E7B06D78965594eB5EF5414c357ca21E1554491`](https://sepolia.etherscan.io/address/0x4E7B06D78965594eB5EF5414c357ca21E1554491) |

How a confidential payment works: ERC-7984 transfers don't revert when you're short, they move an encrypted zero. So the shop pulls the price with `confidentialTransferFrom`, compares what arrived with the price (`FHE.eq`) and makes only that one bit public. The pass is minted once the KMS proof for that bit checks out. Room pots work the same way, and the winners split the pot minus 5%.

## Stack

Solidity 0.8.27, `@fhevm/solidity` 0.11, OpenZeppelin Contracts 5 and Confidential Contracts 0.5, Hardhat. React 19, Vite, three.js with react-three-fiber, Tailwind, zustand. viem 2, `@zama-fhe/sdk` 3.8, permissionless 0.5. Cloudflare Pages.

## Run it

```bash
cd contracts && npm ci && npm run test:snitch
cd app && pnpm install && pnpm dev
```

For gasless play locally, put the Pimlico key in `app/.env.local` (never committed):

```
PIMLICO_API_KEY=...
```

Deploy the site to Cloudflare Pages:

```bash
cd app
pnpm build
npx wrangler pages secret put PIMLICO_API_KEY --project-name snitch
npx wrangler pages deploy dist --project-name snitch
```

Contracts (testnet only):

```bash
cd contracts
npx hardhat vars set PRIVATE_KEY
npx hardhat vars set SEPOLIA_RPC_URL
npx hardhat vars set ETHERSCAN_API_KEY
npx hardhat deploy --network sepolia
cp abi/*.json ../app/src/chain/abi/
```

## Credits

Characters from MakeHuman/MPFB with Quaternius animations, props and textures from Poly Haven, vehicles from Gazebo/Open Robotics, all CC0. Music and sound are generated in the browser. Full list in `CREDITS.md`.
