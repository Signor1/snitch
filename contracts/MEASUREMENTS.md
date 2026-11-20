# Snitch v2 - measurements

Source: `npm run test:snitch` (mock FHEVM, `fhevm.computeTransactionHCU(receipt)`), solc 0.8.27, optimizer 800 runs,
`@fhevm/solidity` 0.11. Every action transaction in the suite (about 1,700 per run, 30 tests) is asserted under the
protocol limits: **20M HCU per transaction** and **5M HCU sequential depth**. The table is the worst case seen for each
action.

| action                                | FHE work                                                       | HCU    | depth  | gas    |
| ------------------------------------- | -------------------------------------------------------------- | ------ | ------ | ------ |
| `start` (snitch only, chapters 1-2)   | rand16, rem, cast, shl                                         | 0.728M | 0.728M | 0.479M |
| `start` (snitch + skimmer, chapter 3) | 2 x (rand16, rem, cast, shl), ge, add, select                  | 1.658M | 0.867M | 0.437M |
| `runJob`                              | and, ne, 2 bounded rand8, ne, eq, and, or, select, cast, 2 add | 0.559M | 0.315M | 0.400M |
| `runJob` (hot job)                    | as above + shl (2 heat when tipped)                            | 0.591M | 0.315M | 0.393M |
| `runJob` (skimmer chapter)            | as `runJob` + and, ne, select                                  | 0.700M | 0.321M | 0.442M |
| `runJob` (skimmer chapter, hot job)   | as above + shl                                                 | 0.732M | 0.321M | 0.437M |
| `tail`                                | and, ne, bounded rand8, eq, xor                                | 0.186M | 0.108M | 0.188M |
| `rumour`                              | and, ne, bounded rand8, eq, xor                                | 0.186M | 0.108M | 0.182M |
| `wiretap`                             | and, ne                                                        | 0.086M | 0.086M | 0.153M |
| `accuse`                              | and, ne, shl, select, not, add, or, and                        | 0.316M | 0.174M | 0.403M |
| `walkAway` (Street, x1)               | ge, select                                                     | 0.107M | 0.107M | 0.254M |
| `walkAway` (Made x2 / Kingpin x3)     | ge, mul, select                                                | 0.372M | 0.320M | 0.264M |
| `settle` (3 handles)                  | none (KMS signature check)                                     | 0      | 0      | 0.244M |
| `settle` (4 handles, skimmer chapter) | none (KMS signature check)                                     | 0      | 0      | 0.196M |

The plan (`rung`, `takeBps`) costs no HCU: the gain is computed in plaintext and the bad-luck draw only changes the
power-of-two bound of the same `randEuint8`. The heaviest transaction (`start` with a skimmer) uses 8.3% of the HCU
limit and 17% of the depth limit. Gas is the worst case and includes first-time storage writes; the first `start` of a
player is the most expensive.

A full seven-job run on chapter 3 (three of them hot) with seven rumours, three tails, one wiretap and one accusation
costs about 1.66 + 4 x 0.70 + 3 x 0.73 + 7 x 0.19 + 3 x 0.19 + 0.09 + 0.32 + 0.37 = 9.3M HCU over 24 transactions.

## Randomness check (one sample run of the suite)

50 runs of chapter 1 on Street (rung 1 on every job, one rumour after each job):

| measure                            | observed            | expected               |
| ---------------------------------- | ------------------- | ---------------------- |
| job tipped, snitch on the team     | 127/161 = 0.79      | 3/4 + 1/4 x 1/8 = 0.78 |
| job tipped, snitch not on the team | 22/139 = 0.16       | 1/8 = 0.125            |
| tail tells the truth               | 128/150 = 0.85      | 7/8 = 0.875            |
| rumour tells the truth             | 259/300 = 0.86      | 7/8 = 0.875            |
| snitch index 0..4                  | 9 / 7 / 12 / 7 / 15 | 10 each                |

30 runs of chapter 1 on Street, rung alternating 0 / 3, jobs without the snitch only (pure bad luck):

| rung | observed     | expected      |
| ---- | ------------ | ------------- |
| 0    | 3/32 = 0.09  | 1/16 = 0.0625 |
| 3    | 22/36 = 0.61 | 1/2           |

## SnitchRooms (multiplayer) - measurements

Source: `npm run test:rooms` (same setup: mock FHEVM, `fhevm.computeTransactionHCU(receipt)`, every labelled transaction
asserted under 20M HCU and 5M depth). Worst case seen per action, rooms of up to five human seats.

| action          | FHE work                                                                   | HCU    | depth  | gas    |
| --------------- | -------------------------------------------------------------------------- | ------ | ------ | ------ |
| `createRoom`    | none (first room of a chapter caches its table from `Snitch`)              | 0      | 0      | 0.316M |
| `startRoom`     | rand16, rem, cast, shl, trivial bag/heat/caught + one `eq` per human       | 1.003M | 0.728M | 0.978M |
| `propose`       | trivial `false` for the pending tip                                        | 0      | 0      | 0.110M |
| `seal`          | fromExternal, and, or                                                      | 0.049M | 0.049M | 0.191M |
| `resolve`       | and, ne, 2 bounded rand8, ne, eq, and, or, not, and, or, select, cast, add | 0.608M | 0.364M | 0.772M |
| `resolve` (hot) | as above + shl                                                             | 0.616M | 0.340M | 0.493M |
| `tail`          | and, ne, bounded rand8, eq, xor                                            | 0.186M | 0.108M | 0.186M |
| `wiretap`       | and, ne                                                                    | 0.086M | 0.086M | 0.153M |
| `accuse`        | and, ne, shl, select, not, add, or, and                                    | 0.316M | 0.174M | 0.805M |
| `walkAway`      | ge, (mul), select                                                          | 0.372M | 0.320M | 0.228M |
| `settle`        | none (KMS signature check against payout, snitch, heat)                    | 0      | 0      | -      |

`startRoom` grows by one `eq` (about 0.05M HCU) per human seat; a full 16-seat crew stays near 1.6M. Gas includes the
ACL grants to the host and every human player on each shared result, so `resolve` and `accuse` grow with the number of
players. A full chapter-1 room (six jobs, every job sealed by two humans, one tail, one accusation) costs about 1.0 + 6
x 0.61 + 12 x 0.05 + 0.19 + 0.32 + 0.37 = 6.1M HCU.

## v3 (chapter rules), 2026-11-19

Source: `npm run test:rules` (mock FHEVM), worst case per action. All under the limits (20M HCU, 5M depth).

| action | what changed | HCU | depth | gas |
| --- | --- | --- | --- | --- |
| `start`, Chapter 4 (two snitches) | + rand16, rem, cast, ge, add, select, shl, or | 1.749M | 0.928M | 0.446M |
| `start`, Chapter 7 (outside man + skimmer) | + randEbool, 2 select | 1.817M | 0.867M | 0.495M |
| `runJob`, Chapter 5 at the recruit job | + rank of the snitch among present seats (gt, add per seat), rand16, rem, ge, select, k-th seat (eq, select per seat), ne, select, shl, or | 3.436M | 1.752M | 1.038M |
| `runJob`, Chapter 8 last part (all-in) | + max, select | 0.735M | 0.399M | 0.416M |
| `settle` | five handles (payout, snitch, heat, skimmer, second) | 0 | 0 | 0.251M |

Every other action costs what it did in v2. On Sepolia: deploy `Snitch` v3 34.3M gas, `SnitchRooms` 28.1M gas.
