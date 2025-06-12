import { useEffect, useState } from 'react';
import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import { useAppContext } from '../_app';
import Importer from '../../components/Importer';
import PieSpend from '../../components/charts/PieSpend';
import BarMonthly from '../../components/charts/BarMonthly';
import LineTrend from '../../components/charts/LineTrend';
import TagModal from '../../components/TagModal';
import { query } from '../../lib/sqlite/init';

export default function AppPage() {
  const session = useSession();
  const router = useRouter();
  const { dbReady, db } = useAppContext();
  const [showTagModal, setShowTagModal] = useState(false);
  
  interface PieDataItem { category: string; total: number }
  interface BarDataItem { month: string; value: number }
  interface LineDataItem { date: string; value: number }
  
  const [chartData, setChartData] = useState({
    pieData: [] as PieDataItem[],
    barData: [] as BarDataItem[],
    lineData: [] as LineDataItem[]
  });

  console.log('[app] Rendering app page, session:', !!session, 'dbReady:', dbReady);

  useEffect(() => {
    if (dbReady && db) {
      console.log('[app] Loading chart data from database');
      loadChartData();
    }
  }, [dbReady, db]);

  const loadChartData = async () => {
    try {
      // Load pie chart data (spending by category)
      const pieResult = await query(
        'SELECT category, SUM(amount) as total FROM transactions WHERE amount < 0 GROUP BY category'
      );
      
      // Load bar chart data (monthly spending)
      const barResult = await query(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as value 
        FROM transactions 
        GROUP BY strftime('%Y-%m', date) 
        ORDER BY month
      `);
      
      // Load line trend data (running balance)
      const lineResult = await query(`
        SELECT date, SUM(amount) OVER (ORDER BY date) as value 
        FROM transactions 
        ORDER BY date
      `);

      // Process and filter the data properly
      const processedPieData = (pieResult as any[]).map(item => ({
        category: item.category || 'Unknown',
        total: Number(item.total) || 0
      }));

      const processedBarData = (barResult as any[])
        .filter(item => item.month)
        .map(item => ({
          month: item.month,
          value: Number(item.value) || 0
        }));

      const processedLineData = (lineResult as any[])
        .filter(item => item.date)
        .map(item => ({
          date: item.date,
          value: Number(item.value) || 0
        }));

      setChartData({
        pieData: processedPieData,
        barData: processedBarData,
        lineData: processedLineData
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
    return <p>Loading database...</p>;
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Financial Dashboard</h2>
      
      {!session && (
        <div style={{ padding: '1rem', backgroundColor: '#f0f0f0', marginBottom: '1rem' }}>
          <p>Note: Authentication not configured. Running in demo mode.</p>
        </div>
      )}
      
      <section style={{ marginBottom: '2rem' }}>
        <h3>Import Data</h3>
        <Importer onImportComplete={loadChartData} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        <div>
          <h3>Spending by Category</h3>
          <PieSpend data={chartData.pieData} />
        </div>
        
        <div>
          <h3>Monthly Overview</h3>
          <BarMonthly data={chartData.barData} />
        </div>
        
        <div>
          <h3>Balance Trend</h3>
          <LineTrend data={chartData.lineData} />
        </div>
      </section>

      <button 
        onClick={() => setShowTagModal(true)}
        style={{ marginTop: '2rem', padding: '0.5rem 1rem' }}
      >
        Manage Categories
      </button>

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