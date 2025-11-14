import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlatformConnectionsController } from './platform-connections.controller';
import { PlatformConnectionsService } from './platform-connections.service';
import { ZaloOAuthController } from './zalo-oauth.controller';
import { ZaloOAuthService } from './zalo-oauth.service';
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas/platform-connection.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
  ],
  controllers: [PlatformConnectionsController, ZaloOAuthController],
  providers: [PlatformConnectionsService, ZaloOAuthService],
  exports: [PlatformConnectionsService, ZaloOAuthService],
})
export class PlatformConnectionsModule {}
