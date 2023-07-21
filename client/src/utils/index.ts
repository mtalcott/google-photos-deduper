let SERVER_HOST = process.env.REACT_APP_SERVER_HOST;

export function appApiUrl(path: string): string {
    if (!SERVER_HOST) {
        console.warn("No SERVER_HOST configured, API requests will fail.");
    }
    return `${SERVER_HOST}${path}`;
}

export async function fetchAppJson(path: string): Promise<any> {
    const response = await fetch(appApiUrl(path));
    let json = await response.json();
    if (response.ok) {
        return json;
    }
}
