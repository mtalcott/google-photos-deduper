const SERVER_HOST = import.meta.env.VITE_SERVER_HOST;

export function appApiUrl(path: string): string {
  if (!SERVER_HOST) {
    console.warn("No SERVER_HOST configured, API requests will fail.");
  }
  return `${SERVER_HOST}${path}`;
}

export async function fetchAppJson(path: string): Promise<any> {
  const response = await fetch(appApiUrl(path));
  const json = await response.json();
  if (response.ok) {
    return json;
  }
}

export function prettyDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = seconds - h * 3600 - m * 60;
  const vals = [h, m, s].map((v) => (v < 10 ? `0${v}` : v));
  if (h > 0) {
    return vals.join(":");
  } else {
    return [vals[1], vals[2]].join(":");
  }
}

export function truncateString(str: string, length: number): string {
  if (str.length <= length) return str;

  const separator = "...";

  const separatorLength = separator.length,
    charsToShow = length - separatorLength,
    frontChars = Math.ceil(charsToShow / 2),
    backChars = Math.floor(charsToShow / 2);

  return (
    str.substring(0, frontChars + 1) +
    separator +
    str.substring(str.length - backChars, str.length)
  );
}

export interface MeResponseType {
  logged_in: boolean;
  user_info: UserInfoType;
  has_active_task: boolean;
}

export interface MeType {
  isLoggedIn: boolean;
  userInfo?: UserInfoType;
  hasActiveTask: boolean;
}

export interface UserInfoType {
  email: string;
  family_name: string;
  given_name: string;
  id: string;
  locale: string;
  name: string;
  picture: string;
  verified_email: boolean;
}

export interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "SUCCESS" | "FAILURE";
  meta?: {
    logMessage?: string;
    steps?: {
      [step: string]: {
        startedAt: string;
        completedAt?: string;
        count?: number;
      };
    };
  };
}

export interface TaskResultsType {}
