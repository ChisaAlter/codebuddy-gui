import React, { useEffect } from 'react';

export default function App() {
  return React.createElement('div', { style: { padding: 40, color: '#fff', background: '#121214', height: '100vh' } }, 
    React.createElement('h1', null, 'Electron Test'),
    React.createElement('p', null, 'If you see this, React is rendering.')
  );
}
