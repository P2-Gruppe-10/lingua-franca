import { UserSet, Obj } from "./acl.ts";
import Graph, { TOMBSTONE } from "./graph.ts";
import { Typeconfig } from "./typeconfig.ts";

type ValidationError =
    | { kind: "missing_typeconfig"; type: string }
    | { kind: "invalid_relation"; type: string; relationName: string };

/**
 * The Authorization system, being the result of harmony between a graph and a set of typeconfigs.
 * */
export class AuthZ {
    graph: Graph;
    typeconfigs: Map<string, Typeconfig>;

    constructor(graph: Graph, typeconfig: Map<string, Typeconfig>) {
        this.graph = graph;
        this.typeconfigs = typeconfig;
    }

    /**
     * Validates harmony between the graph and typeconfig inside the AuthZ object.
     * Returns a (possibly empty) list of ValidationErrors.
     * */
    validate(): ValidationError[] {
        const errors: ValidationError[] = [];
        const typesWithoutConfigs = new Set<string>();

        for (const edge of this.graph.edges) {
            const type = edge.object.type;
            const typeconfig = this.typeconfigs.get(type);

            if (!typeconfig) {
                typesWithoutConfigs.add(type);
                continue; // no point checking relations on a type with no config
            }

            if (!typeconfig.validRelations.has(edge.name)) {
                errors.push({
                    kind: "invalid_relation",
                    type,
                    relationName: edge.name,
                });
            }
        }

        for (const type of typesWithoutConfigs) {
            errors.push({ kind: "missing_typeconfig", type });
        }

        return errors;
    }

    private resolveTargets(object: Obj, relation: string): Obj[] {
        return this.graph
            .getRelationsTo(object)
            .filter((edge) => edge.name === relation)
            .filter(
                (edge) =>
                    edge.subject instanceof UserSet &&
                    edge.subject.relationName === TOMBSTONE
            )
            .map((edge) => (edge.subject as UserSet).object);
    }

    private hasRelation(
        user: number,
        object: Obj,
        relation: string,
        visited: Set<string> = new Set<string>()
    ): boolean {
        const visit = `${object.toString()}#${relation}`;
        if (visited.has(visit)) return false;
        visited.add(visit);
        const typeconfig = this.typeconfigs.get(object.type);
        if (!typeconfig) return false;

        // first handling direct paths thru usersets present in the graph
        if (this.graph.DFS(user, new UserSet(object, relation))) {
            return true;
        }

        // then userset rewrites
        const rewrites = typeconfig.usersetRewrites.get(relation);
        if (!rewrites) return false; // if there are none, you're out of luck

        for (const rewrite of rewrites) {
            if (typeof rewrite === "string") {
                // computed userset
                if (this.hasRelation(user, object, rewrite, visited))
                    return true;
            } else {
                // tuple-to-userset
                const targets = this.resolveTargets(object, rewrite.relation);
                for (const target of targets) {
                    if (
                        this.hasRelation(
                            user,
                            target,
                            rewrite.subRelation,
                            visited
                        )
                    ) {
                        return true;
                    }
                }
            }
        }
        return false; // if none of the previous steps gave us a true, they must not have the relation
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
                if (this.hasRelation(user, object, grant)) {
                    return true;
                }
                continue; // it's not a rewrite rule but it also didn't give our user the green light, so skip
            }
            // otherwise the grant is a rewrite rule
            const targets = this.resolveTargets(object, grant.relation);
            for (const target of targets) {
                if (this.hasRelation(user, target, grant.subRelation)) {
                    return true;
                }
            }
        }

        return false;
    }
}
