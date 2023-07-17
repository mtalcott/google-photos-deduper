// import "./ActiveTaskPage.css";

import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";

export default function ActiveTaskPage() {
    const { data, error, isLoading } = useFetch(appApiUrl("/api/active_task"));

    if (isLoading || error) {
        return null;
    }

    return (
        <>
            <p>Status: {data.status}</p>
            <p>
                Info:
                <pre>{JSON.stringify(data.info, null, 2)}</pre>
            </p>
        </>
    );
}
