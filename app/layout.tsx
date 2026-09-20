import type { Metadata } from 'next';
import AtlasHost from '@/components/atlas-host';
import { initialAtlas } from '@/lib/model';
import './globals.css';
import './typography.css';
export const metadata: Metadata = {
  title: 'Map — The Long Dark',
  description:
    'Your maps, field notes, and Interloper loot discoveries. A companion for every run on Great Bear Island.',
  icons: {
    icon: [
      { url: '/favicon.ico?v=3', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg?v=3', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: { url: '/apple-touch-icon.png?v=3', sizes: '180x180' },
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <AtlasHost preview={initialAtlas()}>{children}</AtlasHost>
      </body>
    </html>
  );
}
