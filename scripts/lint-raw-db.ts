import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const FORBIDDEN_IMPORTS = ['rawWriteDb', 'rawReadDb', 'writeClient', 'readClient'];
const ROOT_DIR = join(import.meta.dir, '../apps/backend/src');

async function scanDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const violations: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...(await scanDirectory(fullPath)));
    } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      // Allow internal db definitions and db tests
      if (
        fullPath.includes('/src/db/index.ts') ||
        fullPath.includes('/src/db/migrate.ts') ||
        fullPath.includes('/src/db/reset.ts') ||
        fullPath.includes('/src/db/db.test.ts')
      ) {
        continue;
      }

      const content = await readFile(fullPath, 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (content.includes(forbidden)) {
          violations.push(`${fullPath}: direct reference to '${forbidden}' found`);
        }
      }
    }
  }

  return violations;
}

console.log('🔍 Checking for raw database client bypass violations...');
const violations = await scanDirectory(ROOT_DIR);

if (violations.length > 0) {
  console.error('❌ Found RLS/tenant-isolation violations:');
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
} else {
  console.log('✅ No raw database bypass violations found. All tenant queries route safely.');
}
