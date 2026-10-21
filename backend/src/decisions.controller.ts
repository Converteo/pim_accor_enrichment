import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Author } from './author.js';
import { DecisionsService, enrichmentDecisionsBody, matchDecisionsBody } from './decisions.js';
import { parse } from './errors.js';

@Controller('decisions')
export class DecisionsController {
  constructor(@Inject(DecisionsService) private readonly decisions: DecisionsService) {}

  @Post('enrichments')
  @HttpCode(200)
  enrichments(@Author() author: string, @Body() body: unknown) {
    return this.decisions.decideEnrichments(parse(enrichmentDecisionsBody, body).items, author);
  }

  @Post('matches')
  @HttpCode(200)
  matches(@Author() author: string, @Body() body: unknown) {
    return this.decisions.decideMatches(parse(matchDecisionsBody, body).items, author);
  }
}
