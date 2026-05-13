import express from "express";
import { z } from "zod";
import { Obj, Relation, UserSet, type Subject, type UserId } from "./acl.ts";
import { deserializeConfig, serializeConfig } from "./serialize.ts";
import AuthZ from "./authz.ts";

process.title = "lingua";
const app = express();
const port = 3000;
app.use(express.json()); // turns out body-parser isnt needed, express has its own json middleware

const graph = await deserializeConfig();
const authz = await AuthZ.withDir(graph, "./schemas/");
authz.validateWithWarnings();

// Save the graph every 10 seconds
setInterval(() => {
    serializeConfig(graph).catch((err: unknown) => {
        console.warn("Failed to serialize graph:", err);
    });
}, 10000);

const AuthorizeQuerySchema = z.object({
    objectId: z.string().min(1), // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    permission: z.string().min(1),
    type: z.string().min(1),
    userId: z.coerce.number().min(0), // we coerce because the input will be something like "1" and we want 1
});

const ObjectSchema = z.object({
    type: z.string().min(1), // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    identifier: z.string().min(1),
});

const ModifyObjectSchema = z.object({
    original: ObjectSchema,
    modified: ObjectSchema,
});

const UserSetSchema = z.object({
    object: ObjectSchema,
    relationName: z.string().min(1),
});

const SubjectSchema = z.union([UserSetSchema, z.coerce.number()]);

const RelationSchema = z.object({
    object: ObjectSchema, // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    name: z.string().min(1),
    subject: SubjectSchema,
});

const RelationQuerySchema = z.object({
    objectType: z.string().min(1),
    objectIdentifier: z.string().min(1),
    name: z.string().min(1),
    subject: SubjectSchema,
});

app.get("/authorize", (req, res) => {
    const result = AuthorizeQuerySchema.safeParse(req.query);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid query parameters",
                details: z.treeifyError(result.error),
            });

        return;
    }

    // at this point we know that the request fits the schema, so the types are ensured
    const { type, objectId, permission, userId } = result.data;
    const object = new Obj(type, objectId);

    if (authz.hasPermission(userId, object, permission)) {
        res.status(200).end();
        return;
    }
    res.status(403).end(); // 401 Unauthorized seems more fitting, but for some reason, it actually means Unauthenticated. Known misnomer. 403 is standard for when the user is actually unauthorized
});

app.post("/relations", (req, res) => {
    const result = RelationSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid post body",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const { object, name } = result.data;

    const obj = new Obj(object.type, object.identifier);

    let subject: Subject;
    // subject is UserId
    if (typeof result.data.subject === "number") {
        subject = result.data.subject;
    } else {
        const bodyObj = result.data.subject.object;
        const object = new Obj(bodyObj.type, bodyObj.identifier);

        subject = new UserSet(object, result.data.subject.relationName);
    }

    try {
        const errors = authz.addEdge(obj, name, subject);
        if (errors.length > 0) {
            res.status(422).json({ errors: errors });
            return;
        }
    } catch (err) {
        if (!(err instanceof Error)) {
            console.error("Error is unknown type: ", err);
            res.status(500).send({ error: "Whoopsies" });
            return;
        }

        res.status(409).send({
            error: `[${err.name}]: ${err.message}`,
        });

        return;
    }

    res.status(200).end();
});

// Remove relation from graph
app.delete("/relations", (req, res) => {
    const result = RelationQuerySchema.safeParse(req.query);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid delete query",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const { objectType, objectIdentifier, name } = result.data;

    const obj = new Obj(objectType, objectIdentifier);

    let subject: Subject;
    // subject is UserId
    if (typeof result.data.subject === "number") {
        subject = result.data.subject;
    } else {
        const bodyObj = result.data.subject.object;
        const object = new Obj(bodyObj.type, bodyObj.identifier);

        subject = new UserSet(object, result.data.subject.relationName);
    }

    const relation = new Relation(obj, name, subject);

    if (!authz.deleteEdge(relation)) {
        res.status(409).json({
            error: "Could not delete edge; does not exist",
        });

        return;
    }

    res.status(200).end();
});

// Add new object to graph
app.post("/objects", (req, res) => {
    const result = ObjectSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid post body",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const object = new Obj(result.data.type, result.data.identifier);
    const modificationResult = authz.addVertex(object);

    if (modificationResult === null) {
        res.status(409).json({
            error: "Object already exists",
        });
        return;
    }
    if (modificationResult.length > 0) {
        res.status(422).json({ errors: modificationResult });
        return;
    }
    res.status(200).end();
});

// Remove object from graph
app.delete("/objects", (req, res) => {
    const result = ObjectSchema.safeParse(req.query);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid delete query",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const object = new Obj(result.data.type, result.data.identifier);

    if (!authz.deleteVertex(object)) {
        res.status(409).json({
            error: "Could not find the object",
        });
        return;
    }

    res.status(200).end();
});

// Modify existing object
app.put("/objects", (req, res) => {
    const result = ModifyObjectSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid put body",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const orginal = new Obj(
        result.data.original.type,
        result.data.original.identifier
    );
    const modified = new Obj(
        result.data.modified.type,
        result.data.modified.identifier
    );

    const modificationResult = authz.modifyObject(orginal, modified);
    if (modificationResult === null) {
        res.status(409).json({
            error: "Could not find the object to modify, or resulting object already exists",
        });
        return;
    }
    if (modificationResult.length > 0) {
        res.status(422).json({ errors: modificationResult });
        return;
    }

    res.status(200).end();
});

//Add subject to graph
app.post("/subjects", (req, res) => {
    const result = z
        .object({ userId: z.coerce.number().min(0) })
        .safeParse(req.body);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid post body",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const subject: UserId = result.data.userId;

    if (!authz.addVertex(subject)) {
        res.status(409).json({
            error: "Subject already exists",
        });
        return;
    }

    res.status(200).end();
});

//Delete subject from graph
app.delete("/subjects", (req, res) => {
    const result = z
        .object({ userId: z.coerce.number().min(0) })
        .safeParse(req.query);

    if (!result.success) {
        res.status(400)
            .contentType("application/json")
            .json({
                error: "Invalid delete query",
                details: z.treeifyError(result.error),
            });
        return;
    }

    const subject: UserId = result.data.userId;

    if (!authz.deleteVertex(subject)) {
        res.status(409).json({
            error: "Subject does not exist",
        });
        return;
    }

    res.status(200).end();
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port.toString()}`);
});
