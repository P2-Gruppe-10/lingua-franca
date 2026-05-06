import { UserSet, Obj, type UserId, Relation } from "./acl.ts";
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

    private resolveUserset(subject: UserSet): Set<UserId> {
        const typeconfig = this.typeconfigs.get(subject.object.type);
        if (!typeconfig) return new Set();

        // finding direct paths first
        const direct = this.graph
            .getRelationsTo(subject.object)
            .filter((edge) => edge.name === subject.relationName)
            .map((edge) => edge.subject)
            .flatMap((s) => {
                if (typeof s === "number") return [s];
                return [...this.resolveUserset(s)];
            });

        // plop those into a new set
        const users = new Set(direct);

        // now its time to find the more indirect paths, those which go through rewrites
        const rewrites = typeconfig.usersetRewrites.get(subject.relationName);
        if (!rewrites) return users; // oop there are none, in other words the relation we are speaking of is defined to only be given to users with directly that relation on the object type

        for (const term of rewrites) {
            if (typeof term === "string") {
                // if the rewrite is just a string (another simple relationName, aka computed userset) we recurseeeeee
                for (const u of this.resolveUserset(
                    new UserSet(subject.object, term)
                )) {
                    users.add(u);
                }
            } else {
                // otherwise we're dealing with a tuple-to-userset kinda situation
                const targets = this.resolveTargets(
                    subject.object,
                    term.relation
                );
                for (const target of targets) {
                    for (const u of this.resolveUserset(
                        new UserSet(target, term.subRelation)
                    )) {
                        users.add(u);
                    }
                }
            }
        }

        return users;
    }

    private hasRelation(user: number, object: Obj, relation: string): boolean {
        // we just construct an auxillary userset with the notion of "everyone who has the relation on the object" and check if our user is in there
        return this.resolveUserset(new UserSet(object, relation)).has(user);
    }

    /**
     * Checks if a UserId has a certain permission on an object of a certain type.
     * Returns false on missing typeconfigs and invalid permission names; make sure to validate the AuthZ system first.
     * */
    hasPermission(user: number, object: Obj, permission: string): boolean {
        const typeconfig = this.typeconfigs.get(object.type);
        if (!typeconfig) return false;

        const grantingRelations = [...typeconfig.permissions].find(
            (perm) => perm.name === permission
        )?.grantedBy;
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
            // so we need to find tombstone usersets on this relation
            const targets = this.resolveTargets(object, grant.relation);

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

// const ehr = new Obj("EHR", "morten");
// const doctor = new Obj("group", "doctor");
// const chief = new Obj("group", "chief");
//
// const hurgAlpha = new Obj("hurg", "alpha");
// const hurgBeta = new Obj("hurg", "beta");
//
// const blablagraph = new Graph(
//     [],
//     [
//         new Relation(ehr, "viewer", new UserSet(doctor, "member")),
//         new Relation(ehr, "editor", new UserSet(chief, "member")),
//         new Relation(doctor, "parent", new UserSet(chief, TOMBSTONE)),
//         new Relation(chief, "member", 0),
//         new Relation(doctor, "member", 1),
//         new Relation(ehr, "owner", 2),
//         new Relation(hurgAlpha, "zoog", new UserSet(hurgBeta, TOMBSTONE)),
//         new Relation(hurgBeta, "shingle", 0),
//         new Relation(hurgAlpha, "zoog", 1),
//     ]
// );
// const ehrtc = await Typeconfig.fromFile("./schemas/EHR.tc");
// const grouptc = await Typeconfig.fromFile("./schemas/group.tc");
// const hurgtc = await Typeconfig.fromFile("./schemas/hurg.tc");
//
// const tcmap = new Map<string, Typeconfig>();
// tcmap.set("EHR", ehrtc);
// tcmap.set("group", grouptc);
// tcmap.set("hurg", hurgtc);
//
// const authz = new AuthZ(blablagraph, tcmap);
// const validation = authz.validate();
// console.log(validation);
//
// if (validation.length === 0) {
//     console.log(authz.hasPermission(0, ehr, "can_view"));
//     console.log(authz.hasPermission(1, ehr, "can_view"));
//     console.log(authz.hasPermission(0, ehr, "can_edit"));
//     console.log(authz.hasPermission(1, ehr, "can_edit"));
//     console.log(authz.hasPermission(2, ehr, "can_view"));
//     console.log(authz.hasPermission(2, ehr, "can_edit"));
//     console.log(authz.hasPermission(0, hurgAlpha, "ximploob"));
//     console.log(authz.hasPermission(1, hurgAlpha, "ximploob"));
//     console.log(authz.hasPermission(2, hurgAlpha, "ximploob"));
// }
