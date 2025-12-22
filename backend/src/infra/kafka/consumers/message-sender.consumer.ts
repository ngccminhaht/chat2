/**
 * Message Sender Consumer
 * Consumes outgoing messages from Kafka and sends them via platform adapters
 *
 * Topic: messages.outgoing
 * Consumer Group: message-sender-group
 */

import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import axios from 'axios';
import { KAFKA_TOPICS } from '../kafka.config';
import { OutgoingMessageEvent } from '../types/webhook.types';
import {
  DEFAULT_RETRY_CONFIG,
  calculateBackoff,
  isRetryableStatus,
  extractStatusCode,
} from './retry.config';
import { Platform, MessageStatus, MessageType } from '@/common/constants';
import { PlatformRegistry } from '@/modules/platforms/core/services/platform.registry';
import { ZaloAdapter } from '@/modules/platforms/adapters/zalo.adapter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { KafkaProducerService } from '../kafka-producer.service';
import {
  WebSocketNotificationEvent,
  MessageStatusPayload,
} from '../types/webhook.types';
import { EnvService } from '@/common/env';
import { VisitorGateway } from '@/modules/websocket/visitor.gateway';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';

/**
 * Extended event type with retry metadata
 */
interface OutgoingEventWithRetry extends OutgoingMessageEvent {
  retryCount?: number;
  lastError?: string;
}

@Controller()
export class MessageSenderConsumer {
  private readonly logger = new Logger(MessageSenderConsumer.name);

  constructor(
    private readonly platformRegistry: PlatformRegistry,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly envService: EnvService,
    private readonly visitorGateway: VisitorGateway,
    private readonly websocketGateway: WebsocketGateway,
  ) {
    this.logger.log(`🚀 MessageSenderConsumer initialized, listening on: ${KAFKA_TOPICS.MESSAGES_OUTGOING}`);
  }

  @MessagePattern(KAFKA_TOPICS.MESSAGES_OUTGOING)
  async handleOutgoingMessage(@Payload() event: OutgoingEventWithRetry): Promise<void> {
    const retryCount = event.retryCount || 0;

    this.logger.log(
      `📤 Processing outgoing message: ${event.messageId} to ${event.platform}` +
        (retryCount > 0 ? ` (retry ${retryCount}/${DEFAULT_RETRY_CONFIG.maxRetries})` : ''),
    );
    this.logger.log(`📋 Event details:`, {
      messageId: event.messageId,
      conversationId: event.conversationId,
      platform: event.platform,
      platformConnectionId: event.platformConnectionId,
      recipientId: event.recipientId,
      messageType: event.message?.type,
      messageText: event.message?.text?.substring(0, 50),
      retryCount,
    });

    try {
      // Handle Web platform separately - emit directly via WebSocket
      if (event.platform === Platform.WEB) {
        await this.handleWebPlatformMessage(event);
        return;
      }

      // 1. Get platform adapter
      const adapter = this.platformRegistry.get(event.platform);
      this.logger.log(`✅ Got adapter for platform: ${event.platform}`);

      // 2. Get platform connection for credentials
      const connection = await this.platformConnectionModel
        .findById(event.platformConnectionId)
        .exec();

      if (!connection) {
        this.logger.error(`Connection not found: ${event.platformConnectionId}`);
        await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, 'Connection not found');
        return;
      }

      // 3. Handle Zalo file upload (Zalo requires uploading files to their server first)
      if (
        event.platform === Platform.ZALO &&
        event.message.type === MessageType.FILE &&
        event.message.mediaUrl
      ) {
        const zaloAdapter = adapter as ZaloAdapter;
        const uploadResult = await zaloAdapter.uploadFile(
          connection.credentials.accessToken,
          event.message.mediaUrl,
          event.message.fileName,
        );

        if (!uploadResult) {
          this.logger.error(`❌ Failed to upload file to Zalo`);
          await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, 'Failed to upload file to Zalo');
          return;
        }

        // Send file message with token
        let result = await zaloAdapter.sendFileWithToken(
          connection,
          event.recipientId,
          uploadResult.token,
        );

        // Handle token refresh if needed
        if (!result.success && result.needsTokenRefresh) {
          const refreshedConnection = await this.refreshZaloToken(connection);
          if (refreshedConnection) {
            // Re-upload with new token
            const reuploadResult = await zaloAdapter.uploadFile(
              refreshedConnection.credentials.accessToken,
              event.message.mediaUrl,
              event.message.fileName,
            );
            if (reuploadResult) {
              result = await zaloAdapter.sendFileWithToken(
                refreshedConnection,
                event.recipientId,
                reuploadResult.token,
              );
            }
          }
        }

        if (result.success) {
          await this.updateMessageStatus(event.messageId, MessageStatus.SENT, undefined, result.platformMessageId);
          this.logger.log(`✅ File sent: ${event.messageId} -> ${result.platformMessageId}`);
        } else {
          await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, result.error);
          this.logger.error(`❌ Failed to send file: ${result.error}`);
        }

