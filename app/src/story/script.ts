import type { PersonKey } from "../game/data";

// No line here may depend on who the snitch is.
// Lines can use {boss}, {crew}, {take}, {job}, {heat}.

export type Speaker = PersonKey | "hale" | "echo" | "benny";

export type Line =
  | { t: "title"; text: string; sub?: string }
  | { t: "narr"; text: string }
  | { t: "say"; who: Speaker; text: string }
  | { t: "text"; who: Speaker; text: string }
  | { t: "call"; who: Speaker; lines: string[] }
  | { t: "photo"; caption: string; note: string }
  | { t: "choice"; prompt: string; options: { label: string; then: Line[]; /** Only offered once every evidence file is found. */ needsAllFiles?: boolean }[] }
  /** Silent: records that the player reached an ending. */
  | { t: "ending"; id: "solace" | "ash" | "echo" };

export interface Scene {
  key: string;
  place: "hideout" | "black";
  mood: "hideout" | "reveal" | "raid" | "title";
  lines: Line[];
}

export const NAMES: Record<Speaker, string> = {
  vex: "Vex",
  mara: "Mara",
  dutch: "Dutch",
  pixel: "Pixel",
  sable: "Sable",
  rook: "Rook",
  juno: "Juno",
  ash: "Ash",
  gage: "Gage",
  lola: "Lola",
  hale: "Det. Insp. Hale",
  echo: "Echo",
  benny: "Benny",
};

const S = (key: string, place: Scene["place"], mood: Scene["mood"], lines: Line[]): Scene => ({ key, place, mood, lines });

