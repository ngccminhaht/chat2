import { connect, connection } from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkConversations() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/miagent';
    console.log('Connecting to MongoDB...');
    await connect(mongoUri);
    console.log('Connected to MongoDB\n');

    const db = connection.db;
    const conversations = db.collection('conversations');

    const convs = await conversations.find({}).limit(5).toArray();

    console.log(`Found ${convs.length} conversation(s):\n`);

    convs.forEach((conv) => {
      console.log(`Conversation ID: ${conv._id}`);
      console.log(`  Platform: ${conv.platform}`);
      console.log(`  Platform Connection ID: ${conv.platformConnectionId}`);
      console.log(`  Status: ${conv.status}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.close();
  }
}

checkConversations();
