import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getFactoryShortName } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const factoryShortName = await getFactoryShortName();
  return {
    title: `${factoryShortName}考勤系统`,
    description: '工厂考勤与工资管理系统',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  );
}
