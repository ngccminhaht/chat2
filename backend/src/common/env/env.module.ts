import { Global, Module } from '@nestjs/common';
import { EnvService } from './env.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvSchema } from './env.schema';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

@Global()
@Module({
  providers: [EnvService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate(config: Record<string, unknown>) {
        const validatedConfig = plainToInstance(EnvSchema, config, {
          enableImplicitConversion: true,
        });

        const errors = validateSync(validatedConfig, {
          whitelist: true,
        });

        if (errors.length) {
          throw new Error(errors.toString());
        }

        return validatedConfig;
      },
    }),
  ],
  exports: [EnvService],
})
export class EnvModule {}
