import { promises as fs } from "node:fs";
import Graph from "./graph.ts";
import moment from "moment";

const fmt = "YYYY-MM-DDTHH:mm:ss";

export async function serializeConfig(graph: Graph): Promise<void> {
    //Converts graph to JSON string and assigns it to stringifiedGraph
    const stringifiedGraph = graph.stringify();

    //Gets current time and time of last backup
    const now = moment().format(fmt);
    const lastBackup = (
        await fs
            .readFile("./lastBackupTime.txt", { encoding: "utf-8" })
            .catch(() => "1970-06-07T00:00:00")
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
    await fs.writeFile("./config.json", stringifiedGraph);
}

export async function deserializeConfig(): Promise<Graph> {
    //Reads config.json
    const config = await fs.readFile("./config.json");

    //Converts config.json contents to Graph and returns this
    const graph = Graph.fromJSON(config.toString());

    return graph;
}

export async function restoreFromBackup(): Promise<Graph> {
    const backupfiles = await fs.readdir("/backup/");

    backupfiles.sort();

    for (const filename of backupfiles) {
        try {
            const config = await fs.readFile("./backup/" + filename);

            const graph = Graph.fromJSON(config.toString());

            return graph;
        } catch {
            continue;
        }
    }
}
