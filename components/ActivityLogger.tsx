'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

function sendAuditEvent(input: {
  action: string;
  actionLabel: string;
  pageUrl: string;
  detail?: Record<string, unknown>;
}) {
  const payload = JSON.stringify(input);
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon('/api/audit/log', blob)) return;
  }
  void fetch('/api/audit/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

function elementLabel(element: Element) {
  const aria = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  return (aria || title || text || '').slice(0, 60);
}

export default function ActivityLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/login')) return;
    const pageUrl = window.location.pathname + window.location.search;
    const startedAt = Date.now();
    sendAuditEvent({
      action: 'page_view',
      actionLabel: '访问页面',
      pageUrl,
      detail: { referrer: document.referrer || null },
    });

    return () => {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      if (durationSeconds < 2) return;
      sendAuditEvent({
        action: 'page_duration',
        actionLabel: `停留页面：${durationSeconds} 秒`,
        pageUrl,
        detail: { durationSeconds },
      });
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('a,button,[role="button"]')
        : null;
      if (!target) return;
      const label = elementLabel(target);
      if (!label) return;
      sendAuditEvent({
        action: 'ui_click',
        actionLabel: `点击：${label}`,
        pageUrl: window.location.pathname + window.location.search,
        detail: {
          tagName: target.tagName.toLowerCase(),
          href: target instanceof HTMLAnchorElement ? target.getAttribute('href') : null,
        },
      });
    };

    const handleError = (event: ErrorEvent) => {
      sendAuditEvent({
        action: 'client_error',
        actionLabel: '前端报错',
        pageUrl: window.location.pathname + window.location.search,
        detail: {
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      sendAuditEvent({
        action: 'client_error',
        actionLabel: '前端异步报错',
        pageUrl: window.location.pathname + window.location.search,
        detail: {
          message: event.reason instanceof Error ? event.reason.message : String(event.reason),
        },
      });
    };

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