export const SCENES: Record<string, Scene> = {
  // Prologue: The Harbour
  p_intro: S("p_intro", "hideout", "title", [
    { t: "title", text: "PORT SOLACE", sub: "Ten years ago" },
    { t: "narr", text: "It always rains in Port Solace. Ash says that's why the city never gets clean." },
    { t: "say", who: "ash", text: "Rain's good. Cops hate rain." },
    { t: "say", who: "ash", text: "Four of us. One boss. That's you, {boss}. Don't let it go to your head." },
    { t: "say", who: "juno", text: "Corner store on Marsh Street. The owner keeps the week's cash under the register." },
    { t: "say", who: "gage", text: "And if the owner's still there?" },
    { t: "say", who: "ash", text: "Then you smile, Gage. You've got a nice smile. Nobody's ever seen it." },
    { t: "say", who: "lola", text: "Grey sedan out front again. Third time this week." },
    { t: "say", who: "ash", text: "Half this city drives grey sedans, Lola." },
    { t: "say", who: "ash", text: "But keep counting. Somebody always talks, {boss}. The trick is knowing who, before the cops do." },
  ]),
  p_after1: S("p_after1", "hideout", "hideout", [
    { t: "say", who: "ash", text: "See? Small jobs. Nobody gets hurt. Everybody gets paid." },
    { t: "say", who: "lola", text: "That sedan was there again. Engine running." },
    { t: "say", who: "juno", text: "Lola sees cops in her soup." },
    { t: "say", who: "ash", text: "Maybe. But if the police are ever waiting for us, look at who was on that job. Then look again." },
  ]),
  p_after2: S("p_after2", "hideout", "hideout", [
    { t: "say", who: "gage", text: "So the harbour job. It's real?" },
    { t: "say", who: "ash", text: "Container eleven. Two hundred grand in watches, and one night guard who owes Juno a favour." },
    { t: "say", who: "juno", text: "He owes me more than a favour." },
    { t: "narr", text: "Ash pulls you aside, out of earshot." },
    { t: "say", who: "ash", text: "I've got a bad feeling, {boss}. If someone's talking, tonight's the night to find out. Use your tail." },
    {
      t: "choice",
      prompt: "Ash is waiting for an answer.",
      options: [
        { label: "We go.", then: [{ t: "say", who: "ash", text: "That's my boss. Last one, then we're out. Somewhere warm." }] },
        { label: "Something's wrong. Let's call it off.", then: [{ t: "say", who: "ash", text: "Something's always wrong. That's why it pays. We go." }] },
      ],
    },
  ]),
  p_outro: S("p_outro", "black", "raid", [
    { t: "title", text: "THE HARBOUR", sub: "Container eleven · 2:14 a.m." },
    { t: "narr", text: "Floodlights. Dogs. Somebody on a loudhailer is shouting your name. Your real name." },
    { t: "say", who: "ash", text: "Go! GO! I'm right behind you—" },
    { t: "narr", text: "He wasn't." },
    { t: "narr", text: "Through the smoke, by the gate, you see a hand holding a phone. Lit up. Still connected." },
    { t: "narr", text: "You never see the face." },
    { t: "narr", text: "They never find Ash's body. The papers say the bay took him." },
    { t: "title", text: "TEN YEARS LATER" },
    { t: "text", who: "echo", text: "Welcome back, {boss}." },
    { t: "text", who: "echo", text: "You're building a new crew. That's sweet." },
    { t: "text", who: "echo", text: "One of them is already mine." },
  ]),

  // Chapter 1: The Corner
  c1_intro: S("c1_intro", "hideout", "title", [
    { t: "title", text: "THE CORNER", sub: "Chapter 1 · Ten years later" },
    { t: "narr", text: "You bought the bar the week it went bust. Nobody asked where the money came from. In this city, nobody asks." },
    { t: "say", who: "vex", text: "So you're the one Ash used to talk about." },
    { t: "say", who: "mara", text: "Five of us. One of you. And a city that forgot your face." },
    { t: "say", who: "dutch", text: "Forgot it? Half the old crowd thinks you're dead." },
    { t: "say", who: "pixel", text: "The other half thinks you sold Ash out." },
    { t: "narr", text: "The room goes quiet." },
    { t: "say", who: "sable", text: "Did you?" },
    {
      t: "choice",
      prompt: "Five faces are waiting for an answer.",
      options: [
        { label: "No. And I'm going to find out who did.", then: [{ t: "say", who: "vex", text: "Good answer. Let's make some money while you look." }] },
        { label: "Ask me again and you're out.", then: [{ t: "say", who: "dutch", text: "Fair enough, boss. Nobody's asking." }, { t: "narr", text: "Everybody's still wondering." }] },
      ],
    },
    { t: "text", who: "echo", text: "One of your five calls me after every job." },
    { t: "text", who: "echo", text: "Guess who." },
  ]),
  c1_after1: S("c1_after1", "hideout", "hideout", [
    { t: "call", who: "hale", lines: ["Evening. Detective Inspector Hale.", "I hear you bought a bar. Congratulations.", "Funny. Ten years ago my brother drank in a bar just like yours.", "Enjoy it while you can."] },
    { t: "narr", text: "Her brother. Ash had a sister. He never told you she was a cop." },
    { t: "say", who: "sable", text: "Who was that?" },
    { t: "say", who: "dutch", text: "By the look on the boss's face? Trouble." },
  ]),
  c1_after2: S("c1_after2", "hideout", "hideout", [
    { t: "say", who: "sable", text: "Hale's car is parked across the street. Third night in a row." },
    { t: "say", who: "pixel", text: "I can get into her phone. Give me a week." },
    { t: "say", who: "mara", text: "Or give her nothing to find." },
    { t: "text", who: "echo", text: "{job}. {take}. Not bad for a comeback." },
    { t: "narr", text: "The exact take. Only the crew knew that number." },
  ]),
  c1_after3: S("c1_after3", "hideout", "hideout", [
    { t: "say", who: "mara", text: "Can I say something without it going round the table?" },
    {
      t: "choice",
      prompt: "Mara is waiting by the back door.",
      options: [
        { label: "Say it.", then: [{ t: "say", who: "mara", text: "Somebody here is spending money they haven't made yet. New watch. New shoes. I won't say who. Not till I'm sure." }, { t: "narr", text: "Gossip isn't evidence. Tails and rumours are." }] },
        { label: "Not here. Not now.", then: [{ t: "say", who: "mara", text: "Your call. Just don't wait too long." }] },
      ],
    },
  ]),
  c1_after4: S("c1_after4", "hideout", "hideout", [
    { t: "text", who: "echo", text: "Still drinking your coffee black, {boss}?" },
    { t: "text", who: "echo", text: "Ash used to tease you about that." },
    { t: "narr", text: "Only one person ever teased you about that. He's been dead for ten years." },
    { t: "say", who: "vex", text: "You've gone white, boss." },
  ]),
  c1_after5: S("c1_after5", "hideout", "hideout", [
    { t: "call", who: "hale", lines: ["Night deposit. Ferry Street. Big job.", "I'd skip it, if I were you.", "No? Then I'll see you there."] },
    { t: "say", who: "dutch", text: "How does she know about Ferry Street?" },
    { t: "say", who: "pixel", text: "The same way Echo knows everything." },
    { t: "say", who: "mara", text: "One of us." },
  ]),
  c1_outro: S("c1_outro", "hideout", "reveal", [
    { t: "narr", text: "The night is over. The cash is counted. The chairs are up on the tables." },
    { t: "say", who: "pixel", text: "I got into Hale's phone. Cat pictures, mostly. And this." },
    { t: "photo", caption: "Ash. Older, thinner, grey at the temples. Standing outside the harbour gates.", note: "The date stamp says: last month." },
    { t: "narr", text: "Ten years dead. Last month." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 2 · Uptown" },
  ]),

  // Chapter 2: Uptown
  c2_intro: S("c2_intro", "hideout", "title", [
    { t: "title", text: "UPTOWN", sub: "Chapter 2" },
    { t: "narr", text: "If Ash is alive, someone has been hiding him. And Uptown is where the money hides." },
    { t: "say", who: "juno", text: "Hello, {boss}. Ten years and you still sit with your back to the wall." },
    { t: "narr", text: "Juno. The fence. The last person who saw Ash alive." },
    { t: "say", who: "juno", text: "I saw his car outside the old harbour last week. I thought you should know. I want in." },
    { t: "say", who: "pixel", text: "I got us something too. A wiretap. Pick two phones, and it tells us for sure if the snitch is on either." },
    { t: "text", who: "echo", text: "A new face at the table. How exciting." },
  ]),
  c2_after1: S("c2_after1", "hideout", "hideout", [
    { t: "say", who: "juno", text: "That car I saw by the harbour. Grey sedan. Plate ends in forty-one." },
    { t: "narr", text: "Forty-one. Lola wrote that plate down ten years ago. Three times." },
    { t: "say", who: "vex", text: "Grey sedans are half this city." },
    { t: "say", who: "juno", text: "That's what Ash used to say." },
  ]),
  c2_after2: S("c2_after2", "hideout", "hideout", [
    { t: "say", who: "sable", text: "Hale just moved into the flat across the street. Curtains open. Binoculars on the sill." },
    { t: "text", who: "hale", text: "Hello, neighbour." },
    { t: "text", who: "hale", text: "Your lights were on till four. Busy night?" },
    { t: "say", who: "dutch", text: "She's not even pretending any more." },
  ]),
  c2_after3: S("c2_after3", "hideout", "hideout", [
    { t: "say", who: "juno", text: "I want a bigger cut, {boss}. I'm the one who knows the doors uptown." },
    {
      t: "choice",
      prompt: "The crew is watching how you handle it.",
      options: [
        { label: "Fine. A bigger cut. Don't make me regret it.", then: [{ t: "say", who: "juno", text: "You won't. Ash always paid me what I'm worth." }, { t: "say", who: "mara", text: "And look how that ended." }] },
        { label: "Same cut as everyone. Or walk.", then: [{ t: "say", who: "juno", text: "Ash would have paid me." }, { t: "narr", text: "She doesn't walk. She smiles. That's worse." }] },
      ],
    },
  ]),
  c2_after4: S("c2_after4", "hideout", "hideout", [
    { t: "text", who: "echo", text: "Juno's lying to you about the car." },
    { t: "text", who: "echo", text: "Ask her where she was at 2:14." },
    { t: "say", who: "juno", text: "Echo wants us fighting. Don't give it the pleasure." },
    { t: "narr", text: "2:14. The minute the floodlights came on at the harbour." },
  ]),
  c2_after5: S("c2_after5", "hideout", "hideout", [
    { t: "say", who: "pixel", text: "I got back into Hale's phone. She has a contact saved as one letter. E." },
    { t: "say", who: "pixel", text: "Last message to E., Tuesday: \"Uptown confirmed. Payment as usual.\"" },
    { t: "say", who: "mara", text: "So Hale pays Echo." },
    { t: "say", who: "pixel", text: "Or Echo lets her think so." },
  ]),
  c2_after6: S("c2_after6", "hideout", "hideout", [
    { t: "call", who: "echo", lines: ["…", "(nobody speaks)", "(far away, a ship's horn: the harbour)", "(the line goes dead)"] },
    { t: "say", who: "sable", text: "Who was it?" },
    { t: "narr", text: "You know that horn. You heard it the night Ash died." },
  ]),
  c2_outro: S("c2_outro", "hideout", "reveal", [
    { t: "say", who: "pixel", text: "The wire picked up something after the bank. Not one of us. Listen." },
    { t: "narr", text: "Static. Then a voice, very calm, saying your real name. The name nobody in this city should know." },
    { t: "say", who: "juno", text: "That's not possible." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 3 · The Docks" },
  ]),

  // Chapter 3: The Docks
  c3_intro: S("c3_intro", "hideout", "title", [
    { t: "title", text: "THE DOCKS", sub: "Chapter 3" },
    { t: "narr", text: "Back to the harbour. Back to where it ended." },
    { t: "say", who: "mara", text: "The count was short last night. A whole stack, gone." },
    { t: "say", who: "dutch", text: "So now we've got a snitch AND a thief." },
    { t: "say", who: "pixel", text: "And I've found the old harbour file on a police server. Deleted. But nothing is ever really deleted." },
    { t: "text", who: "echo", text: "Careful what you dig up, Pixel." },
  ]),
  c3_after1: S("c3_after1", "hideout", "hideout", [
    { t: "say", who: "dutch", text: "Pixel was last to touch the bag. I'm just saying." },
    { t: "say", who: "pixel", text: "Say it again, Dutch. Slower." },
    {
      t: "choice",
      prompt: "Two of your crew are on their feet.",
      options: [
        { label: "Sit down. Both of you.", then: [{ t: "narr", text: "They sit. Nobody looks at anybody." }] },
        { label: "Pixel. Empty your pockets.", then: [{ t: "say", who: "pixel", text: "Gum. A key. My dignity. Happy?" }, { t: "narr", text: "Nothing. Gossip isn't evidence. The count is." }] },
      ],
    },
  ]),
  c3_after2: S("c3_after2", "hideout", "reveal", [
    { t: "narr", text: "Juno takes you to the harbour gate. The same rust. The same lamp." },
    { t: "say", who: "juno", text: "I was here, by the gate, that night. I saw the hand with the phone too." },
    { t: "narr", text: "Ten years, and she never said." },
    { t: "say", who: "juno", text: "You never asked." },
  ]),
  c3_after3: S("c3_after3", "hideout", "hideout", [
    { t: "call", who: "hale", lines: ["My brother's file is missing a page.", "The page with the informant's name on it.", "Did you take it, {boss}? Or did your friend?"] },
    { t: "say", who: "vex", text: "What friend?" },
  ]),
  c3_after4: S("c3_after4", "hideout", "reveal", [
    { t: "say", who: "pixel", text: "Got it. The harbour raid file. The informant had a code name." },
    { t: "say", who: "pixel", text: "ECHO." },
    { t: "say", who: "pixel", text: "And the payments to ECHO never stopped. Ten years. Cash, every month." },
    { t: "say", who: "mara", text: "Who's been paying for ten years?" },
  ]),
  c3_after5: S("c3_after5", "hideout", "hideout", [
    { t: "text", who: "echo", text: "Cold in the fish market, wasn't it?" },
    { t: "text", who: "echo", text: "Someone left the back door open for you. You're welcome." },
    { t: "say", who: "sable", text: "Nobody left that door open. I checked it twice." },
  ]),
  c3_after6: S("c3_after6", "hideout", "reveal", [
    { t: "say", who: "sable", text: "Car outside. Grey sedan. Lights off." },
    { t: "narr", text: "By the time you reach the street, it's gone." },
    { t: "photo", caption: "Under your wiper: a harbour gate pass, ten years old. The name on it: ASH.", note: "Someone was holding on to it." },
  ]),
  c3_outro: S("c3_outro", "hideout", "reveal", [
    { t: "text", who: "echo", text: "Smile." },
    { t: "photo", caption: "You. Tonight. Sitting at this table, in this room.", note: "Taken from inside the hideout." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 4 · Two Wires" },
  ]),

  // Chapter 4: Two Wires
  c4_intro: S("c4_intro", "hideout", "title", [
    { t: "title", text: "TWO WIRES", sub: "Chapter 4" },
    { t: "narr", text: "A new face at the table. Rook: three passports, no past anyone can check." },
    { t: "say", who: "rook", text: "Juno says you pay on time. That's all I need to know about anybody." },
    { t: "call", who: "hale", lines: ["I'll make this simple, {boss}.", "Give me the person who sold out my brother, and you walk.", "Ten years I've thought it was you. Prove me wrong."] },
    { t: "narr", text: "She's offering you a deal. Or setting a trap with your name on it." },
    { t: "text", who: "echo", text: "Two of them are mine now." },
    { t: "text", who: "echo", text: "Catch one and you'll think you've won. You won't have." },
  ]),
  c4_after1: S("c4_after1", "hideout", "hideout", [
    { t: "say", who: "pixel", text: "Two phones pinged the precinct tower last night. Two. Not one." },
    { t: "say", who: "dutch", text: "So we stop trusting half the room." },
    { t: "say", who: "mara", text: "We stopped trusting half the room in chapter one, Dutch." },
  ]),
  c4_after2: S("c4_after2", "hideout", "hideout", [
    { t: "say", who: "juno", text: "The pit boss says a man paid off a marker last month. Forty grand. Signed A." },
    { t: "narr", text: "A. You make yourself not think it." },
    { t: "say", who: "rook", text: "Lot of names start with A, boss." },
  ]),
  c4_after3: S("c4_after3", "hideout", "reveal", [
    { t: "narr", text: "Among the seized cash, a tape. HARBOUR · 11 · 2:14 A.M." },
    { t: "say", who: "pixel", text: "I can clean the audio. Give me a night." },
    { t: "text", who: "echo", text: "Don't play that tape, Pixel." },
    { t: "text", who: "echo", text: "You won't like who you hear." },
  ]),
  c4_after4: S("c4_after4", "hideout", "hideout", [
    { t: "say", who: "pixel", text: "The tape. Mostly dogs and shouting. And at 2:14, one voice, very close to the radio." },
    { t: "narr", text: "A woman's voice: \"Gate's open. They're inside.\"" },
    { t: "say", who: "sable", text: "Hale?" },
    { t: "say", who: "pixel", text: "Hale was at the academy ten years ago. It isn't her." },
  ]),
  c4_after5: S("c4_after5", "hideout", "hideout", [
    {
      t: "choice",
      prompt: "Hale is on the line again. \"My deal still stands. Got a name for me?\"",
      options: [
        { label: "\"Not yet. When I have it, you'll hear it from me.\"", then: [{ t: "say", who: "mara", text: "You're talking to the police now?" }, { t: "narr", text: "Five faces. Five different kinds of worried." }] },
        { label: "Hang up.", then: [{ t: "narr", text: "The phone rings again. You let it ring." }] },
      ],
    },
  ]),
  c4_after6: S("c4_after6", "hideout", "hideout", [
    { t: "say", who: "vex", text: "The courier asked after Juno. By name. Said to say hello from the harbour." },
    { t: "say", who: "juno", text: "I know a lot of people at the harbour, Vex. That's my job." },
  ]),
  c4_outro: S("c4_outro", "black", "raid", [
    { t: "narr", text: "Three in the morning. Dutch doesn't come back from the cash drop." },
    { t: "narr", text: "You find him in the alley behind the bar. Beaten. Alive. Not talking." },
    { t: "narr", text: "On the wall above him, in fresh paint: ECHO." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 5 · The Turn" },
  ]),

  // Chapter 5: The Turn
  c5_intro: S("c5_intro", "hideout", "title", [
    { t: "title", text: "THE TURN", sub: "Chapter 5" },
    { t: "say", who: "dutch", text: "I didn't see who. They knew where I'd be, and when." },
    { t: "say", who: "mara", text: "That means it's one of us. Again." },
    { t: "text", who: "echo", text: "Here's a game." },
    { t: "text", who: "echo", text: "If you haven't found my friend by the fourth job, my friend makes a friend." },
    { t: "narr", text: "Find the snitch fast. Or there will be two." },
  ]),
  c5_after1: S("c5_after1", "hideout", "hideout", [
    { t: "say", who: "rook", text: "Somebody offered me money last night. To keep them posted. I said no." },
    { t: "say", who: "sable", text: "That's exactly what you'd say if you'd said yes." },
    { t: "narr", text: "Gossip isn't evidence. But it's starting to feel like it." },
  ]),
  c5_after2: S("c5_after2", "hideout", "hideout", [
    { t: "say", who: "juno", text: "{boss}. A word. Outside." },
    { t: "say", who: "juno", text: "I was at the harbour that night. By the gate. I told you that." },
    { t: "say", who: "juno", text: "What I didn't tell you is that I saw who had the phone. And I've been scared for ten years." },
    { t: "say", who: "juno", text: "Not here. Not yet." },
  ]),
  c5_after3: S("c5_after3", "hideout", "hideout", [
    { t: "say", who: "mara", text: "That painting at the restorer's. It was the harbour. Somebody paid to have it cleaned the week Ash died." },
    { t: "call", who: "hale", lines: ["Somebody left a parcel at my door.", "Ash's watch. The one he wore the night of the raid.", "It's still ticking, {boss}."] },
  ]),
  c5_after4: S("c5_after4", "hideout", "hideout", [
    { t: "text", who: "echo", text: "Time's up." },
    { t: "text", who: "echo", text: "If you didn't catch my friend, there are two of us at your table now." },
    { t: "narr", text: "You look round the room. Nobody looks back." },
  ]),
  c5_after5: S("c5_after5", "hideout", "hideout", [
    { t: "say", who: "vex", text: "Juno hasn't answered her phone since yesterday." },
    { t: "say", who: "sable", text: "Her flat's empty. Coat gone. Kettle still warm." },
  ]),
  c5_after6: S("c5_after6", "hideout", "hideout", [
    { t: "say", who: "juno", text: "I'm here. I'm here. Someone followed me home. I spent the night in a church." },
    { t: "say", who: "pixel", text: "Funny. Your phone spent the night at the harbour." },
    { t: "say", who: "juno", text: "Then someone has my phone, Pixel." },
  ]),
  c5_outro: S("c5_outro", "hideout", "reveal", [
    { t: "narr", text: "Closing time. The door opens anyway." },
    { t: "narr", text: "He's thinner. Greyer. A scar runs from his ear into his collar. He sits at the bar like he never left." },
    { t: "narr", text: "Ash." },
    { t: "narr", text: "\"Ten years,\" he says. \"We need to talk about who sold me.\"" },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 6 · Blood Money" },
  ]),

  // Chapter 6: Blood Money
  c6_intro: S("c6_intro", "hideout", "title", [
    { t: "title", text: "BLOOD MONEY", sub: "Chapter 6" },
    { t: "narr", text: "Ash won't stay. He won't say where he's been. He says only: \"Ask your crew who opened the gate.\"" },
    { t: "say", who: "sable", text: "So Ash is alive, and you knew him, and he thinks one of us sold him." },
    { t: "say", who: "dutch", text: "Or he thinks you did, boss. He didn't look at you like a friend." },
    { t: "say", who: "rook", text: "From now on, we vote. Before every big job, the table decides who sits it out. That's fair." },
    { t: "narr", text: "Loyalty is something you spend now. Spend it carefully." },
  ]),
  c6_after1: S("c6_after1", "hideout", "hideout", [
    { t: "say", who: "mara", text: "I've worked with you for six chapters of my life. Don't make me regret it." },
    { t: "narr", text: "It's the most she's ever said." },
  ]),
  c6_after2: S("c6_after2", "hideout", "hideout", [
    {
      t: "choice",
      prompt: "The split. Dutch says the risk-takers should take more.",
      options: [
        { label: "\"Equal shares. Always.\"", then: [{ t: "say", who: "dutch", text: "Fine. Equal. Like the old days." }] },
        { label: "\"The ones who went in get more.\"", then: [{ t: "say", who: "sable", text: "The lookout doesn't go in, boss. Remember that next time you need eyes." }] },
      ],
    },
  ]),
  c6_after3: S("c6_after3", "hideout", "hideout", [
    { t: "call", who: "hale", lines: ["My brother came to see me.", "He says you sold him. He says he can prove it.", "I'm starting to believe him, {boss}."] },
    { t: "narr", text: "Ash went to the police. To his sister. About you." },
  ]),
  c6_after4: S("c6_after4", "hideout", "reveal", [
    { t: "say", who: "pixel", text: "The bank records. Somebody's been paying Echo every month. For ten years." },
    { t: "say", who: "pixel", text: "And the last payment, last week, came from an account in one name." },
    { t: "say", who: "pixel", text: "Ash Hale." },
  ]),
  c6_after5: S("c6_after5", "hideout", "hideout", [
    { t: "say", who: "juno", text: "So it was Ash. All along. He sold himself out and ran." },
    { t: "say", who: "mara", text: "Why would a man sell himself out and get shot?" },
    { t: "say", who: "juno", text: "Maybe it went wrong for him too." },
  ]),
  c6_after6: S("c6_after6", "hideout", "hideout", [
    { t: "text", who: "echo", text: "Hale keeps her files in a flat on Cannery Row." },
    { t: "text", who: "echo", text: "Everything you want to know is in there. Go and look." },
    { t: "say", who: "rook", text: "Echo's handing us a job now?" },
    { t: "say", who: "vex", text: "Echo's handing us a trap." },
  ]),
  c6_outro: S("c6_outro", "hideout", "reveal", [
    { t: "narr", text: "Hale's files. Ten years of them. Payments to an informant called ECHO." },
    { t: "narr", text: "The account was opened six weeks ago, in Ash's name. The signature is close. Not close enough." },
    { t: "say", who: "pixel", text: "Someone forged Ash's name. Someone who knew him well enough to try." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 7 · Ash" },
  ]),

  // Chapter 7: Ash
  c7_intro: S("c7_intro", "hideout", "title", [
    { t: "title", text: "ASH", sub: "Chapter 7" },
    { t: "say", who: "ash", text: "I'm in. One last run. Like the old days, {boss}." },
    { t: "say", who: "ash", text: "And somewhere in it, one of us tells the truth about the harbour." },
    { t: "narr", text: "Eight at the table. Or seven, and a ghost." },
    { t: "text", who: "echo", text: "Maybe I'm at your table. Maybe I never was." },
    { t: "narr", text: "This time, the tip-offs might come from outside. Every accusation could be wrong." },
  ]),
  c7_after1: S("c7_after1", "hideout", "hideout", [
    { t: "say", who: "ash", text: "You still hold your breath on the way in. Ten years and you still do that." },
    { t: "say", who: "vex", text: "He drives better than me. I hate it." },
  ]),
  c7_after2: S("c7_after2", "hideout", "hideout", [
    { t: "say", who: "ash", text: "Somebody pulled me out of the bay that night. Put me on a freighter. Paid for a surgeon in Lisbon." },
    { t: "say", who: "ash", text: "I never saw their face. A woman's voice on the phone, every month, for ten years. Telling me to stay gone." },
  ]),
  c7_after3: S("c7_after3", "hideout", "reveal", [
    { t: "photo", caption: "From Hale's glovebox: Ash and Juno at the harbour gate, ten years ago. Juno has a phone in her hand.", note: "Written on the back: \"2:14\"" },
    { t: "say", who: "juno", text: "That's a phone, not a confession. Everybody had a phone." },
  ]),
  c7_after4: S("c7_after4", "hideout", "hideout", [
    { t: "say", who: "ash", text: "The priest says a woman leaves an envelope every month. For a man who's supposed to be dead." },
    { t: "say", who: "ash", text: "My rent, {boss}. Someone's been paying to keep me a ghost." },
  ]),
  c7_after5: S("c7_after5", "hideout", "hideout", [
    { t: "say", who: "rook", text: "The Kesslers will come for this. We should be gone before they do." },
    { t: "call", who: "hale", lines: ["The Kesslers just called me. They want names.", "I told them I didn't have any. Yet."] },
  ]),
  c7_after6: S("c7_after6", "hideout", "hideout", [
    { t: "say", who: "ash", text: "In the tunnel, I remembered. The gate that night opened from the inside." },
    { t: "say", who: "ash", text: "Only one of us had the key." },
    { t: "narr", text: "Nobody asks who. Everybody knows who carried the keys back then." },
  ]),
  c7_after7: S("c7_after7", "hideout", "hideout", [
    { t: "say", who: "juno", text: "Ash. You don't know what it was like after. Alone. With everyone thinking it was me." },
    { t: "say", who: "ash", text: "Nobody ever thought it was you, Juno. That's the point." },
  ]),
  c7_outro: S("c7_outro", "black", "raid", [
    { t: "narr", text: "The harbour. Floodlights. This time Hale is there herself." },
    { t: "narr", text: "She puts Ash in cuffs. He doesn't fight. He looks straight at you." },
    { t: "say", who: "ash", text: "Ask her who Echo really works for." },
    { t: "title", text: "TO BE CONTINUED", sub: "Chapter 8 · Solace" },
  ]),

  // Chapter 8: Solace
  c8_intro: S("c8_intro", "hideout", "title", [
    { t: "title", text: "SOLACE", sub: "The last chapter" },
    { t: "call", who: "hale", lines: ["I've got my brother in a cell and a city that wants your head.", "Here's what happens next. You do one last job. The Mint.", "You bring me Echo, I let Ash go. Fail, and you both go down."] },
    { t: "say", who: "mara", text: "The Mint can't be robbed." },
    { t: "say", who: "juno", text: "Everything can be robbed, Mara. It's just a question of who opens the gate." },
    { t: "narr", text: "Eight parts. Everything carries. Police on the last part, and it's over." },
  ]),
  c8_after1: S("c8_after1", "hideout", "hideout", [{ t: "say", who: "rook", text: "Uniforms fit. Mine's a size too big, which is how I like my lies." }]),
  c8_after2: S("c8_after2", "hideout", "hideout", [{ t: "say", who: "sable", text: "Rota says the vault guard changes at 2:14." }, { t: "narr", text: "Of course it does." }]),
  c8_after3: S("c8_after3", "hideout", "hideout", [{ t: "say", who: "pixel", text: "The drain plans were already marked. Red pen. Somebody else has studied this job." }, { t: "text", who: "echo", text: "You're welcome." }]),
  c8_after4: S("c8_after4", "hideout", "hideout", [{ t: "say", who: "dutch", text: "The inspector lost two grand on purpose and winked at Juno. Like they'd met." }]),
  c8_after5: S("c8_after5", "hideout", "hideout", [{ t: "say", who: "pixel", text: "Cameras are on a loop. Thirty minutes of an empty corridor. Make them count." }]),
  c8_after6: S("c8_after6", "hideout", "hideout", [{ t: "say", who: "vex", text: "Tunnel's open. Smells like the bay. Smells like ten years ago." }]),
  c8_after7: S("c8_after7", "hideout", "reveal", [
    { t: "narr", text: "Inside the vault, among the bars, one small box that isn't the Mint's. Rented by Echo Harbour Ltd." },
    { t: "narr", text: "Inside: an old phone. The battery long dead. On the back, scratched into the case: J." },
    { t: "say", who: "juno", text: "Put that down, {boss}. Let's just take the money and go." },
  ]),
  c8_outro: S("c8_outro", "hideout", "reveal", [
    { t: "narr", text: "Dawn over the harbour. The boat is loaded. Hale's car is at the end of the pier, lights off." },
    { t: "narr", text: "Ash in the back seat. Juno beside you. The crew behind, waiting to see what you do." },
    {
      t: "choice",
      prompt: "How does it end?",
      options: [
        {
          label: "Take the money. Get on the boat. Never come back.",
          then: [
            { t: "narr", text: "You cast off. Port Solace gets smaller, then it's gone." },
            { t: "narr", text: "Your phone buzzes once, far out at sea." },
            { t: "text", who: "echo", text: "Safe travels, {boss}. I'll be here." },
            { t: "ending", id: "solace" },
            { t: "title", text: "ENDING: SOLACE", sub: "Echo is never named. One of three endings." },
          ],
        },
        {
          label: "Give Hale what she wants: tell her it was Ash.",
          then: [
            { t: "narr", text: "Hale looks at you for a long time. Then she drives Ash away." },
            { t: "say", who: "juno", text: "You did the right thing." },
            { t: "narr", text: "She says it too quickly." },
            { t: "ending", id: "ash" },
            { t: "title", text: "ENDING: ASH", sub: "You walk free. The wrong person pays. One of three endings." },
          ],
        },
        {
          label: "\"Juno. It was you. It was always you.\"",
          needsAllFiles: true,
          then: [
            { t: "say", who: "juno", text: "…How long have you known?" },
            { t: "say", who: "juno", text: "I opened the gate. Hale's department paid me. I thought nobody would get hurt." },
            { t: "say", who: "juno", text: "Then Ash went in the water and I pulled him out. Ten years I've paid to keep him alive and away, and paid for you to never know." },
            { t: "narr", text: "Pixel was recording. Hale was listening. She steps out of the car." },
            {
              t: "choice",
              prompt: "Hale is waiting. Juno doesn't run.",
              options: [
                { label: "Hand Juno to Hale.", then: [{ t: "narr", text: "Hale lets Ash out of the car. He doesn't look at Juno as they pass." }, { t: "ending", id: "echo" }, { t: "title", text: "ENDING: ECHO", sub: "The truth, at last. The true ending." }] },
                { label: "Put Juno on the boat. Let the sea decide.", then: [{ t: "narr", text: "The boat goes out with Juno on it, and half the Mint. Ash stands next to you on the pier." }, { t: "say", who: "ash", text: "Ten years. And you let her go." }, { t: "ending", id: "echo" }, { t: "title", text: "ENDING: ECHO", sub: "The truth, and mercy. The true ending." }] },
              ],
            },
          ],
        },
      ],
    },
  ]),
};

/** Flavour only, never tied to hidden state. */
export const ECHO_AFTER = [
  "{job}. I heard it went {how}.",
  "Count it twice, {boss}. Someone at your table already did.",
  "You're looking at the wrong one.",
  "I know where you sat tonight.",
  "Ash would have done it faster.",
  "Heat {heat}. I can make it three whenever I like.",
];
