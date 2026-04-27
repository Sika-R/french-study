import { useState } from 'react';
import AddWord from './AddWord';
import NoteEditor from './NoteEditor';

type Tab = 'word' | 'note';

export default function AddPage() {
  const [tab, setTab] = useState<Tab>('word');
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e6e8ef', paddingBottom: 12, marginBottom: 16 }}>
        <button className={tab === 'word' ? '' : 'ghost'} onClick={() => setTab('word')}>添加单词</button>
        <button className={tab === 'note' ? '' : 'ghost'} onClick={() => setTab('note')}>添加笔记</button>
      </div>
      {tab === 'word' && <AddWord />}
      {tab === 'note' && <NoteEditor />}
    </div>
  );
}
