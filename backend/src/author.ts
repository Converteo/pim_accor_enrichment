import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from './errors.js';

/** E-mail du relecteur, posé par le relais du front dans X-PIM-Author ; 401 s'il manque. */
export const Author = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const author = ctx.switchToHttp().getRequest<Request>().header('x-pim-author')?.trim();
  if (!author)
    throw new ApiError(HttpStatus.UNAUTHORIZED, 'author_required', 'Auteur manquant (en-tête X-PIM-Author).');
  return author;
});
