import { useEffect, useState } from 'react';
import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import { useAppContext } from '../_app';
import Importer from '../../components/Importer';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import PieSpend from '../../components/charts/PieSpend';
import BarMonthly from '../../components/charts/BarMonthly';
import LineTrend from '../../components/charts/LineTrend';
import DailyHeatmap from '../../components/charts/DailyHeatmap';
import MonthRing from '../../components/charts/MonthRing';
import TagModal from '../../components/TagModal';
import { query, getCurrentUserId } from '../../lib/sqlite/init';
import KPI from '../../components/ui/KPI';
import TransactionsTable from '../../components/transactions/TransactionsTable';

export default function AppPage() {
  const session = useSession();
  const router = useRouter();
  const { dbReady, db } = useAppContext();
  const [showTagModal, setShowTagModal] = useState(false);
  
  interface PieDataItem { category: string; total: number }
  interface BarDataItem { month: string; income: number; spend: number; net?: number }
  interface LineDataItem { date: string; value: number }
  interface DailyDataItem { date: string; value: number }
  
  const [chartData, setChartData] = useState({
    pieData: [] as PieDataItem[],
    barData: [] as BarDataItem[],
    lineData: [] as LineDataItem[],
    dailySpend: [] as DailyDataItem[],
    monthCoverage: [] as Array<{ month: string; days: number; daysInMonth: number; pct: number; hasPdf?: boolean }>,
    since: '' as string | undefined,
    through: '' as string | undefined,
  });

  const [kpis, setKpis] = useState({ income: 0, expenses: 0, net: 0 });

  console.log('[app] Rendering app page, session:', !!session, 'dbReady:', dbReady);

  useEffect(() => {
    if (dbReady && db) {
      console.log('[app] Loading chart data from database');
      // Categorize on refresh for any new/uncategorized rows
      (async () => {
        try {
          const { applyRulesToTransactions, autoCategorizeAndAnnotate, normalizePdfSigns, dedupeTransactionsByDateDescAmount } = await import('../../lib/sqlite/init');
          await applyRulesToTransactions();
          await autoCategorizeAndAnnotate();
          try { await normalizePdfSigns(); } catch {}
          try { await dedupeTransactionsByDateDescAmount(); } catch {}
        } catch {}
        await loadChartData();
      })();
    }
  }, [dbReady, db]);

  // Reload charts when user switches
  useEffect(() => {
    const handler = () => {
      if (dbReady && db) loadChartData();
    };
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-user-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-user-changed', handler); };
  }, [dbReady, db]);

  // Reload charts when transactional data changes (e.g., category edits)
  useEffect(() => {
    const handler = () => {
      if (dbReady && db) loadChartData();
    };
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-data-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-data-changed', handler); };
  }, [dbReady, db]);

  const loadChartData = async () => {
    try {
      const userId = await getCurrentUserId();
      // Load pie chart data (spending by category)
      const pieResult = await query(
        'SELECT category, SUM(amount) as total FROM transactions WHERE amount < 0 AND user_id = ? GROUP BY category',
        [userId]
      );
      
      // Load bar chart data (monthly income vs spend)
      const barResult = await query(`
        SELECT 
          strftime('%Y-%m', date) as month,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as spend
        FROM transactions 
        WHERE user_id = ?
        GROUP BY strftime('%Y-%m', date) 
        ORDER BY month
      `, [userId]);
      
      // Load line trend data (running balance) – compute cumulative sum in JS for reliability
      const daily = await query(`
        SELECT date, SUM(amount) as delta
        FROM transactions
        WHERE user_id = ?
        GROUP BY date
        ORDER BY date
      `, [userId]);

      // Daily spending heatmap data (expenses per day only)
      const spendDaily = await query(`
        SELECT date, SUM(ABS(amount)) as spent
        FROM transactions
        WHERE user_id = ? AND amount < 0
        GROUP BY date
        ORDER BY date
      `, [userId]);

      // Month coverage with pdf presence (used only for hasPdf flag)
      const coveragePdf = await query(`
        SELECT month, SUM(pdf_count) as pdfCount FROM (
          SELECT strftime('%Y-%m', date) as month,
                 CASE WHEN coalesce(import_source,'') = 'pdf' THEN 1 ELSE 0 END as pdf_count
          FROM transactions
          WHERE user_id = ?
        )
        GROUP BY month
        ORDER BY month
      `, [userId]);

      // KPI values computed directly from transactions
      const incomeRow = await query('SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE user_id = ? AND amount > 0', [userId]);
      const expenseRow = await query('SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE user_id = ? AND amount < 0', [userId]);
      const netRow = await query('SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE user_id = ?', [userId]);

      // Process and filter the data properly
      const processedPieData = (pieResult as any[]).map(item => ({
        category: item.category || 'Unknown',
        total: Number(item.total) || 0
      }));

      const processedBarData: BarDataItem[] = (barResult as any[])
        .filter(item => item.month)
        .map(item => {
          const income = Number(item.income) || 0;
          const spend = Number(item.spend) || 0; // negative
          return { month: item.month, income, spend, net: income + spend };
        });

      let running = 0;
      const processedLineData = (daily as any[])
        .filter(item => item.date)
        .map(item => {
          running += Number(item.delta) || 0;
          return { date: item.date, value: running };
        });

      const spendDailyRows = (spendDaily as any[])
        .filter(item => item.date)
        .map(item => ({ date: item.date, value: Number(item.spent) || 0 }));

      const processedDailySpend = spendDailyRows;

      // Compute distinct-day coverage per month using the daily (all transactions) dataset
      const dailyRows = (daily as any[]).filter(item => item.date);
      let earliest: string | undefined;
      let latest: string | undefined;
      if (dailyRows.length > 0) {
        earliest = dailyRows[0].date;
        latest = dailyRows[dailyRows.length - 1].date;
      }

      const monthToDaySet = new Map<string, Set<string>>();
      for (const row of dailyRows) {
        const iso: string = row.date;
        if (!iso) continue;
        const month = iso.slice(0, 7);
        const day = iso.slice(8, 10);
        if (!monthToDaySet.has(month)) monthToDaySet.set(month, new Set<string>());
        monthToDaySet.get(month)!.add(day);
      }

      const hasPdfByMonth = new Map<string, boolean>();
      for (const r of coveragePdf as any[]) {
        if (!r || !r.month) continue;
        hasPdfByMonth.set(r.month, Number(r.pdfCount) > 0);
      }

      const processedCoverage = Array.from(monthToDaySet.entries()).map(([month, set]) => {
        const y = Number(month.slice(0, 4));
        const m = Number(month.slice(5, 7));
        const daysInMonth = new Date(y, m, 0).getDate();
        const days = set.size;
        const pct = daysInMonth > 0 ? days / daysInMonth : 0;
        return { month, days, daysInMonth, pct, hasPdf: hasPdfByMonth.get(month) };
      }).sort((a, b) => a.month.localeCompare(b.month));

      setChartData({
        pieData: processedPieData,
        barData: processedBarData,
        lineData: processedLineData,
        dailySpend: processedDailySpend,
        monthCoverage: processedCoverage,
        since: earliest,
        through: latest,
      });
      setKpis({
        income: Math.max(0, Number(incomeRow?.[0]?.v || 0)),
        expenses: Math.abs(Math.min(0, Number(expenseRow?.[0]?.v || 0))),
        net: Number(netRow?.[0]?.v || 0),
      });
      
      console.log('[app] Chart data loaded:', { 
        pie: processedPieData.length, 
        bar: processedBarData.length, 
        line: processedLineData.length 
      });
    } catch (error) {
      console.error('[app] Error loading chart data:', error);
    }
  };

  if (!dbReady) {
    console.log('[app] Database not ready, showing loader');
    return <Card title="Loading"><p className="muted">Preparing your local database...</p></Card>;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h2 style={{ margin: 0 }}>Financial Dashboard</h2>
      
      {!session && (
        <Card title="Demo Mode" right={<span className="muted">No sign-in</span>}>
          <p className="muted" style={{ margin: 0 }}>Authentication is optional. Your data stays local.</p>
        </Card>
      )}
      
      <Card title="Import Data" right={<span className="muted">CSV / OFX</span>}>
        <Importer onImportComplete={loadChartData} />
      </Card>

      {/* KPIs */}
      <section className="grid cols-3" style={{ gap: 16 }}>
        <KPI label="Income" value={`$${kpis.income.toFixed(0)}`} tone="teal" />
        <KPI label="Expenses" value={`$${kpis.expenses.toFixed(0)}`} tone="violet" />
        <KPI label="Net" value={`$${kpis.net.toFixed(0)}`} tone="amber" />
      </section>

      {/* Pies row */}
      <section className="grid cols-2" style={{ gap: 16 }}>
        <Card title="Spending by Category" right={<button className="btn ghost" onClick={() => router.push('/app/pie3d')}>3D view</button>}>
          <PieSpend data={chartData.pieData} onSliceClick={(category) => router.push(`/app/category/${encodeURIComponent(category)}`)} />
        </Card>
        <Card title="Data Coverage (Months)">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
            <MonthRing
              coverage={chartData.monthCoverage}
              since={chartData.since}
              through={chartData.through}
              onMonthClick={(m) => {
                const y = Number(m.slice(0, 4));
                const mo = Number(m.slice(5, 7));
                if (typeof window !== 'undefined') {
                  window.location.hash = `#m-${y}-${String(mo).padStart(2, '0')}`;
                }
              }}
            />
          </div>
        </Card>
      </section>

      {/* GitHub-style heatmap just after pies */}
      <section className="grid" style={{ gap: 16 }}>
        <Card title="Daily Spending Heatmap">
          <DailyHeatmap
            data={chartData.dailySpend}
            onDayClick={(date) => router.push(`/app/day/${encodeURIComponent(date)}`)}
          />
        </Card>
      </section>

      {/* Other charts */}
      <section className="grid cols-2" style={{ gap: 16 }}>
        <Card title="Monthly Overview">
          <BarMonthly data={chartData.barData} />
        </Card>
        <Card title="Balance Trend">
          <LineTrend data={chartData.lineData} />
        </Card>
      </section>

      <Card title="Recent Transactions">
        <TransactionsTable />
      </Card>

      <div>
        <Button variant="secondary" onClick={() => setShowTagModal(true)}>Manage Categories</Button>
      </div>

      {showTagModal && (
        <TagModal 
          onSave={(rule) => {
            console.log('[app] New rule saved:', rule);
            setShowTagModal(false);
            loadChartData();
          }}
          onClose={() => setShowTagModal(false)}
        />
      )}
    </div>
  );
}