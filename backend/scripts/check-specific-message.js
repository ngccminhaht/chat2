const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';
const targetText = 'ừ, tôi là gao đỏ';

async function checkSpecificMessage() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Find the specific message
    const message = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      'content.text': targetText
    });

    if (!message) {
      console.log(`❌ Message "${targetText}" not found!`);
      return;
    }

    console.log('=== TARGET MESSAGE ===');
    console.log(JSON.stringify(message, null, 2));

    // Get all messages in chronological order
    const allMessages = await db.collection('messages').find({
      conversationId: new ObjectId(conversationId)
    })
    .sort({ createdAt: 1 })
    .toArray();

    // Find index of target message
    const targetIndex = allMessages.findIndex(m => m._id.toString() === message._id.toString());
    console.log(`\n=== MESSAGE POSITION ===`);
    console.log(`Message is at index ${targetIndex + 1} out of ${allMessages.length} total messages`);
    console.log(`Created at: ${message.createdAt}`);

    // Check if this message has text content
    console.log(`\n=== CONTENT CHECK ===`);
    console.log(`Has content.text: ${!!message.content?.text}`);
    console.log(`Text value: "${message.content?.text}"`);
    console.log(`Text trimmed: "${message.content?.text?.trim()}"`);
    console.log(`Text length: ${message.content?.text?.length || 0}`);

    // Check filter conditions used in loadChatHistory
    const hasText = message.content?.text && message.content.text.trim();
    console.log(`\n=== FILTER CHECK ===`);
    console.log(`Passes filter (has text && trimmed): ${!!hasText}`);

    // Get messages after this one to see what the "current message" would be
    const messagesAfter = allMessages.slice(targetIndex + 1, targetIndex + 6);
    console.log(`\n=== NEXT 5 MESSAGES (to understand context) ===`);
    messagesAfter.forEach((msg, i) => {
      console.log(`[${i + 1}] ${msg.direction} - ${msg.content?.text?.substring(0, 50) || 'N/A'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkSpecificMessage();
