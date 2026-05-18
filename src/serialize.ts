import { promises as fs } from "node:fs";
import Graph from "./graph.ts";
import moment from "moment";

// Date/time format
const fmt = "YYYY-MM-DDTHH:mm:ss";

/**
 * Writes a graph to ./graph.json. As a side effect, also writes to ./backups/ if an hour has passed since last time
 * this was called.
 * */
export async function serializeGraph(graph: Graph): Promise<void> {
    // main effect: write the stringified graph to the default filepath
    const stringifiedGraph = graph.stringify();
    await fs.writeFile("./graph.json", stringifiedGraph);

    // side effect: make a backup if 1 hour since last time
    await makeBackup(stringifiedGraph, 1, "hours");
}

/**
 * Takes a string and writes it to a new file in ./backups, named the current time, if it has been [amount] [unit] since last backup. Example of [amount] [unit] could be 10 minutes.
 * */
async function makeBackup(stringifiedGraph: string, amount: moment.DurationInputArg1, unit: moment.DurationInputArg2) {
    // get current time and time of last backup
    const now = moment().format(fmt);
    const lastBackup = await lastBackupTime();

    // if at least one hour has passed since last backup, create a new backup
    if (moment(now).isAfter(lastBackup.add(amount, unit))) {
        await fs.mkdir("./backup/", { recursive: true });

        // create new backup file with current graph, name it the current time
        await fs.writeFile(`./backup/${now}.json`, stringifiedGraph);
    }
}

/*
 * Reads a graph from ./graph.json and parses it into a Graph object.
 * */
export async function deserializeGraph(): Promise<Graph> {
    const graph = await fs.readFile("./graph.json", { encoding: "utf-8" }).catch(() => `{"vertices": [], "edges": []}`);
    return Graph.fromJSON(graph);
}

/**
 * Finds the newest backup timestamp in ./backups/, returns a Moment object
 * */
async function lastBackupTime(): Promise<moment.Moment> {
    const backupfiles = await fs.readdir("./backup/").catch(() => []); // if no backups, give empty array which will fall back to unix epoch in next line
    const latestBackupFile = backupfiles.sort().reverse()[0] ?? "1970-06-07T00:00:00";
    const timestamp = latestBackupFile.replace(/\.json$/i, "");
    return moment(timestamp);
}

/**
 * Creates Graph from newest valid backup file.
 *
 * @throws {Error} if no valid backup can be found.
 */
export async function restoreFromBackup(): Promise<Graph> {
    // create an array of backup file names
    const backupfiles = await fs.readdir("./backup/").catch(() => []); // on error, give empty array, will jump to actual throw at the bottom of the function
    backupfiles.sort().reverse();

    for (const filename of backupfiles) {
        // attempt to read current backup file, create and return Graph
        try {
            const config = await fs.readFile(`./backup/${filename}`, {
                encoding: "utf-8",
            });
            return Graph.fromJSON(config);
        } catch {
            continue;
        }
    }
    throw new Error("No valid backup file could be found");
}
