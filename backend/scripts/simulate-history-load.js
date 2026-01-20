const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';
const targetMessageId = '696f41530d473a438a30ff8c'; // "ừ, tôi là gao đỏ"

async function simulateHistoryLoad() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Get conversation
    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId)
    });

    // Simulate what happens when a NEW message arrives AFTER the target message
    // Let's use the message "bạn gao gì cơ" which came after
    const nextMessage = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      'content.text': 'bạn gao gì cơ'
    });

    console.log('=== SIMULATING: New message arrives ===');
    console.log(`New message: "${nextMessage.content.text}"`);
    console.log(`Created at: ${nextMessage.createdAt}\n`);

    // Load history like the code does (limit 50, sorted by createdAt DESC)
    const oldMessages = await db.collection('messages').find({
      organizationId: new ObjectId(conversation.organizationId),
      conversationId: new ObjectId(conversationId)
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

    console.log(`=== LOADED ${oldMessages.length} messages (limit 50, DESC) ===\n`);

    // Reverse to chronological order
    const sortedMessages = oldMessages.reverse();

    // Filter like the code does
    const currentMessageContent = nextMessage.content.text;
    const historyMessages = sortedMessages.filter((msg) =>
      msg.content?.text &&
      msg.content.text.trim() &&
      msg.content.text !== currentMessageContent
    );

    console.log(`=== AFTER FILTERING: ${historyMessages.length} history messages ===\n`);

    // Check if target message is in history
    const targetInHistory = historyMessages.find(m => m._id.toString() === targetMessageId);

    console.log(`=== CHECK: Is "ừ, tôi là gao đỏ" in history? ===`);
    console.log(`Found: ${!!targetInHistory}`);

    if (targetInHistory) {
      const targetIndex = historyMessages.findIndex(m => m._id.toString() === targetMessageId);
      console.log(`Position in history: ${targetIndex + 1} / ${historyMessages.length}`);
    }

    // Show last 10 messages in history
    console.log(`\n=== LAST 10 MESSAGES IN HISTORY ===`);
    const last10 = historyMessages.slice(-10);
    last10.forEach((msg, i) => {
      const isTarget = msg._id.toString() === targetMessageId;
      const marker = isTarget ? ' ⭐ TARGET' : '';
      const sender = msg.direction === 'outbound' ? 'Agent' : (msg.sender?.name || 'Customer');
      console.log(`[${i + 1}] ${sender}: ${msg.content.text.substring(0, 50)}${marker}`);
    });

    // Build chat history string like the code does
    console.log(`\n=== CHAT HISTORY STRING (last 15 messages) ===`);
    const last15 = historyMessages.slice(-15);
    const chatHistory = last15.map((msg) => {
      const sender = msg.direction === 'outbound' ? 'Agent' : (msg.sender?.name || 'Customer');
      const isTarget = msg._id.toString() === targetMessageId;
      const marker = isTarget ? ' ⭐' : '';
      return `${sender}: ${msg.content.text}${marker}`;
    }).join('\n');

    console.log(chatHistory);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

simulateHistoryLoad();
