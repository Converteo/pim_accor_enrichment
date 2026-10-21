import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from './errors.js';

const email = z.email().max(254);
const DOMAIN = '@converteo.com';

/**
 * E-mail du relecteur, posé par le relais du front dans X-PIM-Author (le back n'est appelable que par le SA du front :
 * l'en-tête fait foi). Exigé sur chaque route d'écriture : 401 s'il manque ou n'est pas un e-mail, 403 hors Converteo.
 */
export function authorFrom(header: string | undefined): string {
  const author = header?.trim().toLowerCase();
  if (!author)
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'author_required', 'Auteur manquant (en-tête X-PIM-Author).');
  if (!email.safeParse(author).success)
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'author_invalid', "L'auteur doit être une adresse e-mail.");
  if (!author.endsWith(DOMAIN))
    throw new ApiError(HttpStatus.FORBIDDEN, 'author_forbidden', 'Seuls les comptes @converteo.com peuvent décider.');
  return author;
}

export const Author = createParamDecorator((_: unknown, ctx: ExecutionContext): string =>
  authorFrom(ctx.switchToHttp().getRequest<Request>().header('x-pim-author')),
);
