import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MongoDB client
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ====== Collections ======
let cropsCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const db = client.db("cropsService");
    cropsCollection = db.collection("Crops");

    // =====================
    // CROP ROUTES
    // =====================

    // GET all crops with optional type & limit
    app.get("/api/crops", async (req, res) => {
      try {
        const { type, limit } = req.query;
        let query = {};
        if (type) query.type = type;

        let cursor = cropsCollection.find(query);
        if (limit) cursor = cursor.limit(Number(limit));

        const crops = await cursor.toArray();
        res.send(crops);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch crops" });
      }
    });

    // GET single crop by ID
    app.get("/api/crops/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid crop ID" });
      }

      try {
        const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
        if (!crop) return res.status(404).send({ error: "Crop not found" });
        res.send(crop);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch crop" });
      }
    });

    // POST new crop(s)
    app.post("/api/crops", async (req, res) => {
      try {
        const data = req.body;
        let result;
        if (Array.isArray(data)) {
          result = await cropsCollection.insertMany(data);
        } else {
          result = await cropsCollection.insertOne(data);
        }
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to add crop" });
      }
    });

    // POST interest (non-owner)
    app.post("/api/crops/:id/interests", async (req, res) => {
      try {
        const { userEmail, userName, quantity, message } = req.body;
    
        // Validate
        if (!userEmail || !userName) return res.status(400).send({ error: "User info required" });
        if (!quantity || quantity < 1) return res.status(400).send({ error: "Quantity must be at least 1" });
    
        const cropId = req.params.id;
        const crop = await cropsCollection.findOne({ _id: new ObjectId(cropId) });
        if (!crop) return res.status(404).send({ error: "Crop not found" });
    
        // Check if user is owner
        if (crop.owner?.ownerEmail === userEmail)
          return res.status(403).send({ error: "Owner cannot send interest" });
    
        // Check if already sent interest
        const existingInterest = crop.interests?.find(i => i.userEmail === userEmail);
        if (existingInterest)
          return res.status(400).send({ error: "You’ve already sent an interest" });
    
        // Create interest
        const interestId = new ObjectId();
        const newInterest = {
          _id: interestId,
          cropId,
          userEmail,
          userName,
          quantity,
          message,
          status: "pending",
          createdAt: new Date(),
        };
    
        await cropsCollection.updateOne(
          { _id: new ObjectId(cropId) },
          { $push: { interests: newInterest } }
        );
    
        res.send(newInterest);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to submit interest" });
      }
    });
    

    // PATCH interest status (owner only)
    app.patch("/api/crops/:cropId/interests/:interestId", async (req, res) => {
      const { cropId, interestId } = req.params;
      const { status } = req.body; // accepted / rejected

      if (!ObjectId.isValid(cropId) || !ObjectId.isValid(interestId)) {
        return res.status(400).send({ error: "Invalid ID(s)" });
      }

      try {
        await cropsCollection.updateOne(
          { _id: new ObjectId(cropId), "interests._id": new ObjectId(interestId) },
          { $set: { "interests.$.status": status } }
        );

        res.send({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update interest status" });
      }
    });

    console.log("✅ Crop routes set up");
  } catch (error) {
    console.error(error);
  }
}

run();


// GET crops by owner email
app.get("/api/my-crops", async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).send({ error: "Email required" });

  const result = await cropsCollection
    .find({ "owner.ownerEmail": email })
    .toArray();

  res.send(result);
});

// UPDATE crop
app.put("/api/crops/:id", async (req, res) => {
  const { id } = req.params;
  await cropsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body }
  );
  res.send({ success: true });
});

// delete crop
app.delete("/api/crops/:id", async (req, res) => {
  const { id } = req.params;
  await cropsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send({ success: true });
});


// for edit tab

app.patch("/api/crops/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;

    const result = await cropsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to update crop" });
  }
});
 // Get all interests sent by a user
app.get("/api/my-interests", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send({ error: "Email is required" });

  try {
    const allCrops = await cropsCollection.find({ "interests.userEmail": email }).toArray();
    const myInterests = [];

    allCrops.forEach(crop => {
      crop.interests.forEach(i => {
        if (i.userEmail === email) {
          myInterests.push({
            _id: i._id,
            cropName: crop.name,
            ownerName: crop.owner?.ownerName,
            quantity: i.quantity,
            message: i.message,
            status: i.status
          });
        }
      });
    });

    res.send(myInterests);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch interests" });
  }
});


// test route 
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
