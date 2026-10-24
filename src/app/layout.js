import './globals.css';
import StoreProvider from '@/store/StoreProvider';

export const metadata = {
  title: 'HCM Lite',
  description: 'AI-assisted Human Capital Management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
