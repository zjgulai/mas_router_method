/**
 * Session shape and the one rule about it that the whole workbench depends on:
 * **a session carries the brands a user may see, not a role.**
 *
 * Role-based checks read well until the second tenant arrives, at which point every
 * `if (role === 'admin')` becomes a data-leak review. Brand scoping is a property
 * of the request, so it is threaded from here into every query and every agent run.
 */
export interface Session {
  userId: string;
  displayName: string;
  /** Feishu open_id, used to attribute Feishu-originated runs to the same person. */
  feishuOpenId?: string;
  /** Brands this user may act on. Empty is valid: a user with no brand sees an empty state. */
  brandIds: string[];
}

/**
 * Resolve the session from a request. Placeholder until OAuth lands with milestone 3.
 *
 * It returns null rather than a fake user on purpose: a dev-mode bypass that
 * silently grants access is the single most common way a "we'll add auth later"
 * app ships to production with no auth.
 */
export async function getSession(): Promise<Session | null> {
  const devUser = process.env['DEV_SESSION_USER_ID'];
  if (process.env['NODE_ENV'] !== 'production' && devUser !== undefined) {
    return {
      userId: devUser,
      displayName: devUser,
      brandIds: (process.env['DEV_SESSION_BRAND_IDS'] ?? '').split(',').filter(Boolean),
    };
  }
  return null;
}
