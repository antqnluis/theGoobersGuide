import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdventuresPreview from './AdventuresPreview';
import '../../index.css';
import './preview.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdventuresPreview />
  </StrictMode>,
);
