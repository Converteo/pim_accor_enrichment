import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CONFIG, Config } from './config.js';
import { ErrorFilter } from './errors.js';
import { HealthController } from './health.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
