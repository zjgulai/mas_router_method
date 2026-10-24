import { describeStoreContract } from '../../contracts/store-contract.js';

/**
 * The SQLite adapter must satisfy the same contract the eval fake does.
 *
 * ADR 0009 asked for this and it was never built — which is how the eval fake
 * drifted into accepting runs SQLite rejects and returning `[]` from `list()`.
 */
describeStoreContract({
  name: 'sqlite',
  async create() {
    const { SqliteStore } = await import('./index.js');
    const store = new SqliteStore(':memory:');
    return {
      brands: store,
      references: store,
      recipes: store,
      runs: store,
      async seedBrands() {
        store.seedBrands();
      },
      async close() {
        store.close();
      },
    };
  },
});
