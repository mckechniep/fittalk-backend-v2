import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.get<string>('database.url'),
        },
      },
      log: configService.get<string>('app.nodeEnv') === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Utility method to exclude fields from Prisma results
   */
  exclude<T, Key extends keyof T>(
    data: T,
    keys: Key[],
  ): Omit<T, Key> {
    for (const key of keys) {
      delete data[key];
    }
    return data;
  }

  /**
   * Clean the database (useful for testing)
   */
  async cleanDatabase() {
    if (this.configService.get<string>('app.nodeEnv') === 'production') {
      throw new Error('Cannot clean database in production');
    }

    const transactions: any[] = [];
    transactions.push(this.$executeRaw`SET FOREIGN_KEY_CHECKS = 0;`);

    const tableNames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tableNames) {
      if (tablename !== '_prisma_migrations') {
        try {
          transactions.push(this.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`));
        } catch (error) {
          console.log({ error });
        }
      }
    }

    transactions.push(this.$executeRaw`SET FOREIGN_KEY_CHECKS = 1;`);

    try {
      await this.$transaction(transactions);
    } catch (error) {
      console.log({ error });
    }
  }
}