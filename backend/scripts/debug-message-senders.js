const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';

async function debugMessageSenders() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Get manual/agent messages (outbound messages that were manually sent)
    const messages = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId),
      direction: 'outbound'
    }).sort({ createdAt: 1 }).toArray();

    console.log(`\n=== OUTBOUND MESSAGES (${messages.length} total) ===\n`);

    messages.forEach((msg, i) => {
      console.log(`[${i + 1}] Message ID: ${msg._id}`);
      console.log(`  Content: ${msg.content?.text || 'N/A'}`);
      console.log(`  Created: ${msg.createdAt}`);
      console.log(`  Sender: ${JSON.stringify(msg.sender)}`);
      console.log(`  Platform Message ID: ${msg.platformMessageId || 'N/A'}`);
      console.log(`  Status: ${msg.status || 'N/A'}`);
      console.log('');
    });

    // Sample one message to see full structure
    if (messages.length > 0) {
      console.log('\n=== FULL STRUCTURE OF FIRST OUTBOUND MESSAGE ===');
      console.log(JSON.stringify(messages[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugMessageSenders();
