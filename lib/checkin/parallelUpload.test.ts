import { describe, expect, it, vi } from 'vitest';

import { classifyCheckinError } from '@/lib/checkin/errors';
import {
  ProofUploadError,
  proofUploadFailureLine,
  runProofUploads,
} from '@/lib/checkin/parallelUpload';
import { postSendNotice, subscribeSendNotice } from '@/lib/checkin/sendNotice';
import { preuploadCheckinProofWithClient, saveCheckinProofWithClient } from '@/lib/checkin/rpc';

const client = (rpc = vi.fn()) => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  rpc,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('runProofUploads', () => {
  it('starts every upload before any finishes', async () => {
    const started: string[] = [];
    const gates = { a: deferred<string>(), b: deferred<string>(), c: deferred<string>() };
    const pending = runProofUploads(
      (['a', 'b', 'c'] as const).map((key) => ({
        key,
        label: key,
        run: () => {
          started.push(key);
          return gates[key].promise;
        },
      })),
    );
    await Promise.resolve();
    expect(started).toEqual(['a', 'b', 'c']);
    gates.a.resolve('A');
    gates.b.resolve('B');
    gates.c.resolve('C');
    const out = await pending;
    expect([...out.entries()]).toEqual([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ]);
  });

  it('fails the batch with a line that names the files, after all of them settle', async () => {
    const slow = deferred<string>();
    let settled = false;
    const pending = runProofUploads([
      { key: 'pre', label: 'Start selfie', run: async () => { throw new Error('boom'); } },
      { key: 'post', label: 'End selfie', run: () => slow.promise.then((v) => { settled = true; return v; }) },
    ]);
    const outcome = pending.then(
      () => null,
      (error: unknown) => error,
    );
    await Promise.resolve();
    slow.resolve('ok');
    const error = await outcome;
    expect(settled).toBe(true);
    expect(error).toBeInstanceOf(ProofUploadError);
    expect((error as ProofUploadError).message).toBe(
      'Couldn’t upload Start selfie. It’s still here. Try Send again.',
    );
    expect(classifyCheckinError(error)).toBe('upload');
  });

  it('names several files and rethrows an offline failure unchanged', async () => {
    expect(proofUploadFailureLine(['A', 'B', 'C'])).toBe(
      'Couldn’t upload A, B and C. They’re still here. Try Send again.',
    );
    const offline = new TypeError('Load failed');
    await expect(
      runProofUploads([{ key: 'x', label: 'X', run: async () => { throw offline; } }]),
    ).rejects.toBe(offline);
  });
});

describe('preuploadCheckinProofWithClient', () => {
  const proof = { id: 'pre', name: 'Start selfie', method: 'photo' as const };

  it('uploads every still of a slot together and keeps the blob for the hash', async () => {
    const gates = [deferred<string>(), deferred<string>()];
    const started: string[] = [];
    const upload = vi.fn(({ uri }: { uri: string }) => {
      started.push(uri);
      return gates[started.length - 1].promise;
    });
    const blob = new Blob(['x']);
    const pending = preuploadCheckinProofWithClient(
      client(),
      { challengeId: 'c1', proof, uri: 'file:///a.jpg', urls: ['file:///a.jpg', 'file:///b.jpg'], blob },
      upload,
      async (path) => `https://cdn.test/${path}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    gates[0].resolve('a');
    gates[1].resolve('b');
    const out = await pending;
    expect(out.urls).toEqual(['https://cdn.test/a', 'https://cdn.test/b']);
    expect(out.uri).toBe('https://cdn.test/a');
    expect(out.blob).toBe(blob);
  });

  it('leaves honor slots and already stored files alone', async () => {
    const upload = vi.fn();
    const honor = { challengeId: 'c1', proof: { id: 'h', name: 'Honor', method: 'honor' as const } };
    expect(await preuploadCheckinProofWithClient(client(), honor, upload, async (p) => p)).toBe(honor);
    const stored = { challengeId: 'c1', proof, uri: 'https://cdn.test/a.jpg' };
    expect(await preuploadCheckinProofWithClient(client(), stored, upload, async (p) => p)).toBe(stored);
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not save a slot whose file failed to upload, and the save has nothing left to upload', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'k1', user_id: 'u1', challenge_id: 'c1', status: 'in_progress', proof_parts: {} },
      error: null,
    });
    await expect(
      preuploadCheckinProofWithClient(
        client(rpc),
        { challengeId: 'c1', proof, uri: 'file:///a.jpg' },
        async () => {
          throw new Error('upload failed');
        },
        async (p) => p,
      ),
    ).rejects.toThrow('upload failed');
    expect(rpc).not.toHaveBeenCalled();

    const upload = vi.fn().mockResolvedValue('path/a.jpg');
    const prepared = await preuploadCheckinProofWithClient(
      client(rpc),
      { challengeId: 'c1', proof, uri: 'file:///a.jpg' },
      upload,
      async (p) => `https://cdn.test/${p}`,
    );
    upload.mockClear();
    await saveCheckinProofWithClient(client(rpc), prepared, upload, async (p) => p);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0][1].p_proof_part.url).toBe('https://cdn.test/path/a.jpg');
  });
});

describe('post-send notice', () => {
  it('reaches an open Live and waits for one that is not open yet', () => {
    const seen: string[] = [];
    const off = subscribeSendNotice('c-open', (line) => seen.push(line));
    postSendNotice('c-open', 'Card missed');
    off();
    postSendNotice('c-open', 'ignored');
    expect(seen).toEqual(['Card missed']);

    postSendNotice('c-late', 'Waiting line');
    const late: string[] = [];
    const offLate = subscribeSendNotice('c-late', (line) => late.push(line));
    expect(late).toEqual(['Waiting line']);
    offLate();
  });
});
