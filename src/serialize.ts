import { promises as fs } from "node:fs";
import Graph from "./graph.ts";
import moment from "moment";

export async function serializeConfig(graph: Graph): Promise<void> {
    //Converts graph to JSON string and assigns it to stringifiedGraph
    const stringifiedGraph = graph.stringify();

    //Gets current time and time of last backup
    const now = moment().format("YYYY-MM-DDTHH:mm:ss");
    const lastBackup = (
        await fs
            .readFile("./lastBackupTime.txt", { encoding: "utf-8" })
            .catch(() => "")
    ).trim();

    //Compare if at least one hour since last backup - if so create new backup
    if (moment(now).isAfter(lastBackup, "hour")) {
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

    Object.setPrototypeOf(graph, Graph.prototype);

    return graph;
}
