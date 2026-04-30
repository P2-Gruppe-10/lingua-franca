import express from "express";
import type { Request } from "express";
import bodyParser from "body-parser";
import { Obj, UserSet } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;

const graph = await deserializeConfig();

app.use(bodyParser.json());

interface AuthorizeBody {
    ObjectId: string;
    RelationName: string;
    Type: string;
    UserId: string;
}

app.get("/authorize", (req: Request<unknown, unknown, AuthorizeBody>, res) => {
    console.log(
        req.body.ObjectId,
        req.body.RelationName,
        req.body.Type,
        req.body.UserId
    );

    const object = new Obj(req.body.Type, req.body.ObjectId);

    const users = graph.resolveSubjects(
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
    console.log(`Example app listening on port ${port.toString()}`);
});
