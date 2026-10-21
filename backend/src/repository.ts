import { Inject, Injectable } from '@nestjs/common';
import { Bq } from './gcp.js';

/**
 * Accès aux données : toutes les requêtes SQL du back sont dans BigQueryRepository.
 * Les contrôleurs dépendent de cette classe abstraite, remplacée par un mock dans les tests unitaires.
 */
export abstract class Repository {}

@Injectable()
export class BigQueryRepository extends Repository {
  constructor(@Inject(Bq) private readonly bq: Bq) {
    super();
  }
}
