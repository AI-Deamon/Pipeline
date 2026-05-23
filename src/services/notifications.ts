/**
 * Browser Notification Service
 * Handles permission requests and displaying notifications for scan events
 */

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';

  private constructor() {
    // Check initial permission
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Request notification permission from user
   */
  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are supported
   */
  public isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Check if permission is granted
   */
  public hasPermission(): boolean {
    return this.permission === 'granted';
  }

  /**
   * Get current permission status
   */
  public getPermissionStatus(): NotificationPermission {
    return this.permission;
  }

  /**
   * Show a notification
   */
  public showNotification(options: NotificationOptions): void {
    if (!this.isSupported() || !this.hasPermission()) {
      console.warn('Notifications not available or permission not granted');
      return;
    }

    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon.ico',
      badge: options.badge,
      tag: options.tag,
      requireInteraction: options.requireInteraction ?? true,
    });

    notification.onclick = () => {
      options.onClick?.();
      notification.close();
      window.focus();
    };

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }

  /**
   * Show scan complete notification
   */
  public showScanComplete(scanId: string, status: string, projectName?: string): void {
    const statusEmoji = status === 'COMPLETED' ? '✅' : status === 'FAILED' ? '❌' : '⚠️';
    const title = `${statusEmoji} Scan ${status.toLowerCase()}`;
    const body = projectName 
      ? `${projectName}: ${status === 'COMPLETED' ? 'All stages completed successfully!' : 'Scan failed - check details'}`
      : `Scan ${status.toLowerCase()}`;

    this.showNotification({
      title,
      body,
      tag: `scan-${scanId}`,
      requireInteraction: status === 'FAILED',
      onClick: () => {
        window.location.href = `/scans/${scanId}`;
      },
    });
  }

  /**
   * Show scan started notification
   */
  public showScanStarted(scanId: string, projectName?: string): void {
    this.showNotification({
      title: '🔄 Scan Started',
      body: projectName ? `${projectName}: Security scan in progress...` : 'Security scan in progress...',
      tag: `scan-${scanId}`,
    });
  }
}

export const notificationService = NotificationService.getInstance();
