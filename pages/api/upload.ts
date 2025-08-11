import { NextApiRequest, NextApiResponse } from 'next';
import React from 'react';

export const config = { api: { bodyParser: true } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Deprecated: we now import locally on the client for privacy-first architecture
  if (req.method === 'POST') {
    return res.status(410).json({
      error: 'Deprecated',
      message: 'Server upload is disabled. Please import files directly in the app UI, which stores data locally in your browser.'
    });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
