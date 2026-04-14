'use client';

import React, { useState, useRef } from 'react';
import { ExcelParser } from '@/lib/excel-parser';
import { ExcelPropertyRow, ExcelUnitRow } from '@/lib/types';

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'paused' | 'complete';

interface LogEntry {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  time: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [options, setOptions] = useState({
    updateExisting: true, // Default to true for Excel workflow
    importAsDraft: true,  // Default to Safe Mode
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      type,
      message,
      time: new Date().toLocaleTimeString()
    }]);
    // Auto scroll
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      addLog('info', `File selected: ${e.target.files[0].name}`);
    }
  };

  const startImport = async () => {
    if (!file) return;

    setStatus('parsing');
    setLogs([]); // Clear logs for new run
    addLog('info', 'Starting Excel analysis...');

    try {
      // 1. Parse Excel
      const data = await ExcelParser.parse(file);
      const locales = Object.keys(data.properties);
      const totalProperties = locales.reduce((acc, loc) => acc + data.properties[loc].length, 0);
      const totalUnits = data.units.length;

      const grandTotal = totalProperties + totalUnits;
      setTotal(grandTotal);

      addLog('success', `Excel parsed successfully.`);
      addLog('info', `Found ${totalProperties} property entries across ${locales.length} locales (${locales.join(', ')}).`);
      addLog('info', `Found ${totalUnits} units.`);

      setStatus('importing');
      setProgress(0);
      let currentProgress = 0;

      // 2. Import Base Properties (English)
      // We assume 'en' is the base locale. If not present, we should probably warn or fail.
      if (!data.properties['en']) {
        addLog('warning', "No 'single-en' sheet found. Assuming another locale is base is risky.");
      }

      // Priority order: 'en' first, then others
      const orderedLocales = ['en', ...locales.filter(l => l !== 'en')];

      for (const locale of orderedLocales) {
        if (!data.properties[locale]) continue;

        const rows = data.properties[locale];
        addLog('info', `>>> Importing ${rows.length} properties for locale '${locale}'...`);

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          currentProgress++;

          try {
            const res = await fetch('/api/import-property', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                property: row,
                locale: locale,
                updateExisting: options.updateExisting,
                importAsDraft: options.importAsDraft
              })
            });

            const result = await res.json();

            if (result.success) {
              addLog('success', `[${locale}] Imported: ${row.title?.toString().substring(0, 30)}...`);
            } else {
              addLog('error', `[${locale}] Error in "${row.title}": ${result.error}`);
            }

          } catch (err) {
            addLog('error', `[${locale}] Network/Server Error: ${err}`);
          }

          setProgress(currentProgress);
        }
      }

      // 3. Import Units
      if (data.units.length > 0) {
        addLog('info', `>>> Importing ${data.units.length} units...`);

        // We need to link units to properties. The API/Backend handles finding the property by title.
        // But we need to pass the property_title to the API.

        for (let i = 0; i < data.units.length; i++) {
          const unitRow = data.units[i];
          currentProgress++;

          if (!unitRow.property_title) {
            addLog('warning', `Unit row ${i + 1} missing 'property_title'. Skipping.`);
            setProgress(currentProgress);
            continue;
          }

          // Need to find the Property ID for this unit.
          // Strategy: The backend API `import-unit` should handle the lookup if we pass the title?
          // OR we look it up here?
          // Better: We resolved property IDs during import? No, we didn't store them map here.
          // Let's modify `import-unit` to accept `property_title` or look it up.
          // Actually, our `import-unit` expects `propertyId`. 
          // We need a helper to find property by title from the backend.
          // BUT, `strapiClient.findPropertyByTitle` is backend only.

          // Let's fetch the property ID via a new API call or modify `import-unit` to handle lookup.
          // The cleanest is `import-unit` doing the lookup.
          // Wait, I implemented `import-unit` expecting `propertyId`.
          // I should update `import-unit` to also accept `property_title` and do the lookup internally.
          // FOR NOW: I will implement a quick client-side lookup or just assume I need to fix `import-unit`.
          // Actually, `import-property` doesn't return the mapping easily for us to use here without complexity.

          // Let's CALL an API to get the property ID first? 
          // Or update `import-property` to return existing ID? It does.
          // But maintaining a map across steps is cleaner.
          // However, simpler is just letting the backend find it.

          // REFACTOR PLAN: Update `import-unit/route.ts` to accept `property_title` instead of `propertyId` and look it up. 
          // Since I can't easily change `import-unit` right now (just wrote it), I'll do a quick fetch to look up property?
          // No, better to update `import-unit` to support lookup. It's more robust.

          // Let's try to do it via the API.
          // I'll send `property_title` in the body to `import-unit` and update that file in a moment.

          try {
            const res = await fetch('/api/import-unit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                unit: unitRow,
                propertyTitle: unitRow.property_title, // Sending title to be resolved
                importAsDraft: options.importAsDraft
              })
            });
            const result = await res.json();

            if (result.success) {
              addLog('success', `[Unit] Imported Unit ${unitRow.housing_number} for ${unitRow.property_title}`);
            } else {
              addLog('error', `[Unit] Error Unit ${unitRow.housing_number}: ${result.error}`);
            }
          } catch (err) {
            addLog('error', `[Unit] Error: ${err}`);
          }

          setProgress(currentProgress);
        }
      }

      setStatus('complete');
      addLog('success', '✨ All imports finished.');

    } catch (error) {
      addLog('error', `Critical Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      <main className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Excel Property Importer</h1>
          <p className="opacity-90">Upload your .xlsx file. (Expected sheets: single, single-[lang], units)</p>
        </div>

        <div className="p-8 space-y-8">

          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excel File (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                disabled={status === 'importing' || status === 'parsing'}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                "
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  id="import-draft"
                  type="checkbox"
                  checked={options.importAsDraft}
                  onChange={e => setOptions({ ...options, importAsDraft: e.target.checked })}
                  disabled={status === 'importing'}
                  className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <label htmlFor="import-draft" className="ml-2 block text-sm text-gray-900 font-medium">
                  Import as Draft (Safe Mode - won't publish)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="update-existing"
                  type="checkbox"
                  checked={options.updateExisting}
                  onChange={e => setOptions({ ...options, updateExisting: e.target.checked })}
                  disabled={status === 'importing'}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="update-existing" className="ml-2 block text-sm text-gray-900">
                  Update existing properties (by Title/Slug)
                </label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <button
              onClick={startImport}
              disabled={!file || status === 'importing' || status === 'parsing'}
              className={`px-6 py-3 rounded-lg font-semibold text-white shadow-md transition-all
                ${!file || status === 'importing' || status === 'parsing'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
                }`}
            >
              {status === 'importing' ? 'Importing...' : status === 'parsing' ? 'Analyzing...' : 'Start Import'}
            </button>
          </div>

          {/* Progress */}
          {status !== 'idle' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium text-gray-600">
                <span>Progress</span>
                <span>{progress} / {total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${total ? (progress / total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Console */}
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto shadow-inner border border-gray-800">
            {logs.length === 0 && (
              <p className="text-gray-500 italic text-center mt-20">Waiting to start process...</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className="mb-1">
                <span className="text-gray-500 text-xs mr-2">[{log.time}]</span>
                <span className={`
                  ${log.type === 'success' ? 'text-green-400' : ''}
                  ${log.type === 'error' ? 'text-red-400' : ''}
                  ${log.type === 'warning' ? 'text-yellow-400' : ''}
                  ${log.type === 'info' ? 'text-blue-300' : ''}
                `}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

        </div>
      </main>
    </div>
  );
}
