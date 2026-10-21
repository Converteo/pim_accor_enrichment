import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '../test/helpers.js';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { EXPORT_CLIENTS, ExportService, type ExportClients } from './export.js';
import { Repository } from './repository.js';

const config = {
  GCP_PROJECT_ID: 'proj',
  REGION: 'europe-west1',
  EXPORT_JOB: 'gcrj-base-export',
  EXPORTS_BUCKET: 'bkt-base-exports',
} as Config;
const JOB = 'projects/proj/locations/europe-west1/jobs/gcrj-base-export';
const record = {
  exportId: 'e1',
  path: 'gs://bkt-base-exports/export/20261021-101500/',
  rowCount: 3,
  hotelCount: 1,
  files: ['pim_product.csv', 'traceability.csv'],
  triggeredBy: 'a@converteo.com',
  exportedAt: '2026-10-21T10:15:00.000Z',
};

let repo: { stats: ReturnType<typeof vi.fn>; exports: ReturnType<typeof vi.fn>; exportById: ReturnType<typeof vi.fn> };
let gcp: {
  jobs: { runJob: ReturnType<typeof vi.fn> };
  executions: { getExecution: ReturnType<typeof vi.fn>; listExecutions: ReturnType<typeof vi.fn> };
  file: { exists: ReturnType<typeof vi.fn>; createReadStream: ReturnType<typeof vi.fn> };
  bucket: ReturnType<typeof vi.fn>;
  object: ReturnType<typeof vi.fn>;
};
let service: ExportService;

beforeEach(() => {
  repo = { stats: vi.fn().mockResolvedValue({ pendingForExport: 0 }), exports: vi.fn(), exportById: vi.fn() };
  const file = { exists: vi.fn().mockResolvedValue([true]), createReadStream: vi.fn(() => Readable.from(['a;b\n'])) };
  const object = vi.fn(() => file);
  const bucket = vi.fn(() => ({ file: object }));
  gcp = {
    jobs: { runJob: vi.fn().mockResolvedValue([{ metadata: { name: `${JOB}/executions/gcrj-base-export-abc12` } }]) },
    executions: { getExecution: vi.fn(), listExecutions: vi.fn().mockResolvedValue([[]]) },
    file,
    bucket,
    object,
  };
  const clients = { jobs: gcp.jobs, executions: gcp.executions, storage: { bucket } } as unknown as ExportClients;
  service = new ExportService(repo as unknown as Repository, clients, config);
});

