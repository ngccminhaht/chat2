import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebsocketGateway } from './websocket.gateway';
import { WebSocketBridgeConsumer } from './websocket-bridge.consumer';
import { EnvService } from '@/common/env';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        secret: envService.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [WebsocketGateway, WebSocketBridgeConsumer],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
