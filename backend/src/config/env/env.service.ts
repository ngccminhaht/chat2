import { Injectable } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { EnvSchema } from './env.schema'

@Injectable()
export class EnvService {
  private readonly config: EnvSchema

  constructor() {
    const validatedConfig = plainToInstance(EnvSchema, process.env, {
      enableImplicitConversion: true,
    })

    const errors = validateSync(validatedConfig, { whitelist: true })

    if (errors.length) {
      throw new Error(
        `Environment validation failed: ${errors.map((err) => err.toString()).join(', ')}`,
      )
    }

    this.config = validatedConfig
  }

  get<K extends keyof EnvSchema>(key: K): EnvSchema[K] {
    return this.config[key]
  }
}
