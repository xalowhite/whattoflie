'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { importCsvRows } from '@/lib/flies';
import type { CsvFly } from '@/types/fly';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function ImportCsvDialog() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{inserted:number; skipped:string[]} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = Papa.parse<CsvFly>(text, { header: true, skipEmptyLines: true });
      if (parsed.errors?.length) {
        const first = parsed.errors[0];
        throw new Error(`Row ${first.row}: ${first.message}`);
      }
      const rows = (parsed.data ?? []).filter(r => r.name && r.name.trim().length > 0);
      const res = await importCsvRows(rows);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Import CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <div className="flex gap-2">
          <Button onClick={handleImport} disabled={!file || busy}>
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {result && (
          <div className="text-sm">
            <div><strong>Inserted:</strong> {result.inserted}</div>
            {result.skipped.length > 0 && (
              <div className="mt-2">
                <strong>Skipped (already included):</strong>
                <ul className="list-disc ml-6">
                  {result.skipped.slice(0, 25).map((n, i) => <li key={i}>{n}</li>)}
                </ul>
                {result.skipped.length > 25 && <div>…and {result.skipped.length - 25} more</div>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
