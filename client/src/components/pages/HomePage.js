// import "./HomePage.css";

import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";

export default function HomePage() {
    const { data, error, isLoading } = useFetch(appApiUrl("/auth/me"));

    // if (error) return <p>There was an error.</p>;
    // if (!data) return <p>Loading...</p>;

    // If not authed
    //   Link to auth
    // If authed
    //   Welcome message
    //   If active task
    //     Link to active task

    if (isLoading || error) {
        return null;
    }

    return (
        <>
            {data.user_info?.given_name && (
                <p>Welcome, {data?.user_info?.given_name}!</p>
            )}
            {data.has_active_task && (
                <p>
                    <a href="/active_task">Active Task</a>
                </p>
            )}
        </>
    );
}
