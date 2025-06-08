import { loadDatabase, upsert } from '../lib/sqlite/init';

let db: any;

beforeAll(async () => {
  db = await loadDatabase();
});

test('can upsert rows', () => {
  upsert(db, 'accounts', { id: '1', institution: 'Test', provider_id: '1' });
  const res = db.exec(`SELECT * FROM accounts WHERE id='1'`);
  expect(res[0].values[0][0]).toBe('1');
});
