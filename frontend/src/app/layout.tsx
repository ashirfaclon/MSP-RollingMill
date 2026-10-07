import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SEL_STORAGE_KEY } from '@/state/storageKey';
import AuthGate from '@/auth/AuthGate';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MSP Rolling Mill',
  description: 'MSP Steel rolling mill dashboards — HSM, RMD',
};

/**
 * Applies the stored theme and sidebar state before first paint, so a light-theme reader
 * never sees the dark default flash in, nor a collapsed rail spring open. Reads the same
 * key the selection store writes.
 */
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SEL_STORAGE_KEY)})||'{}'),d=document.documentElement;if(s.theme==='light'||s.theme==='dark')d.setAttribute('data-theme',s.theme);if(s.sidebar==='collapsed'||s.sidebar==='expanded')d.setAttribute('data-sidebar',s.sidebar)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-theme="dark" data-sidebar="expanded" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* Nothing renders until IOsense has signed the reader in (src/auth). */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
