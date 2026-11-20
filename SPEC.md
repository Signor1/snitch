# SNITCH — rules spec (v3)

One contract call = one player action. Solo game versus the contract. All hidden state is FHE-encrypted;
no require/revert/event may depend on an encrypted value.

> This project is not audited, endorsed or operated by Zama. Use at your own risk.

## Hidden state per run (per player)
- `snitch`: index of the informant, uniform in [0, crew).
- `skimmer` (only chapters with `hasSkimmer`): index != snitch, uniform over the others.
- `bag`: encrypted euint32 cash banked so far this run (starts 0).
- `heat`: encrypted euint8 (starts 0). heat >= 3 means raided: payout is 0.
- `caught`: encrypted bool, true once the snitch was accused.
Player may user-decrypt `bag`, `heat` and each action result (`tipped`, `seen`, `tapped`, `right`, `heard`).
Nothing else until the run ends.

## Plain state
`chapter`, `difficulty`, `job` (next job index), `out` (bitmask of members who left), `favors` left,
`wiretapUsed`, `rumourReady` (one free rumour after each job), `stage` (None, Playing, Ended, Settled), `run` counter.

## Jobs
Each job is `{ team, take, hot, dark, need, ban }`:
- `team`: exact team size. `take`: base take.
- `hot`: base take doubles, and a tipped job adds 2 heat instead of 1.
- `dark` (blackout): `tail` and `wiretap` revert `Blackout()` while this is the next job. Rumours and
  accusations still work.
- `need`: bitmask of members who must be on the team unless they are `out`.
- `ban`: bitmask of members who may not be on the team.
Members are seat indices 0..crew-1.

## Chapters (id from 1; the story prologue is off-chain)
Jobs as (team, take, modifiers):

| id | name | crew | jobs | total | skimmer | wiretap |
|---|---|---|---|---|---|---|
| 1 | The Corner | 5 | (2, $1,000) · (2, $2,500, need 0) · (3, $4,500, need 1) · (3, $6,000) · (3, $9,000, ban 2) · (4, $15,000, need 1) | $38,000 | no | no |
| 2 | Uptown | 6 | (2, $2,000, ban 2) · (3, $5,000, dark) · (3, $7,000) · (3, $12,000, hot) · (3, $9,000, need 5) · (4, $15,000) · (4, $30,000, need 1) | $92,000 | no | yes |
| 3 | The Docks | 6 | (2, $4,000) · (3, $10,000, ban 4) · (3, $14,000) · (4, $25,000, dark) · (3, $9,000, hot) · (4, $20,000) · (4, $60,000, hot) | $211,000 | yes | yes |

Chapter `total` = sum of take x (hot ? 2 : 1). The last job of a chapter is the boss job.
Owner can add chapters: `addChapter(name, crew, teams[], takes[], flags[] (bit0 hot, bit1 dark), needs[], bans[],
hasSkimmer, hasWiretap)`; arrays of equal length, at most 8 jobs, 0 < team < crew, need/ban only seats < crew and
disjoint, at most `team` required members, enough members not banned, total <= 250,000,000 (so the worst bag,
total x 2.5 x 2 x 3, fits euint32).

## Difficulty
| id | name | favors | tail / rumour is wrong | base rung (client) | score multiplier |
|---|---|---|---|---|---|
| 0 | Street | 3 | 1/8 | 1 | x1 |
| 1 | Made | 2 | 1/4 | 1 | x2 |
| 2 | Kingpin | 1 | 1/4 | 2 | x3 |
All probabilities are powers of two (FHE random with power-of-two bound). The base rung is the client's starting
point for a plan; the contract does not enforce it.

## The plan (client-side, public)
Scouting, roles, in-job choices and the hands-on score are computed client-side and sent with `runJob` as two
public numbers, both emitted in `JobRun` so anyone can audit a run:
- `rung` 0..3: bad luck has probability 1 / (16 >> rung), i.e. 1/16, 1/8, 1/4, 1/2.
- `takeBps` 2000..25000: share of the base take in basis points. Greed rule: `takeBps <= 15000 + 5000 x rung`.
Violations revert `BadPlan()`.

## Actions
- `start(chapter, difficulty)`: draws the roles, resets everything. Replaces any run in progress.
- `runJob(teamMask, rung, takeBps)`: team must be exactly the job's team size, only members not `out`, every
  `need` member still in the crew, no `ban` member, a valid plan, stage Playing, jobs remaining. Hidden resolution:
  - `snitchOn` = snitch is on the team and not caught.
  - `tipped` = (snitchOn AND tips) OR badLuck, where tips has probability 3/4 and badLuck 1 / (16 >> rung).
  - gain = base x takeBps / 10000 (plaintext, base = take x (hot ? 2 : 1)), halved if the skimmer is on the team.
  - if tipped: heat += hot ? 2 : 1, no cash. else: bag += gain.
  - Result `tipped` (ebool) readable by the player. `job` += 1, `rumourReady` = true.
