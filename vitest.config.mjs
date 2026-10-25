// The spec and state machine in src/ are copied unmodified from the private API.
// Their two imports from that codebase are redirected to minimal stand-ins in test/stubs.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (f) => fileURLToPath(new URL(`./test/stubs/${f}`, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.spec.ts"],
    alias: [
      { find: /^@prisma\/client$/, replacement: stub("prisma-client.ts") },
      { find: /^\.\.\/common\/errors\/app-exception$/, replacement: stub("app-exception.ts") },
    ],
  },
});
