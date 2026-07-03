import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lexion Escalas',
  description: 'Controle de escalas quinzenais de segurança'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
