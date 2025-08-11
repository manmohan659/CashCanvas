import { loadDatabase, upsert } from '../lib/sqlite/init';

let db: any;

beforeAll(async () => {
  db = await loadDatabase();
});

test('can upsert rows', async () => {
  await upsert(db, 'accounts', { id: '1', name: 'Test Checking', type: 'checking', balance: 0, currency: 'USD' });
  const res = await db.exec(`SELECT id, name FROM accounts WHERE id='1'`);
  // res is array of QueryExecResult; verify id
  expect(res[0].values[0][0]).toBe('1');
});
