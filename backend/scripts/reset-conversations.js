/**
 * Reset Conversations Script
 *
 * Deletes all conversations and messages from the database
 * to ensure clean state with new schema (lastMessage.direction)
 *
 * Usage:
 *   mongosh "mongodb://localhost:27017/miagent" scripts/reset-conversations.js
 *
 * Or using mongo:
 *   mongo miagent scripts/reset-conversations.js
 */

print('🗑️  Resetting all conversations and messages...\n');

// Count before deletion
const conversationCount = db.conversations.countDocuments();
const messageCount = db.messages.countDocuments();

print(`Found ${conversationCount} conversations and ${messageCount} messages\n`);

if (conversationCount === 0 && messageCount === 0) {
  print('✅ Database is already clean. Nothing to delete.\n');
  quit(0);
}

// Confirmation prompt (only works in interactive mode)
print('⚠️  WARNING: This will delete ALL conversations and messages!');
print('Press Ctrl+C to cancel, or continue in 3 seconds...\n');

// Wait 3 seconds
sleep(3000);

// Delete all messages
print('Deleting messages...');
const messageResult = db.messages.deleteMany({});
print(`✅ Deleted ${messageResult.deletedCount} messages\n`);

// Delete all conversations
print('Deleting conversations...');
const conversationResult = db.conversations.deleteMany({});
print(`✅ Deleted ${conversationResult.deletedCount} conversations\n`);

// Verify deletion
const remainingConversations = db.conversations.countDocuments();
const remainingMessages = db.messages.countDocuments();

if (remainingConversations === 0 && remainingMessages === 0) {
  print('✅ SUCCESS: All conversations and messages have been deleted!');
  print('💡 New conversations will automatically have the direction field in lastMessage.\n');
} else {
  print(`⚠️  WARNING: Some documents remain:`);
  print(`  - Conversations: ${remainingConversations}`);
  print(`  - Messages: ${remainingMessages}\n`);
}

print('Done.');
