'use client';

import { useState } from 'react';
import { addFly } from '@/lib/flies';
import type { CsvFly } from '@/types/fly';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AddFlyForm() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload: CsvFly = { name, category };
      const res = await addFly(payload);
      if (!res.ok) {
        setMessage(res.reason);
      } else {
        setMessage('Added!');
        setName('');
        setCategory('');
      }
    } catch (err: any) {
      setMessage(err.message || 'Failed to add fly');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add a Fly</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-2" onSubmit={onSubmit}>
          <input
            className="w-full border rounded p-2"
            placeholder="Name (e.g., Zebra Midge)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full border rounded p-2"
            placeholder="Category (nymph, dry, streamer…)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
          {message && <div className="text-sm mt-2">{message}</div>}
        </form>
      </CardContent>
    </Card>
  );
}
