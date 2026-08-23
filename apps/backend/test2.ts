import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/db/schema/index.ts';
import { issueTokenPair } from './src/modules/auth/service.ts';

async function test() {
  const client = postgres('postgresql://boardly:boardly_test@localhost:5433/boardly_test', { max: 1 });
  const db = drizzle(client, { schema });
  // We mock signAccessToken in service.ts? We can't directly call issueTokenPair because it's not exported.
}
