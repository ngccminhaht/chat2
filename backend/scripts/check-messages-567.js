const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696f4bf51ee13f96bb8981c7'; // Vũ Đình Mạnh

async function checkMessages567() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Get messages with text "5", "6", "7"
    const messages = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId),
      'content.text': { $in: ['5', '6', '7'] }
    }).sort({ createdAt: 1 }).toArray();

    console.log(`=== Found ${messages.length} messages ===\n`);

    messages.forEach((msg, i) => {
      console.log(`\n[${i + 1}] Message: "${msg.content.text}"`);
      console.log(`    _id: ${msg._id}`);
      console.log(`    Direction: ${msg.direction}`);
      console.log(`    Sender: ${JSON.stringify(msg.sender, null, 2)}`);
      console.log(`    Created: ${msg.createdAt}`);
      console.log(`    Metadata: ${JSON.stringify(msg.metadata, null, 2)}`);

      // Check what label it would get
      let label;
      if (msg.direction === 'outbound') {
        if (msg.sender?.platformUserId === 'ai-agent') {
          label = 'Agent (AI)';
        } else {
          label = 'Người tư vấn (Manual)';
        }
      } else {
        label = msg.sender?.name || 'Customer';
      }
      console.log(`    → Would be labeled as: ${label}`);
    });

    // Also show all outbound messages to understand the pattern
    console.log('\n\n=== ALL OUTBOUND MESSAGES IN CONVERSATION ===\n');
    const allOutbound = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId),
      direction: 'outbound'
    }).sort({ createdAt: 1 }).toArray();

    allOutbound.forEach((msg, i) => {
      const isAI = msg.sender?.platformUserId === 'ai-agent';
      const label = isAI ? 'Agent' : 'Người tư vấn';
      console.log(`[${i + 1}] ${label}: "${msg.content.text?.substring(0, 40) || 'N/A'}"`);
      console.log(`    platformUserId: ${msg.sender?.platformUserId}`);
      console.log(`    name: ${msg.sender?.name}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkMessages567();
