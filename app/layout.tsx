import { Inter as FontSans } from 'next/font/google';
import { cn } from '@/src/lib/utils';
import { Metadata } from 'next';
import { LocalizationProvider } from '@/src/context/localization';
import { TimezoneProvider } from '@/app/context/timezone';
import { APPLE_TOUCH_ICON } from '@/src/utils/pwa-icons';
import { PwaServiceWorker } from '@/src/components/PwaServiceWorker';
import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#0d9488',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://baby.kahtaf.com'),
  title: 'Sprout Track',
  description: 'Private family baby tracker for feeding, diapers, sleep and growth.',
  icons: { icon: '/sprout-128.png', shortcut: '/sprout-128.png', apple: APPLE_TOUCH_ICON },
  robots: { index: false, follow: false, noarchive: true },
  manifest: '/manifest.json',
  other: { 'apple-mobile-web-app-capable': 'yes', 'apple-mobile-web-app-status-bar-style': 'black-translucent' },
};

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Layout is now responsible only for rendering - redirect logic moved to individual pages

  return (
    <html lang="en" className={cn('h-full', fontSans.variable)} suppressHydrationWarning>
      <body className={cn('min-h-full bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 font-sans antialiased')} suppressHydrationWarning>
        <LocalizationProvider>
          <TimezoneProvider>
            <PwaServiceWorker />
            {children}
          </TimezoneProvider>
        </LocalizationProvider>
      </body>
    </html>
  );
}
