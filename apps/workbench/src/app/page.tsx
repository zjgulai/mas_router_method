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
    <main style={{ fontFamily: 'ui-sans-serif, system-ui', padding: '4rem', maxWidth: 640 }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Recipe workbench</h1>
      {session === null ? (
        <p style={{ color: '#666' }}>
          Not signed in. Feishu OAuth arrives with milestone 3; until then set
          DEV_SESSION_USER_ID and DEV_SESSION_BRAND_IDS in .env to work locally.
        </p>
      ) : (
        <p style={{ color: '#666' }}>
          Signed in as {session.displayName} with {session.brandIds.length} brand(s). The review
          queue, run inspector, and guardrail editor are specified in docs/roadmap.md.
        </p>
      )}
    </main>
  );
}
