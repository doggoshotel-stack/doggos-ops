import React from 'react';
import ReactDOM from 'react-dom/client';
import PasswordGate from './PasswordGate.jsx';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PasswordGate>
      <App />
    </PasswordGate>
  </React.StrictMode>
);
