import { describeStoreContract } from '@mas/core';
import { createFakeEnv } from './fixtures.js';
import { seedBrand } from '@mas/core';
import { BRAND_IDS } from '@mas/core';

/**
 * The eval fake must satisfy the same contract as SQLite (ADR 0009).
 *
 * If this suite fails, an eval run is measuring the fixture rather than the agent.
 */
describeStoreContract({
  name: 'eval fake',
  async create() {
    const env = createFakeEnv();
    return {
      brands: env.brands,
      references: env.references,
      recipes: env.recipes,
      runs: env.runs,
      async seedBrands() {
        for (const id of Object.values(BRAND_IDS)) {
          // The fake brand store creates on demand; touching it is the seed.
          await env.brands.get(id);
          void seedBrand(id);
        }
      },
      async close() {},
    };
  },
});
