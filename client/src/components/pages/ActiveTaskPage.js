import "./ActiveTaskPage.css";

import { useState } from "react";
import { useInterval } from "utils/useInterval";
import { fetchAppJson } from "utils";
import { Link } from "react-router-dom";
import LoadingSpinner from "components/LoadingSpinner";
import TaskResults from "components/TaskResults";

export default function ActiveTaskPage() {
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
                {isLoading && <LoadingSpinner />}
            </p>
            <Link to="/task_options">Start over</Link>
            {task?.message && <pre>{task.message}</pre>}
            {task?.results && <TaskResults results={task.results} />}
        </>
    );
}
