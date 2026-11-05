import { getSession } from '@/lib/session';

/**
 * Placeholder for the milestone-3 workbench (`docs/roadmap.md`).
 *
 * Built last on purpose: a review surface designed before there are recipes to
 * review is a dashboard for an empty table, and its layout will be wrong because
 * nobody yet knows what a reviewer actually looks at first.
 */
export default async function Home() {
  const session = await getSession();

  return (
    <main className="wb-main">
      <h1 className="wb-h1">Recipe workbench</h1>
      <p className="wb-lede">
        Operator surface for reviewing brand-adapted TikTok recipes, inspecting agent execution
        traces, and editing brand guardrails.
      </p>

      {session === null ? (
        <div className="wb-banner">
          <span className="wb-badge wb-badge-warn">UNAUTHENTICATED</span>
          <strong>Not signed in.</strong> Feishu OAuth arrives with milestone 3; until then set{' '}
          <code>DEV_SESSION_USER_ID</code> and <code>DEV_SESSION_BRAND_IDS</code> in{' '}
          <code>.env</code> to work locally.
        </div>
      ) : (
        <div className="wb-banner">
          <span className="wb-badge wb-badge-ok">ACTIVE SESSION</span>
          <strong>Signed in as {session.displayName}</strong> with {session.brandIds.length}{' '}
          brand(s). The review queue, run inspector, and guardrail editor are specified in{' '}
          <code>docs/roadmap.md</code>.
        </div>
      )}

      <section className="wb-grid" aria-label="Workbench modules">
        <div className="wb-panel">
          <h2>Review Queue</h2>
          <p>
            Inspect generated recipes validated against <code>@mas/shared</code> Zod schemas before
            shooters receive them.
          </p>
        </div>
        <div className="wb-panel">
          <h2>Run Inspector</h2>
          <p>
            Audit every step, tool call, and cumulative <code>modelUsage</code> budget check from{' '}
            <code>run-agent.ts</code>.
          </p>
        </div>
        <div className="wb-panel">
          <h2>Brand Guardrails</h2>
          <p>
            Maintain the single source of truth for brand profiles and refusal boundaries shared
            with <code>@mas/evals</code>.
          </p>
        </div>
      </section>
    </main>
  );
}
