import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: false,
        setupFiles: ["./tests/helpers/setup.ts"],
        fileParallelism: false, // this is true by default, and sadly it causes a race condition
    },
});
