import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Erreur renvoyée telle quelle à l'interface : `{ error: { code, message } }`, message en français. */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}

const CODES: Partial<Record<number, [string, string]>> = {
  400: ['bad_request', 'Requête invalide.'],
  401: ['unauthorized', 'Auteur manquant.'],
  404: ['not_found', 'Ressource introuvable.'],
  409: ['conflict', "Conflit avec l'état actuel."],
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ApiError) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const [code, message] = CODES[status] ?? ['error', 'Erreur.'];
      res.status(status).json({ error: { code, message } });
      return;
    }
    // Tout le reste vient de BigQuery ou de GCP : 502, détail dans les logs seulement
    const trace = req.header('x-cloud-trace-context')?.split('/')[0];
    this.logger.error({
      message: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
      httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl },
      ...(trace && { 'logging.googleapis.com/trace': `projects/${process.env.GCP_PROJECT_ID}/traces/${trace}` }),
    });
    res
      .status(HttpStatus.BAD_GATEWAY)
      .json({ error: { code: 'upstream_error', message: 'Erreur BigQuery ou GCP, réessayez plus tard.' } });
  }
}
