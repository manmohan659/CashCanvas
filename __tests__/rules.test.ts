import { categorize, Rule } from '../lib/rules';

test('categorize matches regex', () => {
  const rules: Rule[] = [{ id: '1', pattern: '.*COFFEE.*', category: 'Coffee' }];
  expect(categorize('STARBUCKS COFFEE', rules)).toBe('Coffee');
});
