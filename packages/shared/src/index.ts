/**
 * The public surface of `@mas/shared`.
 *
 * Everything the runtime, gateway, and UI agree on lives here, and nowhere else.
 * If two packages need the same type, it belongs in this file's exports — a
 * duplicated type is a bug that only shows up after a schema change.
 */
export * from './ids.js';
export * from './brand.js';
export * from './reference.js';
export * from './recipe.js';
export * from './run.js';
