import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Toaster from './components/Toaster';
import ConfirmDialog from './components/ConfirmDialog';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster />
    <ConfirmDialog />
  </React.StrictMode>
);
