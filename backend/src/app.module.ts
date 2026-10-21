import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { AuthClient } from 'google-auth-library';
import { CONFIG, Config } from './config.js';
import { ErrorFilter } from './errors.js';
import { Bq, createBq, gcpAuthClient } from './gcp.js';
import { HealthController } from './health.controller.js';
import { BigQueryRepository, Repository } from './repository.js';

export const GCP_AUTH = Symbol('GCP_AUTH');

@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: GCP_AUTH, useFactory: () => gcpAuthClient(config) },
        { provide: Bq, useFactory: (auth: AuthClient | undefined) => createBq(config, auth), inject: [GCP_AUTH] },
        { provide: Repository, useClass: BigQueryRepository },
      ],
    };
  }
}
