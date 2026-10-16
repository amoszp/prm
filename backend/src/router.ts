// One generic REST router backs all eight entity stores, matching the
// frontend's Collection<T> contract exactly (list/get/put/putMany/remove/clear)
// instead of a bespoke route per entity. Every route works on the signed-in
// user's own records (requireUser runs before this router):
//   GET    /:store          -> list()
//   GET    /:store/:id      -> get(id)
//   PUT    /:store/:id      -> put(item)
//   POST   /:store/bulk     -> putMany(items)
//   DELETE /:store/:id      -> remove(id)
//   DELETE /:store          -> clear()

import { Router, type NextFunction, type Request, type Response } from 'express';
import { clearStore, getRecord, listRecords, putManyRecords, putRecord, removeRecord } from './db';
import { isStoreName, type StoreName } from './types';

export const router = Router();

router.param('store', (req: Request, res: Response, next: NextFunction, store: string) => {
  if (!isStoreName(store)) {
    res.status(404).json({ error: `unknown store "${store}"` });
    return;
  }
  next();
});

function storeOf(req: Request): StoreName {
  // Safe: router.param above already rejected unknown store names.
  return req.params.store as StoreName;
}

const userOf = (req: Request): number => req.user!.id;

function hasId(value: unknown): value is { id: string } {
  return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

router.get('/:store', (req: Request, res: Response) => {
  res.json(listRecords(userOf(req), storeOf(req)));
});

router.get('/:store/:id', (req: Request, res: Response) => {
  const item = getRecord(userOf(req), storeOf(req), req.params.id);
  if (!item) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(item);
});

router.put('/:store/:id', (req: Request, res: Response) => {
  const body = req.body;
  if (!hasId(body)) {
    res.status(400).json({ error: 'body must be a JSON object with an "id" field' });
    return;
  }
  if (body.id !== req.params.id) {
    res.status(400).json({ error: 'body id does not match the URL id' });
    return;
  }
  res.json(putRecord(userOf(req), storeOf(req), body));
});

router.post('/:store/bulk', (req: Request, res: Response) => {
  const items = req.body;
  if (!Array.isArray(items) || !items.every(hasId)) {
    res.status(400).json({ error: 'body must be an array of objects, each with an "id" field' });
    return;
  }
  putManyRecords(userOf(req), storeOf(req), items);
  res.status(204).send();
});

router.delete('/:store/:id', (req: Request, res: Response) => {
  removeRecord(userOf(req), storeOf(req), req.params.id);
  res.status(204).send();
});

router.delete('/:store', (req: Request, res: Response) => {
  clearStore(userOf(req), storeOf(req));
  res.status(204).send();
});
