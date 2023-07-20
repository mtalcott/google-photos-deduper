// import "./ActiveTaskPage.css";

import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";
import { Link } from "react-router-dom";

export default function ActiveTaskPage() {
    const { data, isLoading } = useFetch(appApiUrl("/api/active_task"));

    if (isLoading) {
        return null;
    }

    return (
        <>
            <p>Status: {data.status}</p>
            <Link to="/task_options">Start over</Link>
            {data.info && (
                <>
                    <p>Info:</p>
                    <pre>{JSON.stringify(data.info, null, 2)}</pre>
                </>
            )}
        </>
    );
}
