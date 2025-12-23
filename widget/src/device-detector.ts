import { DeviceMetadata } from './types';

/**
 * Detect browser name and version from user agent
 */
function detectBrowser(): { name: string; version: string } {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = '';

  if (ua.includes('Firefox/')) {
    name = 'Firefox';
    version = ua.match(/Firefox\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (ua.includes('Edg/')) {
    name = 'Edge';
    version = ua.match(/Edg\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (ua.includes('Chrome/')) {
    name = 'Chrome';
    version = ua.match(/Chrome\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    name = 'Safari';
    version = ua.match(/Version\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (ua.includes('Opera') || ua.includes('OPR/')) {
    name = 'Opera';
    version = ua.match(/(?:Opera|OPR)\/(\d+(\.\d+)?)/)?.[1] || '';
  }

  return { name, version };
}

/**
 * Detect operating system from user agent
 */
function detectOS(): { name: string; version: string } {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = '';

  if (ua.includes('Windows NT')) {
    name = 'Windows';
    const ntVersion = ua.match(/Windows NT (\d+\.\d+)/)?.[1];
    const versionMap: Record<string, string> = {
      '10.0': '10/11',
      '6.3': '8.1',
      '6.2': '8',
      '6.1': '7',
    };
    version = ntVersion ? versionMap[ntVersion] || ntVersion : '';
  } else if (ua.includes('Mac OS X')) {
    name = 'macOS';
    version = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace(/_/g, '.') || '';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    name = 'iOS';
    version = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace(/_/g, '.') || '';
  } else if (ua.includes('Android')) {
    name = 'Android';
    version = ua.match(/Android (\d+(\.\d+)?)/)?.[1] || '';
  } else if (ua.includes('Linux')) {
    name = 'Linux';
  }

  return { name, version };
}

/**
 * Detect device type from screen size and user agent
 */
function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent;
  const width = window.innerWidth;

  // Check for mobile keywords first
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) {
    return 'mobile';
  }

  // Check for tablet keywords
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
    return 'tablet';
  }

  // Fall back to screen width
  if (width <= 768) {
    return 'mobile';
  } else if (width <= 1024) {
    return 'tablet';
  }

  return 'desktop';
}

/**
 * Collect all device metadata
 */
export function collectDeviceMetadata(): DeviceMetadata {
  const browser = detectBrowser();
  const os = detectOS();

  return {
    browser: browser.name,
    browserVersion: browser.version,
    os: os.name,
    osVersion: os.version,
    device: detectDeviceType(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    domain: window.location.hostname,
    referrer: document.referrer || undefined,
    landingPage: window.location.href,
  };
}
