import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareBridge AI — Agentic Post-Discharge Care Coordination',
  description: 'AI-driven clinical decision-support and post-discharge recovery monitoring with deterministic safety bounds.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
