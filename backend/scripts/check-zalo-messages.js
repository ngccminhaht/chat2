const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PRODUCTION_MONGODB_URI = process.env.PRODUCTION_MONGODB_URI;

async function checkZaloMessages() {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();

    // Find Zalo conversations
    const zaloConversations = await db.collection('conversations').find({
      platform: 'zalo'
    }).limit(5).toArray();

    console.log(`=== Found ${zaloConversations.length} Zalo conversations ===\n`);

    for (const conv of zaloConversations) {
      console.log(`\n--- Conversation: ${conv._id} ---`);
      console.log(`Customer: ${conv.customerName}`);
      console.log(`Status: ${conv.status}`);
      console.log(`AI Enabled: ${conv.aiEnabled || false}`);
      console.log(`AI State: ${conv.aiState || 'N/A'}`);

      // Get messages for this conversation
      const messages = await db.collection('messages').find({
        conversationId: conv._id
      }).sort({ createdAt: -1 }).limit(10).toArray();

      console.log(`\nLast ${messages.length} messages:`);
      messages.reverse().forEach((msg, i) => {
        const sender = msg.direction === 'outbound'
          ? `Agent (${msg.sender?.platformUserId || 'unknown'})`
          : msg.sender?.name || 'Customer';
        console.log(`  [${i + 1}] ${sender}: ${msg.content?.text?.substring(0, 60) || 'N/A'}`);
      });

      // Check for AI responses
      const aiMessages = messages.filter(m =>
        m.direction === 'outbound' &&
        m.sender?.platformUserId === 'ai-agent'
      );
      console.log(`\nAI messages: ${aiMessages.length}/${messages.length}`);

      // Check for manual messages
      const manualMessages = messages.filter(m =>
        m.direction === 'outbound' &&
        m.sender?.platformUserId !== 'ai-agent'
      );
      console.log(`Manual messages: ${manualMessages.length}/${messages.length}`);

      if (manualMessages.length > 0) {
        console.log('\n⚠️  FOUND MANUAL MESSAGES IN ZALO:');
        manualMessages.forEach(msg => {
          console.log(`   - "${msg.content?.text?.substring(0, 50)}" (${msg.createdAt})`);
        });
      }
    }

    // Compare with Facebook
    console.log('\n\n=== FACEBOOK COMPARISON ===\n');
    const fbConversations = await db.collection('conversations').find({
      platform: 'facebook'
    }).limit(5).toArray();

    console.log(`Found ${fbConversations.length} Facebook conversations\n`);

    for (const conv of fbConversations) {
      const messages = await db.collection('messages').find({
        conversationId: conv._id
      }).sort({ createdAt: -1 }).limit(10).toArray();

      const manualMessages = messages.filter(m =>
        m.direction === 'outbound' &&
        m.sender?.platformUserId !== 'ai-agent'
      );

      if (manualMessages.length > 0) {
        console.log(`Conversation ${conv._id} (${conv.customerName}): ${manualMessages.length} manual messages`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkZaloMessages();
