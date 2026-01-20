const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696f4bf51ee13f96bb8981c7'; // Vũ Đình Mạnh

async function checkConversation() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Get conversation
    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId)
    });

    console.log('=== CONVERSATION ===');
    console.log(`Customer: ${conversation.customerName}`);
    console.log(`Platform: ${conversation.platform}`);
    console.log(`AI Enabled: ${conversation.aiEnabled}`);
    console.log(`AI State: ${conversation.aiState}\n`);

    // Get recent messages
    const messages = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId)
    }).sort({ createdAt: -1 }).limit(20).toArray();

    console.log(`=== LAST ${messages.length} MESSAGES (DESC) ===\n`);

    messages.reverse().forEach((msg, i) => {
      const sender = msg.direction === 'outbound'
        ? `Agent (${msg.sender?.platformUserId})`
        : msg.sender?.name || 'Customer';

      console.log(`[${i + 1}] ${sender}`);
      console.log(`    Text: ${msg.content?.text?.substring(0, 80) || 'N/A'}`);
      console.log(`    Created: ${msg.createdAt}`);
      console.log(`    Direction: ${msg.direction}`);
    });

    // Check for manual messages
    const manualMessages = messages.filter(m =>
      m.direction === 'outbound' &&
      m.sender?.platformUserId !== 'ai-agent'
    );

    console.log(`\n=== MANUAL MESSAGES: ${manualMessages.length} ===`);
    manualMessages.forEach(msg => {
      console.log(`- "${msg.content?.text?.substring(0, 60)}"`);
      console.log(`  Created: ${msg.createdAt}`);
    });

    // Check for AI messages
    const aiMessages = messages.filter(m =>
      m.direction === 'outbound' &&
      m.sender?.platformUserId === 'ai-agent'
    );

    console.log(`\n=== AI MESSAGES: ${aiMessages.length} ===`);
    aiMessages.forEach(msg => {
      console.log(`- "${msg.content?.text?.substring(0, 60)}"`);
      console.log(`  Created: ${msg.createdAt}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkConversation();
