import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { Session } from './chat/entities/session.entity';
import { Message } from './chat/entities/message.entity';
import { Interaction } from './chat/entities/interaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres' as const,
        host: c.get<string>('POSTGRES_HOST'),
        port: c.get<number>('POSTGRES_PORT'),
        username: c.get<string>('POSTGRES_USER'),
        password: c.get<string>('POSTGRES_PASSWORD'),
        database: c.get<string>('POSTGRES_DB'),
        entities: [Session, Message, Interaction],
        synchronize: false,
      }),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
