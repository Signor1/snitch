export type Difficulty = 0 | 1 | 2;

/** Model names loaded by the world's Character component. */
export type Body = "gang_m1" | "gang_m2" | "gang_m3" | "gang_f1" | "gang_f2" | "gang_f3" | "boss" | "boss_widow" | "boss_kid" | "boss_ghost" | "cop_m" | "cop_f";

export type Skill = "Driver" | "Safecracker" | "Muscle" | "Hacker" | "Lookout" | "Inside";

export interface Person {
  key: PersonKey;
  name: string;
  role: Skill;
  line: string;
  model: Body;
}

/** `id` is the seat, 0..crew-1, the index the contract uses. */
export interface Member extends Person {
  id: number;
}

export type PersonKey = "vex" | "mara" | "dutch" | "pixel" | "sable" | "rook" | "juno" | "ash" | "gage" | "lola";

export const PEOPLE: Record<PersonKey, Person> = {
  vex: { key: "vex", name: "Vex", role: "Driver", line: "Never been caught. Never been asked how.", model: "gang_m1" },
  mara: { key: "mara", name: "Mara", role: "Safecracker", line: "Opens anything. Says almost nothing.", model: "gang_f1" },
  dutch: { key: "dutch", name: "Dutch", role: "Muscle", line: "Loyal to whoever paid last, he jokes.", model: "gang_m2" },
  pixel: { key: "pixel", name: "Pixel", role: "Hacker", line: "Always on a phone. Always.", model: "gang_f2" },
  sable: { key: "sable", name: "Sable", role: "Lookout", line: "Sees everything. Tells you most of it.", model: "gang_f3" },
  rook: { key: "rook", name: "Rook", role: "Inside", line: "Three passports. Which one is real?", model: "gang_m3" },
  juno: { key: "juno", name: "Juno", role: "Inside", line: "Knows a guy at every bank. Was there the night Ash died.", model: "boss_widow" },
  ash: { key: "ash", name: "Ash", role: "Driver", line: "Your partner. Ten years ago.", model: "boss_kid" },
  gage: { key: "gage", name: "Gage", role: "Muscle", line: "Big hands. Bigger debts.", model: "gang_m3" },
  lola: { key: "lola", name: "Lola", role: "Lookout", line: "Counts every car that passes twice.", model: "gang_f3" },
};

export const castOf = (c: Chapter): Member[] => c.cast.map((k, id) => ({ ...PEOPLE[k], id }));

/** The job's special rule. Members are given as seats. */
export type Task =
  | { kind: "plain" }
  | { kind: "need"; member: number }
  | { kind: "ban"; member: number }
  | { kind: "dark" }
  | { kind: "hot" }
  | { kind: "rush"; seconds: number };

/** Decides the set, the action and the hands-on task. */
export type Target = "safe" | "cases" | "table" | "vault";

export type Venue = "pawn" | "jewel" | "cards" | "bank" | "dock" | "casino" | "church" | "tunnel" | "mint";

export interface Job {
  name: string;
  /** One role per seat: team size is roles.length. */
  roles: Skill[];
  take: number;
  task: Task;
  target: Target;
  venue: Venue;
  /** Keys into EVENTS. */
  beats: [string, string];
  about: string;
  /** Key into SCENES. */
  after?: string;
  /** Last job of the chapter. */
  boss?: boolean;
  /** Story-forced outcome (the prologue's harbour raid). */
  forced?: "tipped";
}

export const teamSize = (j: Job) => j.roles.length;

const P: Task = { kind: "plain" };

export function taskCopy(t: Task, crew: Member[]): { title: string; body: string } {
  const who = (m: number) => crew[m] ?? PEOPLE.vex;
  switch (t.kind) {
    case "need":
      return { title: `Needs ${who(t.member).name}`, body: `Only your ${who(t.member).role.toLowerCase()} can do this one. ${who(t.member).name} must be on the team.` };
    case "ban":
      return { title: `${who(t.member).name} sits out`, body: `${who(t.member).name} is known at this address. Leave them behind.` };
    case "dark":
      return { title: "Blackout", body: "Phones are off tonight. No tails, no wiretap, no suspicion meter until this job is done." };
    case "hot":
      return { title: "Hot goods", body: "Pays double. But if the police show up, it counts as two heat." };
    case "rush":
      return { title: "The window is closing", body: `You have ${t.seconds} seconds to pick the team, or the crew picks for you.` };
    default:
      return { title: "Smash and grab", body: "In and out." };
  }
}

