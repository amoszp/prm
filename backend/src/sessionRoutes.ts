// Sign-in, sign-up and sign-out through the shared accounts service. PRM keeps
// no passwords; the session is an HttpOnly cookie holding the accounts token.

import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  AccountsUnavailable,
  clearSessionCookie,
  clientInfo,
  forgetToken,
  login,
  logout,
  readToken,
  setSessionCookie,
  signup,
} from './auth';

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err) => {
      if (err instanceof AccountsUnavailable) {
        res.status(503).json({ error: 'accounts service unavailable' });
        return;
      }
      next(err);
    });

export const sessionRouter = Router();

sessionRouter.post(
  '/auth/login',
  wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }
    if (username.length > 64 || password.length > 256) {
      res.status(401).json({ error: 'wrong username or password' });
      return;
    }
    const { status, data } = await login(username, password, clientInfo(req));
    if (status !== 200) {
      res.status(status === 429 ? 429 : 401).json({ error: status === 429 ? 'too many attempts' : 'wrong username or password' });
      return;
    }
    setSessionCookie(res, data.token);
    res.json({ user: data.user });
  }),
);

sessionRouter.post(
  '/auth/signup',
  wrap(async (req, res) => {
    const { username, password, displayName } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }
    if (username.length > 64 || password.length > 256 || (typeof displayName === 'string' && displayName.length > 80)) {
      res.status(400).json({ error: 'too long' });
      return;
    }
    const { status, data } = await signup(username, password, typeof displayName === 'string' ? displayName : '', clientInfo(req));
    if (status === 201) {
      // New accounts work at once: sign the user straight in.
      setSessionCookie(res, data.token);
      res.status(201).json({ user: data.user });
      return;
    }
    const code = status === 429 ? 429 : status === 409 ? 409 : 400;
    res.status(code).json({ error: code === 429 ? 'too many sign-ups' : code === 409 ? 'username taken' : data?.message ?? 'invalid' });
  }),
);

sessionRouter.post(
  '/auth/logout',
  wrap(async (req, res) => {
    const token = readToken(req);
    if (token) {
      forgetToken(token);
      await logout(token);
    }
    clearSessionCookie(res);
    res.status(204).send();
  }),
);
