import { UserSet, Obj, type Subject, Relation } from "./acl.ts";
import Graph, { SENTINEL, type Vertex } from "./graph.ts";
import Typeconfig from "./typeconfig.ts";

type ValidationError =
    | { kind: "missing_typeconfig"; type: string }
    | { kind: "invalid_relation"; type: string; relationName: string };

type ValidationResult = ValidationError | { kind: "ok" };

/**
 * The Authorization system, being the result of harmony between a graph and a set of typeconfigs.
 * */
export default class AuthZ {
    graph: Graph;
    typeconfigs: Map<string, Typeconfig>;

    constructor(graph: Graph, typeconfigs: Map<string, Typeconfig>) {
        this.graph = graph;
        this.typeconfigs = typeconfigs;
    }

    private validateEdge(edge: Relation): ValidationResult {
        const type = edge.object.type;
        const typeconfig = this.typeconfigs.get(type);

        // does the edge's object's type have a config?
        if (!typeconfig) {
            return {
                kind: "missing_typeconfig",
                type,
            };
        }

        // if so, does the edge's relationName exist on that object's config?
        if (!typeconfig.validRelations.has(edge.name)) {
            return {
                kind: "invalid_relation",
                type,
                relationName: edge.name,
            };
        }

        // if so, if the subject is a UserSet, does the object of that UserSet:
        if (edge.subject instanceof UserSet) {
            const userset = edge.subject;
            const usersetObjectTypeconfig = this.typeconfigs.get(userset.object.type);

            // have a config for its type?
            if (!usersetObjectTypeconfig) {
                return {
                    kind: "missing_typeconfig",
                    type: userset.object.type,
                };
            }

            // if so, does the relation of the UserSet exist on that object? (given that it is not sentinel)
            if (userset.relationName !== SENTINEL && !usersetObjectTypeconfig.validRelations.has(userset.relationName))
                return {
                    kind: "invalid_relation",
                    type: userset.object.type,
                    relationName: userset.relationName,
                };
        }

        // if all this passes, the edge is good!
        return { kind: "ok" };
    }

    /**
     * Validates harmony between the graph and typeconfig inside the AuthZ object.
     * Returns a (possibly empty) list of ValidationErrors.
     * */
    validate(graph: Graph = this.graph): ValidationError[] {
        const errors: ValidationError[] = [];
        const typesWithoutConfigs = new Set<string>();

        for (const edge of graph.edges) {
            const error = this.validateEdge(edge);
            if (error.kind !== "ok") {
                if (error.kind === "missing_typeconfig") {
                    typesWithoutConfigs.add(error.type);
                } else {
                    errors.push(error);
                }
            }
        }

        for (const vertex of graph.vertices) {
            if (typeof vertex === "number") continue;
            if (!this.typeconfigs.has(vertex.type)) typesWithoutConfigs.add(vertex.type);
        }

        for (const type of typesWithoutConfigs) {
            errors.push({ kind: "missing_typeconfig", type });
        }

        return errors;
    }

    /**
     * Same as validate, but prints errors to stderr before returning.
     * */
    validateWithWarnings(): ValidationError[] {
        const errors = this.validate();
        if (errors.length > 0) {
            console.error("\x1b[0;31mWarning:\x1b[0m the following typeconfig-graph disparities were found:");
            for (const error of errors) {
                console.error(
                    error.kind === "missing_typeconfig"
                        ? `  \x1b[0;31m➜ Missing typeconfig: type ${error.type} has no config\x1b[0m`
                        : `  \x1b[0;31m➜ Invalid relation: type ${error.type} has no defined relation ${error.relationName}\x1b[0m`
                );
            }
        }
        return errors;
    }

    /**
     * Gets all objects in object#... usersets with a certain relation to another object.
     * */
    resolveTargets(object: Obj, relation: string): Obj[] {
        return this.graph
            .getRelationsTo(object)
            .filter((edge) => edge.name === relation)
            .filter((edge) => edge.subject instanceof UserSet && edge.subject.relationName === SENTINEL)
            .map((edge) => (edge.subject as UserSet).object);
    }

