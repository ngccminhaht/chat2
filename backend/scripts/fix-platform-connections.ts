import { connect, connection } from 'mongoose';
import * as dotenv from 'dotenv';
import { ConnectionStatus } from '../src/common/constants';

// Load environment variables
dotenv.config();

async function fixPlatformConnections() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/miagent';
    console.log('Connecting to MongoDB...');
    await connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get the platform connections collection
    const db = connection.db;
    const platformConnections = db.collection('platformconnections');

    // Check current status
    console.log('\nCurrent platform connections:');
    const connections = await platformConnections.find({}).toArray();
    connections.forEach((conn) => {
      console.log(`- ${conn.platform} (${conn.platformAccountName}): status = "${conn.status}"`);
    });

    // Update all to active
    console.log('\nUpdating all platform connections to active...');
    const result = await platformConnections.updateMany(
      {},
      { $set: { status: ConnectionStatus.ACTIVE } }
    );

    console.log(`Updated ${result.modifiedCount} platform connection(s)`);

    // Verify
    console.log('\nAfter update:');
    const updatedConnections = await platformConnections.find({}).toArray();
    updatedConnections.forEach((conn) => {
      console.log(`- ${conn.platform} (${conn.platformAccountName}): status = "${conn.status}"`);
    });

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.close();
    console.log('Disconnected from MongoDB');
  }
}

fixPlatformConnections();
