export type Failure = { ok: false; error: string };

export const fail = (error: string): Failure => ({ ok: false, error });
