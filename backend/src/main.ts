import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { JsonLogger } from './logger.js';

const config = loadConfig();
const app = await NestFactory.create(AppModule.forRoot(config), { logger: new JsonLogger() });
app.enableShutdownHooks();
await app.listen(config.PORT);
