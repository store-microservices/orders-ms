import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NatsService, env } from 'src/config';

@Module({
  controllers: [OrderController],
  providers: [OrderService],
  imports: [
    ClientsModule.register([
      {
        name: NatsService,
        transport: Transport.NATS,
        options: {
          servers: env.NATS_SERVERS,
        },
      },
    ]),
  ],
})
export class OrderModule {}
