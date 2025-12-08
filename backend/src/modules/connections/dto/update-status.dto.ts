import { IsEnum, IsNotEmpty } from 'class-validator';
import { ConnectionStatus } from '@/common/constants';

export class UpdateStatusDto {
  @IsNotEmpty()
  @IsEnum(ConnectionStatus)
  status: ConnectionStatus;
}
