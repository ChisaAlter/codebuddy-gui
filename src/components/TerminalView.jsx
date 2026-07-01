import React, { useEffect, useRef, useState } from 'react';

const API = 'http://127.0.0.1:7890';

export default function TerminalView() {
  const termRef = useRef(null);
  const [panels, setPanels] = useState([1]);
  const termsRef = useRef({});

  useEffect(() => {
    const id = panels[0];
    if (termRef.current && !termsRef.current[id]) {
      const term = new window.Terminal({ fontSize: 13, fontFamily: 'Menlo, monospace' });
      term.open(termRef.current);
      termsRef.current[id] = term;

      fetch(`${API}/api/v1/pty`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ cols: 80, rows: 24 }) })
        .then(r => r.json()).then(d => {
          const es = new EventSource(`${API}/api/v1/pty/${d.id}/output`);
          es.onmessage = e => term.write(e.data);
          term.onData(data => fetch(`${API}/api/v1/pty/${d.id}/input/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ data }) }));
        })
        .catch(err => term.write('\r\nError: ' + err.message + '\r\n'));
    }
    return () => {};
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Terminal</h2>
        <button onClick={() => setPanels([...panels, Date.now()])} className="text-xs px-3 py-1 text-gray-400 hover:text-white rounded">+ Add Panel</button>
      </div>
      <div className={`flex-1 grid ${panels.length > 1 ? 'grid-cols-2' : 'cols-1'} gap-1 p-1`}>
        {panels.map(id => (
          <div key={id} className="bg-dark-500 rounded border border-gray-700 relative">
            <div ref={termRef} className="h-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
