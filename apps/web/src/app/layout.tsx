import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Phone Assistant — Dashboard',
  description: 'Multi-tenant AI phone assistant platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
