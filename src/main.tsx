import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Layout } from './components/Layout';
import './index.css';
import { Account } from './pages/Account';
import { Admin } from './pages/Admin';
import { Forgot, Login, Register, Reset, Verify } from './pages/Auth';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { Kvkk, Rules, Takedown, Terms } from './pages/Legal';
import { Person } from './pages/Person';
import { ReportForm } from './pages/ReportForm';
import { SessionProvider } from './session';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/kisiler', element: <Home /> },
      { path: '/kisi/:id', element: <Person /> },
      { path: '/paylas', element: <ReportForm /> },
      { path: '/hikaye/:id/duzenle', element: <ReportForm /> },
      { path: '/giris', element: <Login /> },
      { path: '/kayit', element: <Register /> },
      { path: '/dogrula', element: <Verify /> },
      { path: '/sifremi-unuttum', element: <Forgot /> },
      { path: '/sifre-sifirla', element: <Reset /> },
      { path: '/hesabim', element: <Account /> },
      { path: '/yonetim', element: <Admin /> },
      { path: '/kurallar', element: <Rules /> },
      { path: '/kullanim-sartlari', element: <Terms /> },
      { path: '/kvkk', element: <Kvkk /> },
      { path: '/kaldirma-talebi', element: <Takedown /> },
      { path: '*', element: <p className="py-20 text-center text-muted">Sayfa bulunamadı.</p> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
