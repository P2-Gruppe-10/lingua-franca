import express from "express";
import { Obj, UserSet } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;

const graph = await deserializeConfig();

app.get(
    "/user/:UserId/relation/:RelationName/objectId/:ObjectId/type/:Type",
    (req, res) => {
        console.log(
            req.params.ObjectId,
            req.params.RelationName,
            req.params.Type,
            req.params.UserId
        );

        const object = new Obj(req.params.Type, req.params.ObjectId);

        const users = graph.resolveSubjects(
            new UserSet(object, req.params.RelationName)
        );

        console.log(users);

        res.statusCode = 200;

        if (users.has(Number(req.params.UserId))) {
            res.send("The docter has permission to the file");
        } else res.send("The doctor does not have persmission to the file");

        res.end();
    }
);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
