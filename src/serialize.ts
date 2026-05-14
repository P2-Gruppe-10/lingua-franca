import { promises as fs } from "node:fs";
import Graph from "./graph.ts";
import moment from "moment";

// Date/time format
const fmt = "YYYY-MM-DDTHH:mm:ss";

/**
 * Updates config.json with newest version of Graph
 *
 * If more than 1 hour since last backup a new one is created
 */
export async function serializeGraph(graph: Graph): Promise<void> {
    //Converts graph to JSON string and assigns it to stringifiedGraph
    const stringifiedGraph = graph.stringify();

    //Gets current time and time of last backup
    const now = moment().format(fmt);
    const lastBackup = (
        await fs.readFile("./lastBackupTime.txt", { encoding: "utf-8" }).catch(() => "1970-06-07T00:00:00")
    ).trim();

    //Compare if at least one hour since last backup - if so create new backup
    if (moment(now).isAfter(moment(lastBackup).add(1, "hours"))) {
        await fs.mkdir("./backup/", { recursive: true });
        //Create filepath string for new backup
        const backupFileName = "./backup/" + now + ".json";

        //Create new backup file with current graph with name from backupFileName
        await fs.writeFile(backupFileName, stringifiedGraph);

        //Update time of last backup to now
        await fs.writeFile("./lastBackupTime.txt", now);
    }

    //Update config file with newest version of graph
    await fs.writeFile("./graph.json", stringifiedGraph);
}

/**
 * Creates Graph from newest config.json file
 *
 * @throws {Error} if config.json did not create a valid
 */
export async function deserializeGraph(): Promise<Graph> {
    const config = await fs.readFile("./graph.json");
    return Graph.fromJSON(config.toString());
}

/**
 * Creates Graph from newest valid backup file.
 *
 * @throws {Error} if no valid backup can be found.
 */
export async function restoreFromBackup(): Promise<Graph> {
    // create an array of backup file names
    const backupfiles = await fs.readdir("/backup/");
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
