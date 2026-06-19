export default function Home() {
  return (
    <main className="min-h-screen bg-surface-dark text-on-dark">
      {/* Nav */}
      <nav className="h-16 border-b border-surface-dark-elevated flex items-center justify-between px-8 max-w-[1200px] mx-auto">
        <span className="font-display text-xl text-on-dark">Dungeon.AI</span>
        <div className="flex items-center gap-6">
          <a href="/how-it-works" className="text-sm font-medium text-on-dark-soft hover:text-on-dark transition-colors">How it works</a>
          <a href="/pricing" className="text-sm font-medium text-on-dark-soft hover:text-on-dark transition-colors">Pricing</a>
          <a
            href="/play"
            className="bg-primary text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-primary-active transition-colors"
          >
            Play Now
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-8 py-section">
        <div className="grid grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block bg-surface-dark-elevated text-accent-teal text-xs font-medium tracking-widest uppercase px-3 py-1 rounded-pill mb-6">
              Co-op · AI Dungeon Master · Web
            </span>
            <h1 className="font-display text-6xl text-on-dark leading-[1.05] tracking-display mb-6">
              Your story,<br />told together.
            </h1>
            <p className="text-on-dark-soft text-lg leading-relaxed mb-8 max-w-md">
              Gather your party online. An AI Dungeon Master narrates the world, runs NPCs, and arbitrates the rules — while you and your friends make every choice.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/play"
                className="bg-primary text-white text-sm font-medium px-6 py-3 rounded-md hover:bg-primary-active transition-colors"
              >
                Start a session
              </a>
              <a href="/how-it-works" className="text-sm font-medium text-on-dark-soft underline underline-offset-4">
                See how it works
              </a>
            </div>
          </div>

          {/* Game preview card */}
          <div className="bg-surface-dark-elevated rounded-xl p-6 min-h-[380px] flex flex-col font-mono text-sm">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-surface-dark">
              <div className="w-2 h-2 rounded-full bg-error" />
              <div className="w-2 h-2 rounded-full bg-warning" />
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-on-dark-soft text-xs ml-2">dungeon-master</span>
            </div>
            <div className="flex-1 space-y-3 text-xs leading-relaxed">
              <p className="text-accent-amber">{"[DM]"} You descend into the crypt. Torchlight flickers across crumbling stone walls. The air smells of old earth and something else — burnt metal.</p>
              <p className="text-on-dark-soft">{"[Kira]"} I cast Detect Magic and scan the room.</p>
              <p className="text-accent-amber">{"[DM]"} Your senses prickle. A faint aura pulses behind the northern wall — transmutation magic, old and dormant.</p>
              <p className="text-on-dark-soft">{"[Talon]"} I try to find a hidden door. Perception check?</p>
              <p className="text-accent-amber">{"[DM]"} Roll for it. DC 14.</p>
              <div className="mt-4 p-3 bg-surface-dark rounded-md border border-surface-dark-soft">
                <p className="text-success">🎲 Talon rolled 17 — Success!</p>
                <p className="text-on-dark-soft mt-1">The wall shifts, revealing a narrow passage.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-[1200px] mx-auto px-8 pb-section">
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Real-time co-op", body: "Play with 2-6 friends simultaneously. No turn-based lobbies — the DM responds to everyone." },
            { title: "Rules arbitration", body: "The AI knows D&D 5e rules. No arguments, no rulebook lookups. Just play." },
            { title: "Adaptive narrative", body: "Every session is unique. The DM remembers your choices and adapts the story around them." },
          ].map((f) => (
            <div key={f.title} className="bg-surface-dark-elevated rounded-lg p-8">
              <h3 className="text-lg font-medium text-on-dark mb-3">{f.title}</h3>
              <p className="text-on-dark-soft text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1200px] mx-auto px-8 pb-section">
        <div className="bg-primary rounded-lg p-16 text-center">
          <h2 className="font-display text-4xl text-white mb-4">Free to try, no account needed</h2>
          <p className="text-white/80 mb-8">Start a solo session in 30 seconds. Invite friends when you're ready.</p>
          <a
            href="/play"
            className="inline-block bg-surface-dark text-on-dark text-sm font-medium px-6 py-3 rounded-md hover:bg-surface-dark-elevated transition-colors"
          >
            Enter the dungeon
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-dark-elevated">
        <div className="max-w-[1200px] mx-auto px-8 py-16 flex items-center justify-between">
          <span className="font-display text-xl text-on-dark">Dungeon.AI</span>
          <p className="text-on-dark-soft text-sm">© 2025 Dungeon.AI. AI-powered tabletop adventures.</p>
        </div>
      </footer>
    </main>
  );
}
