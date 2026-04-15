export interface TeacherConfig {
  teacherIp: string;
  port: number;
  adminPasswordHash?: string;
  clientId?: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
  sessionServerTime?: string;
}

export interface VerifyPasswordResult {
  ok: boolean;
}

export interface TeacherWindowSettings {
  forceFullscreen: boolean;
  syncFollow: boolean;
  allowInteract: boolean;
  syncInteraction: boolean;
  podiumAtTop: boolean;
  renderScale: number;
  uiScale: number;
  alertJoin: boolean;
  alertLeave: boolean;
  alertFullscreenExit: boolean;
  alertTabHidden: boolean;
  monitorEnabled: boolean;
  monitorIntervalSec: number;
}

export interface TeacherSession {
  role: 'host';
  clientId: string;
  token: string;
  expiresAt?: string;
  serverTime?: string;
}

export interface TeacherHostApi {
  classStarted(options?: { forceFullscreen?: boolean }): void;
  classEnded(): void;
  setFullscreen(enable: boolean): void;
  getConfig(): Promise<TeacherConfig>;
  saveConfig(config: Partial<TeacherConfig> & { _quit?: boolean }): Promise<boolean>;
  verifyPassword(password: string): Promise<VerifyPasswordResult>;
  getRole(): Promise<'host'>;
  getSession(): Promise<TeacherSession | null>;
  bootstrapSession(): Promise<TeacherSession | null>;
  getSettings(): Promise<TeacherWindowSettings | null>;
  saveSettings(settings: Partial<TeacherWindowSettings>): Promise<boolean>;
  importCourse(): Promise<{ success: boolean; imported?: string[]; skipped?: string[]; canceled?: boolean } | null>;
  exportCourse(payload?: { courseFile?: string; format?: 'pdf' | 'lume'; title?: string }): Promise<{ success: boolean; filePath?: string; filename?: string; canceled?: boolean; error?: string } | null>;
  openLogDir(): Promise<string | null>;
  getLogDir(): Promise<string | null>;
  selectSubmissionDir(): Promise<string | null>;
  toggleDevTools(): void;
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  onWindowMaximized?(callback: () => void): void;
  onWindowUnmaximized?(callback: () => void): void;
  removeWindowMaximizedListener?(callback: () => void): void;
  removeWindowUnmaximizedListener?(callback: () => void): void;
}

export interface ElectronCompatApi extends TeacherHostApi {}

declare global {
  interface Window {
    teacherHost?: TeacherHostApi;
    electronAPI?: Partial<ElectronCompatApi>;
  }
}

export {};
