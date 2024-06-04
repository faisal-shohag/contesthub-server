import { MongoClient, ServerApiVersion } from "mongodb";
import "dotenv/config"

const uri = process.env.db

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
})

export { client }