- `tail(member)`: costs 1 favor. Returns ebool "seen with a cop" = isSnitch XOR wrong (per difficulty).
  Reverts `Blackout()` while the next job is dark.
- `rumour(member)`: free, once after each job (`NoRumour()` otherwise, also before the first job), member not out.
  Same answer and error rate as `tail`. Allowed before a dark job.
- `wiretap(pairMask)`: exactly two members, once per run, only chapters with wiretap. Returns exact ebool
  "the snitch is one of these two". Does not cost a favor. Reverts `Blackout()` while the next job is dark.
- `accuse(member)`: member leaves the crew either way (`out`). If it was a snitch: its bit is cleared (it never
  tips again), and the bag doubles if no snitch was caught before; caught = true. If not: heat += 1. Returns ebool
  `right` readable by the player.
- `walkAway()`: ends the run at any time (also used after the boss job or a raid). Computes
  payout = heat >= 3 ? 0 : bag * multiplier, and makes payout, snitch, heat, skimmer and second
  publicly decryptable (see "The reveal" below). Stage Ended.
- `settle(player, clears, proof)`: anyone relays the KMS proof against the stored handles; records
  best payout per chapter, stars and total. Stage Settled. Runs once.

## Stars (per chapter, from payout before the multiplier, i.e. the bag)
total = sum of take x (hot ? 2 : 1) over the chapter. 1 star: bag > 0. 2 stars: bag >= 40% of total.
3 stars: bag >= total (a clean sweep at full take, a greedy plan, or catching the snitch).
A chapter unlocks when the previous one has >= 1 star.

## Chapter rules (v3)
Chapters 4–8 are added by the deploy script with `addChapter(..., rules, recruitAt)` from `contracts/chapters.json`,
which `app/scripts/export-chapters.ts` writes from the game's own tables (so the app and the contract play the same
numbers). Rules are flags, all drawn with FHE randomness and kept encrypted:

| flag | name | what it does |
|---|---|---|
| 1 | `RULE_TWO` | Two snitches, the second uniform over the others. Both tip. Catching the first doubles the bag once; the other keeps talking |
| 2 | `RULE_RECRUIT` | When job `recruitAt` starts, a snitch still at large turns a second member, uniform over the members still in the crew. A caught snitch recruits nobody |
| 4 | `RULE_OUTSIDE` | Half the time nobody at the table is a snitch: every accusation is wrong, and only bad luck brings the police |
| 8 | `RULE_ALLIN` | Police on the last job is a raid (heat raised to at least 3), whatever the heat was |

`addChapter` rejects a second snitch (drawn or recruited) in a chapter with a skimmer, both of `RULE_TWO` and
`RULE_RECRUIT`, and a `recruitAt` outside 1..jobs-1 (or set without the rule).

| id | name | crew | jobs | total | skimmer | wiretap | rule |
|---|---|---|---|---|---|---|---|
| 4 | Two Wires | 7 | 7 | $121,000 | no | yes | two snitches |
| 5 | The Turn | 7 | 7 | $166,000 | no | yes | recruit at job 4 |
| 6 | Blood Money | 7 | 7 | $149,000 | yes | yes | (loyalty: client only) |
| 7 | Ash | 8 | 8 | $190,000 | yes | yes | outside man |
| 8 | Solace | 8 | 8 | $286,000 | no | yes | all-in |

**The reveal (v3).** `walkAway` makes five values public, and `settle` checks the KMS proof against them in this
order: `payout, snitch, heat, skimmer, second`, i.e. `clears = abi.encode(uint32, uint8, uint8, uint8, uint8)`.
255 (`NO_SNITCH`) stands for a role that does not exist: no skimmer, no second snitch, or (outside man) nobody at the
table. "Nobody" is computed (`x OR 255`), not a plain constant, so it is an ordinary ciphertext the KMS can sign.

## The shop (Sepolia: `SnitchPass`, `SnitchWardrobe`, `SnitchPots`)
Money is a confidential dollar: Zama's `cUSDTMock` (ERC-7984, 6 decimals) from the protocol registry, which wraps
a test USDT anyone can mint. A payer first makes the shop contract an operator on the token (`setOperator`).

- **A confidential payment.** The contract pulls a public price with `confidentialTransferFrom(payer, this, price)`.
  An ERC-7984 transfer the payer can't afford moves an encrypted zero instead of reverting, so the contract gets
  back only what moved. It computes `ok = (moved == price)`, makes that one bit publicly decryptable, and records
  the payment only when it is relayed with the KMS proof. Nobody learns the payer's balance; a failed payment moved
  nothing.
