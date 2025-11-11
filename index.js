const express = require('express')
const cors = require('cors')
require('dotenv').config();
const { MongoClient, ServerApiVersion , ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

/*const uri = "mongodb+srv://socialDbUser:yLWG3k6kwC59quIj@myfirstmongodb.noasusn.mongodb.net/?appName=MyFirstMongoDb";*/

// Connection URI from MongoDB atlas
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@myfirstmongodb.noasusn.mongodb.net/?appName=MyFirstMongoDb`;

const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();  
        const db = client.db("socialDb"); // Your database name you can use any name 
        const userCollection = db.collection('users');
        const eventCollection = db.collection('events');
        const joinCollection = db.collection('joinedEvents');
        app.post('/users' , async(req , res) => {
            const newUser = req.body;
            const email = req.body.email;
            const query = { email: email }
            const existingUser = await userCollection.findOne(query);
            if(existingUser) {
                res.send({message: 'user already exits. do not need to insert again'})
            }
            else {
                const result = await userCollection.insertOne(newUser);
                res.send(result);
            }
        });
        app.post('/events' , async(req , res) => {
            const newEvent = req.body;
            const result = await eventCollection.insertOne(newEvent);
            res.send(result);
        });
        app.get('/events', async (req, res) => {
            try {
                const { search, type } = req.query;
                const today = new Date();
                const query = {
                    eventDate: { $gte: today.toISOString() }, // show only upcoming events
                };
                if(search) {
                    query.title = { $regex: search, $options: 'i' }; // case-insensitive search
                }
                if(type && type !== 'All') {
                    query.eventType = type;
                }
                const events = await eventCollection
                    .find(query)
                    .sort({ eventDate: 1 })
                    .toArray();

                res.send(events);
            } 
            catch (error) {
                console.error('Error loading events:', error);
                res.status(500).send({ message: 'Failed to load events', error });
            }
        });
        app.get('/events/:id' , async(req , res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await eventCollection.findOne(query);
            res.send(result);
        })
        app.get('/joinedEvents', async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) return res.status(400).send({ message: "Email is required" });

                const db = client.db("socialDb");
                const joinCollection = db.collection("joinedEvents");

                // Find all joined events for this user and sort by date ascending
                const joined = await joinCollection
                .find({ userEmail: email })
                .sort({ eventDate: 1 })
                .toArray();

                res.send(joined);
            } 
            catch (error) {
                console.error("Error fetching joined events:", error);
                res.status(500).send({ message: "Failed to load joined events", error });
            }
        });
        app.post('/joinEvent', async (req, res) => {
            try {
                const { eventId, user } = req.body;
                if(!eventId || !user) return res.status(400).send({ message: "Missing eventId or user data" });

                const db = client.db("socialDb");
                const joinCollection = db.collection("joinedEvents");

                // check if user already joined
                const alreadyJoined = await joinCollection.findOne({
                    eventId,
                    userEmail: user.email
                });
                if(alreadyJoined) return res.status(400).send({ message: "You have already joined this event" });

                const event = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
                if(!event) return res.status(404).send({ message: "Event not found" });

                const joinedData = {
                    eventId,
                    eventTitle: event.title,
                    eventType: event.eventType,
                    location: event.location,
                    eventDate: event.eventDate,
                    userEmail: user.email,
                    userName: user.name,
                    thumbnail: event.thumbnail,
                    joinedAt: new Date()
                };
                const result = await joinCollection.insertOne(joinedData);
                res.send(result);
             } 
             catch (error) {
                console.error("Error joining event:", error);
                res.status(500).send({ message: "Failed to join event", error });
             }
         });
         app.get('/myEvents', async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) return res.status(400).send({ message: "Email is required" });

                const events = await eventCollection.find({ userEmail: email }).sort({ eventDate: 1 }).toArray();
                res.send(events);
            } 
            catch (error) {
                console.error("Error fetching user's events:", error);
                res.status(500).send({ message: "Failed to load your events", error });
            }
         }); 
         app.put('/events/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updatedEvent = req.body;

                const event = await eventCollection.findOne({ _id: new ObjectId(id) });
                if (!event) return res.status(404).send({ message: "Event not found" });

                if (event.userEmail !== updatedEvent.userEmail) {
                return res.status(403).send({ message: "You cannot update this event" });
                }

                // Update main event
                await eventCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedEvent }
                );

                // Update all joined versions
                await joinCollection.updateMany(
                    { $or: [{ eventId: id }, { eventId: new ObjectId(id) }] },
                    {
                        $set: {
                            eventTitle: updatedEvent.title,
                            eventType: updatedEvent.eventType,
                            location: updatedEvent.location,
                            eventDate: updatedEvent.eventDate,
                            thumbnail: updatedEvent.thumbnail,
                        },
                    }
                );
                res.send({ message: "Event and joined records updated successfully" });
                } 
                catch (error) {
                    console.error("Error updating event:", error);
                    res.status(500).send({ message: "Failed to update event", error });
                }
         }); 
         app.delete('/events/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { userEmail } = req.query;

                const event = await eventCollection.findOne({ _id: new ObjectId(id) });
                if (!event) return res.status(404).send({ message: "Event not found" });

                if (event.userEmail !== userEmail) {
                    return res.status(403).send({ message: "You cannot delete this event" });
                }

                // Delete from main events
                await eventCollection.deleteOne({ _id: new ObjectId(id) });

                // 👇 Delete from joined events too
                await joinCollection.deleteMany({ eventId: id });

                res.send({ message: "Event and all joined records deleted successfully" });
            } 
            catch (error) {
                console.error("Error deleting event:", error);
                res.status(500).send({ message: "Failed to delete event", error });
            }
       });
         await client.db("admin").command({ ping: 1 }); // Send a ping to confirm a successful connection
         console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } 
    finally {
        
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
   res.send('Hello World!')
})

app.listen(port, () => {
   console.log(`Example app listening on port ${port}`)
})