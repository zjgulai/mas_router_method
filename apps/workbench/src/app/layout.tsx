import type { ReactNode } from 'react';

export const metadata = {
  title: 'Recipe workbench',
  description: 'Review recipes, inspect agent runs, and manage brand guardrails.',
};

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
      <body>{children}</body>
    </html>
  );
}
