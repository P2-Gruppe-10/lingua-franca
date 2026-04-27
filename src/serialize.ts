import { promises as fs } from "node:fs";
import Graph from "./graph.ts";

export async function serializeConfig(graph: Graph): Promise<void> {
    const stringifiedGraph = graph.stringify();

    await fs.writeFile("./config.json", stringifiedGraph);
}

export async function deserializeConfig(): Promise<Graph> {
    const config = await fs.readFile("./config.json");

    return Graph.fromJSON(config.toString());
}
