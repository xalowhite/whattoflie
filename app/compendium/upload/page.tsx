'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function UploadCSV() {
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  async function handleUpload() {
    if (!file) return
    setBusy(true)
    setLog(null)

    const fd = new FormData()
    fd.set('file', file)
    const res = await fetch('/api/flies/ingest-csv', { method: 'POST', body: fd })
    const json = await res.json()
    setBusy(false)
    setLog(json)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Flies CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>CSV headers: <code>name,category,difficulty</code></p>
          <input type="file" accept=".csv,text/csv"
                 onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Button onClick={handleUpload} disabled={!file || busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          {log && (
            <pre className="text-sm bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto">
              {JSON.stringify(log, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
      <div className="mt-6 text-sm opacity-70">
        Duplicates automatically resolve to the existing row.
      </div>
    </div>
  )
}
