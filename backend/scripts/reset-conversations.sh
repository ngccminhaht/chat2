#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🗑️  Reset Conversations Script${NC}"
echo ""
echo -e "${RED}⚠️  WARNING: This will delete ALL conversations and messages!${NC}"
echo ""
read -p "Type 'DELETE' to confirm: " confirmation

if [ "$confirmation" != "DELETE" ]; then
  echo -e "${GREEN}Cancelled.${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}Connecting to MongoDB...${NC}"

# MongoDB connection string (adjust if needed)
MONGO_URI=${MONGO_URI:-"mongodb://localhost:27017/miagent"}

# Run the deletion script
mongosh "$MONGO_URI" --quiet --eval '
const conversationCount = db.conversations.countDocuments();
const messageCount = db.messages.countDocuments();

print("📊 Current counts:");
print("  - Conversations: " + conversationCount);
print("  - Messages: " + messageCount);
print("");

if (conversationCount === 0 && messageCount === 0) {
  print("✅ Database is already clean.");
} else {
  print("🗑️  Deleting...");

  const messageResult = db.messages.deleteMany({});
  const conversationResult = db.conversations.deleteMany({});

  print("✅ Deleted " + messageResult.deletedCount + " messages");
  print("✅ Deleted " + conversationResult.deletedCount + " conversations");
  print("");
  print("💡 New conversations will have lastMessage.direction field automatically.");
}
'

echo ""
echo -e "${GREEN}Done!${NC}"
