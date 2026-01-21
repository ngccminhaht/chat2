const { MongoClient, ObjectId } = require("mongodb");

const uri =
  "mongodb://omnichat_admin:GKaAKhdwCncUPbcNmBi0@103.253.20.153:8310/omnichat?authSource=admin";
const conversationId = "696f4bf51ee13f96bb8981c7";

async function clearConversation() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("omnichat");

    // Delete all messages in this conversation
    const result = await db
      .collection("messages")
      .deleteMany({ conversationId: new ObjectId(conversationId) });

    console.log(`Deleted ${result.deletedCount} messages from conversation ${conversationId}`);
  } finally {
    await client.close();
  }
}

clearConversation().catch(console.error);
