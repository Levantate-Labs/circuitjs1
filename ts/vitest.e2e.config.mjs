// Copyright (C) 2026 Levantate Labs. GNU GPL v2 or later.
// End-to-end tests against the built app (run `npm run build` first): npm run test:e2e
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["e2e/**/*.e2e.mjs"],
        testTimeout: 60_000,
        hookTimeout: 90_000,
        fileParallelism: false,
    },
});
