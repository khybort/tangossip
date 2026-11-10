import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        main: './worker/index.ts',
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, HASH_KEY: 'test-hash-key' } },
      }),
    ],
    test: { include: ['tests/**/*.test.ts'], setupFiles: ['./tests/setup.ts'] },
  };
});