        await this.publishStatusNotification(event, result.success ? MessageStatus.SENT : MessageStatus.FAILED);
        return;
      }

      // 3b. Handle Zalo image upload (Zalo requires uploading images to their server first)
      if (
        event.platform === Platform.ZALO &&
        event.message.type === MessageType.IMAGE &&
        event.message.mediaUrl
      ) {
        const zaloAdapter = adapter as ZaloAdapter;
        const uploadResult = await zaloAdapter.uploadImage(
          connection.credentials.accessToken,
          event.message.mediaUrl,
        );

        if (!uploadResult) {
          this.logger.error(`❌ Failed to upload image to Zalo`);
          await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, 'Failed to upload image to Zalo');
          return;
        }

        // Send image message with attachment_id
        let result = await zaloAdapter.sendImageWithAttachmentId(
          connection,
          event.recipientId,
          uploadResult.attachmentId,
        );

        // Handle token refresh if needed
        if (!result.success && result.needsTokenRefresh) {
          const refreshedConnection = await this.refreshZaloToken(connection);
          if (refreshedConnection) {
            // Re-upload with new token
            const reuploadResult = await zaloAdapter.uploadImage(
              refreshedConnection.credentials.accessToken,
              event.message.mediaUrl,
            );
            if (reuploadResult) {
              result = await zaloAdapter.sendImageWithAttachmentId(
                refreshedConnection,
                event.recipientId,
                reuploadResult.attachmentId,
              );
            }
          }
        }

        if (result.success) {
          await this.updateMessageStatus(event.messageId, MessageStatus.SENT, undefined, result.platformMessageId);
          this.logger.log(`✅ Image sent: ${event.messageId} -> ${result.platformMessageId}`);
        } else {
          await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, result.error);
          this.logger.error(`❌ Failed to send image: ${result.error}`);
        }

        await this.publishStatusNotification(event, result.success ? MessageStatus.SENT : MessageStatus.FAILED);
        return;
      }

      // 4. Format outbound message using adapter (for non-file/image messages)
      const outboundMessage = {
        type: event.message.type,
        content: {
          text: event.message.text,
          mediaUrl: event.message.mediaUrl,
          mediaType: event.message.mediaType,
          fileName: event.message.fileName,
        },
      };
      const platformPayload = adapter.formatOutbound(outboundMessage);

      // 5. Send message via adapter
      let result = await adapter.send(
        connection,
        event.recipientId,
        platformPayload,
      );

      // 6. Handle token refresh if needed (Zalo specific)
      if (!result.success && result.needsTokenRefresh && event.platform === Platform.ZALO) {
        this.logger.log(`🔄 Attempting to refresh Zalo access token for connection ${connection._id}`);

        const refreshedConnection = await this.refreshZaloToken(connection);
        if (refreshedConnection) {
          this.logger.log(`✅ Token refreshed, retrying send...`);
          result = await adapter.send(
            refreshedConnection,
            event.recipientId,
            platformPayload,
          );
        } else {
          this.logger.error(`❌ Failed to refresh token, marking message as failed`);
        }
      }

      // 6. Update message status with retry logic
      if (result.success) {
        await this.updateMessageStatus(
          event.messageId,
          MessageStatus.SENT,
          undefined,
          result.platformMessageId,
        );
        this.logger.log(
          `✅ Message sent: ${event.messageId} -> ${result.platformMessageId}`,
        );
        await this.publishStatusNotification(event, MessageStatus.SENT);
      } else {
        // Handle retry logic for failed sends
        const statusCode = extractStatusCode(result.error);

        if (isRetryableStatus(statusCode) && retryCount < DEFAULT_RETRY_CONFIG.maxRetries) {
          // Schedule retry with exponential backoff
          const delay = calculateBackoff(retryCount);
          this.logger.warn(
            `⏳ Scheduling retry ${retryCount + 1}/${DEFAULT_RETRY_CONFIG.maxRetries} ` +
              `for message ${event.messageId} in ${delay}ms (status: ${statusCode})`,
          );
          await this.scheduleRetry(event, retryCount + 1, delay, result.error);
          return; // Don't update status yet - will retry
        }

        // Max retries reached or non-retryable error → fail permanently
        if (retryCount >= DEFAULT_RETRY_CONFIG.maxRetries) {
          this.logger.error(
            `💀 Max retries (${DEFAULT_RETRY_CONFIG.maxRetries}) reached for ${event.messageId}, sending to DLQ`,
          );
          await this.sendToDLQ(event, result.error);
        }

        await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, result.error);
        this.logger.error(`❌ Failed to send message: ${result.error}`);
        await this.publishStatusNotification(event, MessageStatus.FAILED);
      }

    } catch (error) {
      this.logger.error(
        `❌ Error processing outgoing message: ${error.message}`,
        error.stack,
      );

      // Handle retry for unexpected errors (likely network/server issues)
      const statusCode = extractStatusCode(error);

      if (isRetryableStatus(statusCode) && retryCount < DEFAULT_RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoff(retryCount);
        this.logger.warn(
          `⏳ Scheduling retry ${retryCount + 1}/${DEFAULT_RETRY_CONFIG.maxRetries} ` +
            `for message ${event.messageId} after exception in ${delay}ms`,
        );
        await this.scheduleRetry(event, retryCount + 1, delay, error.message);
        return;
      }

      if (retryCount >= DEFAULT_RETRY_CONFIG.maxRetries) {
        await this.sendToDLQ(event, error.message);
      }

      await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, error.message);
      await this.publishStatusNotification(event, MessageStatus.FAILED);
    }
  }

  /**
   * Update message status in database
   * Handles race condition: if webhook already created message with real platformMessageId,
   * the pending message should be deleted to avoid duplicates
   */
  private async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    error?: string,
    platformMessageId?: string,
  ): Promise<void> {
    const update: any = { status };

    if (error) {
      update['metadata.error'] = error;
    }

    // If we have a real platformMessageId, handle potential race condition
    if (platformMessageId) {
      try {
        // Check if a message with this platformMessageId already exists (created by webhook)
        const existingMessage = await this.messageModel.findOne({
          platformMessageId,
          _id: { $ne: messageId }, // Not our pending message
        }).exec();

        if (existingMessage) {
          // Webhook already created the real message, delete our pending one
          this.logger.warn(
            `Race condition detected: webhook already created message with ${platformMessageId}, deleting pending message ${messageId}`,
          );
          await this.messageModel.findByIdAndDelete(messageId);
          return;
        }

        // No conflict, safe to update
        update.platformMessageId = platformMessageId;
        await this.messageModel.findByIdAndUpdate(messageId, update);
      } catch (err) {
        // E11000 duplicate key error - webhook beat us to it
        if (err.code === 11000) {
          this.logger.warn(
            `E11000 race condition: deleting pending message ${messageId}`,
          );
          await this.messageModel.findByIdAndDelete(messageId);
          return;
        }
        throw err;
      }
    } else {
      await this.messageModel.findByIdAndUpdate(messageId, update);
    }
  }

  /**
   * Publish status notification via Kafka and broadcast to org agents
   */
  private async publishStatusNotification(
    event: OutgoingMessageEvent,
    status: MessageStatus,
  ): Promise<void> {
    try {
      // Get connection for userId and organizationId
      const connection = await this.platformConnectionModel
        .findById(event.platformConnectionId)
        .exec();

      if (!connection) {
        return;
      }

      const statusPayload = {
        messageId: event.messageId,
        conversationId: event.conversationId,
        status,
      };

      // Broadcast status update to all org agents
      const organizationId = connection.organizationId?.toString();
      if (organizationId) {
        this.websocketGateway.emitToOrgAgents(organizationId, 'message:status', statusPayload);
      }

      // Also send via Kafka to connectedBy user (for backward compatibility)
      if (connection.connectedBy) {
        const userId = connection.connectedBy.toString();
        const notification: WebSocketNotificationEvent = {
          type: 'message:status',
          userId,
          payload: statusPayload as MessageStatusPayload,
          timestamp: Date.now(),
        };

        await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
          key: userId,
          value: notification,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to publish status notification: ${error.message}`);
    }
  }

  /**
   * Refresh Zalo access token and update connection in database
   * @returns Updated connection with new tokens, or null if refresh failed
   */
  private async refreshZaloToken(
    connection: PlatformConnectionDocument,
  ): Promise<PlatformConnectionDocument | null> {
    try {
      const refreshToken = connection.credentials?.refreshToken;
      if (!refreshToken || refreshToken === 'placeholder') {
        this.logger.error(`❌ No valid refresh token for connection ${connection._id}`);
        return null;
      }

      const appId = this.envService.get('ZALO_APP_ID');
      const appSecret = this.envService.get('ZALO_APP_SECRET');

      const params = new URLSearchParams({
        app_id: appId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      this.logger.log(`🔄 Calling Zalo refresh token API...`);

      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: appSecret,
          },
        },
      );

      this.logger.log(`📨 Zalo refresh token response:`, {
        error: response.data.error,
        hasAccessToken: !!response.data.access_token,
      });

      // Check for error (Zalo returns error field on failure)
      if (response.data.error) {
        this.logger.error(`❌ Zalo refresh token error: ${response.data.error} - ${response.data.message}`);
        return null;
      }

      // Update connection with new tokens
      const newAccessToken = response.data.access_token;
      const newRefreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in || 3600;

      const updatedConnection = await this.platformConnectionModel.findByIdAndUpdate(
        connection._id,
        {
          'credentials.accessToken': newAccessToken,
          'credentials.refreshToken': newRefreshToken,
          'credentials.expiresAt': new Date(Date.now() + expiresIn * 1000),
        },
        { new: true },
      ).exec();

      this.logger.log(`✅ Zalo token refreshed successfully for connection ${connection._id}`);
      return updatedConnection;
    } catch (error) {
      this.logger.error(`❌ Failed to refresh Zalo token: ${error.response?.data || error.message}`);
      return null;
    }
  }

  /**
   * Handle web platform messages by emitting directly to visitor via WebSocket
   * Web messages don't go through external APIs - they're delivered via our WebSocket gateway
   */
  private async handleWebPlatformMessage(event: OutgoingMessageEvent): Promise<void> {
    try {
      // recipientId is the sessionId (format: web_{orgId}_{sessionId}, we extract sessionId)
      // Actually recipientId is customerPlatformUserId which IS the sessionId
      const sessionId = event.recipientId;

      // Get the message from database to include full details
      const message = await this.messageModel.findById(event.messageId).exec();
      if (!message) {
        this.logger.error(`Message not found: ${event.messageId}`);
        return;
      }

      // Emit message to visitor via WebSocket
      this.visitorGateway.emitToVisitor(sessionId, 'message:received', {
        message: {
          _id: message._id.toString(),
          content: message.content,
          sender: message.sender,
          direction: message.direction,
          createdAt: (message as any).createdAt || new Date(),
        },
      });

      // Update message status to sent
      await this.updateMessageStatus(event.messageId, MessageStatus.SENT);

      this.logger.log(`✅ Web message sent to visitor ${sessionId}: ${event.messageId}`);

      // Broadcast message:new to ALL org agents for real-time sync
      const organizationId = message.organizationId?.toString();
      if (organizationId) {
        this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', {
          conversationId: message.conversationId?.toString(),
          message: message.toObject(),
        });
        this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', {
          conversationId: message.conversationId?.toString(),
        });
      }

      // Publish status notification
      await this.publishStatusNotification(event, MessageStatus.SENT);
    } catch (error) {
      this.logger.error(`❌ Failed to send web message: ${error.message}`);
      await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, error.message);
    }
  }

  /**
   * Schedule a retry by re-publishing to the same topic after a delay
   * Uses setTimeout for simplicity; production may use BullMQ for persistence
   */
  private async scheduleRetry(
    event: OutgoingEventWithRetry,
    retryCount: number,
    delayMs: number,
    lastError: string,
  ): Promise<void> {
    setTimeout(async () => {
      try {
        await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING, {
          key: event.conversationId,
          value: {
            ...event,
            retryCount,
            lastError,
          },
        });
        this.logger.log(
          `🔄 Retry ${retryCount} scheduled for message ${event.messageId}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to schedule retry for ${event.messageId}: ${error.message}`,
        );
      }
    }, delayMs);
  }

  /**
   * Send failed message to Dead Letter Queue for manual inspection
   */
  private async sendToDLQ(
    event: OutgoingEventWithRetry,
    error: string,
  ): Promise<void> {
    try {
      await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING_DLQ, {
        key: event.messageId,
        value: {
          ...event,
          error,
          failedAt: Date.now(),
          retriesAttempted: event.retryCount || 0,
        },
      });
      this.logger.log(`📨 Message ${event.messageId} sent to DLQ`);
    } catch (dlqError) {
      this.logger.error(
        `❌ Failed to send message ${event.messageId} to DLQ: ${dlqError.message}`,
      );
    }
  }
}
