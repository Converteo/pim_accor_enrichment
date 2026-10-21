import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { JsonLogger } from './logger.js';

const config = loadConfig();
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { logger: new JsonLogger() });
// Valider une fiche ou un lot de fiches avec commentaire dépasse les 100 Ko par défaut
app.useBodyParser('json', { limit: '2mb' });
app.enableShutdownHooks();
await app.listen(config.PORT);
