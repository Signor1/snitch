import clsx from "clsx";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { Logo, Mark } from "../brand/Mark";
import { Button, TopBar } from "../components/ui";
import addresses from "../chain/abi/addresses.json";
import { CHAPTERS } from "../game/data";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { useProfile } from "../settings/store";

const SEPOLIA = (addresses as Record<string, Record<string, string | number>>)["11155111"];
const scan = (a: string) => `https://sepolia.etherscan.io/address/${a}#code`;

const STEPS = [
  ["Scout", "Case the place, buy the plans, or pay off a cop. One move before every job."],
  ["Plan", "Put the right skills in the right seats. A driver drives; a safecracker cracks."],
  ["The job", "Make the calls when the radio crackles. Crack the dial, smash the cases, punch the vault code yourself."],
  ["Get out", "If the police were waiting, pick the way out. Lose someone for a night, or lose it all."],
  ["Find the snitch", "Police on a job point at that team. Tails, rumours and a wiretap tell you more. Accuse right and the bag doubles."],
] as const;

const SECRETS = [
  ["Who the snitch is", "Nobody", "Drawn with encrypted randomness inside the contract. Revealed, with a proof, only when you walk away."],
  ["Whether the police were waiting", "You alone", "Every result comes back encrypted. Only your key opens it."],
  ["Your tails, rumours and wiretap", "You alone", "What you learn about your crew stays yours."],
  ["A friend's role", "That friend alone", "In a room, each phone can decrypt only its own seat."],
  ["A friend's sealed word", "Nobody, ever", "The contract keeps only 'is the snitch AND said talk', encrypted. Loyal words simply vanish."],
] as const;

const CONTRACTS = [
  ["Snitch", "The solo game: eight chapters, every rule"],
  ["SnitchRooms", "Rooms: friends, sealed words, the snitch seat"],
  ["SnitchPass", "The Boss Pass, paid in a confidential dollar"],
  ["SnitchWardrobe", "Cosmetics you earn with stars"],
  ["SnitchPots", "Room buy-ins and payouts"],
] as const;

const rise = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };

