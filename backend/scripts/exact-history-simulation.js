const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;
const conversationId = '696eeb4b5c7902d0253f14b8';

// This simulates EXACTLY what loadChatHistory does
async function exactHistorySimulation() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId)
    });

    // Simulate: New message "bạn gao gì cơ" arrives
    const newMessage = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      'content.text': 'bạn gao gì cơ',
      direction: 'inbound'
    });

    console.log('=== SIMULATION: Customer sends message ===');
    console.log(`Message: "${newMessage.content.text}"`);
    console.log(`Time: ${newMessage.createdAt}\n`);

    // EXACT CODE FROM loadChatHistory:
    const oldMessages = await db.collection('messages').find({
      organizationId: new ObjectId(conversation.organizationId),
      conversationId: new ObjectId(conversation._id)
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

    console.log(`Step 1: Loaded ${oldMessages.length} messages from DB (DESC order)\n`);

    const sortedMessages = oldMessages.reverse();
    console.log(`Step 2: Reversed to chronological order\n`);

    const currentMessageContent = newMessage.content.text;
    console.log(`Step 3: Current message content: "${currentMessageContent}"\n`);

    const historyMessages = sortedMessages.filter((msg) =>
      msg.content?.text &&
      msg.content.text.trim() &&
      msg.content.text !== currentMessageContent
    );

    console.log(`Step 4: Filtered to ${historyMessages.length} history messages\n`);

    // Check if "ừ, tôi là gao đỏ" is in history
    const targetMessage = historyMessages.find(m => m.content.text === 'ừ, tôi là gao đỏ');
    console.log(`=== CHECK: Is "ừ, tôi là gao đỏ" in history? ===`);
    console.log(`Result: ${targetMessage ? '✅ YES' : '❌ NO'}\n`);

    if (historyMessages.length > 0) {
      const chatHistory = historyMessages.map((msg) => {
        const sender = msg.direction === 'outbound' ? 'Agent' : (msg.sender?.name || 'Customer');
        return `${sender}: ${msg.content.text}`;
      }).join('\n');

      console.log(`=== CHAT HISTORY STRING (sent to AI) ===`);
      console.log(chatHistory);
      console.log('\n');

      // Final content that AI sees
      const aiQuery = `${chatHistory}\n\n${currentMessageContent}`;
      console.log(`=== FINAL QUERY TO AI ===`);
      console.log(aiQuery);
      console.log('\n');

      // Highlight the manual message
      const lines = chatHistory.split('\n');
      const targetLine = lines.find(line => line.includes('ừ, tôi là gao đỏ'));
      if (targetLine) {
        console.log(`✅ Manual message found in history:`);
        console.log(`   "${targetLine}"`);
      } else {
        console.log(`❌ Manual message NOT in history!`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

exactHistorySimulation();
