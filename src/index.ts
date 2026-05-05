import express from "express";
import { z } from "zod";
import { Obj, Relation, UserSet } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;
const graph = await deserializeConfig();
app.use(express.json()); // turns out body-parser isnt needed, express has its own json middleware

const AuthorizeQuerySchema = z.object({
    ObjectId: z.string().min(1), // .min(1) ensures no empty strings. without it, /authorize?ObjectId=&... would be valid input
    RelationName: z.string().min(1),
    Type: z.string().min(1),
    UserId: z.coerce.number().min(0), // we coerce because the input will be something like "1" and we want 1
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
    const { Type, ObjectId, RelationName, UserId } = result.data;

    const relation = new Relation(
        new Obj(Type, ObjectId),
        RelationName,
        UserId
    ); // merely constructing this to include its zanzibar-style string form in the response

    const object = new Obj(Type, ObjectId);
    const users = graph.resolveSubjects(new UserSet(object, RelationName));

    if (users.has(UserId)) {
        res.status(200).send(
            `Relation <code>${relation.toString()}</code> exists; permission granted`
        );
    } else {
        res.status(403).send(
            `Relation <code>${relation.toString()}</code> does not exist; permission denied`
        ); // 401 Unauthorized seems more fitting, but for some reason, it actually means Unauthenticated. Known misnomer. 403 is standard for when the user is actually unauthorized
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port.toString()}`);
});
