// TODO: Implement CSV/OFX POST handler
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // TODO: Parse CSV/OFX file, write to in-browser SQLite, enqueue sync to Supabase
    res.status(200).json({ message: 'File upload placeholder' });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
