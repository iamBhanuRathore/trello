import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/db/schema/index.ts';

const client = postgres('postgresql://boardly:boardly_test@localhost:5433/boardly_test', { max: 1 });
const db = drizzle(client, { schema });

async function test() {
  try {
    const expiresAt = new Date();
    await db.insert(schema.refreshTokens).values({
      userId: '00000000-0000-0000-0000-000000000000',
      tokenHash: 'abc',
      expiresAt,
    });
    console.log("refreshTokens insert OK");
  } catch(e) {
    console.error("refreshTokens insert error:", e);
  }
  process.exit(0);
}
test();
