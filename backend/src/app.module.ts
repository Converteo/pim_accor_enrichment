import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ExecutionsClient, JobsClient } from '@google-cloud/run';
import { Storage } from '@google-cloud/storage';
import type { AuthClient } from 'google-auth-library';
import { CONFIG, Config } from './config.js';
import { ErrorFilter } from './errors.js';
import { Bq, createBq, gcpAuthClient } from './gcp.js';
import { DecisionsController } from './decisions.controller.js';
import { DecisionsService } from './decisions.js';
import { EXPORT_CLIENTS, ExportController, ExportService } from './export.js';
import { HealthController } from './health.controller.js';
import { HotelsController } from './hotels.controller.js';
import { MatchesController } from './matches.controller.js';
import { BigQueryRepository, Repository } from './repository.js';
import { SettingsController, SettingsService } from './settings.js';

export const GCP_AUTH = Symbol('GCP_AUTH');

@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        HotelsController,
        MatchesController,
        DecisionsController,
        ExportController,
        SettingsController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: GCP_AUTH, useFactory: () => gcpAuthClient(config) },
        { provide: Bq, useFactory: (auth: AuthClient | undefined) => createBq(config, auth), inject: [GCP_AUTH] },
        { provide: Repository, useClass: BigQueryRepository },
        DecisionsService,
        SettingsService,
        ExportService,
        {
          provide: EXPORT_CLIENTS,
          useFactory: (authClient: AuthClient | undefined) => ({
            jobs: new JobsClient({ authClient }),
            executions: new ExecutionsClient({ authClient }),
            storage: new Storage({ projectId: config.GCP_PROJECT_ID, authClient }),
          }),
          inject: [GCP_AUTH],
        },
      ],
    };
  }
}