export const jobTake = (j: Job) => (j.task.kind === "hot" ? j.take * 2 : j.take);

/** Default: one snitch, drawn at the start. */
export interface Rules {
  /** Catching one doubles the bag once; the other keeps talking. */
  snitches?: 1 | 2;
  /** Job index where the snitch secretly turns a second member, unless caught first. */
  recruitAt?: number;
  /** Half the time there is no snitch at the table: tips come from outside. */
  outside?: boolean;
  /** Wrong accusations and police nights lower loyalty; too low and someone walks. */
  loyalty?: boolean;
  /** Police on the last part is a raid, whatever the heat. */
  allIn?: boolean;
}

export interface Chapter {
  /** 0 is the prologue. */
  id: number;
  name: string;
  tagline: string;
  /** Seat order. */
  cast: PersonKey[];
  jobs: Job[];
  skimmer: boolean;
  wiretap: boolean;
  intro: string;
  outro: string;
  twist?: string;
  rules?: Rules;
  open: boolean;
  /** Story run with no reveal at the end. */
  prologue?: boolean;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 0,
    name: "The Harbour",
    tagline: "Ten years ago. You, Ash, and three others. Someone already talked.",
    cast: ["ash", "juno", "gage", "lola"],
    jobs: [
      { name: "Corner store", roles: ["Muscle", "Driver"], take: 800, task: P, target: "table", venue: "pawn", beats: ["patrol", "clerk"], about: "Marsh Street. The owner keeps the week's cash under the register.", after: "p_after1" },
      { name: "Bookmaker", roles: ["Lookout", "Inside"], take: 2400, task: P, target: "table", venue: "cards", beats: ["drunk", "backdoor"], about: "Saturday's bets, still in the drawer on Sunday morning.", after: "p_after2" },
      { name: "The Harbour", roles: ["Driver", "Muscle", "Inside"], take: 200000, task: P, target: "vault", venue: "dock", beats: ["floodlight", "radio"], about: "Container eleven. Two hundred grand in watches. One guard who owes Juno.", boss: true, forced: "tipped" },
    ],
    skimmer: false,
    wiretap: false,
    intro: "p_intro",
    outro: "p_outro",
    open: true,
    prologue: true,
  },
  {
    id: 1,
    name: "The Corner",
    tagline: "Small jobs to rebuild. Five faces. One is wearing a wire.",
    cast: ["vex", "mara", "dutch", "pixel", "sable"],
    jobs: [
      { name: "Pawn shop", roles: ["Muscle", "Driver"], take: 1000, task: P, target: "cases", venue: "pawn", beats: ["patrol", "clerk"], about: "Benny's Pawn on Coal Street. Gold in the cases, Benny asleep in the back.", after: "c1_after1" },
      { name: "Card room", roles: ["Lookout", "Driver"], take: 2500, task: { kind: "need", member: 0 }, target: "table", venue: "cards", beats: ["drunk", "backdoor"], about: "A private game above the noodle bar. The pot sits on the table till dawn.", after: "c1_after2" },
      { name: "Bookie's office", roles: ["Safecracker", "Lookout", "Driver"], take: 4500, task: { kind: "need", member: 1 }, target: "safe", venue: "cards", beats: ["dog", "creak"], about: "Fat Lou's back office. One safe, one old lock, one guard dog.", after: "c1_after3" },
      { name: "Jeweller", roles: ["Inside", "Muscle", "Lookout"], take: 6000, task: { kind: "rush", seconds: 25 }, target: "cases", venue: "jewel", beats: ["patrol", "alarm"], about: "Halvorsen & Daughters. The shutters come down in twenty-five seconds.", after: "c1_after4" },
      { name: "Gold exchange", roles: ["Muscle", "Hacker", "Driver"], take: 9000, task: { kind: "ban", member: 2 }, target: "cases", venue: "pawn", beats: ["camera", "clerk"], about: "Cash for gold, no questions. Dutch owes the owner money, so he stays home.", after: "c1_after5" },
      { name: "Night deposit", roles: ["Safecracker", "Hacker", "Lookout", "Driver"], take: 15000, task: { kind: "need", member: 1 }, target: "safe", venue: "bank", beats: ["floodlight", "radio"], about: "Ferry Street bank. Every shop on the corner drops its takings here at night.", boss: true },
    ],
    skimmer: false,
    wiretap: false,
    intro: "c1_intro",
    outro: "c1_outro",
    twist: "New: give each person a role. The right skill in the right seat pays more.",
    open: true,
  },
  {
    id: 2,
    name: "Uptown",
    tagline: "Bigger doors. A bigger crew. And a wiretap of your own.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno"],
    jobs: [
      { name: "Gallery", roles: ["Inside", "Lookout"], take: 2000, task: { kind: "ban", member: 2 }, target: "cases", venue: "jewel", beats: ["camera", "alarm"], about: "A private gallery. The cases hold what the paintings paid for. The owner knows Dutch's face.", after: "c2_after1" },
      { name: "Penthouse", roles: ["Safecracker", "Hacker", "Lookout"], take: 5000, task: { kind: "dark" }, target: "safe", venue: "cards", beats: ["creak", "radio"], about: "A banker's penthouse. He's at the opera. His safe isn't. Phones off tonight.", after: "c2_after2" },
      { name: "Wine cellar", roles: ["Muscle", "Driver", "Inside"], take: 7000, task: { kind: "plain" }, target: "cases", venue: "dock", beats: ["dog", "creak"], about: "Under the Hotel Meridian: crates of wine worth more than the hotel.", after: "c2_after3" },
      { name: "Auction house", roles: ["Inside", "Muscle", "Driver"], take: 12000, task: { kind: "hot" }, target: "table", venue: "cards", beats: ["drunk", "backdoor"], about: "The night before the sale, the deposits sit on the counting table. Hot money.", after: "c2_after4" },
      { name: "Tailor's back room", roles: ["Safecracker", "Lookout", "Inside"], take: 9000, task: { kind: "need", member: 5 }, target: "safe", venue: "pawn", beats: ["clerk", "camera"], about: "Moretti & Sons, tailors to the rich. The safe is behind the mirrors. Only Juno knows which one.", after: "c2_after5" },
      { name: "Private club", roles: ["Lookout", "Inside", "Muscle", "Driver"], take: 15000, task: { kind: "rush", seconds: 25 }, target: "table", venue: "cards", beats: ["drunk", "alarm"], about: "The Orchid Club. Members only. The card table closes at two, sharp.", after: "c2_after6" },
      { name: "Private bank", roles: ["Safecracker", "Hacker", "Inside", "Driver"], take: 30000, task: { kind: "need", member: 1 }, target: "vault", venue: "bank", beats: ["floodlight", "alarm"], about: "Ostrander Private. The vault door weighs four tonnes. Mara has to open it.", boss: true },
    ],
    skimmer: false,
    wiretap: true,
    intro: "c2_intro",
    outro: "c2_outro",
    twist: "New tool: the wiretap. Pick two people. It tells you, for certain, if the snitch is one of them.",
    open: true,
  },
  {
    id: 3,
    name: "The Docks",
    tagline: "Someone is talking. Someone else is stealing.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno"],
    jobs: [
      { name: "Customs shed", roles: ["Inside", "Driver"], take: 4000, task: { kind: "rush", seconds: 20 }, target: "table", venue: "dock", beats: ["floodlight", "dog"], about: "Seized cash, counted twice a day. Tonight it's counted once.", after: "c3_after1" },
      { name: "Container nine", roles: ["Muscle", "Lookout", "Driver"], take: 10000, task: { kind: "ban", member: 4 }, target: "cases", venue: "dock", beats: ["radio", "creak"], about: "A container that isn't on any manifest. The guards know Sable from the old days.", after: "c3_after2" },
      { name: "Fuel depot", roles: ["Safecracker", "Muscle", "Driver"], take: 14000, task: { kind: "plain" }, target: "safe", venue: "dock", beats: ["dog", "floodlight"], about: "The depot pays its drivers in cash. The cash sleeps in an old safe by the pumps.", after: "c3_after3" },
      { name: "Harbour office", roles: ["Safecracker", "Hacker", "Lookout", "Driver"], take: 25000, task: { kind: "dark" }, target: "safe", venue: "dock", beats: ["camera", "dog"], about: "The harbour master keeps the bribes in his own safe. Phones off tonight.", after: "c3_after4" },
      { name: "Fish market", roles: ["Inside", "Muscle", "Lookout"], take: 9000, task: { kind: "hot" }, target: "table", venue: "dock", beats: ["creak", "radio"], about: "The cold store. The wholesalers settle up in cash at four in the morning. Hot money.", after: "c3_after5" },
      { name: "Crane yard", roles: ["Muscle", "Lookout", "Hacker", "Driver"], take: 20000, task: { kind: "rush", seconds: 20 }, target: "cases", venue: "dock", beats: ["floodlight", "radio"], about: "A crate the size of a car, swinging from a crane that stops at the shift change.", after: "c3_after6" },
      { name: "The freighter", roles: ["Safecracker", "Muscle", "Inside", "Driver"], take: 60000, task: { kind: "hot" }, target: "vault", venue: "dock", beats: ["floodlight", "radio"], about: "The Lisbeth Mae. Her strongroom sails at dawn.", boss: true },
    ],
    skimmer: true,
    wiretap: true,
    intro: "c3_intro",
    outro: "c3_outro",
    twist: "New trouble: the skimmer. When they are on a clean job, half the cash goes missing.",
    open: true,
  },
  {
    id: 4,
    name: "Two Wires",
    tagline: "Hale turned two of them.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno", "rook"],
    jobs: [
      { name: "Armoured van depot", roles: ["Driver", "Muscle"], take: 3000, task: P, target: "table", venue: "bank", beats: ["camera", "backdoor"], about: "Where the cash vans sleep. The night shift counts the float on a trestle table.", after: "c4_after1" },
      { name: "Casino cage", roles: ["Inside", "Hacker", "Lookout"], take: 8000, task: P, target: "table", venue: "casino", beats: ["drunk", "camera"], about: "The Golden Anchor's cash cage. Chips in, cash out, and a pit boss who owes Juno.", after: "c4_after2" },
      { name: "Evidence locker", roles: ["Safecracker", "Hacker", "Lookout"], take: 10000, task: { kind: "dark" }, target: "safe", venue: "bank", beats: ["creak", "alarm"], about: "Rob the police. Seized cash, and the original harbour raid tape. Phones off tonight.", after: "c4_after3" },
      { name: "Bus depot payroll", roles: ["Safecracker", "Muscle", "Driver"], take: 12000, task: { kind: "need", member: 1 }, target: "safe", venue: "dock", beats: ["dog", "floodlight"], about: "Two hundred drivers paid in cash on Friday. The safe is older than Mara.", after: "c4_after4" },
      { name: "Racetrack bookies", roles: ["Inside", "Lookout", "Driver"], take: 9000, task: { kind: "hot" }, target: "table", venue: "cards", beats: ["drunk", "radio"], about: "Saturday's book at Solace Downs. Hot money: the owners are not nice people.", after: "c4_after5" },
      { name: "Diamond courier", roles: ["Muscle", "Lookout", "Driver", "Inside"], take: 20000, task: { kind: "ban", member: 5 }, target: "cases", venue: "jewel", beats: ["patrol", "alarm"], about: "A courier's drop at Halvorsen's. The courier knows Juno: she stays out.", after: "c4_after6" },
      { name: "Casino vault", roles: ["Safecracker", "Hacker", "Inside", "Muscle", "Driver"], take: 50000, task: { kind: "need", member: 1 }, target: "vault", venue: "casino", beats: ["floodlight", "alarm"], about: "Under the Golden Anchor. Five of you, one vault, two wires somewhere in the room.", boss: true },
    ],
    skimmer: false,
    wiretap: true,
    intro: "c4_intro",
    outro: "c4_outro",
    twist: "New: TWO snitches. Catch one and the bag doubles, but the other is still talking.",
    rules: { snitches: 2 },
    open: true,
  },
  {
    id: 5,
    name: "The Turn",
    tagline: "The snitch is recruiting.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno", "rook"],
    jobs: [
      { name: "Pharmacy warehouse", roles: ["Muscle", "Driver"], take: 5000, task: P, target: "cases", venue: "dock", beats: ["dog", "radio"], about: "Crates of pills that never reached a chemist. Somebody will pay for them.", after: "c5_after1" },
      { name: "Jewellery fair", roles: ["Inside", "Lookout", "Muscle"], take: 11000, task: P, target: "cases", venue: "jewel", beats: ["camera", "clerk"], about: "Twenty dealers, one hall, one night guard who loves the radio.", after: "c5_after2" },
      { name: "Art restorer", roles: ["Safecracker", "Inside", "Lookout"], take: 13000, task: { kind: "dark" }, target: "safe", venue: "jewel", beats: ["creak", "alarm"], about: "Pieces sent for cleaning, and the cash that pays for silence. Phones off.", after: "c5_after3" },
      { name: "Ferry ticket office", roles: ["Inside", "Driver", "Hacker"], take: 9000, task: { kind: "rush", seconds: 20 }, target: "table", venue: "dock", beats: ["floodlight", "backdoor"], about: "The last ferry's takings, counted before the night boat leaves.", after: "c5_after4" },
      { name: "Gold refinery", roles: ["Safecracker", "Muscle", "Hacker", "Driver"], take: 25000, task: { kind: "hot" }, target: "safe", venue: "mint", beats: ["alarm", "radio"], about: "Bars still warm from the mould. Hot: everyone in the city will want them back.", after: "c5_after5" },
      { name: "Mayor's fundraiser", roles: ["Inside", "Lookout", "Muscle"], take: 18000, task: { kind: "need", member: 5 }, target: "table", venue: "cards", beats: ["drunk", "camera"], about: "Envelopes for the re-election. Juno is on the guest list, so Juno goes in.", after: "c5_after6" },
      { name: "City treasury van", roles: ["Safecracker", "Hacker", "Muscle", "Driver", "Lookout"], take: 60000, task: P, target: "vault", venue: "bank", beats: ["floodlight", "radio"], about: "The treasury moves its cash once a month. Tonight it stops at a depot it doesn't know is yours.", boss: true },
    ],
    skimmer: false,
    wiretap: true,
    intro: "c5_intro",
    outro: "c5_outro",
    twist: "New: the snitch recruits. Not caught by job 4, and a second member turns, in secret. Be fast.",
    rules: { recruitAt: 3 },
    open: true,
  },
  {
    id: 6,
    name: "Blood Money",
    tagline: "The crew starts asking questions about you.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno", "rook"],
    jobs: [
      { name: "Loan shark's office", roles: ["Safecracker", "Muscle"], take: 6000, task: P, target: "safe", venue: "pawn", beats: ["clerk", "creak"], about: "Mr Feeney lends at forty percent. His safe is full of other people's rent.", after: "c6_after1" },
      { name: "Chop shop", roles: ["Muscle", "Driver", "Hacker"], take: 9000, task: P, target: "cases", venue: "dock", beats: ["dog", "backdoor"], about: "Stolen cars in, parts out. The cash is in the parts crates.", after: "c6_after2" },
      { name: "Embassy courier", roles: ["Inside", "Lookout", "Driver"], take: 14000, task: { kind: "dark" }, target: "cases", venue: "jewel", beats: ["camera", "patrol"], about: "Diplomatic bags, unopened. Phones off: the embassy listens to everything.", after: "c6_after3" },
      { name: "Bank of Solace", roles: ["Inside", "Hacker", "Lookout", "Driver"], take: 20000, task: P, target: "table", venue: "bank", beats: ["alarm", "clerk"], about: "The front counter at closing. And the account records of a man called Ash Hale.", after: "c6_after4" },
      { name: "Night club safe", roles: ["Safecracker", "Muscle", "Lookout"], take: 15000, task: { kind: "hot" }, target: "safe", venue: "cards", beats: ["drunk", "radio"], about: "The Orchid's Saturday safe. Hot: the owner is the mayor's cousin.", after: "c6_after5" },
      { name: "Port authority", roles: ["Safecracker", "Hacker", "Inside", "Driver"], take: 30000, task: { kind: "rush", seconds: 25 }, target: "safe", venue: "dock", beats: ["floodlight", "camera"], about: "Every bribe on the waterfront ends up here, for about an hour.", after: "c6_after6" },
      { name: "Hale's safe-house", roles: ["Safecracker", "Hacker", "Lookout", "Muscle", "Driver"], take: 40000, task: P, target: "safe", venue: "bank", beats: ["creak", "alarm"], about: "Where Hale keeps her informants' files. You're not here for the money.", boss: true },
    ],
    skimmer: true,
    wiretap: true,
    intro: "c6_intro",
    outro: "c6_outro",
    twist: "New: loyalty. Wrong accusations and police nights wear it down. Too low and people refuse to work. Before the last job, the crew votes.",
    rules: { loyalty: true },
    open: true,
  },
  {
    id: 7,
    name: "Ash",
    tagline: "Ash is back. He wants the crew. He wants you.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno", "rook", "ash"],
    jobs: [
      { name: "Ash's first job", roles: ["Driver", "Muscle"], take: 8000, task: { kind: "need", member: 7 }, target: "cases", venue: "pawn", beats: ["patrol", "clerk"], about: "Benny's again. Ash wants to see if you've still got it. Ash drives.", after: "c7_after1" },
      { name: "Old haunts", roles: ["Inside", "Lookout"], take: 9000, task: P, target: "table", venue: "cards", beats: ["drunk", "backdoor"], about: "The bookmaker from ten years ago. Same drawer. Same Sunday morning.", after: "c7_after2" },
      { name: "Hale's car", roles: ["Hacker", "Lookout", "Driver"], take: 6000, task: P, target: "cases", venue: "dock", beats: ["camera", "patrol"], about: "Her car, in the police garage. Whatever she keeps in the boot.", after: "c7_after3" },
      { name: "The church collection", roles: ["Inside", "Lookout", "Muscle"], take: 12000, task: P, target: "table", venue: "church", beats: ["creak", "drunk"], about: "St Brendan's. The collection, and the envelope the priest holds for someone.", after: "c7_after4" },
      { name: "Rival crew's stash", roles: ["Muscle", "Driver", "Lookout", "Inside"], take: 15000, task: { kind: "hot" }, target: "cases", venue: "dock", beats: ["dog", "radio"], about: "The Kessler brothers' money. Hot: they will come looking.", after: "c7_after5" },
      { name: "The tunnel", roles: ["Safecracker", "Hacker", "Lookout"], take: 20000, task: { kind: "dark" }, target: "safe", venue: "tunnel", beats: ["creak", "alarm"], about: "The old tram tunnel runs under a bank's night safe. Phones off underground.", after: "c7_after6" },
      { name: "Ash's last debt", roles: ["Safecracker", "Muscle", "Driver", "Inside"], take: 25000, task: { kind: "need", member: 7 }, target: "safe", venue: "pawn", beats: ["clerk", "camera"], about: "Someone kept Ash alive for ten years. He wants to pay them back. Ash goes.", after: "c7_after7" },
      { name: "The Harbour, again", roles: ["Safecracker", "Hacker", "Muscle", "Driver", "Inside"], take: 80000, task: P, target: "vault", venue: "dock", beats: ["floodlight", "radio"], about: "Container eleven. Same gate, same lamp. This time you know someone might be holding a phone.", boss: true },
    ],
    skimmer: true,
    wiretap: true,
    intro: "c7_intro",
    outro: "c7_outro",
    twist: "New: the outside man. This time there may be NO snitch at the table. Every accusation could be wrong. Knowing when not to accuse is the test.",
    rules: { outside: true },
    open: true,
  },
  {
    id: 8,
    name: "Solace",
    tagline: "The Port Solace Mint. One heist in eight parts.",
    cast: ["vex", "mara", "dutch", "pixel", "sable", "juno", "rook", "ash"],
    jobs: [
      { name: "Part 1 · The uniforms", roles: ["Inside", "Driver"], take: 3000, task: P, target: "cases", venue: "pawn", beats: ["clerk", "patrol"], about: "Mint security uniforms, from the laundry that cleans them.", after: "c8_after1" },
      { name: "Part 2 · The guard rota", roles: ["Safecracker", "Lookout"], take: 4000, task: P, target: "safe", venue: "cards", beats: ["creak", "drunk"], about: "The shift supervisor keeps the rota in his office safe.", after: "c8_after2" },
      { name: "Part 3 · The drain plans", roles: ["Hacker", "Lookout", "Safecracker"], take: 5000, task: { kind: "dark" }, target: "safe", venue: "bank", beats: ["alarm", "camera"], about: "The city engineer's archive. Phones off.", after: "c8_after3" },
      { name: "Part 4 · The inspector", roles: ["Inside", "Muscle", "Driver"], take: 6000, task: P, target: "table", venue: "cards", beats: ["drunk", "backdoor"], about: "The Mint inspector plays cards on Thursdays. He loses on purpose, for a price.", after: "c8_after4" },
      { name: "Part 5 · The cameras", roles: ["Hacker", "Lookout", "Inside"], take: 8000, task: { kind: "rush", seconds: 20 }, target: "cases", venue: "bank", beats: ["camera", "alarm"], about: "The control room next door to the Mint. Twenty seconds before the shift change.", after: "c8_after5" },
      { name: "Part 6 · The tunnel", roles: ["Muscle", "Driver", "Lookout", "Hacker"], take: 10000, task: P, target: "cases", venue: "tunnel", beats: ["dog", "radio"], about: "The drain that runs under the Mint's loading bay. Bring torches.", after: "c8_after6" },
      { name: "Part 7 · The vault", roles: ["Safecracker", "Hacker", "Muscle", "Inside", "Lookout"], take: 150000, task: P, target: "vault", venue: "mint", beats: ["floodlight", "alarm"], about: "The Port Solace Mint. The vault door, at last.", after: "c8_after7" },
      { name: "Part 8 · The way out", roles: ["Driver", "Muscle", "Lookout", "Inside", "Hacker"], take: 50000, task: { kind: "hot" }, target: "table", venue: "dock", beats: ["floodlight", "radio"], about: "Everything you took, through the harbour, onto a boat. If the police are waiting here, it's over.", boss: true },
    ],
    skimmer: false,
    wiretap: true,
    intro: "c8_intro",
    outro: "c8_outro",
    twist: "The finale. Everything carries from part to part. Police at the last part is a raid, whatever the heat.",
    rules: { allIn: true },
    open: true,
  },
];