export default function About() {
  const nav = useNavigate();
  const me = useProfile((s) => s.identity);
  useSceneAudio("title");
  const launch = () => nav(me ? "/" : "/identity");

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgb(5_5_5/0.35)_0%,rgb(5_5_5/0.85)_45%,rgb(5_5_5/0.97)_100%)]" />
      <TopBar />

      <section className="pointer-events-auto relative mx-auto flex min-h-[88dvh] w-full max-w-6xl flex-col justify-end px-5 pb-16 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <div className="flex items-center gap-3">
            <Mark size={52} />
            <Logo height={60} />
          </div>
          <h1 className="display mt-6 max-w-4xl text-[2.6rem] leading-[1.02] text-mist sm:text-7xl">
            Someone at your table is <span className="neon-cyan text-cyan">talking.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-mist-dim">
            A story-driven heist game. You run a crew of thieves, and one of them works for the police. Nobody can see who: not you, not your friends, not us. You find out the way a real boss would, by watching which jobs go wrong.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button kind="cyan" size="lg" onClick={launch}>
              Launch the game
            </Button>
            <Button kind="ghost" size="lg" onClick={() => nav("/rooms")}>
              Play with friends
            </Button>
          </div>
          <p className="eyebrow mt-5 text-mist-faint">Live on Ethereum Sepolia · no wallet, no gas · plays in the browser</p>
        </motion.div>
      </section>

      <main className="pointer-events-auto relative mx-auto w-full max-w-6xl space-y-24 px-5 pb-24 sm:px-8">
        <section>
          <motion.div {...rise}>
            <p className="eyebrow text-violet">Every job</p>
            <h2 className="display mt-2 text-4xl text-mist sm:text-5xl">Five moves. One of them is a lie.</h2>
          </motion.div>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([t, b], i) => (
              <motion.li key={t} {...rise} transition={{ duration: 0.5, delay: i * 0.06 }} className="panel rounded-2xl p-5">
                <span className="num grid h-8 w-8 place-items-center rounded-full bg-cyan text-sm text-ink">{i + 1}</span>
                <p className="display-soft mt-3 text-xl text-mist">{t}</p>
                <p className="mt-1 text-sm text-mist-dim">{b}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        <section>
          <motion.div {...rise}>
            <p className="eyebrow text-cyan">Fair by construction</p>
            <h2 className="display mt-2 text-4xl text-mist sm:text-5xl">Nobody can cheat. Not even us.</h2>
            <p className="mt-3 max-w-3xl text-mist-dim">
              A game about a secret is only fair if the secret is real. On an ordinary blockchain anyone could read the snitch out of the contract; on a server, whoever runs it could peek. SNITCH keeps every secret encrypted on-chain with fully homomorphic encryption (Zama's FHEVM): the contract plays the whole game on numbers it can't read.
            </p>
          </motion.div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-line">
            {SECRETS.map(([what, who, how], i) => (
              <motion.div key={what} {...rise} transition={{ duration: 0.45, delay: i * 0.05 }} className={clsx("grid gap-1 px-5 py-4 sm:grid-cols-[1.2fr_0.8fr_2fr] sm:items-center sm:gap-4", i % 2 ? "bg-ink/70" : "bg-amethyst/15")}>
                <p className="display-soft text-mist">{what}</p>
                <p className={clsx("eyebrow", who.startsWith("Nobody") ? "text-heat" : "text-cyan")}>{who}</p>
                <p className="text-sm text-mist-dim">{how}</p>
              </motion.div>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-sm text-mist-faint">
            The plan you send with each job (how much risk, how much greed) is public, so anyone can audit a run. Your score is only recorded after the contract checks the decryption proof, so nobody can fake one.
          </p>
        </section>

        <section>
          <motion.div {...rise}>
            <p className="eyebrow text-violet">The story</p>
            <h2 className="display mt-2 text-4xl text-mist sm:text-5xl">Ten years ago, someone sold out your partner.</h2>
            <p className="mt-3 max-w-3xl text-mist-dim">A prologue and eight chapters, sixty jobs, three endings. Every chapter changes the rules on you.</p>
          </motion.div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHAPTERS.filter((c) => c.open).map((c, i) => (
              <motion.li key={c.id} {...rise} transition={{ duration: 0.45, delay: (i % 3) * 0.06 }} className="panel rounded-2xl p-5">
                <p className="eyebrow text-mist-faint">{c.prologue ? "Prologue" : `Chapter ${c.id}`}</p>
                <p className="display-soft mt-1 text-xl text-mist">{c.name}</p>
                <p className="mt-1 text-sm text-mist-dim">{c.tagline}</p>
                {c.twist && <p className="mt-3 text-xs text-cyan">{c.twist.replace(/^New( tool| trouble)?: /, "")}</p>}
              </motion.li>
            ))}
          </ul>
        </section>

        <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <motion.div {...rise}>
            <p className="eyebrow text-cyan">Play with friends</p>
            <h2 className="display mt-2 text-4xl text-mist sm:text-5xl">One of your friends is the snitch.</h2>
            <p className="mt-3 text-mist-dim">
              Open a room and send the link. Friends join from their own phones, no wallet needed. Each one presses and holds to see their own role. When their seat goes on a job, they seal a word: talk, or stay quiet. Only the snitch's word counts, and nobody can tell whose it was.
            </p>
            <Button kind="mist" size="lg" className="mt-6" onClick={() => nav("/rooms")}>
              Open a room
            </Button>
          </motion.div>
          <motion.div {...rise} className="panel rounded-3xl p-6">
            <p className="eyebrow text-mist-faint">Your role · press and hold</p>
            <p className="display mt-2 text-3xl text-heat">You are the snitch.</p>
            <p className="mt-2 text-sm text-mist">When you're sent on a job, you can tip off the police. Do it too often and they'll catch you.</p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <span className="grid h-11 place-items-center rounded-full border border-heat/60 bg-heat/10 text-sm font-semibold text-heat">Talk</span>
              <span className="grid h-11 place-items-center rounded-full bg-mist text-sm font-semibold text-ink">Stay quiet</span>
            </div>
          </motion.div>
        </section>

        <section>
          <motion.div {...rise}>
            <p className="eyebrow text-violet">On the record</p>
            <h2 className="display mt-2 text-4xl text-mist sm:text-5xl">Every contract is public.</h2>
            <p className="mt-3 max-w-3xl text-mist-dim">Verified on Ethereum Sepolia. Read the code, follow the transactions, check the proofs.</p>
          </motion.div>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {CONTRACTS.filter(([n]) => SEPOLIA?.[n]).map(([n, what]) => (
              <li key={n}>
                <a href={scan(String(SEPOLIA[n]))} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink/60 px-4 py-3 hover:border-cyan">
                  <span className="min-w-0">
                    <span className="display-soft block text-mist">{n}</span>
                    <span className="block text-xs text-mist-dim">{what}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-cyan">{String(SEPOLIA[n]).slice(0, 6)}…{String(SEPOLIA[n]).slice(-4)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="text-center">
          <motion.div {...rise}>
            <h2 className="display neon-violet text-4xl text-mist sm:text-6xl">Who's talking?</h2>
            <Button kind="cyan" size="lg" className="mt-8" onClick={launch}>
              Launch the game
            </Button>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
