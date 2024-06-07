import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";
import { client } from "./Database/db.config.js";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

app.use(
  cors({
    origin: ["http://localhost:5173", "https://taskph11.netlify.app"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("🚀 Working fine!");
});

app.listen(PORT, () => {
  console.log(`🚀 App is Running on ${PORT}`);
});



async function run() {
  try {
    const database = client.db("contestHub");
    const contestsCollection = database.collection("contests");
    const usersCollection = database.collection("users");

    app.get("/contests", async (req, res) => {
      let contests = contestsCollection.find().sort({ due: -1 });
      contests = await contests.toArray();
      res.status(200).send({ success: true, data: contests });
    });

    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().sort({ name: 1 }).toArray();
      res.send({success: true, data:users})
    })



    // post+
    app.post('/user', async (req, res) => {
      const user = req.body;
      const getUser = await usersCollection.findOne({email: user.email});
      if(getUser) return res.send({success: false, message: "User already exists"})
      const result = await usersCollection.insertOne(user);
      res.send({success: true, data:result});
    })

    app.put('/users/:id', async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      console.log(user);
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      res.send({success: true, data:result});
    })


    // contests
    app.post('/contests', async (req, res) => {
      const contest = req.body;
      const result = await contestsCollection.insertOne(contest);
      res.send({success: true, data:result});
    })

    app.get('/contests/:id', async (req, res) => {
      const id = req.params.id;
      const contest = await contestsCollection.findOne({_id: new ObjectId(id)});
      res.send({success: true, data:contest});
    })

    



  } finally {
    //setTimeout(() => {client.close()}, 1500)
  }
}
run().catch(console.dir);

export default app;
