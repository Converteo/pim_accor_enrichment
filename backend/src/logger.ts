import { ConsoleLogger, LogLevel } from '@nestjs/common';

const SEVERITY: Record<LogLevel, string> = {
  log: 'INFO',
  error: 'ERROR',
  warn: 'WARNING',
  debug: 'DEBUG',
  verbose: 'DEBUG',
  fatal: 'CRITICAL',
};

/** Une ligne JSON par log, lue par Cloud Logging (champ `severity`, et `logging.googleapis.com/trace` si fourni). */
export class JsonLogger extends ConsoleLogger {
  protected printMessages(messages: unknown[], context = '', logLevel: LogLevel = 'log'): void {
    for (const message of messages) {
      const fields = typeof message === 'object' && message !== null ? message : { message };
      process.stdout.write(JSON.stringify({ severity: SEVERITY[logLevel], context, ...fields }) + '\n');
    }
  }
}
