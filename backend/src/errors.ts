import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

// Messages de validation en français, renvoyés tels quels à l'interface
z.config(z.locales.fr());

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

/** Erreurs des clients Google : ApiError (BigQuery, Storage, champs code/errors) ou GoogleError (gRPC, code numérique). */
const isGcpError = (e: unknown) =>
  e instanceof Error && ('errors' in e || typeof (e as { code?: unknown }).code === 'number');

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
    // Détail dans les logs seulement ; 502 pour une erreur renvoyée par BigQuery ou une API GCP, 500 sinon (bug du back)
    const trace = req.header('x-cloud-trace-context')?.split('/')[0];
    this.logger.error({
      message: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
      httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl },
      ...(trace && { 'logging.googleapis.com/trace': `projects/${process.env.GCP_PROJECT_ID}/traces/${trace}` }),
    });
    if (isGcpError(exception)) {
      res
        .status(HttpStatus.BAD_GATEWAY)
        .json({ error: { code: 'upstream_error', message: 'Erreur BigQuery ou GCP, réessayez plus tard.' } });
    } else {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: { code: 'internal_error', message: 'Erreur interne du serveur.' } });
    }
  }
}

/** Valide une entrée (query, corps) ; 400 avec le chemin du premier champ invalide sinon. */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new ApiError(HttpStatus.BAD_REQUEST, 'invalid_request', `Requête invalide${where} : ${issue?.message ?? ''}`);
  }
  return result.data;
}
