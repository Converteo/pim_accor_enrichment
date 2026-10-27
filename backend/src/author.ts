import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from './errors.js';

const email = z.email().max(254);
const DOMAIN = '@converteo.com';

/** Comptes hors Converteo autorisés à décider (EXTERNAL_REVIEWERS, séparés par « , »), aussi ouverts dans IAP. */
function externalReviewers(): string[] {
  return (process.env.EXTERNAL_REVIEWERS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * E-mail du relecteur, posé par le relais du front dans X-PIM-Author (le back n'est appelable que par le SA du front :
 * l'en-tête fait foi). Exigé sur chaque route d'écriture : 401 s'il manque ou n'est pas un e-mail, 403 hors Converteo
 * et hors invités.
 */
export function authorFrom(header: string | undefined, external: string[] = externalReviewers()): string {
  const author = header?.trim().toLowerCase();
  if (!author)
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'author_required', 'Auteur manquant (en-tête X-PIM-Author).');
  if (!email.safeParse(author).success)
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'author_invalid', "L'auteur doit être une adresse e-mail.");
  if (!author.endsWith(DOMAIN) && !external.includes(author))
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      'author_forbidden',
      'Seuls les comptes @converteo.com et les invités peuvent décider.',
    );
  return author;
}

export const Author = createParamDecorator((_: unknown, ctx: ExecutionContext): string =>
  authorFrom(ctx.switchToHttp().getRequest<Request>().header('x-pim-author')),
);
