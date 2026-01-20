const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';

async function debugConversation() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Get conversation
    console.log('\n=== CONVERSATION ===');
    const conversation = await db.collection('conversations').findOne({ _id: new ObjectId(conversationId) });
    console.log(JSON.stringify(conversation, null, 2));

    // Get all messages for this conversation
    console.log('\n=== MESSAGES ===');
    const messages = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId)
    }).sort({ createdAt: 1 }).toArray();

    console.log(`Total messages: ${messages.length}`);
    messages.forEach((msg, i) => {
      console.log(`\n[${i + 1}] ${msg.direction} - ${msg.sender?.type || 'unknown'}`);
      console.log(`  ID: ${msg._id}`);
      console.log(`  Content: ${msg.content?.text || 'N/A'}`);
      console.log(`  Created: ${msg.createdAt}`);
      console.log(`  Platform Message ID: ${msg.platformMessageId || 'N/A'}`);
    });

    // Count by direction and sender type
    console.log('\n=== MESSAGE SUMMARY ===');
    const inbound = messages.filter(m => m.direction === 'inbound').length;
    const outbound = messages.filter(m => m.direction === 'outbound').length;
    const customer = messages.filter(m => m.sender?.type === 'customer').length;
    const agent = messages.filter(m => m.sender?.type === 'agent').length;

    console.log(`Inbound: ${inbound}, Outbound: ${outbound}`);
    console.log(`Customer: ${customer}, Agent: ${agent}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugConversation();
