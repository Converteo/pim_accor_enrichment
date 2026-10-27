import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { parse } from './errors.js';
import { limit, optional } from './hotels.controller.js';
import { Repository } from './repository.js';

const matchQuery = z.object({
  status: z
    .enum(['needs_review', 'pending_judgment', 'auto_approved', 'auto_rejected', 'human'])
    .default('needs_review'),
  source: optional(z.string().trim()),
  brand: optional(z.string().trim()),
  verdict: optional(z.string().trim()),
  search: optional(z.string().trim()),
  limit,
  cursor: optional(z.string()),
});

@Controller('matches')
export class MatchesController {
  constructor(@Inject(Repository) private readonly repo: Repository) {}

  @Get()
  matches(@Query() query: unknown) {
    return this.repo.matches(parse(matchQuery, query));
  }
}
