import { promises as fs } from "node:fs";
import { beforeAll, afterAll } from "vitest";

const TMP_DIR = "/tmp/lingua-franca";

beforeAll(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
    process.chdir(TMP_DIR);
});

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
});
