import { promises as fs } from "node:fs";
import Graph from "./graph.ts";

export async function serializeConfig(graph: Graph): Promise<void> {
    //Converts graph to JSON string and assigns it to strinifiedGraph
    const stringifiedGraph = graph.stringify();

    //Overwrites config.json to stringifiedGraph
    await fs.writeFile("./config.json", stringifiedGraph);
}

export async function deserializeConfig(): Promise<Graph> {
    //Reads config.json
    const config = await fs.readFile("./config.json");

    //Converts config.json contents to Graph and returns this
    return Graph.fromJSON(config.toString());
}
