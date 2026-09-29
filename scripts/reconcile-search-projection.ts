import { getDb } from '../src/lib/server/db';
import { runSearchProjectionReconcile } from '../src/lib/server/modules/discovery-search';

const db = getDb();
const result = await runSearchProjectionReconcile(db, new Date());
console.log(
	`search-projection-reconcile complete (upserted=${result.upserted}, removed=${result.removed})`
);
