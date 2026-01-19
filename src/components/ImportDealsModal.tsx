import { useState } from 'react';
import { X, Upload, Download, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateExampleCSV, downloadCSV, parseCSV, validateDealRow, csvRowToObject, parseFlexibleDate } from '../lib/csv-utils';

interface ImportDealsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; errors: string[] }>;
}

export default function ImportDealsModal({ onClose, onSuccess }: ImportDealsModalProps) {
  const { user, roleInfo } = useAuth();
  const teamId = roleInfo?.teamId || null;
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleDownloadExample = async () => {
    if (!user) return;

    const { data: teamStatuses } = teamId
      ? await supabase
          .from('pipeline_statuses')
          .select('name')
          .eq('team_id', teamId)
          .order('sort_order')
      : ({ data: null } as any);

    const { data: statuses } = teamStatuses?.length
      ? ({ data: teamStatuses } as any)
      : await supabase
          .from('pipeline_statuses')
          .select('name')
          .eq('user_id', user.id)
          .order('sort_order');

    const statusNames = (statuses as any)?.map((s: any) => s.name) || [];
    const csvContent = generateExampleCSV(statusNames);
    downloadCSV(csvContent, 'deals-import-example.csv');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResult(null);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const handleImport = async () => {
    if (!file || !user) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        alert('CSV file must contain a header row and at least one data row');
        setImporting(false);
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      const { data: teamLeadSources } = teamId
        ? await supabase
            .from('lead_sources')
            .select('id, name')
            .eq('team_id', teamId)
        : ({ data: null } as any);

      const { data: leadSources } = teamLeadSources?.length
        ? ({ data: teamLeadSources } as any)
        : await supabase
            .from('lead_sources')
            .select('id, name')
            .eq('user_id', user.id);

      const leadSourceMap = new Map(
        (leadSources as any)?.map((ls: any) => [ls.name.toLowerCase(), ls.id]) || []
      );

      const { data: teamPipelineStatuses } = teamId
        ? await supabase
            .from('pipeline_statuses')
            .select('id, name, lifecycle_stage')
            .eq('team_id', teamId)
        : ({ data: null } as any);

      const { data: pipelineStatuses } = teamPipelineStatuses?.length
        ? ({ data: teamPipelineStatuses } as any)
        : await supabase
            .from('pipeline_statuses')
            .select('id, name, lifecycle_stage')
            .eq('user_id', user.id);

      const pipelineStatusMap = new Map(
        (pipelineStatuses as any)?.map((ps: any) => [ps.name.toLowerCase(), { id: ps.id, lifecycle_stage: ps.lifecycle_stage }]) || []
      );

      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('default_brokerage_split_rate')
        .eq('user_id', user.id)
        .single();

      const defaultBrokerageSplit = (userSettings as any)?.default_brokerage_split_rate || 0.2;

      let successCount = 0;
      let failedCount = 0;
      const errors: Array<{ row: number; errors: string[] }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const rowData = csvRowToObject(headers, dataRows[i]);
        const validation = validateDealRow(rowData, Array.from(pipelineStatusMap.keys()) as string[]);

        if (!validation.valid) {
          failedCount++;
          errors.push({ row: i + 2, errors: validation.errors });
          continue;
        }

        const leadSourceId = leadSourceMap.get(rowData.lead_source_name.toLowerCase().trim());
        if (!leadSourceId) {
          failedCount++;
          errors.push({ row: i + 2, errors: [`Lead source "${rowData.lead_source_name}" not found. Please create it in Lead Sources settings first.`] });
          continue;
        }

        let pipelineStatusId = null;
        let status: any = 'new';
        if (rowData.pipeline_status && rowData.pipeline_status.trim() !== '') {
          const normalizedStatusName = rowData.pipeline_status.toLowerCase().trim();
          const mappedStatus = pipelineStatusMap.get(normalizedStatusName);
          pipelineStatusId = mappedStatus?.id || null;
          if (mappedStatus?.lifecycle_stage) {
            status = mappedStatus.lifecycle_stage;
          }
        }

        let parsedCloseDate: string | null = null;
        if (rowData.close_date && rowData.close_date.trim() !== '') {
          parsedCloseDate = parseFlexibleDate(rowData.close_date);
          if (!parsedCloseDate) {
            failedCount++;
            errors.push({
              row: i + 2,
              errors: [
                `Close date "${rowData.close_date}" is not recognized. Use formats like YYYY-MM-DD, MM/DD/YYYY, or December 15, 2024.`
              ]
            });
            continue;
          }
        }

        const dealData = {
          user_id: user.id,
          client_name: rowData.client_name.trim(),
          client_phone: rowData.client_phone?.trim() || null,
          client_email: rowData.client_email?.trim() || null,
          property_address: rowData.property_address?.trim() || null,
          city: rowData.city?.trim() || null,
          state: rowData.state?.trim() || null,
          zip: rowData.zip?.trim() || null,
          deal_type: rowData.deal_type.trim(),
          lead_source_id: leadSourceId,
          pipeline_status_id: pipelineStatusId,
          status: status,
          expected_sale_price: rowData.expected_sale_price && rowData.expected_sale_price.trim() !== ''
            ? Number(rowData.expected_sale_price)
            : null,
          actual_sale_price: rowData.actual_sale_price && rowData.actual_sale_price.trim() !== ''
            ? Number(rowData.actual_sale_price)
            : null,
          gross_commission_rate: rowData.gross_commission_rate && rowData.gross_commission_rate.trim() !== ''
            ? Number(rowData.gross_commission_rate)
            : 0.03,
          brokerage_split_rate: rowData.brokerage_split_rate && rowData.brokerage_split_rate.trim() !== ''
            ? Number(rowData.brokerage_split_rate)
            : defaultBrokerageSplit,
          referral_out_rate: rowData.referral_out_rate && rowData.referral_out_rate.trim() !== ''
            ? Number(rowData.referral_out_rate)
            : null,
          referral_in_rate: rowData.referral_in_rate && rowData.referral_in_rate.trim() !== ''
            ? Number(rowData.referral_in_rate)
            : null,
          transaction_fee: rowData.transaction_fee && rowData.transaction_fee.trim() !== ''
            ? Number(rowData.transaction_fee)
            : 0,
          close_date: parsedCloseDate,
          stage_entered_at: new Date().toISOString(),
          closed_at: status === 'closed' ? new Date().toISOString() : null
        };

        const { error } = await (supabase
          .from('deals') as any)
          .insert(dealData);

        if (error) {
          failedCount++;
          errors.push({ row: i + 2, errors: [error.message] });
        } else {
          successCount++;
        }
      }

      setResult({
        success: successCount,
        failed: failedCount,
        errors
      });
    } catch (error) {
      console.error('Import error:', error);
      alert('An error occurred while importing. Please check your file format.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Import Deals from CSV</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">How to Import Deals</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Download the example CSV file to see the required format</li>
              <li>Fill in your deal data following the example structure</li>
              <li>Save your file as CSV format</li>
              <li>Upload your CSV file using the button below</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Step 1: Download Example</h3>
              <button
                onClick={handleDownloadExample}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <Download className="w-5 h-5" />
                <span>Download Example CSV</span>
              </button>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Step 2: Upload Your CSV</h3>
              <label className="block w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 cursor-pointer transition text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={importing}
                />
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-600">
                  {file ? (
                    <span className="font-medium text-blue-600">{file.name}</span>
                  ) : (
                    <>
                      <span className="font-medium text-blue-600">Click to upload</span>
                      {' '}or drag and drop
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">CSV files only</div>
              </label>
            </div>

            {file && !result && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Step 3: Import</h3>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center space-x-2 transition"
                >
                  {importing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span>Import Deals</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Import Results</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 rounded-lg p-3 flex items-center space-x-3">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <div>
                        <div className="text-2xl font-bold text-green-600">{result.success}</div>
                        <div className="text-xs text-gray-600">Successfully Imported</div>
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 flex items-center space-x-3">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                      <div>
                        <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                        <div className="text-xs text-gray-600">Failed</div>
                      </div>
                    </div>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <h4 className="font-semibold text-red-900 mb-2">Errors</h4>
                    <div className="space-y-2">
                      {result.errors.map((error, index) => (
                        <div key={index} className="text-sm">
                          <div className="font-medium text-red-800">Row {error.row}:</div>
                          <ul className="list-disc list-inside text-red-700 ml-2">
                            {error.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setFile(null);
                      setResult(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    Import Another File
                  </button>
                  <button
                    onClick={() => {
                      if (result.success > 0) {
                        onSuccess();
                      }
                      onClose();
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Required Fields</h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li><span className="font-medium">client_name:</span> Client's full name</li>
              <li><span className="font-medium">lead_source_name:</span> Must match one of your configured lead sources</li>
              <li><span className="font-medium">deal_type:</span> buyer, seller, buyer_and_seller, renter, or landlord</li>
              <li><span className="font-medium">pipeline_status:</span> Must match one of your configured pipeline statuses</li>
            </ul>
            <div className="mt-3 text-xs text-gray-600">
              Note: Property address and price are optional. Lead source and pipeline status names must match exactly or the import will fail.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
