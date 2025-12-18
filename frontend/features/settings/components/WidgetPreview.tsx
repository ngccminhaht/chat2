'use client';

import { useEffect } from 'react';

interface WidgetPreviewProps {
  orgSlug: string;
  refreshKey: number;
}

/**
 * Injects the widget script directly into the page.
 * The widget will appear in the bottom-right corner of the screen.
 */
export default function WidgetPreview({ orgSlug, refreshKey }: WidgetPreviewProps) {
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300/api';
    const widgetUrl = `${window.location.origin}/widget.js`;

    // Clean up existing widget
    const existingContainer = document.getElementById('miagent-widget-container');
    if (existingContainer) {
      existingContainer.remove();
    }

    // Remove old script if exists
    const oldScript = document.querySelector('script[data-miagent-widget]');
    if (oldScript) {
      oldScript.remove();
    }

    // Remove old styles
    const oldStyles = document.querySelectorAll('style[data-miagent-widget]');
    oldStyles.forEach((s) => s.remove());

    // Clear MiAgent global
    if ((window as any).MiAgent) {
      delete (window as any).MiAgent;
    }

    // Create and inject new script with cache busting
    const script = document.createElement('script');
    script.src = `${widgetUrl}?v=${refreshKey}`;
    script.setAttribute('data-org', orgSlug);
    script.setAttribute('data-api', apiUrl);
    script.setAttribute('data-miagent-widget', 'true');
    document.body.appendChild(script);

    // Cleanup on unmount or refresh
    return () => {
      const container = document.getElementById('miagent-widget-container');
      if (container) {
        container.remove();
      }
      const scriptEl = document.querySelector('script[data-miagent-widget]');
      if (scriptEl) {
        scriptEl.remove();
      }
      const styles = document.querySelectorAll('style[data-miagent-widget]');
      styles.forEach((s) => s.remove());
      if ((window as any).MiAgent) {
        delete (window as any).MiAgent;
      }
    };
  }, [orgSlug, refreshKey]);

  // No UI - widget renders itself in bottom corner
  return null;
}
