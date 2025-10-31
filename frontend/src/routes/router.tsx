import { createBrowserRouter } from 'react-router-dom';
import { TrackingPage } from '../routes/tracking-page';
import { DashboardPage } from '../routes/dashboard-page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <TrackingPage />,
  },
  {
    path: '/dashboard',
    element: <DashboardPage />,
  },
]);
