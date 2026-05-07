import express from "express";
import { z } from "zod";
import { Obj, Relation, UserSet, type Subject } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;
const graph = await deserializeConfig();
app.use(express.json()); // turns out body-parser isnt needed, express has its own json middleware

const AuthorizeQuerySchema = z.object({
    objectId: z.string().min(1), // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    relationName: z.string().min(1),
    type: z.string().min(1),
    userId: z.coerce.number().min(0), // we coerce because the input will be something like "1" and we want 1
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
    const { type, objectId, relationName, userId } = result.data;

    const relation = new Relation(
        new Obj(type, objectId),
        relationName,
        userId
    ); // merely constructing this to include its zanzibar-style string form in the response

    const object = new Obj(type, objectId);
    const users = graph.resolveSubjects(new UserSet(object, relationName));

    if (users.has(userId)) {
        res.status(200).send(
            `Relation <code>${relation.toString()}</code> exists; permission granted`
        );
    } else {
        res.status(403).send(
            `Relation <code>${relation.toString()}</code> does not exist; permission denied`
        ); // 401 Unauthorized seems more fitting, but for some reason, it actually means Unauthenticated. Known misnomer. 403 is standard for when the user is actually unauthorized
    }
});

const ObjectSchema = z.object({
    type: z.string().min(1), // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    identifier: z.string().min(1),
});

const UserSetSchema = z.object({
    object: ObjectSchema,
    relationName: z.string().min(1),
});

const SubjectSchema = z.union([UserSetSchema, z.number()]);

const RelationsQuerySchema = z.object({
    object: ObjectSchema, // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    name: z.string().min(1),
    subject: SubjectSchema,
});

app.post("/relations", (req, res) => {
    const result = RelationsQuerySchema.safeParse(req.body);

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
        graph.addEdge(obj, name, subject);
    } catch (err) {
        if (!(err instanceof Error)) {
            console.error("Error is unknown type: ", err);
            res.status(500).send({ error: "Whoopsies" }).end();
            return;
        }

        res.status(409)
            .send({
                error: `[${err.name}]: ${err.message}`,
            })
            .end();

        return;
    }

    res.status(200).end();
});

// Remove relation from graph
// app.delete("/relations", (req, res) => {
//
// })

// Modify existing relation
// app.put("/relations", (req, res) => {
//
// })

// Add new object to graph
// app.post("/objects", (req, res) => {
//
// })

// Remove object from graph
// app.delete("/objects", (req, res) => {
//
// })

// Modify existing object
// app.put("/objects", (req, res) => {
//
// })

app.listen(port, () => {
    console.log(`Example app listening on port ${port.toString()}`);
});