describe('ExportService', () => {
  it('status : compteur en attente et historique', async () => {
    repo.stats.mockResolvedValue({ pendingForExport: 4 });
    repo.exports.mockResolvedValue([record]);
    expect(await service.status()).toEqual({
      pendingCount: 4,
      canExport: false,
      runningExecutionId: null,
      history: [record],
    });
    expect(gcp.executions.listExecutions).toHaveBeenCalledWith({ parent: JOB, pageSize: 20 }, { autoPaginate: false });
  });

  it('status et run : une exécution en cours bloque un nouvel export (409 export_running)', async () => {
    gcp.executions.listExecutions.mockResolvedValue([
      [
        { name: `${JOB}/executions/x-2`, conditions: [{ type: 'Completed', state: 1 }] },
        { name: `${JOB}/executions/x-1`, conditions: [{ type: 'Completed', state: 4 }] },
      ],
    ]);
    expect(await service.status()).toMatchObject({ canExport: false, runningExecutionId: 'x-2' });
    await expect(service.run('a@converteo.com')).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'export_running' } },
    });
    expect(gcp.jobs.runJob).not.toHaveBeenCalled();
  });

  it("run : 409 tant qu'il reste des éléments en attente, sans lancer le job", async () => {
    repo.stats.mockResolvedValue({ pendingForExport: 2 });
    await expect(service.run('a@converteo.com')).rejects.toMatchObject({ status: 409 });
    expect(gcp.jobs.runJob).not.toHaveBeenCalled();
  });

  it("run : lance le job avec l'auteur dans TRIGGERED_BY et renvoie l'id d'exécution", async () => {
    expect(await service.run('a@converteo.com')).toEqual({ executionId: 'gcrj-base-export-abc12' });
    expect(gcp.jobs.runJob).toHaveBeenCalledWith({
      name: JOB,
      overrides: { containerOverrides: [{ env: [{ name: 'TRIGGERED_BY', value: 'a@converteo.com' }] }] },
    });
  });

  it('run : relance sans surcharge si le droit runWithOverrides manque', async () => {
    gcp.jobs.runJob.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 7 }));
    expect(await service.run('a@converteo.com')).toEqual({ executionId: 'gcrj-base-export-abc12' });
    expect(gcp.jobs.runJob).toHaveBeenLastCalledWith({ name: JOB });
  });

  it.each([
    [{}, { state: 'running' }],
    [{ conditions: [{ type: 'Completed', state: 1 }] }, { state: 'running' }],
    [{ completionTime: {}, conditions: [{ type: 'Completed', state: 4 }] }, { state: 'succeeded' }],
    [{ conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }, { state: 'succeeded' }],
    [
      { completionTime: {}, conditions: [{ type: 'Completed', state: 3, message: 'Task failed' }] },
      { state: 'failed', message: 'Task failed' },
    ],
    // Compteurs à 0 par défaut (protobuf) : ne pas conclure au succès sans la condition
    [{ completionTime: {}, succeededCount: 0, taskCount: 0 }, { state: 'running' }],
  ])('execution %j', async (execution, expected) => {
    gcp.executions.getExecution.mockResolvedValue([execution]);
    expect(await service.execution('gcrj-base-export-abc12')).toEqual(expected);
    expect(gcp.executions.getExecution).toHaveBeenCalledWith({ name: `${JOB}/executions/gcrj-base-export-abc12` });
  });

  it('execution : 404 si Cloud Run ne la connaît pas', async () => {
    gcp.executions.getExecution.mockRejectedValue(Object.assign(new Error('5 NOT_FOUND'), { code: 5 }));
    await expect(service.execution('gcrj-base-export-zzzzz')).rejects.toMatchObject({ status: 404 });
  });

  it('execution : 404 pour un id qui sortirait du job', async () => {
    await expect(service.execution('../../jobs/x')).rejects.toMatchObject({ status: 404 });
    expect(gcp.executions.getExecution).not.toHaveBeenCalled();
  });

  it('file : sert un fichier listé dans exports, depuis le dossier de l’export', async () => {
    repo.exportById.mockResolvedValue(record);
    const file = await service.file('e1', 'traceability.csv');
    expect(file.getHeaders()).toMatchObject({
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="traceability.csv"',
    });
    expect(gcp.bucket).toHaveBeenCalledWith('bkt-base-exports');
    expect(gcp.object).toHaveBeenCalledWith('export/20261021-101500/traceability.csv');
  });

  it.each([
    ['export inconnu', null, 'pim_product.csv'],
    ['fichier non listé', record, '../secret.csv'],
    ['autre bucket', { ...record, path: 'gs://autre/export/x/' }, 'pim_product.csv'],
  ])('file : 404 si %s', async (_, rec, name) => {
    repo.exportById.mockResolvedValue(rec);
    await expect(service.file('e1', name)).rejects.toMatchObject({ status: 404 });
  });
});

describe('GET /exports/:exportId/files/:name, erreur du flux GCS', () => {
  async function appStreaming(stream: () => Readable) {
    const file = { exists: vi.fn().mockResolvedValue([true]), createReadStream: vi.fn(stream) };
    const clients = { storage: { bucket: () => ({ file: () => file }) } };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadConfig(ENV))] })
      .overrideProvider(Repository)
      .useValue({ exportById: vi.fn().mockResolvedValue({ ...record, path: 'gs://bucket/export/x/' }) })
      .overrideProvider(EXPORT_CLIENTS)
      .useValue(clients)
      .compile();
    return moduleRef.createNestApplication({ logger: false }).init();
  }

  it('502 au format du contrat si la lecture échoue avant le premier octet', async () => {
    const app = await appStreaming(
      () =>
        new Readable({
          read() {
            this.destroy(new Error('403 Forbidden'));
          },
        }),
    );
    const res = await request(app.getHttpServer()).get('/exports/e1/files/traceability.csv').expect(502);
    expect(res.body.error.code).toBe('upstream_error');
    expect(res.headers['content-disposition']).toBeUndefined();
    await app.close();
  });

  it('coupe la connexion si la lecture échoue en cours de route (pas de CSV tronqué « réussi »)', async () => {
    const app = await appStreaming(() => {
      let sent = false;
      return new Readable({
        read() {
          if (!sent) {
            sent = true;
            this.push('a;b\n');
          } else setTimeout(() => this.destroy(new Error('CRC32C mismatch')), 10);
        },
      });
    });
    await expect(request(app.getHttpServer()).get('/exports/e1/files/traceability.csv')).rejects.toThrow();
    await app.close();
  });
});
