import { NextApiRequest, NextApiResponse } from 'next';
import React from 'react';
import formidable from 'formidable';
import fs from 'fs';
import { parseCsv, parseOfx } from '../../lib/parsers';
import { db } from '../../lib/sqlite/init';
import { useSync } from '../../hooks/useSync';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[api/upload] Request received:', req.method);
  
  if (req.method !== 'POST') {
    console.log('[api/upload] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({ multiples: false });
    
    console.log('[api/upload] Parsing form data...');
    const [fields, files] = await form.parse(req);
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      console.log('[api/upload] No file provided');
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log('[api/upload] File received:', file.originalFilename, 'Size:', file.size);
    
    const buffer = fs.readFileSync(file.filepath);
    const filename = file.originalFilename || '';
    
    let rows: any[] = [];
    
    if (filename.endsWith('.csv')) {
      console.log('[api/upload] Parsing CSV file');
      rows = await parseCsv(buffer.toString());
    } else if (filename.endsWith('.ofx')) {
      console.log('[api/upload] Parsing OFX file');
      rows = await parseOfx(buffer.toString());
    } else {
      console.log('[api/upload] Unsupported file type:', filename);
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    console.log('[api/upload] Parsed rows:', rows.length);
    
    // Write to SQLite
    for (const row of rows) {
      await db.upsert('transactions', row);
    }
    
    // Sync to Supabase (fire and forget)
    try {
      const { sync } = useSync();
      sync(rows).catch(error => {
        console.error('[api/upload] Supabase sync failed:', error);
      });
    } catch (syncError) {
      console.warn('[api/upload] Sync initialization failed:', syncError);
    }
    
    console.log('[api/upload] Upload completed successfully');
    res.status(200).json({ 
      success: true, 
      imported: rows.length,
      message: `Imported ${rows.length} transactions`
    });
    
  } catch (error) {
    console.error('[api/upload] Upload failed:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
}
