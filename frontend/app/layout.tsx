import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  title: 'Omnichannel Chat Platform',
  description: 'Multi-channel messaging platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className={nunito.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
