import type { Metadata } from 'next';
import AtlasHost from '@/components/atlas-host';
import { initialAtlas } from '@/lib/model';
import './globals.css';
import './typography.css';
export const metadata: Metadata = {
  title: 'Map — The Long Dark',
  description:
    'Your maps, field notes, and Interloper loot discoveries. A companion for every run on Great Bear Island.',
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
