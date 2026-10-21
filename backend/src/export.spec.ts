import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from './config.js';
import { ExportService, type ExportClients } from './export.js';
import type { Repository } from './repository.js';

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
  executions: { getExecution: ReturnType<typeof vi.fn> };
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
    executions: { getExecution: vi.fn() },
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
    expect(await service.status()).toEqual({ pendingCount: 4, canExport: false, history: [record] });
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
    [{ completionTime: {}, succeededCount: 1, taskCount: 1 }, { state: 'succeeded' }],
    [
      { completionTime: {}, failedCount: 1, taskCount: 1, conditions: [{ type: 'Completed', message: 'Task failed' }] },
      { state: 'failed', message: 'Task failed' },
    ],
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
