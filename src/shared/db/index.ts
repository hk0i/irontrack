/**
 * Barrel for src/shared/db/* — schema + every read/write helper, grouped by
 * domain into sibling files (see docs/edd-db-split.md).
 * No other file should touch db.routines / db.exercises / db.sets directly —
 * this keeps "weightInLbs is the only source of truth" invariant in one place.
 */

export * from './schema';
export * from './units';
export * from './exercises';
export * from './sets';
export * from './routines';
export * from './sessions';
export * from './bodyMetrics';
export * from './backup';
export * from './sharing';

export { db as default } from './schema';