- **Boss Pass** (`SnitchPass`, ERC-721, $4.99 a season). `buy()` then `claim(order, clears, proof)` mints the pass.
  One per player per season; the pass is the player's boss identity, so it can't be transferred. The owner sets the
  price, opens the next season and withdraws the takings (the amount stays encrypted).
- **Wardrobe** (`SnitchWardrobe`, ERC-1155). Cosmetics are earned, not bought: item `id` unlocks at
  `starsFor[id]` stars of `Snitch.totalStars` (recorded by `settle` against a KMS proof). One of each per player;
  tradable. Items: Gold chain (3 stars), Fedora (8), Neon jacket (15), Echo's lighter (24).
- **Room pots** (`SnitchPots`). The host of an open room sets a buy-in; the host and seated players pay it before
  the start (`pay`, then `confirm` with the proof). After `SnitchRooms.settle`, the winners split the pot minus a 5%
  rake (`claim`): on a crew win the host and the human seats except the snitch's, on a snitch win the human in the
  snitch seat. Only winners who paid share; if none did (a computer snitch won), every payer gets their buy-in back
  minus the rake. Claims wait until every payment is confirmed, so shares can't change after the first claim.

## Rooms (multiplayer, `SnitchRooms`)
A separate contract deployed next to `Snitch`; it reads the chapter tables (`chapterOf`) and the difficulty table
(`difficultyOf`) from it and caches them. No chapter unlock is needed in rooms; the skimmer is not used.

- **Lobby.** `createRoom(chapter, difficulty)` opens a room (ids from 1); the caller is the host (the boss) and never
  takes a seat. Before the start, players `join(id, seat)` an empty seat below the crew size (one seat per address
  per room) and may `leave(id)`. Seats nobody takes are computer players.
- **Start.** `startRoom(id)` (host, once) locks the seats and draws the snitch seat uniformly over the crew
  (`rem(rand16, crew)`). Each human seat gets an encrypted `mine` = "I am the snitch", readable by that player only
  (`myRole(id)`). Bag and heat start at 0, readable by the host and every human player. Favors per difficulty go to
  the host.
- **Jobs.** `propose(id, team, rung, takeBps)` (host, no job pending): same team and plan rules as `runJob`
  (`BadTeam`, `BadPlan`). Every human on the team must then `seal(id, word, proof)` an encrypted bool (true = tip the
  police). The contract keeps only `mine AND word`, so a loyal player's word is ignored and sending a seal reveals
  nothing. `resolve(id)` (host) runs once every human on the team sealed, or after `SEAL_TIMEOUT` = 10 minutes
  (missing words count as no tip):
  - `talk` = OR of the sealed words, OR (a computer seat on the team is the snitch AND tips, 3/4).
  - `tipped` = (`talk` AND NOT caught) OR bad luck (1 / (16 >> rung)).
  - gain, bag and heat exactly as in the solo game. `tipped`, bag and heat are readable by the host and every human.
- **Host tools.** `tail(id, seat)` (a favor, answer to the host only, wrong 1/tailWrongBound), `wiretap(id, pair)`
  (once, chapters with a wiretap, exact, host only), both blocked before a dark job (`Blackout`).
  `accuse(id, seat)` (no job pending): the seat leaves the crew; right doubles the bag (once: the snitch mask is
  cleared) and sets `caught`, so the snitch's words and tips no longer count; wrong adds 1 heat. `right` is readable
  by the host and every human.
- **End.** `walkAway(id)` (host): payout = heat >= 3 ? 0 : bag x multiplier; payout, snitch seat and heat become
  publicly decryptable. `settle(id, clears, proof)` (anyone, once) checks the KMS proof against the stored handles
  in the order payout, snitch, heat; `clears = abi.encode(uint32 payout, uint8 snitch, uint8 heat)`.
- **Who wins.** The snitch side wins when the crew was raided (heat >= 3) or the bag (payout / multiplier, catch
  bonus included) is under 40% of the chapter total (the two-star line of the solo game). Otherwise the crew wins.
  `caught` is not revealed: a catch already shows in the doubled bag. Crew win: `crewWins` +1 for the host and every
  human player except the snitch seat. Snitch win: `snitchWins` +1 for the human in the snitch seat (a computer
  snitch's win credits nobody).
- **Visibility.** Public: seats, teams, plans, who sealed, timings, the final payout, snitch seat and heat. Per player:
  own role. Host and players: job results, bag, heat, accusation results. Host only: tails and the wiretap.
