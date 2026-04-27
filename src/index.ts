import express from "express";
import { Graph } from "./graph.ts";
import { Obj, Relation, UserSet } from "./acl.ts";

const app = express();
const port = 3000;

app.get(
    "/user/:UserId/relation/:Relation/objectName/:ObjectName/type/:Type",
    (req, res) => {
        //const mortenEhr = new Obj("EHR", "Morten's");

        console.log(
            req.params.ObjectName,
            req.params.Relation,
            req.params.Type,
            req.params.UserId
        );

        let object = new Obj(req.params.Type, req.params.ObjectName);

        let users = graph.resolveSubjects(
            new UserSet(object, req.params.Relation)
        );

        console.log(users);

        if (users.has(Number(req.params.UserId))) {
            res.send("The docter has permission to the file");
        }

        res.send("The doctor does not have persmission to the file");
    }
);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
