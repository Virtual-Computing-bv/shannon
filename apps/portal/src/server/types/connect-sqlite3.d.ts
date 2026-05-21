declare module 'connect-sqlite3' {
  import type { Store } from 'express-session';
  import type session from 'express-session';

  interface SQLiteStoreOptions {
    db?: string;
    dir?: string;
    table?: string;
    concurrentDB?: boolean;
  }

  interface SQLiteStoreFactory {
    new (options?: SQLiteStoreOptions): Store;
  }

  function factory(session: typeof session): SQLiteStoreFactory;
  export = factory;
}
