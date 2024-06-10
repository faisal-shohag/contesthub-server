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

    app.get('/user/:email', async(req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({email: email});
      res.send({success: true, data:user})
    })

    // post+
    app.post('/user', async (req, res) => {
      const user = req.body;
      const getUser = await usersCollection.findOne({email: user.email});
      if(getUser) return res.send({success: false, message: "User already exists"})
      const result = await usersCollection.insertOne(user);
      res.send({success: true, data:result});
    })

    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      console.log(user);
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      res.send({success: true, data:result});
    })

    app.put('/user/:id', async (req, res) => {
      const userId = req.params.id;
      const updateFields = req.body;
    
      if (!ObjectId.isValid(userId)) {
        return res.status(400).send({ success: false, message: 'Invalid user ID' });
      }
    
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: updateFields }
        );
    
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: 'User not found' });
        }
    
        res.status(200).send({ success: true, message: 'User updated successfully' });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


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

    //popular contests
    app.get("/popular-contests", async (req, res) => {
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
            $sort: { participationsCount: -1 }
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
        ]).limit(5).toArray();
    
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
              participations: {
                $map: {
                  input: '$participations',
                  as: 'participation',
                  in: {
                    $mergeObjects: [
                      '$$participation',
                      {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$participantDetails',
                              as: 'participantDetail',
                              cond: { $eq: ['$$participantDetail.email', '$$participation.user_email'] }
                            }
                          },
                          0
                        ]
                      }
                    ]
                  }
                }
              }
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
              isDecided: 1,
              status: 1,
              creator_email: 1,
              creatorDetails: { name: 1, email: 1, photoURL: 1 },
              participationsCount: 1,
              participations: 1
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

    app.get('/contests-all', async (req, res) => {
      try {
        const contests = await contestsCollection.find().toArray();
        res.send({ success: true, data: contests });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    })
    
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

    app.post('/add-comment/:id', async (req, res) => {
      const contestId = req.params.id;
      const { comment } = req.body;
    
      if (!comment) {
        return res.status(400).send({ success: false, message: 'Comment text is required' });
      }
    
      try {
        const result = await contestsCollection.updateOne(
          { _id: new ObjectId(contestId) },
          {
            $set: { comment: comment }
          }
        );
    
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: 'Contest not found' });
        }
    
        res.status(200).send({ success: true, message: 'Comment added successfully' });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
  

    //all participaitions
    app.get('/participations', async (req, res) => {
      try {
        const participations = await participationCollection.aggregate([
          {
            $lookup: {
              from: 'contests',
              let: { contestId: { $toObjectId: '$contestId' } },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$_id', '$$contestId'] }
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
                    creator_email: 1
                  }
                }
              ],
              as: 'contestDetails'
            }
          },
          {
            $unwind: {
              path: '$contestDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user_email',
              foreignField: 'email',
              as: 'userDetails'
            }
          },
          {
            $unwind: {
              path: '$userDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              contestId: 1,
              user_email: 1,
              paymentIntentId: 1,
              paid_at: 1,
              isWinner: 1,
              contestDetails: 1,
              userDetails: {
                name: 1,
                email: 1,
                photoURL: 1
              }
            }
          }
        ]).toArray();
    
        res.send({ success: true, data: participations });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
     

    //particapations by email
    app.get('/participations/:email', async (req, res) => {
      const email = req.params.email;
      
      try {
        const participations = await participationCollection.aggregate([
          {
            $match: { user_email: email }
          },
          {
            $lookup: {
              from: 'contests',
              let: { contestId: { $toObjectId: '$contestId' } },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$_id', '$$contestId'] }
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
                    
                  }
                }
              ],
              as: 'contestDetails'
            }
          },
          {
            $unwind: {
              path: '$contestDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user_email',
              foreignField: 'email',
              as: 'userDetails'
            }
          },
          {
            $unwind: {
              path: '$userDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              contestId: 1,
              user_email: 1,
              paymentIntentId: 1,
              paid_at: 1,
              contestDetails: 1,
              isWinner: 1,
              task: 1,
              quickNote: 1,
              userDetails: {
                name: 1,
                email: 1,
                photoURL: 1
              }
            }
          }
        ]).toArray();
    
        res.send({ success: true, data: participations });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get('/winning-count/:email', async (req, res) => {
      const email = req.params.email;
    
      try {
        const totalContests = await contestsCollection.countDocuments();
        const result = await participationCollection.aggregate([
          {
            $match: { user_email: email }
          },
          {
            $group: {
              _id: '$user_email',
              totalParticipations: { $sum: 1 },
              totalWins: { $sum: { $cond: ['$isWinner', 1, 0] } }
            }
          },
          {
            $project: {
              _id: 0,
              user_email: '$_id',
              winPercentage: {
                $cond: {
                  if: { $eq: ['$totalParticipations', 0] },
                  then: 0,
                  else: {
                    $multiply: [{ $divide: ['$totalWins', '$totalParticipations'] }, 100]
                  }
                }
              },
              attemptedPercentage: {
                $cond: {
                  if: { $eq: [totalContests, 0] },
                  then: 0,
                  else: {
                    $multiply: [{ $divide: ['$totalParticipations', totalContests] }, 100]
                  }
                }
              }
            }
          }
        ]).toArray();
    
        if (result.length === 0) {
          return res.status(404).send({ success: false, message: 'No participations found for this user' });
        }
    
        res.send({ success: true, data: [result[0].winPercentage, result[0].attemptedPercentage, 100-(result[0].winPercentage+result[0].attemptedPercentage)],  winPercentage: result[0].winPercentage, attemptedPercentage: result[0].attemptedPercentage });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // participations
    app.post('/participations', async (req, res) => {
      const participation = req.body;
      const result = await participationCollection.insertOne(participation);
      res.send({success: true, data:result});
    })

    //leaderboard
    app.get('/leaderboard', async (req, res) => {
      try {
        const leaderboard = await usersCollection.aggregate([
          {
            $match: { role: { $ne: 'admin' } }
          },
          {
            $lookup: {
              from: 'participations',
              localField: 'email',
              foreignField: 'user_email',
              as: 'participations'
            }
          },
          {
            $lookup: {
              from: 'contests',
              let: { contestIds: '$participations.contestId' },
              pipeline: [
                {
                  $match: {
                    $expr: { $in: [{ $toString: '$_id' }, '$$contestIds'] }
                  }
                },
                {
                  $project: {
                    _id: 1,
                    name: 1,
                    type: 1,
                    due: 1,
                    status: 1
                  }
                }
              ],
              as: 'contestDetails'
            }
          },
          {
            $addFields: {
              totalParticipations: { $size: '$participations' },
              totalWins: {
                $size: {
                  $filter: {
                    input: '$participations',
                    as: 'participation',
                    cond: { $eq: ['$$participation.isWinner', true] }
                  }
                }
              }
            }
          },
          {
            $project: {
              _id: 0,
              email: 1,
              name: 1,
              photoURL: 1,
              totalParticipations: 1,
              totalWins: 1,
              contestDetails: 1
            }
          },
          {
            $sort: { totalWins: -1, totalParticipations: -1 }
          }
        ]).toArray();
    
        res.send({ success: true, data: leaderboard });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    


    app.put('/submission-update/:id', async (req, res) => {
      const participationId = req.params.id;
      const updateFields = req.body;
    
      if (!ObjectId.isValid(participationId)) {
        return res.status(400).send({ success: false, message: 'Invalid participation ID' });
      }
    
      try {
        const result = await participationCollection.updateOne(
          { _id: new ObjectId(participationId) },
          { $set: updateFields }
        );
    
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: 'Participation not found' });
        }
    
        res.status(200).send({ success: true, message: 'Participation updated successfully' });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post('/submit-task', async (req, res) => {
      const { contestId, user_email, updateFields } = req.body;
    
      if (!contestId || !user_email || !updateFields) {
        return res.status(400).send({ success: false, message: 'contestId, user_email, and updateFields are required' });
      }
    
      try {
        const result = await participationCollection.updateOne(
          { contestId: contestId, user_email: user_email },
          { $set: updateFields }
        );
    
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: 'Participation not found' });
        }
    
        res.status(200).send({ success: true, message: 'Participation updated successfully' });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    //participations for creator
    app.get('/contests-by-creator/:email', async (req, res) => {
      const creatorEmail = req.params.email;
    
      try {
        const contests = await contestsCollection.aggregate([
          {
            $match: { creator_email: creatorEmail }
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
                },
                {
                  $lookup: {
                    from: 'users',
                    localField: 'user_email',
                    foreignField: 'email',
                    as: 'userDetails'
                  }
                },
                {
                  $unwind: {
                    path: '$userDetails',
                    preserveNullAndEmptyArrays: true
                  }
                },
                {
                  $addFields: {
                    participant: {
                      id: '$_id',
                      isWinner: '$isWinner',
                      user_email: '$user_email',
                      paymentIntentId: '$paymentIntentId',
                      paid_at: '$paid_at',
                      name: '$userDetails.name',
                      email: '$userDetails.email',
                      task: "$task",
                      quickNote: "$quickNote",
                    }
                  }
                },
                {
                  $project: {
                    _id: 0,
                    participant: 1
                  }
                }
              ],
              as: 'participants'
            }
          },
          {
            $addFields: {
              participantsCount: { $size: '$participants' }
            }
          },
          {
            $match: {
              participantsCount: { $gte: 1 }
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
              participantsCount: 1,
              participants: '$participants.participant'
            }
          },
          {
            $sort: { due: -1 }
          }
        ]).toArray();
    
        res.status(200).send({ success: true, data: contests });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


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


    //top creators
    app.get('/top-creators', async (req, res) => {
      try {
        const topCreators = await contestsCollection.aggregate([
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
              participantCount: { $size: '$participations' }
            }
          },
          {
            $group: {
              _id: '$creator_email',
              totalParticipants: { $sum: '$participantCount' }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: 'email',
              as: 'creatorDetails'
            }
          },
          {
            $unwind: '$creatorDetails'
          },
          {
            $match: { 'creatorDetails.role': 'creator' }
          },
          {
            $project: {
              _id: 0,
              creator_email: '$_id',
              totalParticipants: 1,
              creatorDetails: {
                name: 1,
                email: 1,
                photoURL: 1
              }
            }
          },
          {
            $sort: { totalParticipants: -1 }
          },
          {
            $limit: 3
          }
        ]).toArray();
    
        res.send({ success: true, data: topCreators });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });




  } finally {
    //setTimeout(() => {client.close()}, 1500)
  }
}
run().catch(console.dir);

export default app;
