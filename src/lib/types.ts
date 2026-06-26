import { platform } from "os";

export const PLATFORM = platform();

export type OperatingSystem = 'linux' | 'windows' | 'macos' | 'other';

export type DisplayServer = 'wayland' | 'x11' | 'other';
