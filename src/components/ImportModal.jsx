import { useState, useRef } from 'react';
import { parseGlucoseCSV } from '../lib/csvParser';

export default function ImportModal({ onClose, onImport }) {
  const [status, setStatus] = useState('idle'); // idle, parsing, done, error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('parsing');
    setError(null);

    try {
      const text = await file.text();
      const { readings, errors } = parseGlucoseCSV(text);

      if (readings.length === 0) {
        setStatus('error');
        setError('No valid glucose readings found in this file.');
        return;
      }

      const importResult = await onImport(readings);
      setResult({
        ...importResult,
        errors,
        total: readings.length,
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Import Glucose Data</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        {status === 'idle' && (
          <div>
            <p className="text-text-secondary text-sm mb-4">
              Select a CSV file exported from Health Auto Export. The file should contain blood glucose readings with timestamp and value columns.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-xl font-bold text-lg bg-glucose text-white active:opacity-80"
            >
              Select CSV File
            </button>
          </div>
        )}

        {status === 'parsing' && (
          <div className="text-center py-8">
            <div className="text-text-secondary">Parsing data...</div>
          </div>
        )}

        {status === 'done' && result && (
          <div>
            <div className="bg-bg-primary rounded-xl p-4 mb-4">
              <div className="text-target font-bold text-lg mb-2">Import Complete</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Readings added:</span>
                  <span className="font-medium">{result.added}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Duplicates skipped:</span>
                  <span className="font-medium">{result.skipped}</span>
                </div>
                {result.errors > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Invalid rows skipped:</span>
                    <span className="font-medium text-danger">{result.errors}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-4 rounded-xl font-bold text-lg bg-bg-tertiary text-white active:opacity-80"
            >
              Done
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="bg-danger/20 rounded-xl p-4 mb-4">
              <div className="text-danger font-bold mb-1">Import Failed</div>
              <div className="text-sm text-text-secondary max-h-32 overflow-y-auto break-words">
                {error && error.length > 200 ? error.slice(0, 200) + '...' : error}
              </div>
            </div>
            <button
              onClick={() => { setStatus('idle'); setError(null); }}
              className="w-full py-4 rounded-xl font-bold text-lg bg-bg-tertiary text-white active:opacity-80"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
