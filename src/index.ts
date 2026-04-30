import express, { type Request } from "express";
import bodyParser from "body-parser";
import { Obj, UserSet, type Subject } from "./acl.ts";
import { deserializeConfig } from "./serialize.ts";

const app = express();
const port = 3000;

const graph = await deserializeConfig();

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

interface RelationsPostBody {
    object: Obj;
    name: string;
    subject: Subject;
}

app.post(
    "/relations",
    (req: Request<unknown, unknown, RelationsPostBody>, res) => {
        const obj = new Obj(req.body.object.type, req.body.object.identifier);
        let subject: Subject;
        // subject is UserId
        if (typeof req.body.subject === "number") {
            subject = req.body.subject;
        } else {
            const bodyObj = req.body.subject.object;
            const object = new Obj(bodyObj.type, bodyObj.identifier);

            subject = new UserSet(object, req.body.subject.relationName);
        }

        try {
            graph.addEdge(obj, req.body.name, subject);
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
    }
);

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
    console.log(`Example app listening on port ${port}`);
});
