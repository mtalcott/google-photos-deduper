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
