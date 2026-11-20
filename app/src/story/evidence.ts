// One file per job, earned by a perfect job. All of them unlock the true ending.
// No file may depend on who this run's snitch is.
export interface File {
  id: string;
  chapter: number;
  job: number;
  title: string;
  text: string;
}

const F = (chapter: number, job: number, title: string, text: string): File => ({ id: `${chapter}:${job}`, chapter, job, title, text });

export const FILES: File[] = [
  F(0, 0, "Lola's notebook", "Grey sedan, plate ending 41. Marsh Street, three nights running. Engine on. Nobody gets out."),
  F(0, 1, "The bookmaker's ledger", "A regular marked only as \"J.\" clears a large debt in cash, the week before the harbour job."),

  F(1, 0, "A ten-year-old pawn ticket", "One mobile phone, pawned at Benny's the morning after the harbour raid. Signed: J."),
  F(1, 1, "A bar tab", "For a year after the raid, someone paid for Ash's usual drink every Friday. Cash. Nobody drank it."),
  F(1, 2, "An envelope in Fat Lou's safe", "Addressed by hand: \"Echo, Ferry Street post box 41.\" Empty."),
  F(1, 3, "A jeweller's receipt", "A ring, engraved inside: \"Eleven.\" Container eleven was the harbour job. Paid for in cash."),
  F(1, 4, "A camera still", "The gold exchange, last Tuesday. Outside: a grey sedan, plate ending 41."),
  F(1, 5, "A deposit slip", "Rent for Ferry Street post box 41. Paid in cash, every month, for ten years."),

  F(2, 0, "The gallery guest book", "Juno signed in on the night of the harbour raid: her alibi. The ink is newer than the page."),
  F(2, 1, "The banker's diary", "\"Paid E. for the harbour tip-off. Worth every penny. E. has expensive taste in rings.\""),
  F(2, 2, "A crate stamp", "The wine crates carry a fence's mark. The same mark Juno has used for twenty years."),
  F(2, 3, "Auction lot 41", "A harbour gate pass, ten years old. Withdrawn from sale the morning you arrived in town."),
  F(2, 4, "The tailor's book", "A suit altered for \"Mr A.\" last month. The fitting was booked from post box 41."),
  F(2, 5, "A club membership card", "Echo Harbour Ltd. One director. Initials: J.O."),
  F(2, 6, "Safe deposit box 41", "Inside: a burner phone. The last call it made went to Detective Inspector Hale's desk."),

  F(3, 0, "A customs release", "Ash's car, seized ten years ago, released last year. Collected by \"J.O.\""),
  F(3, 1, "A container lease", "Signed \"E. Harbour\". The handwriting matches the pawn ticket from Benny's."),
  F(3, 2, "A fuel card", "Used at the harbour every week for ten years. The card holder: Juno Okafor."),
  F(3, 3, "The harbour master's bribes book", "\"J. Gate, night of the eleventh. Paid.\""),
  F(3, 4, "Cold store locker 41", "Ash's jacket, with a bullet hole in the shoulder, and a hospital tag. He walked out alive."),
  F(3, 5, "A crane driver's statement", "\"A woman opened the gate for the police that night. She had a phone in her hand.\""),
  F(3, 6, "The freighter's log", "Ten years ago: \"One passenger, male, injured, from Port Solace. Passage paid by J.\""),
  F(4, 1, "A casino marker", "Forty thousand, signed \"A.\", paid off in cash last month. The pit boss says the woman who paid it wore gloves."),
  F(4, 2, "The harbour raid tape", "2:14 a.m., a woman's voice, close to the police radio: \"Gate's open. They're inside.\""),
  F(5, 2, "Under the varnish", "Restoring the harbour painting turned up a note on the canvas: \"J. The gate, 2:14.\""),
  F(5, 5, "The fundraiser's donor list", "Echo Harbour Ltd gave fifty thousand. Contact: Juno Okafor."),
  F(6, 3, "The bank's signature card", "The \"Ash Hale\" account. The signature loops its A the way only one person in the crew writes."),
  F(6, 6, "Hale's own notes", "\"Echo is a woman. My department has paid her for ten years. I never asked her name. I didn't want to know.\""),
  F(7, 2, "Hale's glovebox", "The photo from the harbour gate. On the back, in Hale's hand: \"Who called it in? Find the phone.\""),
  F(7, 7, "Ash's statement", "\"The gate opened from inside. Only one of us carried the keys that year.\" The key list: Juno."),
  F(8, 2, "The marked drain plans", "Sold to the Mint inspector last week, by post. Return address: Ferry Street box 41."),
  F(8, 6, "The box in the vault", "Echo Harbour Ltd's deposit box. An old phone, scratched \"J.\". Last number dialled: Hale's department, 2:14."),
];

export const fileFor = (chapter: number, job: number) => FILES.find((f) => f.chapter === chapter && f.job === job);
