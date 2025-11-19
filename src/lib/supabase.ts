import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const missingVars = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY'
].filter(Boolean);

if (missingVars.length > 0) {
  const message = `Missing Supabase environment variable${missingVars.length > 1 ? 's' : ''}: ${missingVars.join(
    ', '
  )}. Copy .env.example to .env and provide your Supabase project credentials.`;

  if (import.meta.env.DEV && typeof document !== 'undefined') {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f6f6f6;
          color: #1c1c1e;
          padding: 24px;
          text-align: center;
        ">
          <div style="
            max-width: 420px;
            background: white;
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.08);
          ">
            <h1 style="font-size: 20px; margin-bottom: 12px;">Supabase configuration required</h1>
            <p style="font-size: 15px; line-height: 1.5; margin-bottom: 16px;">
              ${message}
            </p>
            <pre style="
              text-align: left;
              background: #f8f8f8;
              padding: 12px;
              border-radius: 12px;
              font-size: 13px;
              overflow-x: auto;
            ">cp .env.example .env</pre>
          </div>
        </div>
      `;
    }
  }

  throw new Error(message);
}

export const supabase = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
