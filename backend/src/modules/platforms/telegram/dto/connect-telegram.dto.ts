import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class ConnectTelegramDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+:[A-Za-z0-9_-]+$/, {
    message: 'Invalid bot token format. Expected format: 123456:ABC-DEF...',
  })
  botToken: string;
}
