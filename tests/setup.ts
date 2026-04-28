import { promises as fs } from "node:fs";

const TMP_DIR = "/tmp/lingua-franca";

export async function globalSetup() {
    // entering tmp dir so we dont pollute the actual project with testing files
    await fs.mkdir(TMP_DIR, { recursive: true });
    process.chdir(TMP_DIR);
}

export async function globalTeardown() {
    // clear the contents of the tmp dir to make sure we dont leave any junk that might cause weird behaviors in subsequent tests
    await fs.rm(TMP_DIR, { recursive: true, force: true });
}
