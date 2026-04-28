import { promises as fs } from "node:fs";

export async function globalSetup() {
    // entering tmp dir so we dont pollute the actual project with testing files
    await fs.mkdir("/tmp/lingua-franca", { recursive: true });
    process.chdir("/tmp/lingua-franca");
}

export async function globalTeardown() {
    console.log("Global teardown executed");
}
