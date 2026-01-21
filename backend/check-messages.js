const { MongoClient, ObjectId } = require("mongodb");

const uri =
  "mongodb://omnichat_admin:GKaAKhdwCncUPbcNmBi0@103.253.20.153:8310/omnichat?authSource=admin";
const conversationId = "696f4bf51ee13f96bb8981c7";

async function checkMessages() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("omnichat");
    const messages = await db
      .collection("messages")
      .find({ conversationId: new ObjectId(conversationId) })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    console.log(
      `Found ${messages.length} messages in conversation ${conversationId}:\n`,
    );

    messages.forEach((msg, idx) => {
      console.log(
        `${msg._id}. ${msg.direction} | ${JSON.stringify({ ...msg.content, sentToAiAt: msg.sentToAiAt }, null, 2)}\n\n`,
      );
    });
  } finally {
    await client.close();
  }
}

checkMessages().catch(console.error);
