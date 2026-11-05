import type { ReactNode } from 'react';

export const metadata = {
  title: 'Recipe Workbench · MAS Router',
  description: 'Review recipes, inspect agent runs, and manage brand guardrails.',
};

const WORKBENCH_CSS = `
  :root {
    color-scheme: light;
    --ground: #f7f1f2;
    --surface: #fcf8f9;
    --sunk: #efe3e6;
    --deep: #d8c1c7;
    --ink: #211216;
    --muted: #4d3139;
    --faint: #6b4953;
    --accent: #8c2a4b;
    --accent-hover: #6b1d37;
    --accent2: #f4dce3;
    --accent-soft: #f9eef1;
    --warn: #6b460a;
    --warn2: #f5e6cc;
    --side-bg: #211015;
    --side-border: #3b2029;
    --side-text: #efe2e6;
    --sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --serif: "Source Han Serif SC", "Noto Serif CJK SC", Georgia, ui-serif, serif;
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  ::selection { background: var(--accent2); color: var(--ink); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font: 16.5px/1.74 var(--sans);
    -webkit-font-smoothing: antialiased;
  }
  .wb-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .wb-topbar {
    background: var(--side-bg);
    color: var(--side-text);
    border-bottom: 1px solid var(--side-border);
    padding: 1.05rem clamp(1.5rem, 5vw, 4.5rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.25rem;
  }
  .wb-brand {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    font-family: var(--serif);
    font-weight: 650;
    font-size: 1.2rem;
    color: #faf4f5;
  }
  .wb-brand::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #c45a7c;
    border-radius: 1px;
  }
  .wb-sub {
    font-family: var(--sans);
    font-size: 0.8rem;
    font-weight: 400;
    color: #b5949e;
  }
  .wb-main {
    flex: 1;
    max-width: 86rem;
    width: 100%;
    margin: 0 auto;
    padding: clamp(2.8rem, 4.8vw, 4.5rem) clamp(1.5rem, 5vw, 4.5rem) 5rem;
  }
  .wb-h1 {
    font-family: var(--serif);
    font-size: clamp(1.95rem, 4vw, 2.75rem);
    font-weight: 650;
    letter-spacing: -0.02em;
    margin: 0 0 0.85rem;
  }
  .wb-lede {
    color: var(--muted);
    font-size: 1.08rem;
    line-height: 1.74;
    max-width: 72ch;
    margin: 0 0 2.2rem;
  }
  .wb-banner {
    background: var(--accent-soft);
    border: 1px solid var(--deep);
    padding: 1.4rem 1.7rem;
    margin: 0 0 2.6rem;
    font-size: 0.95rem;
    line-height: 1.72;
    color: var(--muted);
  }
  .wb-banner strong { color: var(--ink); }
  .wb-badge {
    display: inline-block;
    font-size: 0.76rem;
    font-weight: 650;
    padding: 0.14rem 0.55rem;
    border-radius: 2px;
    margin-right: 0.6rem;
    font-variant-numeric: tabular-nums;
  }
  .wb-badge-ok { background: var(--accent2); color: var(--accent); }
  .wb-badge-warn { background: var(--warn2); color: var(--warn); }
  .wb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.15rem;
  }
  .wb-panel {
    background: var(--surface);
    border: 1px solid var(--deep);
    padding: 1.75rem 2rem;
  }
  .wb-panel h2 {
    font-family: var(--serif);
    font-size: 1.18rem;
    font-weight: 650;
    margin: 0 0 0.6rem;
  }
  .wb-panel p {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.7;
    color: var(--muted);
  }
  code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--sunk);
    color: var(--ink);
    padding: 0.1em 0.35em;
    border-radius: 2px;
  }
`;

/**
 * The operator surface. Two rules shape the whole UI:
 *
 *   1. Every screen answers "what did the agent do, and why" — a screen that only
 *      shows the output is a chat app with extra steps.
 *   2. Nothing here calls a model directly. Everything goes through `@mas/core`, so
 *      a run started from the workbench is the same run as one started in Feishu.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: WORKBENCH_CSS }} />
      </head>
      <body>
        <div className="wb-shell">
          <header className="wb-topbar">
            <div className="wb-brand">
              MAS Workbench
              <span className="wb-sub">Operator Surface · @mas/core</span>
            </div>
            <span className="wb-sub">Zero Direct Model Calls · Single Runtime</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
