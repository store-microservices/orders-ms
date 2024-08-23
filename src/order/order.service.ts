import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { PaginationDto } from 'src/common/pagination.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { NatsService } from 'src/config';

@Injectable()
export class OrderService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);

  constructor(@Inject(NatsService) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }
  async create(createOrderDto: CreateOrderDto) {
    try {
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );

      const { totalItems, totalAmount } = createOrderDto.items.reduce(
        (acc, orderItem) => {
          const product = products.find((p) => p.id === orderItem.productId);

          return {
            totalItems: acc.totalItems + orderItem.quantity,
            totalAmount: acc.totalAmount + orderItem.quantity * product.price,
          };
        },
        { totalItems: 0, totalAmount: 0 },
      );

      const order = await this.order.create({
        data: {
          totalItems,
          totalAmount,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find((p) => p.id === orderItem.productId).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              productId: true,
              quantity: true,
              price: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((p) => p.id === orderItem.productId).name,
        })),
      };
    } catch (error) {
      this.logger.error(error);
      throw new RpcException(error);
    }
  }

  async findAll(pagination: PaginationDto) {
    try {
      const { page, limit } = pagination;
      const totalPages = await this.order.count();
      const lastPage = Math.ceil(totalPages / limit);

      return {
        data: await this.order.findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {
            createdAt: 'asc',
          },
        }),
        meta: {
          total: totalPages,
          page,
          lastPage,
        },
      };
    } catch (error) {
      this.logger.error(error);
      throw new RpcException(error);
    }
  }

  async findOne(id: string) {
    try {
      const order = await this.order.findUnique({
        where: {
          id,
        },
        include: {
          OrderItem: {
            select: {
              productId: true,
            },
          },
        },
      });

      const productIds = order.OrderItem.map((item) => item.productId);

      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );

      if (!order) {
        throw new RpcException('Order not found');
      }

      return {
        ...order,
        OrderItem: products,
      };
    } catch (error) {
      this.logger.error(error);
      throw new RpcException(error);
    }
  }

  changeStatus(id: string, updateOrderDto: UpdateOrderDto) {
    try {
      const order = this.findOne(id);
      if (!order) {
        throw new RpcException('Order not found');
      }

      return this.order.update({
        where: {
          id,
        },
        data: updateOrderDto,
      });
    } catch (error) {
      this.logger.error(error);
      throw new RpcException(error);
    }
  }
}
