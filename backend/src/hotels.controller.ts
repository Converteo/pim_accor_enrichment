import { Controller, Get, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { FAMILIES, PRIORITIES } from './api.js';
import { ApiError, parse } from './errors.js';
import { Repository } from './repository.js';

/** Paramètre facultatif : une valeur vide (`?brand=`) vaut absence. */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());
const text = optional(z.string().trim());
export const limit = z.coerce.number().int().min(1).max(200).default(50);

const hotelQuery = z.object({
  view: z.enum(['review', 'pending']).default('review'),
  brand: text,
  source: text,
  family: optional(z.enum(FAMILIES)),
  priority: optional(z.enum(PRIORITIES)),
  search: text,
  outdated: optional(z.enum(['hide', 'only'])),
  limit,
  cursor: text,
});

const autoApprovedQuery = hotelQuery.omit({ view: true, outdated: true });

@Controller()
export class HotelsController {
  constructor(@Inject(Repository) private readonly repo: Repository) {}

  @Get('stats')
  stats() {
    return this.repo.stats();
  }

  @Get('hotels')
  hotels(@Query() query: unknown) {
    return this.repo.hotels(parse(hotelQuery, query));
  }

  /** Valeurs validées automatiquement, pour information (lecture seule). */
  @Get('enrichments/auto-approved')
  autoApproved(@Query() query: unknown) {
    return this.repo.autoApprovedValues(parse(autoApprovedQuery, query));
  }

  @Get('hotels/facets')
  facets() {
    return this.repo.facets();
  }

  @Get('fields/:pimField/values')
  async fieldValues(@Param('pimField') pimField: string) {
    const [field] = await this.repo.fieldValues([pimField]);
    if (!field) throw new ApiError(HttpStatus.NOT_FOUND, 'field_not_found', `Champ ${pimField} inconnu du modèle PIM.`);
    return field;
  }

  @Get('hotels/:rid')
  async hotel(@Param('rid') rid: string) {
    const detail = await this.repo.hotel(rid);
    if (!detail) throw new ApiError(HttpStatus.NOT_FOUND, 'hotel_not_found', `Hôtel ${rid} introuvable.`);
    return detail;
  }
}
