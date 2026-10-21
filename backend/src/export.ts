import { ExecutionsClient, JobsClient } from '@google-cloud/run';
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
import { Author } from './author.js';
import { CONFIG, type Config } from './config.js';
import { ApiError } from './errors.js';
import { Repository } from './repository.js';

/** Clients GCP de l'export, remplacés par des faux dans les tests. */
export interface ExportClients {
  jobs: Pick<JobsClient, 'runJob'>;
  executions: Pick<ExecutionsClient, 'getExecution'>;
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

const NOT_FOUND = 5;
const PERMISSION_DENIED = 7;
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

  async status() {
    const [stats, history] = await Promise.all([this.repo.stats(), this.repo.exports()]);
    return { pendingCount: stats.pendingForExport, canExport: stats.pendingForExport === 0, history };
  }

  /** Lance le job d'export ; il revérifie lui-même qu'il ne reste rien en attente. */
  async run(author: string) {
    const { pendingForExport } = await this.repo.stats();
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
    if (!execution.completionTime) return { state: 'running' as const };
    if ((execution.succeededCount ?? 0) >= (execution.taskCount ?? 1)) return { state: 'succeeded' as const };
    const completed = execution.conditions?.find((c) => c.type === 'Completed');
    return { state: 'failed' as const, message: completed?.message || "L'exécution de l'export a échoué." };
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
