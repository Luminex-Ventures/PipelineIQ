import type { DealType, DealStatus } from './database.types';

export interface CSVDealRow {
  client_name: string;
  client_phone?: string;
  client_email?: string;
  property_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  deal_type: DealType;
  lead_source_name?: string;
  pipeline_status: string;
  expected_sale_price?: number;
  actual_sale_price?: number;
  gross_commission_rate?: number;
  brokerage_split_rate?: number;
  referral_out_rate?: number;
  referral_in_rate?: number;
  transaction_fee?: number;
  close_date?: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function pad(number: number) {
  return number.toString().padStart(2, '0');
}

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function buildISO(year: number, month: number, day: number) {
  if (!isValidDate(year, month, day)) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function normalizeYear(year: number) {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }
  return year;
}

function monthFromName(name: string) {
  const key = name.toLowerCase();
  return MONTH_MAP[key] || null;
}

export function parseFlexibleDate(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, ' ');

  const isoMatch = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    return buildISO(parseInt(y, 10), parseInt(m, 10), parseInt(d, 10));
  }

  const usMatch = normalized.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})$/);
  if (usMatch) {
    const [_, m, d, y] = usMatch;
    const year = normalizeYear(parseInt(y, 10));
    return buildISO(year, parseInt(m, 10), parseInt(d, 10));
  }

  const dottedIsoMatch = normalized.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dottedIsoMatch) {
    const [_, y, m, d] = dottedIsoMatch;
    return buildISO(parseInt(y, 10), parseInt(m, 10), parseInt(d, 10));
  }

  const monthFirstMatch = normalized.match(/^([A-Za-z]+)[\s\-](\d{1,2}),?[\s\-]*(\d{4})$/);
  if (monthFirstMatch) {
    const month = monthFromName(monthFirstMatch[1]);
    if (month) {
      return buildISO(parseInt(monthFirstMatch[3], 10), month, parseInt(monthFirstMatch[2], 10));
    }
  }

  const dayFirstMatch = normalized.match(/^(\d{1,2})[\s\-]([A-Za-z]+),?[\s\-]*(\d{4})$/);
  if (dayFirstMatch) {
    const month = monthFromName(dayFirstMatch[2]);
    if (month) {
      return buildISO(parseInt(dayFirstMatch[3], 10), month, parseInt(dayFirstMatch[1], 10));
    }
  }

  return null;
}

export function generateExampleCSV(statusNames: string[] = []): string {
  const headers = [
    'client_name',
    'client_phone',
    'client_email',
    'property_address',
    'city',
    'state',
    'zip',
    'deal_type',
    'lead_source_name',
    'pipeline_status',
    'expected_sale_price',
    'actual_sale_price',
    'gross_commission_rate',
    'brokerage_split_rate',
    'referral_out_rate',
    'referral_in_rate',
    'transaction_fee',
    'close_date'
  ].join(',');

  const defaultStatuses = ['New Lead', 'Contacted', 'Under Contract'];
  const statuses = statusNames.length > 0 ? statusNames : defaultStatuses;

  const exampleRows = [
    {
      client_name: 'John Smith',
      client_phone: '555-123-4567',
      client_email: 'john.smith@example.com',
      property_address: '123 Main Street',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      deal_type: 'buyer',
      lead_source_name: 'Zillow',
      pipeline_status: statuses[Math.min(2, statuses.length - 1)] || statuses[0],
      expected_sale_price: '450000',
      actual_sale_price: '',
      gross_commission_rate: '0.03',
      brokerage_split_rate: '0.20',
      referral_out_rate: '',
      referral_in_rate: '',
      transaction_fee: '500',
      close_date: ''
    },
    {
      client_name: 'Sarah Johnson',
      client_phone: '555-987-6543',
      client_email: 'sarah.j@example.com',
      property_address: '456 Oak Avenue',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
      deal_type: 'seller',
      lead_source_name: 'Past Client',
      pipeline_status: statuses[statuses.length - 1] || statuses[0],
      expected_sale_price: '525000',
      actual_sale_price: '520000',
      gross_commission_rate: '0.03',
      brokerage_split_rate: '0.20',
      referral_out_rate: '0.25',
      referral_in_rate: '',
      transaction_fee: '500',
      close_date: '2024-12-15'
    },
    {
      client_name: 'Mike Davis',
      client_phone: '555-456-7890',
      client_email: 'mike.davis@example.com',
      property_address: '789 Elm Street',
      city: 'Houston',
      state: 'TX',
      zip: '77001',
      deal_type: 'renter',
      lead_source_name: 'Referral',
      pipeline_status: statuses[Math.min(1, statuses.length - 1)] || statuses[0],
      expected_sale_price: '2400',
      actual_sale_price: '',
      gross_commission_rate: '0.5',
      brokerage_split_rate: '0.20',
      referral_out_rate: '',
      referral_in_rate: '',
      transaction_fee: '0',
      close_date: ''
    }
  ];

  const rows = exampleRows.map(row =>
    Object.values(row).map(val => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');

  return `${headers}\n${rows}`;
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCSV(content: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        if (currentField || currentLine.length > 0) {
          currentLine.push(currentField.trim());
          if (currentLine.some(field => field !== '')) {
            lines.push(currentLine);
          }
          currentLine = [];
          currentField = '';
        }
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(field => field !== '')) {
      lines.push(currentLine);
    }
  }

  return lines;
}

export function validateDealRow(row: any, validStatusNames: string[] = []): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.client_name || row.client_name.trim() === '') {
    errors.push('client_name is required');
  }

  if (!row.lead_source_name || row.lead_source_name.trim() === '') {
    errors.push('lead_source_name is required');
  }

  const validDealTypes = ['buyer', 'seller', 'buyer_and_seller', 'renter', 'landlord'];
  if (!row.deal_type || !validDealTypes.includes(row.deal_type)) {
    errors.push(`deal_type must be one of: ${validDealTypes.join(', ')}`);
  }

  if (!row.pipeline_status || row.pipeline_status.trim() === '') {
    errors.push('pipeline_status is required');
  } else if (validStatusNames.length > 0) {
    const statusLower = row.pipeline_status.toLowerCase().trim();
    if (!validStatusNames.includes(statusLower)) {
      errors.push(`pipeline_status must be one of your configured statuses: ${validStatusNames.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function csvRowToObject(headers: string[], row: string[]): any {
  const obj: any = {};
  headers.forEach((header, index) => {
    const value = row[index] || '';
    obj[header] = value;
  });
  return obj;
}
