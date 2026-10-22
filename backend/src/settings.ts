import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Injectable, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AUTO_VALIDATION_STEPS, type AutoValidation, type AutoValidationStep } from './api.js';
import { Author, authorFrom } from './author.js';
import { CONFIG, type Config } from './config.js';
import { ApiError, parse } from './errors.js';
import { Repository } from './repository.js';

const threshold = z.number().int().min(0).max(100).nullable();

export const autoValidationBody = z
  .object({ approveThreshold: threshold, rejectThreshold: threshold, comment: z.string().trim().max(2000).nullish() })
  .refine((b) => b.approveThreshold === null || b.rejectThreshold === null || b.rejectThreshold <= b.approveThreshold, {
    message: 'le seuil de rejet doit être inférieur ou égal au seuil de validation',
    path: ['rejectThreshold'],
  });

const stepParam = z.enum(AUTO_VALIDATION_STEPS);

/**
 * Seuils de validation automatique (rapprochements, enrichissements), réglés dans l'interface.
 * Chaque réglage ajoute une ligne à validation.auto_validation_settings ; v_matches et v_enrichments appliquent la
 * dernière de chaque étape à la lecture : le changement vaut tout de suite, sans relancer le pipeline.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(Repository) private readonly repo: Repository,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Liste vide : tout relecteur Converteo peut changer les seuils. */
  canEdit(author: string | null): boolean {
    if (!author) return false;
    const editors = this.config.SETTINGS_EDITORS;
    return editors.length === 0 || editors.includes(author);
  }

  async autoValidation(author: string | null): Promise<AutoValidation> {
    const [distributions, history] = await Promise.all([
      this.repo.scoreDistributions(),
      this.repo.autoValidationHistory(),
    ]);
    return {
      canEdit: this.canEdit(author),
      steps: AUTO_VALIDATION_STEPS.map((step) => {
        const d = distributions.find((x) => x.step === step);
        const changes = history
          .filter((h) => h.step === step)
          .map(({ approveThreshold, rejectThreshold, comment, author, setAt }) => ({
            approveThreshold,
            rejectThreshold,
            comment,
            author,
            setAt,
          }));
        // Sans donnée dans la vue (aucun élément jugé ou enrichi), le dernier réglage fait foi
        const last = changes[0];
        return {
          step,
          approveThreshold: d ? d.approveThreshold : (last?.approveThreshold ?? null),
          rejectThreshold: d ? d.rejectThreshold : (last?.rejectThreshold ?? null),
          isDefault: changes.length === 0,
          distribution: d?.buckets ?? [],
          history: changes,
        };
      }),
    };
  }

  async setAutoValidation(step: AutoValidationStep, body: z.infer<typeof autoValidationBody>, author: string) {
    if (!this.canEdit(author))
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'settings_forbidden',
        "Vous n'êtes pas autorisé à changer les seuils de validation automatique.",
      );
    await this.repo.insertAutoValidation(
      {
        step,
        approve_threshold: body.approveThreshold,
        reject_threshold: body.rejectThreshold,
        comment: body.comment || null,
      },
      author,
    );
    return this.autoValidation(author);
  }
}

/** Auteur facultatif en lecture : sert seulement à dire si la personne peut changer les seuils. */
function optionalAuthor(header: string | undefined): string | null {
  try {
    return authorFrom(header);
  } catch {
    return null;
  }
}

@Controller('settings/auto-validation')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  get(@Headers('x-pim-author') author: string | undefined) {
    return this.settings.autoValidation(optionalAuthor(author));
  }

  @Post(':step')
  @HttpCode(200)
  set(@Author() author: string, @Param('step') step: string, @Body() body: unknown) {
    return this.settings.setAutoValidation(parse(stepParam, step), parse(autoValidationBody, body), author);
  }
}
