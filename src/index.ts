import express from "express";
import bodyParser from "body-parser";
import { Obj, UserSet } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;

let graph = await deserializeConfig();

app.use(bodyParser.json());

app.get("/authorize", (req, res) => {
    //   "/user/:UserId/relation/:RelationName/objectId/:ObjectId/type/:Type",

    console.log(
        req.body.ObjectId,
        req.body.RelationName,
        req.body.Type,
        req.body.UserId
    );

    let object = new Obj(req.body.Type, req.body.ObjectId);

    let users = graph.resolveSubjects(
        new UserSet(object, req.body.RelationName)
    );

    console.log(users);

    res.statusCode = 200;

    if (users.has(Number(req.body.UserId))) {
        res.send("The docter has permission to the file");
    } else res.send("The doctor does not have persmission to the file");

    res.end();
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
