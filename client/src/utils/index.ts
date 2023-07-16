let SERVER_HOST = process.env.REACT_APP_SERVER_HOST;

export function appApiUrl(path: String): String {
    if (!SERVER_HOST) {
        console.warn("No SERVER_HOST configured, API requests will fail.");
    }
    return `${SERVER_HOST}${path}`;
}
