import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Phone Assistant — Dashboard',
  description: 'Multi-tenant AI phone assistant platform',
};

// Apply the saved theme before first paint. Light is the default; dark is only
// applied when the user explicitly opted in (no OS-preference forcing).
const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
