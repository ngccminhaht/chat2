const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';

async function findAILogs() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Find the message "bạn gao gì cơ" (came after "ừ, tôi là gao đỏ")
    const targetCustomerMessage = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      'content.text': 'bạn gao gì cơ',
      direction: 'inbound'
    });

    if (!targetCustomerMessage) {
      console.log('Customer message not found');
      return;
    }

    console.log('=== CUSTOMER MESSAGE ===');
    console.log(`Text: "${targetCustomerMessage.content.text}"`);
    console.log(`Created: ${targetCustomerMessage.createdAt}`);
    console.log(`Message ID: ${targetCustomerMessage._id}\n`);

    // Find the AI response to this message
    const aiResponse = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      direction: 'outbound',
      'sender.platformUserId': 'ai-agent',
      createdAt: { $gt: targetCustomerMessage.createdAt }
    });

    if (aiResponse) {
      console.log('=== AI RESPONSE ===');
      console.log(`Text: "${aiResponse.content.text}"`);
      console.log(`Created: ${aiResponse.createdAt}`);
      console.log(`Message ID: ${aiResponse._id}\n`);
    }

    // Get manual message "ừ, tôi là gao đỏ"
    const manualMessage = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      'content.text': 'ừ, tôi là gao đỏ'
    });

    console.log('=== MANUAL MESSAGE (should be in history) ===');
    console.log(`Text: "${manualMessage.content.text}"`);
    console.log(`Created: ${manualMessage.createdAt}`);
    console.log(`Sender: ${JSON.stringify(manualMessage.sender)}\n`);

    // Check timing
    console.log('=== TIMELINE ===');
    console.log(`1. Manual message: ${manualMessage.createdAt}`);
    console.log(`2. Customer asks: ${targetCustomerMessage.createdAt}`);
    if (aiResponse) {
      console.log(`3. AI responds: ${aiResponse.createdAt}`);
    }

    const manualBeforeCustomer = new Date(manualMessage.createdAt) < new Date(targetCustomerMessage.createdAt);
    console.log(`\nManual message came BEFORE customer message: ${manualBeforeCustomer}`);

    if (manualBeforeCustomer) {
      console.log('\n✅ Manual message should be included in chat history when AI responds!');
    } else {
      console.log('\n❌ Manual message came AFTER - would not be in history yet');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

findAILogs();
