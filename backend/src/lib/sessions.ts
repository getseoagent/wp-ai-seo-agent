export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

type Opts = { maxSessions: number; now: () => number };

export function createSessionStore(opts: Opts = { maxSessions: 200, now: Date.now }) {
  const messages = new Map<string, Message[]>();
  const lastTouched = new Map<string, number>();

  function touch(id: string) {
    lastTouched.set(id, opts.now());
    if (messages.size > opts.maxSessions) {
      let oldestId: string | undefined;
      let oldestT = Infinity;
      for (const [k, t] of lastTouched) {
        if (t < oldestT) { oldestT = t; oldestId = k; }
      }
      if (oldestId !== undefined) {
        messages.delete(oldestId);
        lastTouched.delete(oldestId);
      }
    }
  }

  return {
    get(id: string): Message[] {
      return messages.get(id) ?? [];
    },
    append(id: string, msg: Message): void {
      const arr = messages.get(id) ?? [];
      arr.push(msg);
      messages.set(id, arr);
      touch(id);
    },
    replace(id: string, msgs: Message[]): void {
      messages.set(id, msgs);
      touch(id);
    },
  };
}
