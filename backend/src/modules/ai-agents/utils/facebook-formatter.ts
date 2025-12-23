/**
 * Facebook Formatting Utilities
 * Converts markdown to Facebook-compatible format
 */

export class FacebookFormatter {
  /**
   * Convert markdown text to Facebook-compatible format
   * Facebook supports: *bold*, _italic_, ~strikethrough~, ```code```
   */
  static markdownToFBFormat(text: string): string {
    let result = text;

    // 1. Handle code blocks
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      let content = match.slice(3, -3);
      content = content.replace(/^[a-zA-Z0-9]+\n/, "");
      content = content.trim();
      return "```\n" + content + "\n```";
    });

    // 2. Handle bold - mark temporarily
    result = result.replace(/\*\*(.+?)\*\*/g, "§BOLD§$1§BOLD§");
    result = result.replace(/__(.+?)__/g, "§BOLD§$1§BOLD§");

    // 3. Handle italic
    result = result.replace(/\*(.+?)\*/g, "_$1_");
    // _text_ remains as is

    // 4. Convert bold markers to *
    result = result.replace(/§BOLD§/g, "*");

    // 5. Handle strikethrough
    result = result.replace(/~~(.+?)~~/g, "~$1~");

    return result;
  }
}
