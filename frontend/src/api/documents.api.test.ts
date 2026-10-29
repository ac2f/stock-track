import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('./client', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));

import { DocumentError, fetchDocument } from './documents.api';

const jsonBlob = (body: unknown) =>
  new Blob([JSON.stringify(body)], { type: 'application/json' });
const axiosError = (status: number | null, body?: unknown, code?: string) =>
  Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    code,
    response: status === null ? undefined : { status, data: body === undefined ? undefined : jsonBlob(body) },
  });

const failWith = (e: unknown) => get.mockImplementation(() => Promise.reject(e));
const failOnce = (e: unknown) => get.mockImplementationOnce(() => Promise.reject(e));

beforeEach(() => {
  get.mockReset();
});

describe('fetchDocument', () => {
  it('PDF blobunu olduğu gibi verir ve blob olarak ister', async () => {
    const pdf = new Blob(['%PDF-1.7 ...'], { type: 'application/pdf' });
    get.mockResolvedValue({ data: pdf });
    await expect(fetchDocument('/x.pdf')).resolves.toBe(pdf);
    expect(get).toHaveBeenCalledWith('/x.pdf', expect.objectContaining({ responseType: 'blob' }));
  });

  it('sunucu 500 dönerse sunucunun yazdığı nedeni ve HTTP durumunu verir', async () => {
    failWith(
      axiosError(500, { success: false, statusCode: 500, message: 'PDF oluşturulamadı: ENOENT: LiberationSans-Regular.ttf' }),
    );
    const err = await fetchDocument('/x.pdf').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentError);
    expect((err as Error).message).toBe('PDF oluşturulamadı: ENOENT: LiberationSans-Regular.ttf (HTTP 500)');
  });

  it('genel 500 iletisi de HTTP durumuyla gelir', async () => {
    failWith(axiosError(500, { message: 'Beklenmeyen bir hata oluştu.' }));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow('Beklenmeyen bir hata oluştu. (HTTP 500)');
  });

  it('eski sunucu (404 Cannot GET) için ne yapılacağını söyler', async () => {
    failWith(axiosError(404, { message: 'Cannot GET /api/v1/customers/1/statement.pdf' }));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow(/sunucuyu yeniden derleyip başlatın/i);
  });

  it('gerçek 404 iletisini (ör. cari yok) korur', async () => {
    failWith(axiosError(404, { message: 'Cari bulunamadı' }));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow('Cari bulunamadı');
  });

  it('yetki ve oturum hatalarını ayırt eder', async () => {
    failOnce(axiosError(403, { message: 'Bu işlem için yetkiniz yok' }));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow('Bu işlem için yetkiniz yok');
    failOnce(axiosError(401, { message: 'Unauthorized' }));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow(/Yeniden giriş/);
  });

  it('yanıt yoksa sunucuya ulaşılamadığını söyler', async () => {
    failWith(axiosError(null));
    await expect(fetchDocument('/x.pdf')).rejects.toThrow(/Sunucuya ulaşılamadı/);
  });

  it('başarılı ama JSON dönen yanıtı belge diye vermez', async () => {
    get.mockResolvedValue({ data: jsonBlob({ success: true, data: { entries: [] } }) });
    await expect(fetchDocument('/x.pdf')).rejects.toThrow(DocumentError);
    get.mockResolvedValue({ data: jsonBlob({ message: 'Yanlış uç nokta' }) });
    await expect(fetchDocument('/x.pdf')).rejects.toThrow('Yanlış uç nokta');
  });

  it('boş yanıtı reddeder', async () => {
    get.mockResolvedValue({ data: new Blob([], { type: 'application/pdf' }) });
    await expect(fetchDocument('/x.pdf')).rejects.toThrow(/boş/);
  });

  it('iptal edilen istek özgün hata olarak geçer (iletiye çevrilmez)', async () => {
    const cancelled = axiosError(null, undefined, 'ERR_CANCELED');
    failWith(cancelled);
    await expect(fetchDocument('/x.pdf')).rejects.toBe(cancelled);
  });
});
