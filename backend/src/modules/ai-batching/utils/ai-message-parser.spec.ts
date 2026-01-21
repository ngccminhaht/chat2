/**
 * Tests for AI Message Parser
 */

import { AIMessageParser } from './ai-message-parser';

describe('AIMessageParser', () => {
  describe('parseTextAndMedia', () => {
    it('should parse plain text without media', () => {
      const text = 'Hello, this is a plain text message.';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'text',
        content: 'Hello, this is a plain text message.',
      });
    });

    it('should parse text with single image', () => {
      const text =
        'Here is an image: ![Product photo](https://example.com/product.jpg)';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'text',
        content: 'Here is an image:',
      });
      expect(result[1]).toEqual({
        type: 'image',
        content: 'https://example.com/product.jpg',
        alt: 'Product photo',
      });
    });

    it('should parse text with single video', () => {
      const text = 'Watch this: [Demo video](https://example.com/demo.mp4)';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'text',
        content: 'Watch this:',
      });
      expect(result[1]).toEqual({
        type: 'video',
        content: 'https://example.com/demo.mp4',
        alt: 'Demo video',
      });
    });

    it('should parse text with multiple images and videos', () => {
      const text =
        'Check out this product ![Product](https://example.com/p1.jpg) and this video [Tutorial](https://example.com/tutorial.mp4) and another image ![Screenshot](https://example.com/s1.png)';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(6);
      expect(result[0].type).toBe('text');
      expect(result[1].type).toBe('image');
      expect(result[2].type).toBe('text');
      expect(result[3].type).toBe('video');
      expect(result[4].type).toBe('text');
      expect(result[5].type).toBe('image');
    });

    it('should parse image at the beginning', () => {
      const text =
        '![Product](https://example.com/product.jpg) This is a great product!';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'image',
        content: 'https://example.com/product.jpg',
        alt: 'Product',
      });
      expect(result[1]).toEqual({
        type: 'text',
        content: 'This is a great product!',
      });
    });

    it('should parse image at the end', () => {
      const text =
        'This is a great product! ![Product](https://example.com/product.jpg)';
      const result = AIMessageParser.parseTextAndMedia(text);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'text',
        content: 'This is a great product!',
      });
      expect(result[1]).toEqual({
        type: 'image',
        content: 'https://example.com/product.jpg',
        alt: 'Product',
      });
    });

    it('should handle empty or whitespace-only text parts', () => {
      const text =
        '![Image1](https://example.com/1.jpg)   ![Image2](https://example.com/2.jpg)';
      const result = AIMessageParser.parseTextAndMedia(text);

      // Should only contain the two images, whitespace-only text is ignored
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('image');
      expect(result[1].type).toBe('image');
    });

    it('should handle null or undefined input', () => {
      expect(AIMessageParser.parseTextAndMedia(null)).toEqual([
        { type: 'text', content: '' },
      ]);
      expect(AIMessageParser.parseTextAndMedia(undefined)).toEqual([
        { type: 'text', content: '' },
      ]);
    });

    it('should support various image formats', () => {
      const formats = [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'avif',
        'bmp',
        'svg',
      ];
      formats.forEach((format) => {
        const text = `![Image](https://example.com/image.${format})`;
        const result = AIMessageParser.parseTextAndMedia(text);
        expect(result[0].type).toBe('image');
      });
    });

    it('should support various video formats', () => {
      const formats = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'flv', 'wmv'];
      formats.forEach((format) => {
        const text = `[Video](https://example.com/video.${format})`;
        const result = AIMessageParser.parseTextAndMedia(text);
        expect(result[0].type).toBe('video');
      });
    });

    it('should handle mixed text, images, and videos in realistic AI response', () => {
      const aiResponse = `Great question! Here's what I found:

First, check out this product image:
![Red Shoes](https://cdn.example.com/products/shoes-red-123.jpg)

The product features include:
- Premium leather
- Available sizes: 7-12

Watch this demo video to see them in action:
[Product Demo](https://cdn.example.com/videos/shoes-demo.mp4)

For more details, here's a close-up:
![Close-up view](https://cdn.example.com/products/shoes-closeup.png)

Let me know if you need anything else!`;

      const result = AIMessageParser.parseTextAndMedia(aiResponse);

      expect(result.length).toBeGreaterThan(5);
      expect(result.filter((p) => p.type === 'text').length).toBeGreaterThan(0);
      expect(result.filter((p) => p.type === 'image').length).toBe(2);
      expect(result.filter((p) => p.type === 'video').length).toBe(1);
    });
  });

  describe('isValidMediaUrl', () => {
    it('should validate image URLs', () => {
      expect(
        AIMessageParser.isValidMediaUrl(
          'https://example.com/image.jpg',
          'image',
        ),
      ).toBe(true);
      expect(
        AIMessageParser.isValidMediaUrl(
          'http://example.com/photo.png',
          'image',
        ),
      ).toBe(true);
      expect(
        AIMessageParser.isValidMediaUrl('not-a-url', 'image'),
      ).toBe(false);
      expect(
        AIMessageParser.isValidMediaUrl(
          'https://example.com/video.mp4',
          'image',
        ),
      ).toBe(false);
    });

    it('should validate video URLs', () => {
      expect(
        AIMessageParser.isValidMediaUrl(
          'https://example.com/video.mp4',
          'video',
        ),
      ).toBe(true);
      expect(
        AIMessageParser.isValidMediaUrl('http://example.com/clip.mov', 'video'),
      ).toBe(true);
      expect(
        AIMessageParser.isValidMediaUrl('not-a-url', 'video'),
      ).toBe(false);
      expect(
        AIMessageParser.isValidMediaUrl(
          'https://example.com/image.jpg',
          'video',
        ),
      ).toBe(false);
    });

    it('should reject null/undefined URLs', () => {
      expect(AIMessageParser.isValidMediaUrl(null as any, 'image')).toBe(false);
      expect(AIMessageParser.isValidMediaUrl(undefined as any, 'video')).toBe(
        false,
      );
    });
  });
});
