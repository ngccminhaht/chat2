import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';

@Injectable()
export class PlatformConnectionsService {
  constructor(
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {}

  async findAllByUser(userId: string): Promise<any> {
    const connections = await this.platformConnectionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    // Transform _id to id for frontend compatibility
    return connections.map((conn) => {
      const doc: any = conn.toObject();
      return {
        id: conn._id.toString(),
        userId: conn.userId.toString(),
        platform: conn.platform,
        platformAccountId: conn.platformAccountId,
        platformAccountName: conn.platformAccountName,
        status: conn.status,
        credentials: conn.credentials,
        webhookSecret: conn.webhookSecret,
        metadata: conn.metadata,
        lastSyncAt: conn.lastSyncAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }

  async findOne(id: string): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel.findById(id).exec();
  }

  async findByPlatform(
    userId: string,
    platform: string,
  ): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform,
      })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.platformConnectionModel.findByIdAndDelete(id).exec();
  }
}
