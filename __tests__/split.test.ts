import { computeSplits } from '../lib/split/logic';

describe('computeSplits', () => {
  test('equal split rounds and distributes pennies', () => {
    const ids = ['a','b','c'];
    const res = computeSplits('equal', 10, ids, {});
    const sum = res.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBeCloseTo(10, 2);
    expect(res.length).toBe(3);
  });

  test('exact split validates sum', () => {
    const ids = ['a','b'];
    expect(() => computeSplits('exact', 10, ids, { amounts: [5] })).toThrow();
    const ok = computeSplits('exact', 10, ids, { amounts: [3,7] });
    expect(ok[0].amount + ok[1].amount).toBeCloseTo(10, 2);
  });

  test('percent split validates 100%', () => {
    const ids = ['a','b'];
    expect(() => computeSplits('percent', 10, ids, { percents: [60,30] })).toThrow();
    const ok = computeSplits('percent', 10, ids, { percents: [60,40] });
    expect(ok.map(x => x.amount)).toEqual([6,4]);
  });

  test('shares split by weights', () => {
    const ids = ['a','b','c'];
    const res = computeSplits('shares', 12, ids, { shares: [1,1,2] });
    expect(res.map(x => x.amount)).toEqual([3,3,6]);
  });

  test('itemized split per-item equal among targets', () => {
    const ids = ['a','b','c'];
    const res = computeSplits('itemized', 0, ids, { items: [ { amount: 9, member_ids: ['a','b'] }, { amount: 3, member_ids: ['a','b','c'] } ] });
    const map: any = {}; res.forEach(r => map[r.member_id] = r.amount);
    expect(map['a']).toBeCloseTo(9/2 + 1, 2);
    expect(map['b']).toBeCloseTo(9/2 + 1, 2);
    expect(map['c']).toBeCloseTo(1, 2);
  });
});


