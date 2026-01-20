const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';

async function testChatHistory() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Get conversation
    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId)
    });

    // Get all messages sorted by createdAt (like the loadChatHistory function)
    const oldMessages = await db.collection('messages').find({
      organizationId: new ObjectId(conversation.organizationId),
      conversationId: new ObjectId(conversationId)
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

    console.log(`Found ${oldMessages.length} messages\n`);

    // Reverse to chronological order
    const sortedMessages = oldMessages.reverse();

    // Filter messages with text content
    const historyMessages = sortedMessages.filter((msg) =>
      msg.content?.text &&
      msg.content.text.trim()
    );

    console.log(`After filtering: ${historyMessages.length} messages with text\n`);

    // Build chat history like the code does
    const chatHistory = historyMessages.map((msg) => {
      const sender = msg.direction === 'outbound' ? 'Agent' : (msg.sender?.name || 'Customer');
      return `${sender}: ${msg.content.text}`;
    }).join('\n');

    console.log('=== CHAT HISTORY (CURRENT LOGIC) ===\n');
    console.log(chatHistory);
    console.log('\n');

    // Now show what it should be (distinguishing AI vs manual)
    console.log('=== CHAT HISTORY (WITH AI/MANUAL DISTINCTION) ===\n');
    const improvedHistory = historyMessages.map((msg) => {
      let sender;
      if (msg.direction === 'outbound') {
        if (msg.sender?.platformUserId === 'ai-agent') {
          sender = 'AI Agent';
        } else {
          sender = 'Agent (Manual)';
        }
      } else {
        sender = msg.sender?.name || 'Customer';
      }
      return `${sender}: ${msg.content.text}`;
    }).join('\n');

    console.log(improvedHistory);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

testChatHistory();
