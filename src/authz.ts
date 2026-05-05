import { UserSet, type Obj } from "./acl.ts";
import Graph, { TOMBSTONE } from "./graph.ts";
import { Typeconfig } from "./typeconfig.ts";

type ValidationError =
    | { kind: "missing_typeconfig"; type: string }
    | { kind: "invalid_relation"; type: string; relationName: string };

/**
 * The Authorization system, being the result of harmony between a graph and a typeconfig.
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

    private hasRelation(user: number, object: Obj, relation: string): boolean {
        return this.graph
            .resolveSubjects(new UserSet(object, relation))
            .has(user);
    }

    /**
     * Expands a grant. By this we mean a relation in the context of permission grants; we wish to take a relation and return an array containing that relation plus any other relation that is given this relation by the typeconfig. For example, if owner gives editor, and editor gives viewer, then expandGrant("viewer", whatevertypeconfig) returns ["owner", "editor"].
     * */
    private expandGrant(grant: string, typeconfig: Typeconfig): string[] {
        const expandedGrants = [...typeconfig.relationRules]
            .filter((rule) => rule.affected === grant)
            .map((rule) => rule.give);
        if (expandedGrants.length === 0) {
            return [];
        }
        return expandedGrants.flatMap((g) => this.expandGrant(g, typeconfig));
    }

    /**
     * Checks if a UserId has a certain permission on an object of a certain type.
     * Returns false on missing typeconfigs and invalid permission names; make sure to validate the AuthZ system first.
     * */
    hasPermission(user: number, object: Obj, permission: string): boolean {
        const typeconfig = this.typeconfigs.get(object.type);
        if (!typeconfig) {
            return false;
        }

        const grantingRelations = [...typeconfig.permissions].find(
            (perm) => perm.name === permission
        )?.grantedBy;
        if (!grantingRelations) {
            return false;
        }

        for (const grant of grantingRelations) {
            // simple case, just look for a relation
            if (typeof grant === "string") {
                const expandedGrants = this.expandGrant(grant, typeconfig);
                for (const g of [...expandedGrants, grant]) {
                    if (
                        this.graph
                            .resolveSubjects(new UserSet(object, g))
                            .has(user)
                    ) {
                        return true;
                    }
                }
                continue; // it's not a rewrite rule but it also didn't give our user the green light, so skip
            }
            // otherwise the grant is a rewrite rule
            // so we need to find tombstone usersets on this relation
            const targets = this.graph
                .getRelationsTo(object)
                .filter((relation) => relation.name === grant.relation) // now we have all relations to the object with the right relation name
                .filter(
                    (relation) =>
                        relation.subject instanceof UserSet &&
                        relation.subject.relationName === TOMBSTONE
                ) // we are only interested in relations where the subject is a UserSet like `parent#...`
                .map((relation) => (relation.subject as UserSet).object); // we can cast the subject to UserSet since we just filtered for UserSets only. then, we are only interested in the objects of those relations

            // now that we have a list of objects, we can call hasRelation on those.
            // for example, if the grant is `parent->viewer` and the object is `doc:readme`, we find `doc:readme#parent@folder:home#...`, extract `folder:home`, and then check hasRelation(user, folder:home, "viewer").
            // it's worth noting that this approach doesn't support a situation where one rewrite rule resolves to a type of object which itself has even more rewrite rules. hopefully this will simply remain out of scope for our project though.
            for (const target of targets) {
                if (this.hasRelation(user, target, grant.subRelation)) {
                    return true;
                }
            }
        }

        return false;
    }
}
