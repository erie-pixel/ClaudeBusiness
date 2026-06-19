export default function Home() {
  return (
    <main className="min-h-screen bg-canvas">
      {/* Nav */}
      <nav className="h-16 border-b border-hairline flex items-center justify-between px-8 max-w-[1200px] mx-auto">
        <span className="font-display text-xl text-ink">CogniMarket</span>
        <div className="flex items-center gap-6">
          <a href="/tasks" className="text-sm font-medium text-muted hover:text-ink transition-colors">Tasks</a>
          <a href="/pricing" className="text-sm font-medium text-muted hover:text-ink transition-colors">Pricing</a>
          <a href="/docs" className="text-sm font-medium text-muted hover:text-ink transition-colors">Docs</a>
          <a
            href="/tasks"
            className="bg-primary text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-primary-active transition-colors"
          >
            Browse Tasks
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-8 py-section">
        <div className="grid grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block bg-surface-card text-ink text-xs font-medium tracking-widest uppercase px-3 py-1 rounded-pill mb-6">
              Research-Grade · Peer-Reviewed
            </span>
            <h1 className="font-display text-6xl text-ink leading-[1.05] tracking-display mb-6">
              Cognitive tasks,<br />ready to license.
            </h1>
            <p className="text-body text-lg leading-relaxed mb-8 max-w-md">
              Validated N-back, Stroop, and Trail Making paradigms with novel delivery mechanisms. License for your research, app, or clinical workflow.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/tasks"
                className="bg-primary text-white text-sm font-medium px-6 py-3 rounded-md hover:bg-primary-active transition-colors"
              >
                Browse Tasks
              </a>
              <a href="/docs" className="text-sm font-medium text-ink underline underline-offset-4">
                View documentation
              </a>
            </div>
          </div>

          {/* Demo preview card */}
          <div className="bg-surface-dark rounded-xl p-8 min-h-[380px] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <span className="text-on-dark-soft text-xs font-mono">n-back-task-v2</span>
              <span className="bg-accent-teal/20 text-accent-teal text-xs font-medium px-2 py-1 rounded-sm">LIVE DEMO</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-lg bg-surface-dark-elevated border border-surface-dark-soft flex items-center justify-center mx-auto mb-4">
                  <span className="font-display text-4xl text-on-dark">B</span>
                </div>
                <p className="text-on-dark-soft text-sm">Does this match 2 trials ago?</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button className="bg-surface-dark-elevated text-on-dark text-sm px-4 py-2 rounded-md hover:bg-primary transition-colors">
                    Match
                  </button>
                  <button className="bg-surface-dark-elevated text-on-dark text-sm px-4 py-2 rounded-md hover:bg-surface-dark-soft transition-colors">
                    No Match
  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-between text-on-dark-soft text-xs font-mono mt-6">
              <span>Trial 7 / 20</span>
              <span>Score: 85%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-[1200px] mx-auto px-8 pb-section">
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Peer-reviewed paradigms", body: "Every task maps to published literature. Ship your paper with confidence." },
            { title: "License like a template", body: "Personal, Commercial, and Developer tiers. Modify and redistribute with the right license." },
            { title: "Drop-in ready", body: "React components + vanilla JS. Integrate in hours, not weeks." },
          ].map((f) => (
            <div key={f.title} className="bg-surface-card rounded-lg p-8">
              <h3 className="font-sans text-lg font-medium text-ink mb-3">{f.title}</h3>
              <p className="text-body text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-[1200px] mx-auto px-8 pb-section">
        <div className="bg-primary rounded-lg p-16 text-center">
          <h2 className="font-display text-4xl text-white mb-4">Start with a free demo</h2>
          <p className="text-white/80 mb-8">Try any task before you buy. No signup required.</p>
          <a
            href="/tasks"
            className="inline-block bg-canvas text-ink text-sm font-medium px-6 py-3 rounded-md hover:bg-surface-card transition-colors"
          >
            Explore all tasks
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-dark">
        <div className="max-w-[1200px] mx-auto px-8 py-16 flex items-center justify-between">
          <span className="font-display text-xl text-on-dark">CogniMarket</span>
          <p className="text-on-dark-soft text-sm">© 2025 CogniMarket. Research-grade cognitive tasks.</p>
        </div>
      </footer>
    </main>
  );
}
