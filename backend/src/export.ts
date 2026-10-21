import { ExecutionsClient, JobsClient, protos } from '@google-cloud/run';
import { Storage } from '@google-cloud/storage';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Author } from './author.js';
import { CONFIG, type Config } from './config.js';
import { ApiError } from './errors.js';
import { Repository } from './repository.js';

/** Clients GCP de l'export, remplacés par des faux dans les tests. */
export interface ExportClients {
  jobs: Pick<JobsClient, 'runJob'>;
  executions: Pick<ExecutionsClient, 'getExecution' | 'listExecutions'>;
  storage: Pick<Storage, 'bucket'>;
}
export const EXPORT_CLIENTS = Symbol('EXPORT_CLIENTS');

export interface ExportRecord {
  exportId: string;
  path: string;
  rowCount: number | null;
  hotelCount: number | null;
  files: string[];
  triggeredBy: string | null;
  exportedAt: string;
}

const State = protos.google.cloud.run.v2.Condition.State;
const NOT_FOUND = 5;
const PERMISSION_DENIED = 7;
type Execution = protos.google.cloud.run.v2.IExecution;

/** La condition Completed fait foi (les compteurs ne sont pas garantis à jour en même temps que completionTime). */
function stateOf(execution: Execution): { state: 'running' | 'succeeded' | 'failed'; message?: string } {
  const completed = execution.conditions?.find((c) => c.type === 'Completed');
  const state = completed?.state;
  if (state === State.CONDITION_SUCCEEDED || state === 'CONDITION_SUCCEEDED') return { state: 'succeeded' };
  if (state === State.CONDITION_FAILED || state === 'CONDITION_FAILED')
    return { state: 'failed', message: completed?.message || "L'exécution de l'export a échoué." };
  return { state: 'running' };
}

const ID = /^[a-z0-9-]{1,63}$/;

@Injectable()
export class ExportService {
  private readonly logger = new Logger('Export');

  constructor(
    @Inject(Repository) private readonly repo: Repository,
    @Inject(EXPORT_CLIENTS) private readonly gcp: ExportClients,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private get job() {
    return `projects/${this.config.GCP_PROJECT_ID}/locations/${this.config.REGION}/jobs/${this.config.EXPORT_JOB}`;
  }

  /** Id de l'exécution du job en cours, s'il y en a une (les plus récentes d'abord). */
  private async runningExecution(): Promise<string | null> {
    const [executions] = await this.gcp.executions.listExecutions(
      { parent: this.job, pageSize: 20 },
      { autoPaginate: false },
    );
    const running = executions.find((e) => stateOf(e).state === 'running');
    return running?.name?.split('/').pop() ?? null;
  }

  async status() {
    const [stats, history, runningExecutionId] = await Promise.all([
      this.repo.stats(),
      this.repo.exports(),
      this.runningExecution(),
    ]);
    return {
      pendingCount: stats.pendingForExport,
      canExport: stats.pendingForExport === 0 && !runningExecutionId,
      runningExecutionId,
      history,
    };
  }

  /** Lance le job d'export ; il revérifie lui-même qu'il ne reste rien en attente. */
  async run(author: string) {
    const [{ pendingForExport }, running] = await Promise.all([this.repo.stats(), this.runningExecution()]);
    // shortcut: deux POST au même instant peuvent encore passer tous les deux ; le job revérifie l'attente, pas le doublon
    if (running)
      throw new ApiError(HttpStatus.CONFLICT, 'export_running', `Un export est déjà en cours (exécution ${running}).`);
    if (pendingForExport > 0)
      throw new ApiError(
        HttpStatus.CONFLICT,
        'export_blocked',
        `Export impossible : ${pendingForExport} élément(s) encore en attente de décision ou d'enrichissement.`,
      );
    const overrides = { containerOverrides: [{ env: [{ name: 'TRIGGERED_BY', value: author }] }] };
    let operation;
    try {
      [operation] = await this.gcp.jobs.runJob({ name: this.job, overrides });
    } catch (e) {
      // shortcut: sans roles/run.jobsExecutorWithOverrides, triggered_by = id d'exécution ; retirer quand l'infra l'a donné
      if ((e as { code?: number }).code !== PERMISSION_DENIED) throw e;
      this.logger.warn({ message: 'Surcharge TRIGGERED_BY refusée, export lancé sans auteur', author });
      [operation] = await this.gcp.jobs.runJob({ name: this.job });
    }
    const name = (operation.metadata as { name?: string } | null)?.name;
    if (!name) throw new Error("Cloud Run n'a pas renvoyé le nom de l'exécution");
    this.logger.log({ message: 'Export lancé', execution: name, author });
    return { executionId: name.split('/').pop()! };
  }

  async execution(id: string) {
    const notFound = new ApiError(HttpStatus.NOT_FOUND, 'execution_not_found', 'Exécution introuvable.');
    if (!ID.test(id)) throw notFound;
    const [execution] = await this.gcp.executions
      .getExecution({ name: `${this.job}/executions/${id}` })
      .catch((e: { code?: number }) => {
        throw e.code === NOT_FOUND ? notFound : e;
      });
    return stateOf(execution);
  }

  async file(exportId: string, name: string): Promise<StreamableFile> {
    const record = await this.repo.exportById(exportId);
    // Seuls les fichiers listés par le job sont servis : pas de chemin arbitraire dans le bucket
    if (!record || !record.files.includes(name))
      throw new ApiError(HttpStatus.NOT_FOUND, 'file_not_found', 'Fichier introuvable.');
    const prefix = `gs://${this.config.EXPORTS_BUCKET}/`;
    if (!record.path.startsWith(prefix))
      throw new ApiError(HttpStatus.NOT_FOUND, 'file_not_found', 'Fichier hors du bucket des exports.');
    const object = `${record.path.slice(prefix.length).replace(/\/?$/, '/')}${name}`;
    const file = this.gcp.storage.bucket(this.config.EXPORTS_BUCKET).file(object);
    const [exists] = await file.exists();
    if (!exists) throw new ApiError(HttpStatus.NOT_FOUND, 'file_not_found', 'Fichier introuvable dans le bucket.');
    return new StreamableFile(file.createReadStream(), {
      type: name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/octet-stream',
      disposition: `attachment; filename="${name.replace(/"/g, '')}"`,
    }).setErrorHandler((err, response) => {
      this.logger.error({ message: `Lecture de ${object} interrompue : ${err.message}` });
      const res = response as unknown as Response;
      // Après le premier octet, couper la connexion : le navigateur voit un échec, pas un CSV tronqué
      if (res.headersSent) return res.destroy(err);
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Type');
      res
        .status(HttpStatus.BAD_GATEWAY)
        .json({ error: { code: 'upstream_error', message: 'Lecture du fichier impossible, réessayez plus tard.' } });
    });
  }
}

@Controller()
export class ExportController {
  constructor(@Inject(ExportService) private readonly exports: ExportService) {}

  @Get('export/status')
  status() {
    return this.exports.status();
  }

  @Post('export')
  @HttpCode(200)
  run(@Author() author: string) {
    return this.exports.run(author);
  }

  @Get('export/executions/:id')
  execution(@Param('id') id: string) {
    return this.exports.execution(id);
  }

  @Get('exports/:exportId/files/:name')
  file(@Param('exportId') exportId: string, @Param('name') name: string) {
    return this.exports.file(exportId, name);
  }
}
