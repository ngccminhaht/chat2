#!/usr/bin/env node

/**
 * Script to check how many accounts are connected to a specific Facebook page
 * Usage: cd backend && node ../scripts/check-page-connections.js <pageId>
 */

const path = require('path');
// Import from backend node_modules
const { MongoClient } = require(path.join(__dirname, '../backend/node_modules/mongodb'));

const PRODUCTION_MONGODB_URI = 'mongodb://omnichat_admin:GKaAKhdwCncUPbcNmBi0@103.253.20.153:8310/omnichat?authSource=admin';

async function checkPageConnections(pageId) {
  const client = new MongoClient(PRODUCTION_MONGODB_URI);

  try {
    console.log('🔌 Connecting to production database...\n');
    await client.connect();

    const db = client.db('omnichat');
    const platformConnections = db.collection('platformconnections');

    // Query for connections with this page ID
    const connections = await platformConnections.find({
      platform: 'facebook',
      'metadata.pageId': pageId
    }).toArray();

    console.log(`📊 Results for Page ID: ${pageId}`);
    console.log('='.repeat(60));
    console.log(`Total connections found: ${connections.length}\n`);

    if (connections.length > 0) {
      connections.forEach((conn, index) => {
        console.log(`Connection #${index + 1}:`);
        console.log(`  Organization ID: ${conn.organizationId}`);
        console.log(`  Account ID: ${conn.platformAccountId}`);
        console.log(`  Account Name: ${conn.platformAccountName}`);
        console.log(`  Status: ${conn.status}`);
        console.log(`  Connected By: ${conn.connectedBy || 'N/A'}`);
        console.log(`  Created At: ${conn.createdAt}`);
        console.log(`  Last Sync: ${conn.lastSyncAt || 'Never'}`);
        console.log('');
      });
    } else {
      console.log('❌ No connections found for this page.\n');
    }

    // Check if there are multiple organizations
    const uniqueOrgs = new Set(connections.map(c => c.organizationId.toString()));
    if (uniqueOrgs.size > 1) {
      console.log('⚠️  WARNING: Multiple organizations are connected to this page!');
      console.log(`   This violates the unique constraint.`);
      console.log(`   Organizations: ${Array.from(uniqueOrgs).join(', ')}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('✅ Database connection closed.');
  }
}

// Get page ID from command line argument
const pageId = process.argv[2] || '989024737617978';

checkPageConnections(pageId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