export interface Mode {
  id: Difficulty;
  name: string;
  favors: number;
  tailWrong: number;
  /** Starting rung on the LUCK ladder in mission.ts. */
  luck: number;
  /** Chance of police with no snitch, before choices move it. */
  badLuck: number;
  /** Seconds per decision. */
  think: number;
  mult: number;
  body: string;
}

export const MODES: Mode[] = [
  { id: 0, name: "Street", favors: 3, tailWrong: 1 / 8, luck: 1, badLuck: 1 / 8, think: 12, mult: 1, body: "3 tails. Tails are rarely wrong. Suspicion meter on. More time to decide." },
  { id: 1, name: "Made", favors: 2, tailWrong: 1 / 4, luck: 1, badLuck: 1 / 8, think: 8, mult: 2, body: "2 tails, wrong more often. Less time to decide. Score x2." },
  { id: 2, name: "Kingpin", favors: 1, tailWrong: 1 / 4, luck: 2, badLuck: 1 / 4, think: 5, mult: 3, body: "1 tail. More bad luck. No meter. Five seconds to decide. Score x3." },
];

export const TIPS = 3 / 4;
export const HEAT_MAX = 3;

export const totalTake = (c: Chapter) => c.jobs.reduce((a, j) => a + jobTake(j), 0);

export function starsFor(c: Chapter, bag: number, raided: boolean) {
  if (raided || bag <= 0) return 0;
  const t = totalTake(c);
  return bag >= t ? 3 : bag >= 0.4 * t ? 2 : 1;
}