    /**
     * Checks if a UserId has a certain permission on an object of a certain type.
     * Returns false on missing typeconfigs and invalid permission names; make sure to validate the AuthZ system first.
     * */
    hasPermission(user: number, object: Obj, permission: string): boolean {
        const typeconfig = this.typeconfigs.get(object.type);
        if (!typeconfig) return false;

        const grantingRelations = typeconfig.permissions.get(permission);
        if (!grantingRelations) return false;

        for (const grant of grantingRelations) {
            // simple case, just look for a relation
            if (typeof grant === "string") {
                if (this.graph.DFS(user, new UserSet(object, grant), this)) {
                    return true;
                }
                continue; // it's not a rewrite rule but it also didn't give our user the green light, so skip
            }
            // otherwise the grant is a rewrite rule
            const targets = this.resolveTargets(object, grant.relation);
            for (const target of targets) {
                if (this.graph.DFS(user, new UserSet(target, grant.subRelation), this)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Adds an edge to the graph stored by the AuthZ system. Does not modify graph if validation fails.
     * @returns {ValidationResult} The result of validating the new edge.
     * @throws {Error} If the edge's object does not exist in the graph.
     * @throws {Error} If the edge's UserId or UserSet object does not exist in the graph.
     * @throws {Error} If the edge already exists in the graph.
     * */
    addEdge(obj: Obj, name: string, subject: Subject): ValidationResult {
        const res = this.validateEdge(new Relation(obj, name, subject));
        if (res.kind === "ok") this.graph.addEdge(obj, name, subject);
        return res;
    }

    /**
     * Adds a vertex to the graph stored by the AuthZ system. Does not modify graph if validation fails.
     * @returns {ValidationResult | { kind: "duplicate" }} The result of validating the new vertex.
     *                                                     `{ kind: "duplicate" }` if the vertex already exists in the graph.
     * */
    addVertex(vertex: Vertex): ValidationResult | { kind: "duplicate" } {
        if (vertex instanceof Obj && !this.typeconfigs.has(vertex.type)) {
            return { kind: "missing_typeconfig", type: vertex.type };
        }
        if (!this.graph.addVertex(vertex)) {
            return { kind: "duplicate" };
        }
        return { kind: "ok" };
    }

    /**
     * Modifies an object in the graph stored by the AuthZ system. Does not modify graph if validation fails.
     * @returns {ValidationResult | { kind: "duplicate_or_nonexistent" }} The result of validating the modified vertex.
     *                                                                    `{ kind: "duplicate_or_nonexistent" }` if the
     *                                                                    original object does not exist in the graph,
     *                                                                    or the modified object already exists in the graph.
     */
    modifyObject(original: Obj, modified: Obj): ValidationResult | { kind: "duplicate_or_nonexistent" } {
        if (!this.typeconfigs.has(modified.type)) {
            return { kind: "missing_typeconfig", type: modified.type };
        }
        if (!this.graph.modifyObject(original, modified)) {
            return { kind: "duplicate_or_nonexistent" };
        }
        return { kind: "ok" };
    }

    /**
     * Deletes an edge in the graph stored by the AuthZ system.
     * @returns {boolean} `true` if the edge was found and successfully deleted.
     *                    `false` if the edge did not exist in the graph.
     * */
    deleteEdge(relation: Relation): boolean {
        return this.graph.deleteEdge(relation);
    }

    /**
     * Deletes a vertex in the graph stored by the AuthZ system.
     * @returns {boolean} `true` if the vertex was found and successfully deleted.
     *                    `false` if the vertex did not exist in the graph.
     * */
    deleteVertex(vertex: Vertex): boolean {
        return this.graph.deleteVertex(vertex);
    }
}
