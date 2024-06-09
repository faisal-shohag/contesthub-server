import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";
import { client } from "./Database/db.config.js";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import Stripe from "stripe";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(stripeSecretKey);

const app = express();
const PORT = process.env.PORT || 5000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

app.use(
  cors({
    origin: ["http://localhost:5173", "https://taskph12.netlify.app"],
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
    const participationCollection = database.collection('participations')

 


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
    app.get("/contests", async (req, res) => {
      try {
        const contests = await contestsCollection.aggregate([
          {
            $match: {
              status: 'approved'  // Only approved contests
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'creator_email',
              foreignField: 'email',
              as: 'creatorDetails'
            }
          },
          {
            $unwind: {
              path: '$creatorDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'participations',
              localField: '_id',
              foreignField: 'contestId',
              as: 'participations'
            }
          },
          {
            $addFields: {
              participationsCount: { $size: '$participations' }
            }
          },
          {
            $sort: { due: -1 }
          },
          {
            $project: {
              name: 1,
              image: 1,
              description: 1,
              price: 1,
              price_money: 1,
              instruction: 1,
              type: 1,
              due: 1,
              status: 1,
              creator_email: 1,
              'creatorDetails.name': 1,
              'creatorDetails.email': 1,
              'creatorDetails.photoURL': 1,
              participationsCount: 1
            }
          }
        ]).toArray();
    
        res.status(200).send({ success: true, data: contests });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    //contest search
    app.get('/contests/search', async (req, res) => {
      const keyword = req.query.keyword;
      
      if (!keyword) {
        return  res.send({
          success: true,
          data: []
        });
      }
    
      try {
        const regex = new RegExp(keyword, 'i'); // 'i' for case-insensitive
        
        const contests = await contestsCollection.aggregate([
          {
            $match: {
              status: 'approved',
              $or: [
                { name: { $regex: regex } },
                { description: { $regex: regex } },
                { type: { $regex: regex } }
              ]
            }
          },
          {
            $lookup: {
              from: 'participations',
              let: { contestId: { $toString: '$_id' } },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$contestId', '$$contestId'] }
                  }
                }
              ],
              as: 'participations'
            }
          },
          {
            $addFields: {
              participationsCount: { $size: '$participations' }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'participations.user_email',
              foreignField: 'email',
              as: 'participantDetails'
            }
          },
          {
            $project: {
              name: 1,
              image: 1,
              description: 1,
              price: 1,
              price_money: 1,
              instruction: 1,
              type: 1,
              due: 1,
              status: 1,
              creator_email: 1,
              participationsCount: 1,
              participantDetails: {
                _id: 1,
                name: 1,
                email: 1
              }
            }
          },
          {
            $sort: { due: -1 }
          }
        ]).toArray();
    
        res.send({
          success: true,
          data: contests
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });



    app.post('/contests', async (req, res) => {
      const contest = req.body;
      const result = await contestsCollection.insertOne(contest);
      res.send({success: true, data:result});
    })


    // get individual contest with all info
    app.get('/contests/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const contest = await contestsCollection.aggregate([
          {
            $match: { _id: new ObjectId(id) }
          },
          {
            $lookup: {
              from: 'participations',
              let: { contestId: { $toString: '$_id' } },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$contestId', '$$contestId'] }
                  }
                }
              ],
              as: 'participations'
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'participations.user_email',
              foreignField: 'email',
              as: 'participantDetails'
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'creator_email',
              foreignField: 'email',
              as: 'creatorDetails'
            }
          },
          {
            $unwind: {
              path: '$creatorDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $addFields: {
              participationsCount: { $size: '$participations' }
            }
          },
          {
            $project: {
              name: 1,
              image: 1,
              description: 1,
              price: 1,
              price_money: 1,
              instruction: 1,
              type: 1,
              due: 1,
              status: 1,
              creator_email: 1,
              creatorDetails: { name: 1, email: 1, photoURL: 1 },
              participationsCount: 1,
              participantDetails: 1
            }
          }
        ]).toArray();
    
        if (contest.length === 0) {
          return res.status(404).send({ success: false, message: 'Contest not found' });
        }
    
        res.status(200).send({ success: true, data: contest[0] });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    

    app.get('/my_contests/:email', async (req, res) => {
      const email = req.params.email;
      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const limit = 10; // 10 items per page
      const skip = (page - 1) * limit;
    
      try {
        const contests = await contestsCollection
          .find({ creator_email: email })
          .skip(skip)
          .limit(limit)
          .toArray();
    
        const totalContests = await contestsCollection.countDocuments({ creator_email: email });
    
        res.send({
          success: true,
          data: contests,
          page: page,
          totalPages: Math.ceil(totalContests / limit),
          totalItems: totalContests
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get('/all_contests', async (req, res) => {
      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const limit = 10; // 10 items per page
      const skip = (page - 1) * limit;
    
      try {
        const contests = await contestsCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();
    
        const totalContests = await contestsCollection.countDocuments();
    
        res.send({
          success: true,
          data: contests,
          page: page,
          totalPages: Math.ceil(totalContests / limit),
          totalItems: totalContests
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    
    

    app.put('/contests/:id', async (req, res) => {
      const id = req.params.id;
      const contest = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: contest,
      };
      const result = await contestsCollection.updateOne(filter, updateDoc, options);
      res.send({success: true, data:result});
    })



    // participations
    app.post('/participations', async (req, res) => {
      const participation = req.body;
      const result = await participationCollection.insertOne(participation);
      res.send({success: true, data:result});
    })


    //payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });


    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await participationCollection.insertOne(payment);
      res.send({ success: true, data: result });
    })





  } finally {
    //setTimeout(() => {client.close()}, 1500)
  }
}
run().catch(console.dir);

export default app;
