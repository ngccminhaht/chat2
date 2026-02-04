/**
 * Manual Test for MessageCombiner Platform Label Detection
 * Run with: node test-message-combiner-manual.js
 */

// Simulate the getPlatformLabel logic
function getPlatformLabel(platform, message) {
  const labels = {
    facebook: "Facebook",
    zalo: "Zalo",
    tiktok: "TikTok",
    shopee: "Shopee",
    web: "Web",
  };

  const baseLabel = labels[platform] || platform;

  if (platform === "facebook") {
    let isComment = false;

    if (message) {
      const messageMetadata = message.metadata || {};
      const rawPayload = messageMetadata.rawPayload || {};

      isComment =
        messageMetadata.isComment === true ||
        rawPayload.isComment === true ||
        false;
    }

    const finalLabel = isComment ? "FACEBOOK:COMMENT" : "FACEBOOK:INBOX";
    return finalLabel;
  }

  return baseLabel;
}

console.log("\n🧪 Testing getPlatformLabel Function\n");

// Test 1: Inbox message
const inboxMessage = {
  metadata: {
    isComment: false,
    rawPayload: { isComment: false }
  }
};
const result1 = getPlatformLabel("facebook", inboxMessage);
console.log("Test 1 - Inbox Message:");
console.log("  Input: metadata.isComment = false");
console.log("  Result:", result1);
console.log("  Expected: FACEBOOK:INBOX");
console.log("  Status:", result1 === "FACEBOOK:INBOX" ? "✅ PASS" : "❌ FAIL");

// Test 2: Comment message
const commentMessage = {
  metadata: {
    isComment: true,
    postId: "post_123",
    rawPayload: { isComment: true, post_id: "post_123" }
  }
};
const result2 = getPlatformLabel("facebook", commentMessage);
console.log("\nTest 2 - Comment Message:");
console.log("  Input: metadata.isComment = true");
console.log("  Result:", result2);
console.log("  Expected: FACEBOOK:COMMENT");
console.log("  Status:", result2 === "FACEBOOK:COMMENT" ? "✅ PASS" : "❌ FAIL");

// Test 3: Message with only rawPayload
const rawPayloadOnlyMessage = {
  metadata: {
    rawPayload: { isComment: true }
  }
};
const result3 = getPlatformLabel("facebook", rawPayloadOnlyMessage);
console.log("\nTest 3 - RawPayload Only:");
console.log("  Input: rawPayload.isComment = true (no direct metadata.isComment)");
console.log("  Result:", result3);
console.log("  Expected: FACEBOOK:COMMENT");
console.log("  Status:", result3 === "FACEBOOK:COMMENT" ? "✅ PASS" : "❌ FAIL");

// Test 4: Message without metadata
const noMetadataMessage = {};
const result4 = getPlatformLabel("facebook", noMetadataMessage);
console.log("\nTest 4 - No Metadata:");
console.log("  Input: no metadata");
console.log("  Result:", result4);
console.log("  Expected: FACEBOOK:INBOX (default)");
console.log("  Status:", result4 === "FACEBOOK:INBOX" ? "✅ PASS" : "❌ FAIL");

// Test 5: Message with undefined message
const result5 = getPlatformLabel("facebook", undefined);
console.log("\nTest 5 - Undefined Message:");
console.log("  Input: undefined");
console.log("  Result:", result5);
console.log("  Expected: FACEBOOK:INBOX (default)");
console.log("  Status:", result5 === "FACEBOOK:INBOX" ? "✅ PASS" : "❌ FAIL");

// Test 6: Non-Facebook platform
const result6 = getPlatformLabel("zalo", inboxMessage);
console.log("\nTest 6 - Non-Facebook Platform:");
console.log("  Input: platform = 'zalo'");
console.log("  Result:", result6);
console.log("  Expected: Zalo");
console.log("  Status:", result6 === "Zalo" ? "✅ PASS" : "❌ FAIL");

// Summary
console.log("\n" + "=".repeat(50));
console.log("🏁 Test Summary");
console.log("=".repeat(50));
const allPassed =
  result1 === "FACEBOOK:INBOX" &&
  result2 === "FACEBOOK:COMMENT" &&
  result3 === "FACEBOOK:COMMENT" &&
  result4 === "FACEBOOK:INBOX" &&
  result5 === "FACEBOOK:INBOX" &&
  result6 === "Zalo";

console.log(allPassed ? "\n✅ All tests PASSED!" : "\n❌ Some tests FAILED!");
console.log("\n");
