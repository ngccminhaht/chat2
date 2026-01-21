/**
 * AI Message Parser
 * Parses AI responses that contain images or videos in markdown format
 * and splits them into multiple messages for sequential sending
 */

export interface MessagePart {
  type: 'text' | 'image' | 'video';
  content: string;
  alt?: string;
}

export class AIMessageParser {
  /**
   * Parse text and extract media (images, videos) into separate parts
   * Supports markdown-style image/video syntax:
   * - Images: ![alt text](https://example.com/image.jpg)
   * - Videos: [alt text](https://example.com/video.mp4)
   */
  static parseTextAndMedia(text: string | null | undefined): MessagePart[] {
    if (!text || typeof text !== 'string') {
      return [{ type: 'text', content: text || '' }];
    }

    // Regex for images: ![alt](url.jpg|png|gif|webp|etc)
    const imageRegex =
      /!\[([^\]]*)\]\(([^)]+\.(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|tiff|tif|ico|heic|heif))\)/gi;

    // Regex for videos: [alt](url.mp4|mov|etc)
    const videoRegex =
      /\[([^\]]*)\]\(([^)]+\.(?:mp4|mov|avi|mkv|webm|3gp|flv|wmv))\)/gi;

    const parts: MessagePart[] = [];
    let lastIndex = 0;
    const allMatches: Array<{
      type: 'image' | 'video';
      match: RegExpExecArray;
      index: number;
      length: number;
    }> = [];

    // Find all image matches
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(text)) !== null) {
      allMatches.push({
        type: 'image',
        match: match,
        index: match.index,
        length: match[0].length,
      });
    }

    // Find all video matches
    while ((match = videoRegex.exec(text)) !== null) {
      allMatches.push({
        type: 'video',
        match: match,
        index: match.index,
        length: match[0].length,
      });
    }

    // Sort matches by position in text
    allMatches.sort((a, b) => a.index - b.index);

    // Process matches and extract text parts
    for (const mediaMatch of allMatches) {
      // Extract text before this match
      if (mediaMatch.index > lastIndex) {
        const textPart = text.slice(lastIndex, mediaMatch.index).trim();
        if (textPart && /\w/.test(textPart)) {
          parts.push({ type: 'text', content: textPart });
        }
      }

      // Add media part
      parts.push({
        type: mediaMatch.type,
        content: mediaMatch.match[2], // URL
        alt: mediaMatch.match[1], // Alt text
      });

      lastIndex = mediaMatch.index + mediaMatch.length;
    }

    // Extract remaining text after last match
    if (lastIndex < text.length) {
      const textPart = text.slice(lastIndex).trim();
      if (textPart && /\w/.test(textPart)) {
        parts.push({ type: 'text', content: textPart });
      }
    }

    // If no matches found, return original text
    if (parts.length === 0) {
      parts.push({ type: 'text', content: text });
    }

    return parts;
  }

  /**
   * Validate media URL
   */
  static isValidMediaUrl(url: string, type: 'image' | 'video'): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    if (type === 'image') {
      return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|tiff|tif|ico|heic|heif)$/i.test(
        url,
      );
    } else if (type === 'video') {
      return /^https?:\/\/.+\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv)$/i.test(url);
    }

    return false;
  }
}
