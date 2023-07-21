import "./ActiveTaskPage.css";

import { useEffect, useState, useRef } from "react";
import { useInterval } from "utils/useInterval";
import { fetchAppJson } from "utils";
import { Link } from "react-router-dom";

export default function ActiveTaskPage() {
    // const { data, isLoading } = useFetch(appApiUrl("/api/active_task"));

    const [task, setTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useInterval(async () => {
        if (isLoading) {
            let taskJson = await fetchAppJson("/api/active_task");
            setTask(taskJson);
            setIsLoading(
                !taskJson || ["PENDING", "PROGRESS"].includes(taskJson?.status)
            );
        }
    }, 1000);

    return (
        <>
            <p>
                <span>Status: {task?.status || ""}</span>{" "}
                {isLoading && <span className="loader">Loading...</span>}
            </p>
            <Link to="/task_options">Start over</Link>
            {task?.info && (
                <>
                    <p>Info:</p>
                    <pre>{JSON.stringify(task.info, null, 2)}</pre>
                </>
            )}
        </>
    );
}
