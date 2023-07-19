// import "./HomePage.css";

import { Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";

export default function HomePage() {
    const { user } = useContext(AppContext);

    if (user) {
        return (
            <AuthedHome
                name={user.given_name}
                hasActiveTask={user.has_active_task}
            />
        );
    }
    return <UnauthedHome />;
}

function UnauthedHome() {
    return (
        <Link reloadDocument to="/auth/google">
            Get started
        </Link>
    );
}

function AuthedHome({ name, hasActiveTask }) {
    return (
        <>
            <p>Welcome, {name}!</p>
            {hasActiveTask && (
                <p>
                    <Link to="/active_task">Active Task</Link>
                </p>
            )}
        </>
    );
}
